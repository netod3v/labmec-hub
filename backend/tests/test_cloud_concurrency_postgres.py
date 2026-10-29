"""Multiple application workers sharing an isolated PostgreSQL test database."""
import hashlib
import os
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

from werkzeug.security import generate_password_hash

from backend.app import create_app
from backend.database import Database
from backend.reset_mail_queue import JOBS, enqueue_reset_mail, process_reset_mail


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL nao configurada')
class CloudConcurrencyPostgresTests(unittest.TestCase):
    def setUp(self):
        self.database = Database(os.environ['TEST_DATABASE_URL'])
        self.database.initialize()
        self.uid = 'cloud_review_' + uuid4().hex
        self.job_key = hashlib.sha256(self.uid.encode()).hexdigest()
        self.rate_key = 'cloud_review_' + uuid4().hex
        self.folder = tempfile.TemporaryDirectory()
        with self.database.transaction() as repository:
            repository.create_user(self.uid, self.uid + '@example.invalid',
                                   generate_password_hash('test-only-password-123'), {'name': 'Test'})
            self.user = repository.user(self.uid)
        settings = dict(TESTING=True, SECRET_KEY='c' * 40, STORAGE_DIR=self.folder.name,
                        PUBLIC_ORIGIN='https://hub.example.invalid', SESSION_COOKIE_SECURE=False,
                        LIVEKIT_API_KEY='', LIVEKIT_API_SECRET='', RESET_MAIL_DELIVERY='queue',
                        RESET_MAIL_WORKER_SECRET='w' * 40, SMTP_HOST='smtp.invalid',
                        SMTP_USERNAME='sender@example.invalid', SMTP_PASSWORD='test-only')
        self.apps = [create_app(settings, Database(os.environ['TEST_DATABASE_URL'])) for _ in range(2)]

    def tearDown(self):
        with self.database.transaction() as repository:
            repository.save_document(JOBS, self.job_key, None)
            repository.connection.execute('DELETE FROM login_attempts WHERE key = %s', (self.rate_key,))
            repository.connection.execute('DELETE FROM users WHERE id = %s', (self.uid,))
        self.folder.cleanup()

    def test_atomic_limit_across_connections_allows_exactly_the_configured_count(self):
        def attempt(index):
            with self.apps[index % 2].database.transaction() as repository:
                return repository.attempt_allowed(self.rate_key, limit=7)
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(40)))
        self.assertEqual(sum(results), 7)
        with self.database.transaction() as repository:
            row = repository.connection.execute('SELECT attempts FROM login_attempts WHERE key = %s',
                                                (self.rate_key,)).fetchone()
        self.assertEqual(row['attempts'], 40)

    def test_http_login_limit_is_shared_by_two_application_instances(self):
        clients = [app.test_client() for app in self.apps]
        csrf = [client.get('/api/session').json['csrf'] for client in clients]
        # An account-specific bucket is shared even when the source IP changes.
        results = []
        for index in range(18):
            worker = index % 2
            response = clients[worker].post('/api/auth/login',
                json={'email': self.user['email'], 'password': 'wrong-password'},
                headers={'X-CSRF-Token': csrf[worker]}, environ_overrides={'REMOTE_ADDR': f'198.51.100.{index + 1}'})
            results.append(response.status_code)
        self.assertEqual(results, [401] * 15 + [429] * 3)

    def test_concurrent_requests_coalesce_into_one_durable_job(self):
        def enqueue(index):
            enqueue_reset_mail(self.apps[index % 2], self.user)
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(enqueue, range(16)))
        with self.database.transaction() as repository:
            job = repository.document(JOBS, self.job_key)
        self.assertEqual(job['attempts'], 0)
        self.assertEqual(job['uid'], self.uid)

    def test_parallel_workers_do_not_send_the_same_active_lease_twice(self):
        enqueue_reset_mail(self.apps[0], self.user)
        start = Barrier(2)
        def run(index):
            start.wait(timeout=5)
            return process_reset_mail(self.apps[index])
        with patch('backend.password_reset.send_reset_email', side_effect=lambda *_: time.sleep(.2)) as smtp:
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(run, range(2)))
            smtp.assert_called_once()
        self.assertEqual(sum(row['sent'] for row in results), 1)
        with self.database.transaction() as repository:
            self.assertIsNone(repository.document(JOBS, self.job_key))

    def test_expired_lease_recovers_and_old_worker_cannot_acknowledge_new_owner(self):
        enqueue_reset_mail(self.apps[0], self.user)
        with self.apps[0].database.transaction() as repository:
            old = repository.claim_reset_mail_job(time.time(), 'old-worker', 120)
            self.assertIsNotNone(old)
            old['data']['leaseUntil'] = time.time() - 1
            repository.save_document(JOBS, self.job_key, old['data'])
        with self.apps[1].database.transaction() as repository:
            new = repository.claim_reset_mail_job(time.time(), 'new-worker', 120)
        self.assertEqual(new['data']['attempts'], 2)
        with self.apps[0].database.transaction() as repository:
            self.assertFalse(repository.finish_reset_mail_job(self.job_key, 'old-worker'))
        with self.apps[1].database.transaction() as repository:
            self.assertTrue(repository.finish_reset_mail_job(self.job_key, 'new-worker'))

    def test_password_change_in_another_instance_discards_pending_email(self):
        enqueue_reset_mail(self.apps[0], self.user)
        with self.apps[1].database.transaction() as repository:
            repository.change_password(self.uid, 'test-only-new-hash')
        with patch('backend.password_reset.send_reset_email') as smtp:
            self.assertEqual(process_reset_mail(self.apps[0])['discarded'], 1)
            smtp.assert_not_called()

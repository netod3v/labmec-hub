"""Outbox reliability with no real email delivery or production data."""
import time
import unittest
from contextlib import contextmanager
from unittest.mock import patch

from werkzeug.security import generate_password_hash

from backend.app import create_app
from backend.database import Database
from backend.reset_mail_queue import CONTROL, JOBS, WORKER_PATH, enqueue_reset_mail
from backend.tests import test_api


class ResetMailQueueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('senha-de-teste-segura')

    write = test_api.ApiTests.write
    login = test_api.ApiTests.login

    def setUp(self):
        test_api.ApiTests.setUp(self)
        self.app.config.update(RESET_MAIL_DELIVERY='queue', RESET_MAIL_WORKER_SECRET='w' * 48,
                               PUBLIC_ORIGIN='https://hub.example.org', SMTP_HOST='smtp.invalid',
                               SMTP_USERNAME='sender@example.invalid', SMTP_PASSWORD='test-only', SMTP_FROM='')
        self.database.accounts['alice']['profile']['isAdmin'] = True
        self.headers = {'Authorization': 'Bearer ' + 'w' * 48}

    def worker(self, client=None):
        return (client or self.client).post(WORKER_PATH, json={}, headers=self.headers)

    def ready(self):
        self.assertEqual(self.worker().status_code, 200)

    def request_reset(self, email='alice@example.org'):
        return self.write('/api/auth/forgot-password', {'email': email}, 'POST')

    def jobs(self):
        return self.database.documents(JOBS)

    def test_requires_worker_credential_even_for_an_administrator(self):
        self.login('alice')
        for headers in ({}, {'Authorization': 'Bearer wrong'}, {'Authorization': 'Bearer ç'}, {'X-CSRF-Token': self.csrf}):
            self.assertEqual(self.client.post(WORKER_PATH, json={}, headers=headers).status_code, 401)
        self.assertEqual(self.worker().status_code, 200)
        self.assertEqual(self.client.get(WORKER_PATH, headers=self.headers).status_code, 405)

    def test_stale_or_unconfigured_worker_fails_closed_for_every_email(self):
        known, missing = self.request_reset(), self.request_reset('missing@example.org')
        self.assertEqual(known.status_code, 503)
        self.assertEqual(known.json, missing.json)
        self.ready()
        self.database.save_document(CONTROL, 'worker', {'lastSeen': time.time() - 181})
        self.assertEqual(self.request_reset().status_code, 503)
        self.assertEqual(self.jobs(), [])

    def test_worker_rejects_bad_configuration_without_marking_itself_ready(self):
        for origin in ('http://example.org', 'https://user:password@example.org', 'https://example.org/path'):
            self.app.config['PUBLIC_ORIGIN'] = origin
            self.assertEqual(self.worker().status_code, 503)
        self.app.config['PUBLIC_ORIGIN'] = 'https://hub.example.org'
        self.app.config['SMTP_PASSWORD'] = ''
        self.assertEqual(self.worker().status_code, 503)
        self.assertIsNone(self.database.document(CONTROL, 'worker'))

    def test_request_only_persists_and_another_instance_delivers(self):
        self.ready()
        with patch('backend.password_reset.send_reset_email') as smtp:
            self.assertEqual(self.request_reset().status_code, 200)
            self.assertEqual(self.request_reset('missing@example.org').json, self.request_reset().json)
            smtp.assert_not_called()
            self.assertEqual(len(self.jobs()), 1, 'pending requests are coalesced per account')
            stored = str(self.jobs())
            for private in ('alice@example.org', 'test-only', '#token=', 'sender@example.invalid'):
                self.assertNotIn(private, stored)
            second = create_app(dict(self.app.config), self.database).test_client()
            self.assertEqual(self.worker(second).json['sent'], 1)
            smtp.assert_called_once()
            self.assertEqual(smtp.call_args.args[1], 'alice@example.org')
            self.assertIn('/reset-password#token=', smtp.call_args.args[2])
        self.assertEqual(self.jobs(), [])

    def test_smtp_holds_no_database_transaction(self):
        self.ready()
        self.request_reset()
        original = self.database.transaction
        depth = 0

        @contextmanager
        def tracked():
            nonlocal depth
            depth += 1
            try:
                with original() as repository:
                    yield repository
            finally:
                depth -= 1

        with patch.object(self.database, 'transaction', tracked):
            with patch('backend.password_reset.send_reset_email', side_effect=lambda *_: self.assertEqual(depth, 0)):
                self.assertEqual(self.worker().json['sent'], 1)

    def test_smtp_failure_retries_after_backoff_then_completes(self):
        self.ready()
        self.request_reset()
        with patch('backend.password_reset.send_reset_email', side_effect=OSError('secret provider detail')):
            with self.assertLogs(self.app.logger, level='WARNING') as logs:
                self.assertEqual(self.worker().json['retried'], 1)
            self.assertNotIn('secret provider detail', str(logs.output))
        row = self.jobs()[0]
        self.assertEqual(row['data']['attempts'], 1)
        self.assertGreater(row['data']['nextAttempt'], time.time())
        with patch('backend.password_reset.send_reset_email') as smtp:
            self.assertEqual(self.worker().json['sent'], 0)
            smtp.assert_not_called()
            row['data']['nextAttempt'] = 0
            self.database.save_document(JOBS, row['id'], row['data'])
            self.assertEqual(self.worker().json['sent'], 1)
        self.assertEqual(self.jobs(), [])

    def test_crashed_worker_is_retried_and_stale_ack_cannot_delete_new_lease(self):
        self.ready()
        self.request_reset()
        claimed = self.database.claim_reset_mail_job(time.time(), 'old', 120)
        self.assertIsNone(self.database.claim_reset_mail_job(time.time(), 'other', 120))
        claimed['data']['leaseUntil'] = 0
        self.database.save_document(JOBS, claimed['id'], claimed['data'])
        new = self.database.claim_reset_mail_job(time.time(), 'new', 120)
        self.assertFalse(self.database.finish_reset_mail_job(new['id'], 'old'))
        self.assertEqual(len(self.jobs()), 1)
        self.assertTrue(self.database.finish_reset_mail_job(new['id'], 'new'))

    def test_database_failure_after_smtp_keeps_job_for_retry(self):
        self.ready()
        self.request_reset()
        with patch('backend.password_reset.send_reset_email') as smtp:
            with patch.object(self.database, 'finish_reset_mail_job', side_effect=RuntimeError('commit failed')):
                with self.assertRaises(RuntimeError):
                    self.worker()
            self.assertEqual(len(self.jobs()), 1)
            row = self.jobs()[0]
            row['data']['leaseUntil'] = 0
            self.database.save_document(JOBS, row['id'], row['data'])
            self.assertEqual(self.worker().json['sent'], 1)
            self.assertEqual(smtp.call_count, 2, 'ambiguous SMTP acknowledgement can resend, never silently lose the job')
        self.assertEqual(self.jobs(), [])

    def test_changed_password_blocked_and_expired_jobs_never_send(self):
        self.ready()
        self.request_reset()
        self.database.accounts['alice']['session_version'] += 1
        with patch('backend.password_reset.send_reset_email') as smtp:
            self.assertEqual(self.worker().json['discarded'], 1)
            enqueue_reset_mail(self.app, self.database.user('alice'))
            self.database.accounts['alice']['profile']['isBanned'] = True
            self.assertEqual(self.worker().json['discarded'], 1)
            enqueue_reset_mail(self.app, self.database.user('alice'))
            row = self.jobs()[0]
            row['data']['expiresAt'] = 0
            self.database.save_document(JOBS, row['id'], row['data'])
            self.worker()
            smtp.assert_not_called()
        self.assertEqual(self.jobs(), [])

    def test_retry_limit_is_terminal_and_queue_is_not_public(self):
        self.ready()
        self.request_reset()
        row = self.jobs()[0]
        row['data']['attempts'] = 4
        self.database.save_document(JOBS, row['id'], row['data'])
        with patch('backend.password_reset.send_reset_email', side_effect=OSError('offline')):
            self.assertEqual(self.worker().json['failed'], 1)
        self.assertEqual(self.jobs()[0]['data']['status'], 'failed')
        self.login('alice')
        self.assertEqual(self.client.get('/api/data/' + JOBS).status_code, 404)


class CloudTLSConfigTests(unittest.TestCase):
    def test_cloud_default_requires_tls_and_keeps_stronger_verification(self):
        for suffix, expected in [('', 'require'), ('?sslmode=verify-full', 'verify-full')]:
            with patch('backend.database.psycopg.connect') as connect:
                with Database('postgresql://localhost/test' + suffix, require_tls=True).transaction():
                    pass
                self.assertEqual(connect.call_args.kwargs['sslmode'], expected)
                self.assertIsNone(connect.call_args.kwargs['prepare_threshold'])
        with self.assertRaises(RuntimeError):
            Database('postgresql://localhost/test?sslmode=disable', require_tls=True)

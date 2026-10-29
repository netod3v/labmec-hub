"""Abuse cases from the 2026-10-28 STRIDE/DREAD review."""
import hashlib
import unittest
from backend.tests import test_api

class SecurityReviewTests(unittest.TestCase):
    setUpClass = classmethod(test_api.ApiTests.setUpClass.__func__)
    setUp = test_api.ApiTests.setUp
    login = test_api.ApiTests.login
    write = test_api.ApiTests.write

    def test_copied_cookie_is_rejected_after_logout(self):
        self.login()
        name = self.app.config['SESSION_COOKIE_NAME']
        cookie = self.client.get_cookie(name).value
        clone = self.app.test_client()
        clone.set_cookie(name, cookie)
        self.assertEqual(clone.get('/api/data/users').status_code, 200)
        self.assertEqual(self.write('/api/auth/logout', method='POST').status_code, 200)
        self.assertEqual(clone.get('/api/data/users').status_code, 401)
        self.assertIsNone(clone.get('/api/session').json['user'])

    def test_member_cannot_join_other_unit_to_read_private_data(self):
        self.login()
        response = self.write('/api/data/users/alice', {'sectors': {'LACAM': True, 'LabNeuroMusc': True}})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.client.get('/api/data/posts_private/LabNeuroMusc').status_code, 403)
        self.assertEqual(self.write('/api/data/users/alice', {'sector': 'LabNeuroMusc'}).status_code, 403)

    def test_expired_and_legacy_sessions_are_denied(self):
        self.login()
        with self.client.session_transaction() as session:
            token = session['sid']
        key = hashlib.sha256(token.encode()).hexdigest()
        record = self.database.document('_sessions', key)
        self.assertNotIn(token, str(self.database.records))
        record['expires'] = 1
        self.database.save_document('_sessions', key, record)
        self.assertEqual(self.client.get('/api/data/users').status_code, 401)
        self.assertIsNone(self.client.get('/api/session').json['user'])
        with self.client.session_transaction() as session:
            session.pop('sid')
        self.assertEqual(self.client.get('/api/data/users').status_code, 401)

    def test_internal_session_records_are_not_readable_or_writable(self):
        self.login()
        self.assertEqual(self.client.get('/api/data/_sessions').status_code, 404)
        self.assertEqual(self.write('/api/data/_sessions/fake', {'uid': 'alice'}, 'PUT').status_code, 404)

    def test_new_user_can_complete_profile_without_private_unit_access(self):
        self.database.accounts['alice']['profile'].pop('sectors')
        self.login()
        self.assertEqual(self.write('/api/data/users/alice', {'name': 'Alice', 'affiliation': 'masters'}).status_code, 200)
        self.assertEqual(self.client.get('/api/data/posts_private/LACAM').status_code, 403)
        self.assertEqual(self.client.get('/api/data/posts').status_code, 200)

    def test_production_reset_does_not_wait_for_smtp(self):
        from threading import Event
        from unittest.mock import patch
        started, release, finished = Event(), Event(), Event()
        self.app.config.update(TESTING=False, PUBLIC_ORIGIN='http://localhost',
                               SMTP_HOST='smtp.invalid', SMTP_USERNAME='test', SMTP_PASSWORD='fake')
        def slow_smtp(*args):
            started.set()
            release.wait(5)
            finished.set()
        with patch('backend.password_reset.send_reset_email', side_effect=slow_smtp):
            try:
                response = self.write('/api/auth/forgot-password', {'email': 'alice@example.org'}, 'POST')
                self.assertEqual(response.status_code, 200)
                self.assertTrue(started.wait(1))
                self.assertFalse(finished.is_set())
            finally:
                release.set()
                self.assertTrue(finished.wait(2))

    def test_full_mail_queue_does_not_disclose_account_or_block_request(self):
        from unittest.mock import patch
        self.app.config.update(TESTING=False, PUBLIC_ORIGIN='http://localhost',
                               SMTP_HOST='smtp.invalid', SMTP_USERNAME='test', SMTP_PASSWORD='fake')
        with patch('backend.password_reset._mail_slots') as slots:
            slots.acquire.return_value = False
            existing = self.write('/api/auth/forgot-password', {'email': 'alice@example.org'}, 'POST')
            missing = self.write('/api/auth/forgot-password', {'email': 'missing@example.org'}, 'POST')
            self.assertEqual(existing.status_code, 200)
            self.assertEqual(existing.json, missing.json)

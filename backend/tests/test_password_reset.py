import smtplib
import time
import unittest
from unittest.mock import patch
from email.utils import parseaddr

from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from backend.tests import test_api
from backend.password_reset import send_reset_email


class PasswordResetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('senha-de-teste-segura')

    setUp = test_api.ApiTests.setUp
    write = test_api.ApiTests.write
    login = test_api.ApiTests.login

    def configure(self):
        self.app.config.update(PUBLIC_ORIGIN='https://hub.example.org', SMTP_HOST='smtp.gmail.com',
                               SMTP_PORT=587, SMTP_USERNAME='sender@example.org', SMTP_PASSWORD='app-secret', SMTP_FROM='')

    def token(self, uid='alice'):
        return URLSafeTimedSerializer(self.app.config['SECRET_KEY'], salt='labiomec-password-reset-v1').dumps(
            {'uid': uid, 'version': self.database.accounts[uid]['session_version']})

    def reset(self, token, password='uma-nova-senha-segura'):
        return self.write('/api/auth/reset-password', {'token': token, 'password': password}, 'POST')

    def test_request_email_and_single_use_link_revokes_sessions(self):
        self.configure()
        self.login()
        token_before = self.token()
        with patch('backend.password_reset.send_reset_email') as send:
            response = self.write('/api/auth/forgot-password', {'email': ' ALICE@example.org '}, 'POST')
        self.assertEqual(response.status_code, 200)
        config, address, link = send.call_args.args
        self.assertEqual(address, 'alice@example.org')
        self.assertTrue(link.startswith('https://hub.example.org/reset-password#token='))
        token = link.split('#token=')[1]
        self.assertNotIn(token, str(response.json))
        self.assertEqual(self.reset(token).status_code, 200)
        self.assertTrue(check_password_hash(self.database.accounts['alice']['password_hash'], 'uma-nova-senha-segura'))
        self.assertEqual(self.client.get('/api/data/users').status_code, 401)
        self.assertEqual(self.reset(token).status_code, 400)
        self.assertEqual(self.reset(token_before).status_code, 400)
        response = self.write('/api/auth/login', {'email': 'alice@example.org', 'password': 'uma-nova-senha-segura'}, 'POST')
        self.assertEqual(response.status_code, 200)

    def test_expired_tampered_invalid_and_weak_password_are_rejected(self):
        with patch('itsdangerous.timed.TimestampSigner.get_timestamp', return_value=int(time.time()) - 1801):
            expired = self.token()
        valid = self.token()
        for token in [expired, valid + 'x', '', None, 'x' * 2049]:
            self.assertEqual(self.reset(token).status_code, 400)
        self.assertEqual(self.reset(valid, 'short').status_code, 400)
        self.assertEqual(self.database.accounts['alice']['session_version'], 1)
        self.assertEqual(self.reset(valid).status_code, 200)

    def test_unknown_blocked_removed_and_smtp_failure_have_generic_response(self):
        self.configure()
        with patch('backend.password_reset.send_reset_email') as send:
            known = self.write('/api/auth/forgot-password', {'email': 'alice@example.org'}, 'POST')
            missing = self.write('/api/auth/forgot-password', {'email': 'missing@example.org'}, 'POST')
            self.assertEqual(known.json, missing.json)
            self.assertEqual(send.call_count, 1)
            for field in ['isRemoved', 'isBanned']:
                self.database.accounts['bob']['profile'] = {field: True}
                result = self.write('/api/auth/forgot-password', {'email': 'bob@example.org'}, 'POST')
                self.assertEqual(result.json, known.json)
                self.assertEqual(self.reset(self.token('bob')).status_code, 400)
            self.assertEqual(send.call_count, 1)
        with patch('backend.password_reset.send_reset_email', side_effect=smtplib.SMTPException('private error')):
            with self.assertLogs(self.app.logger, level='ERROR') as logged:
                result = self.write('/api/auth/forgot-password', {'email': 'alice@example.org'}, 'POST')
            self.assertEqual(result.json, known.json)
            self.assertNotIn('private error', str(logged.output))

    def test_configuration_csrf_origin_validation_and_limits(self):
        self.configure()
        self.app.config['SMTP_PASSWORD'] = ''
        self.assertEqual(self.write('/api/auth/forgot-password', {'email': 'alice@example.org'}, 'POST').status_code, 503)
        self.configure()
        self.app.config['PUBLIC_ORIGIN'] = ''
        with patch('backend.password_reset.send_reset_email') as send:
            response = self.write('/api/auth/forgot-password', {'email': 'alice@example.org'}, 'POST')
            self.assertEqual(response.status_code, 503)
            send.assert_not_called()
        self.configure()
        self.assertEqual(self.client.post('/api/auth/forgot-password', json={'email':'alice@example.org'}).status_code, 403)
        self.assertEqual(self.client.post('/api/auth/reset-password', json={}).status_code, 403)
        result = self.client.post('/api/auth/forgot-password', json={'email':'alice@example.org'}, headers={'X-CSRF-Token':self.csrf, 'Origin':'https://evil.example.org'})
        self.assertEqual(result.status_code, 403)
        self.assertEqual(self.write('/api/auth/forgot-password', {'email':'invalid'}, 'POST').status_code, 400)
        self.database.attempts.clear()
        for _ in range(15):
            self.assertEqual(self.write('/api/auth/forgot-password', {'email':'missing@example.org'}, 'POST').status_code, 200)
        self.assertEqual(self.write('/api/auth/forgot-password', {'email':'missing@example.org'}, 'POST').status_code, 429)

    def test_smtp_uses_tls_and_no_credentials_in_email_body(self):
        self.configure()
        with patch('backend.password_reset.smtplib.SMTP') as smtp:
            send_reset_email(self.app.config, 'alice@example.org', 'https://hub.example.org/reset-password#token=secret-token')
            server = smtp.return_value.__enter__.return_value
            server.starttls.assert_called_once()
            server.login.assert_called_once_with('sender@example.org', 'app-secret')
            message = server.send_message.call_args.args[0]
            self.assertEqual(message['To'], 'alice@example.org')
            self.assertEqual(parseaddr(message['From']), ('LABIOMEC Hub', 'sender@example.org'))
            plain = message.get_body(preferencelist=('plain',)).get_content()
            html = message.get_body(preferencelist=('html',)).get_content()
            self.assertIn('secret-token', plain)
            self.assertIn('secret-token', html)
            self.assertNotIn('app-secret', plain + html)
            self.assertNotIn('sender@example.org', html)
            self.assertIn('LABIOMEC HUB', html)
            self.assertIn('30 minutos', html)
            self.assertIn('cid:labiomec-logo', html)
            self.assertTrue(any(part.get('Content-ID') == '<labiomec-logo>' for part in message.walk()))
        with patch('backend.password_reset.smtplib.SMTP_SSL') as smtp:
            self.app.config['SMTP_PORT'] = 465
            send_reset_email(self.app.config, 'alice@example.org', 'https://hub.example.org/')
            smtp.assert_called_once()
            smtp.return_value.__enter__.return_value.starttls.assert_not_called()

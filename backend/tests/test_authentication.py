"""Cadastro e credenciais com contas descartáveis e sem envio de e-mail."""
import unittest
from werkzeug.security import check_password_hash, generate_password_hash
from backend.tests import test_api


class AuthenticationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('senha-de-teste-segura')

    setUp = test_api.ApiTests.setUp
    write = test_api.ApiTests.write

    def test_registration_normalizes_email_hashes_password_and_logs_in(self):
        password = 'Senha de teste! 123'
        previous = self.csrf
        response = self.write('/api/auth/register', {'email':' NOVA@Example.org ', 'password':password}, 'POST')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['user']['email'], 'nova@example.org')
        self.assertNotEqual(response.json['csrf'], previous)
        user = self.database.user(response.json['user']['uid'])
        self.assertNotEqual(user['password_hash'], password)
        self.assertTrue(check_password_hash(user['password_hash'], password))
        self.assertFalse(user['profile'].get('isAdmin'))
        self.assertEqual(self.client.get('/api/session').json['user'], response.json['user'])
        self.csrf = response.json['csrf']
        self.assertEqual(self.write('/api/auth/logout', method='POST').status_code, 200)
        self.csrf = self.client.get('/api/session').json['csrf']
        self.assertEqual(self.write('/api/auth/login', {'email':'NOVA@example.org','password':password}, 'POST').status_code, 200)

    def test_duplicate_closed_and_invalid_registration_do_not_create_users(self):
        before = len(self.database.accounts)
        for email,password,status in [('alice@example.org','senha-de-teste-segura',409), ('invalido','senha-de-teste-segura',400), ('new@example.org','curta',400), ('new@example.org','x'*257,400)]:
            with self.subTest(email=email,status=status):
                self.assertEqual(self.write('/api/auth/register', {'email':email,'password':password}, 'POST').status_code,status)
        self.app.config['ALLOW_REGISTRATION'] = False
        self.assertEqual(self.write('/api/auth/register', {'email':'new@example.org','password':'senha-de-teste-segura'}, 'POST').status_code,403)
        self.assertEqual(len(self.database.accounts),before)

    def test_malformed_credentials_return_client_errors(self):
        for action in ['login','register']:
            for body in [[], 'texto', {'email':'new@example.org','password':['not-a-password']}, {'email':'new@example.org','password':123456789012}]:
                with self.subTest(action=action,body=body):
                    response=self.write('/api/auth/'+action,body,'POST')
                    self.assertEqual(response.status_code,400)

    def test_registration_password_boundaries(self):
        for size in [12,256]:
            with self.subTest(size=size):
                response=self.write('/api/auth/register',{'email':f'length{size}@example.org','password':('Tz7!qW2$kR9@'*22)[:size]},'POST')
                self.assertEqual(response.status_code,200)
                self.csrf=response.json['csrf']

    def test_rate_limit_and_csrf_protect_login_and_registration(self):
        credentials={'email':'alice@example.org','password':'errada'}
        self.assertEqual(self.client.post('/api/auth/register',json=credentials).status_code,403)
        response=self.client.post('/api/auth/login',json=credentials,headers={'X-CSRF-Token':self.csrf,'Origin':'https://untrusted.example.org'})
        self.assertEqual(response.status_code,403)
        for _ in range(15):
            self.assertEqual(self.write('/api/auth/login',credentials,'POST').status_code,401)
        self.assertEqual(self.write('/api/auth/login',credentials,'POST').status_code,429)
        self.assertEqual(self.write('/api/auth/register',{'email':'new@example.org','password':'senha-de-teste-segura'},'POST').status_code,429)

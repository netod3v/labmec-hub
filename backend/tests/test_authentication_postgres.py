"""Cadastro e recuperação completos em PostgreSQL exclusivo de testes."""
from concurrent.futures import ThreadPoolExecutor
import os
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4
from werkzeug.security import check_password_hash
from backend.app import create_app
from backend.database import Database


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL não configurada')
class AuthenticationPostgresTests(unittest.TestCase):
    def test_registration_duplicate_and_password_recovery_roundtrip(self):
        database=Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        email='auth_test_'+uuid4().hex+'@example.org'
        password='Minha senha de teste! 123'
        with tempfile.TemporaryDirectory() as folder:
            app=create_app(dict(TESTING=True,SECRET_KEY='a'*40,STORAGE_DIR=folder,ALLOW_REGISTRATION=True,
                PUBLIC_ORIGIN='https://hub.example.org',SMTP_HOST='smtp.example.org',SMTP_USERNAME='sender@example.org',SMTP_PASSWORD='fake-smtp-password'),database)
            client=app.test_client()
            csrf=client.get('/api/session').json['csrf']
            def post(path,body):
                return client.post('/api/auth/'+path,json=body,headers={'X-CSRF-Token':csrf})
            try:
                result=post('register',{'email':' '+email.upper()+' ','password':password})
                self.assertEqual(result.status_code,200)
                csrf=result.json['csrf']
                uid=result.json['user']['uid']
                with database.transaction() as repository:
                    user=repository.user(uid)
                    self.assertEqual(user['email'],email)
                    self.assertTrue(check_password_hash(user['password_hash'],password))
                    self.assertNotEqual(user['password_hash'],password)
                self.assertEqual(post('register',{'email':email,'password':password}).status_code,409)
                with patch('backend.password_reset.send_reset_email') as send:
                    self.assertEqual(post('forgot-password',{'email':email}).status_code,200)
                token=send.call_args.args[2].split('#token=',1)[1]
                new_password='Minha nova senha de teste! 456'
                self.assertEqual(post('reset-password',{'token':token,'password':new_password}).status_code,200)
                self.assertIsNone(client.get('/api/session').json['user'])
                self.assertEqual(post('reset-password',{'token':token,'password':password}).status_code,400)
                self.assertEqual(post('login',{'email':email,'password':password}).status_code,401)
                result=post('login',{'email':email,'password':new_password})
                self.assertEqual(result.status_code,200)
                self.assertEqual(result.json['user']['uid'],uid)
            finally:
                with database.transaction() as repository:
                    repository.connection.execute('DELETE FROM users WHERE email = %s',(email,))

    def test_simultaneous_registration_creates_one_account(self):
        database=Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        email='auth_race_'+uuid4().hex+'@example.org'
        with tempfile.TemporaryDirectory() as folder:
            app=create_app(dict(TESTING=True,SECRET_KEY='b'*40,STORAGE_DIR=folder,ALLOW_REGISTRATION=True),database)
            def register(_):
                client=app.test_client()
                csrf=client.get('/api/session').json['csrf']
                return client.post('/api/auth/register',json={'email':email,'password':'Senha de teste simultaneo!'},headers={'X-CSRF-Token':csrf}).status_code
            try:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    self.assertEqual(sorted(executor.map(register,range(2))),[200,409])
                with database.transaction() as repository:
                    count=repository.connection.execute('SELECT count(*) AS total FROM users WHERE email = %s',(email,)).fetchone()
                    self.assertEqual(count['total'],1)
            finally:
                with database.transaction() as repository:
                    repository.connection.execute('DELETE FROM users WHERE email = %s',(email,))

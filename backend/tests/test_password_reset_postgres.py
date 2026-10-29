"""Concorrência da redefinição em PostgreSQL exclusivo de testes."""
from concurrent.futures import ThreadPoolExecutor
import os
import tempfile
import unittest
from uuid import uuid4

from backend.app import create_app
from backend.database import Database
from backend.reset_codes import CHALLENGES, challenge_key, new_nonce, prepare_code


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL não configurada')
class PasswordResetPostgresTests(unittest.TestCase):
    def test_concurrent_code_verification_and_grant_use_each_succeed_only_once(self):
        database = Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        uid = 'reset_test_' + uuid4().hex
        with database.transaction() as repository:
            repository.create_user(uid, uid + '@example.org', 'previous-hash', {'name': 'Teste'})
        try:
            with tempfile.TemporaryDirectory() as folder:
                app = create_app({'TESTING': True, 'SECRET_KEY': 'r' * 40, 'STORAGE_DIR': folder}, database)
                other = create_app({'TESTING': True, 'SECRET_KEY': 'r' * 40, 'STORAGE_DIR': folder}, Database(os.environ['TEST_DATABASE_URL']))
                with database.transaction() as repository:
                    user = repository.user(uid)
                code = prepare_code(app, user, new_nonce())

                def verify(index):
                    client = [app, other][index].test_client()
                    csrf = client.get('/api/session').json['csrf']
                    return client.post('/api/auth/verify-reset-code', json={'email': user['email'], 'code': code}, headers={'X-CSRF-Token': csrf})

                with ThreadPoolExecutor(max_workers=2) as executor:
                    results = list(executor.map(verify, range(2)))
                self.assertEqual(sorted(result.status_code for result in results), [200, 400])
                token = next(result.json['token'] for result in results if result.status_code == 200)

                def reset(_):
                    client = [app, other][_].test_client()
                    csrf = client.get('/api/session').json['csrf']
                    return client.post('/api/auth/reset-password', json={'token': token, 'password': 'senha-nova-concorrente'}, headers={'X-CSRF-Token': csrf}).status_code

                with ThreadPoolExecutor(max_workers=2) as executor:
                    self.assertEqual(sorted(executor.map(reset, range(2))), [200, 400])
                with database.transaction() as repository:
                    self.assertEqual(repository.user(uid)['session_version'], 2)
        finally:
            with database.transaction() as repository:
                repository.save_document(CHALLENGES, challenge_key(uid), None)
                repository.connection.execute('DELETE FROM users WHERE id = %s', (uid,))

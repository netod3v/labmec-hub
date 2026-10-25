"""Concorrência da redefinição em PostgreSQL exclusivo de testes."""
from concurrent.futures import ThreadPoolExecutor
import os
import tempfile
import unittest
from uuid import uuid4

from itsdangerous import URLSafeTimedSerializer

from backend.app import create_app
from backend.database import Database


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL não configurada')
class PasswordResetPostgresTests(unittest.TestCase):
    def test_concurrent_link_use_changes_password_only_once(self):
        database = Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        uid = 'reset_test_' + uuid4().hex
        with database.transaction() as repository:
            repository.create_user(uid, uid + '@example.org', 'previous-hash', {'name': 'Teste'})
        try:
            with tempfile.TemporaryDirectory() as folder:
                app = create_app({'TESTING': True, 'SECRET_KEY': 'r' * 40, 'STORAGE_DIR': folder}, database)
                token = URLSafeTimedSerializer('r' * 40, salt='labiomec-password-reset-v1').dumps({'uid': uid, 'version': 1})

                def reset(_):
                    client = app.test_client()
                    csrf = client.get('/api/session').json['csrf']
                    return client.post('/api/auth/reset-password', json={'token': token, 'password': 'senha-nova-concorrente'}, headers={'X-CSRF-Token': csrf}).status_code

                with ThreadPoolExecutor(max_workers=2) as executor:
                    self.assertEqual(sorted(executor.map(reset, range(2))), [200, 400])
                with database.transaction() as repository:
                    self.assertEqual(repository.user(uid)['session_version'], 2)
        finally:
            with database.transaction() as repository:
                repository.connection.execute('DELETE FROM users WHERE id = %s', (uid,))

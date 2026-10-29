"""Session revocation across workers sharing real PostgreSQL."""
import os
import tempfile
import unittest
from uuid import uuid4
from werkzeug.security import generate_password_hash
from backend.app import create_app
from backend.database import Database

@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL nao configurada')
class SecurityReviewPostgresTests(unittest.TestCase):
    def test_logout_revocation_is_shared_between_application_workers(self):
        database = Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        uid = 'session_review_' + uuid4().hex
        password = 'Session review password! 123'
        with database.transaction() as repository:
            repository.create_user(uid, uid+'@example.invalid', generate_password_hash(password), {'name': 'Review'})
        with tempfile.TemporaryDirectory() as folder:
            config = dict(TESTING=True, SECRET_KEY='s'*40, STORAGE_DIR=folder,
                          PUBLIC_ORIGIN='http://localhost', SESSION_COOKIE_SECURE=False,
                          LIVEKIT_API_KEY='', LIVEKIT_API_SECRET='')
            first = create_app(config, database)
            second = create_app(config, database)
            client = first.test_client()
            csrf = client.get('/api/session').json['csrf']
            response = client.post('/api/auth/login',json={'email':uid+'@example.invalid','password':password},headers={'X-CSRF-Token':csrf})
            self.assertEqual(response.status_code, 200)
            csrf = response.json['csrf']
            name = first.config['SESSION_COOKIE_NAME']
            clone = second.test_client()
            clone.set_cookie(name, client.get_cookie(name).value)
            self.assertEqual(clone.get('/api/data/users').status_code, 200)
            self.assertEqual(client.post('/api/auth/logout',headers={'X-CSRF-Token':csrf}).status_code, 200)
            self.assertEqual(clone.get('/api/data/users').status_code, 401)
            self.assertIsNone(clone.get('/api/session').json['user'])

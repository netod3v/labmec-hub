"""The exported Flask instance keeps the factory's routes and security hooks."""
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask

from backend.app import create_app
from backend.tests.test_api import MemoryDatabase


class VercelEntrypointTests(unittest.TestCase):
    def settings(self, folder):
        return dict(TESTING=True, SECRET_KEY='e'*40, STORAGE_DIR=folder,
                    STORAGE_BACKEND='local', LIVEKIT_API_KEY='', LIVEKIT_API_SECRET='',
                    PUBLIC_ORIGIN='http://localhost', SESSION_COOKIE_SECURE=False)

    def test_factory_configures_supplied_instance_and_retains_security(self):
        with tempfile.TemporaryDirectory() as folder:
            supplied = Flask('vercel_entrypoint_test', static_folder=None)
            app = create_app(self.settings(folder), MemoryDatabase(), application=supplied)
            self.assertIs(app, supplied)
            client = app.test_client()
            self.assertEqual(client.get('/api/health').status_code, 200)
            self.assertEqual(client.get('/api/admin/overview').status_code, 401)
            self.assertEqual(client.post('/api/auth/login', json={}).status_code, 403)
            page = client.get('/')
            self.assertEqual(page.status_code, 200)
            self.assertIn('nonce-', page.headers['Content-Security-Policy'])

    def test_root_export_is_the_configured_wsgi_application(self):
        with tempfile.TemporaryDirectory() as folder:
            real_factory = create_app
            def configure(**kwargs):
                return real_factory(self.settings(folder), MemoryDatabase(), **kwargs)
            with patch('backend.app.create_app', side_effect=configure) as factory:
                exported = runpy.run_path(str(Path(__file__).resolve().parents[2] / 'app.py'))
            app = exported['app']
            self.assertIsInstance(app, Flask)
            self.assertIs(factory.call_args.kwargs['application'], app)
            self.assertEqual(app.test_client().get('/api/health').status_code, 200)
            response = app.test_client().get('/lab-config.js')
            self.assertEqual(response.status_code, 200)
            response.close()

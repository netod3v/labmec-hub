"""Cloud storage preserves API authorization, limits and temporary-file cleanup."""
from io import BytesIO
from contextlib import contextmanager
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from werkzeug.exceptions import ServiceUnavailable
from backend.app import create_app
from backend.object_storage import SupabaseFileStorage, NoRedirect
from backend.tests import test_api


class FakeStorage:
    def __init__(self):
        self.files = {}
        self.downloads = 0
        self.fail_upload = False

    def upload(self, file_id, path, mime_type):
        self.files[file_id] = path.read_bytes()
        if self.fail_upload:
            raise ServiceUnavailable('Unavailable')

    def download(self, file_id, path, expected_size):
        self.downloads += 1
        path.write_bytes(self.files[file_id])

    def delete(self, file_id):
        self.files.pop(file_id, None)


class CloudStorageApiTests(unittest.TestCase):
    setUpClass = classmethod(test_api.ApiTests.setUpClass.__func__)
    login = test_api.ApiTests.login
    write = test_api.ApiTests.write

    def setUp(self):
        test_api.ApiTests.setUp(self)
        self.remote = FakeStorage()
        with patch('backend.app.SupabaseFileStorage', return_value=self.remote):
            self.app = create_app(dict(TESTING=True, SECRET_KEY='t'*40, STORAGE_DIR=self.folder.name,
                                      STORAGE_BACKEND='supabase', STORAGE_LIMIT_BYTES=1024,
                                      LIVEKIT_API_KEY='', LIVEKIT_API_SECRET=''), self.database)
        self.client = self.app.test_client()
        self.csrf = self.client.get('/api/session').json['csrf']

    def upload(self, data=b'%PDF-1.7\nprivate-test'):
        return self.client.post('/api/files', data={'file': (BytesIO(data), 'review.pdf')},
                                headers={'X-CSRF-Token': self.csrf})

    def test_private_roundtrip_range_cleanup_and_delete(self):
        self.login()
        response = self.upload()
        self.assertEqual(response.status_code, 201)
        key = response.json['file']['id']
        self.assertEqual(list(Path(self.folder.name).iterdir()), [])
        self.login('bob')
        self.assertEqual(self.client.get('/api/files/'+key).status_code, 403)
        self.assertEqual(self.remote.downloads, 0)
        self.login()
        download = self.client.get('/api/files/'+key+'?inline=1')
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download.data, b'%PDF-1.7\nprivate-test')
        download.close()
        self.assertEqual(list(Path(self.folder.name).iterdir()), [])
        partial = self.client.get('/api/files/'+key, headers={'Range': 'bytes=0-3'})
        self.assertEqual(partial.status_code, 206)
        self.assertEqual(partial.data, b'%PDF')
        partial.close()
        self.assertEqual(self.write('/api/files/'+key, method='DELETE').status_code, 200)
        self.assertNotIn(key, self.remote.files)
        self.assertIsNone(self.database.file(key))

    def test_failed_remote_upload_cleans_object_and_metadata(self):
        self.login()
        self.remote.fail_upload = True
        self.assertEqual(self.upload().status_code, 503)
        self.assertEqual(self.remote.files, {})
        self.assertEqual(self.database.list_files(), [])
        self.assertEqual(list(Path(self.folder.name).iterdir()), [])

    def test_database_commit_failure_after_upload_removes_remote_object(self):
        self.login()
        original = self.database.transaction

        @contextmanager
        def failed_commit():
            with original() as repository:
                yield repository
                if repository.files:
                    raise RuntimeError('simulated commit failure')

        with patch.object(self.database, 'transaction', failed_commit):
            with self.assertRaisesRegex(RuntimeError, 'simulated commit failure'):
                self.upload()
        self.assertEqual(self.remote.files, {})
        self.assertEqual(self.database.list_files(), [])
        self.assertEqual(list(Path(self.folder.name).iterdir()), [])

    def test_quota_and_request_limit_apply_before_cloud_upload(self):
        self.login()
        self.assertEqual(self.upload(b'x'*1025).status_code, 400)
        self.assertEqual(self.remote.files, {})
        self.app.config['MAX_CONTENT_LENGTH'] = 64
        self.assertEqual(self.upload().status_code, 413)
        self.assertEqual(self.remote.files, {})

    def test_transaction_pooler_disables_prepared_statements(self):
        from backend.database import Database
        with patch('backend.database.psycopg.connect') as connect:
            with Database('test').transaction():
                pass
        self.assertIsNone(connect.call_args.kwargs['prepare_threshold'])

    def test_vercel_defaults_to_persistent_storage_secure_cookie_and_small_payload(self):
        with patch.dict('os.environ', {
            'VERCEL': '1', 'SECRET_KEY': 'v'*40,
            'SUPABASE_URL': 'https://example.supabase.co',
            'SUPABASE_SECRET_KEY': 'sb_secret_'+'x'*32,
        }, clear=True):
            app = create_app({'STORAGE_DIR': self.folder.name}, self.database)
            self.assertEqual(app.config['STORAGE_BACKEND'], 'supabase')
            self.assertEqual(app.config['MAX_CONTENT_LENGTH'], 4*1024*1024)
            self.assertTrue(app.config['SESSION_COOKIE_SECURE'])
            self.assertEqual(app.config['RESET_MAIL_DELIVERY'], 'queue')
            self.assertEqual(app.config['SESSION_COOKIE_NAME'], '__Host-labiomec_session')
            with self.assertRaises(RuntimeError):
                create_app({'STORAGE_DIR': self.folder.name, 'STORAGE_BACKEND': 'local'}, self.database)
            with self.assertRaisesRegex(RuntimeError, 'fila persistente'):
                create_app({'STORAGE_DIR': self.folder.name, 'RESET_MAIL_DELIVERY': 'thread'}, self.database)

    def test_cloud_env_file_is_opt_in(self):
        for name in ('.env', '.env.cloud'):
            with patch.dict('os.environ', {'HUB_ENV_FILE': name}):
                with patch('backend.app.load_dotenv') as load:
                    create_app({'SECRET_KEY': 'e'*40, 'STORAGE_DIR': self.folder.name,
                                'LIVEKIT_API_KEY': '', 'LIVEKIT_API_SECRET': ''}, self.database)
                self.assertEqual(load.call_args.args[0].name, name)


class StorageHttpTests(unittest.TestCase):
    def store(self):
        return SupabaseFileStorage('https://example.supabase.co', 'sb_secret_'+'x'*32, 'hub-files')

    def test_rejects_untrusted_configuration_identifiers_and_redirects(self):
        for url in ('http://example.supabase.co', 'https://example.supabase.co@evil.test',
                    'https://example.supabase.co/?next=evil'):
            with self.assertRaises(RuntimeError):
                SupabaseFileStorage(url, 'sb_secret_'+'x'*32, 'hub-files')
        with self.assertRaises(RuntimeError):
            SupabaseFileStorage('https://example.supabase.co', 'sb_publishable_not_a_server_key', 'hub-files')
        with self.assertRaises(ValueError):
            self.store().delete('../other')
        self.assertIsNone(NoRedirect().redirect_request(None, None, 302, '', {}, 'https://evil.test'))

    def test_upload_streams_file_and_sends_key_only_in_header(self):
        store = self.store()
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'input.pdf'
            path.write_bytes(b'%PDF-test')
            def open_request(request, timeout):
                self.assertEqual(request.data.read(), b'%PDF-test')
                self.assertNotIn(store.key, request.full_url)
                self.assertEqual(request.get_header('Apikey'), store.key)
                self.assertEqual(request.get_header('Content-length'), '9')
                return BytesIO(b'{}')
            with patch.object(store.opener, 'open', side_effect=open_request):
                store.upload('a'*32, path, 'application/pdf')

    def test_incomplete_or_oversized_download_is_removed(self):
        store = self.store()
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder)/'download'
            for body in (b'abc', b'abcdefghi'):
                with patch.object(store.opener, 'open', return_value=BytesIO(body)):
                    with self.assertRaises(ServiceUnavailable):
                        store.download('a'*32, destination, 5)
                self.assertFalse(destination.exists())

    def test_provider_error_does_not_disclose_key_or_response(self):
        store = self.store()
        error = HTTPError('https://example.supabase.co', 403, 'secret response', {}, BytesIO(b'secret body'))
        with patch.object(store.opener, 'open', side_effect=error):
            with self.assertRaises(ServiceUnavailable) as caught:
                store.delete('a'*32)
        self.assertNotIn('secret body', str(caught.exception))
        self.assertNotIn(store.key, str(caught.exception))

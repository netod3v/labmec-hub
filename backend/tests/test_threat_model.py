"""Regressões do modelo de ameaças documentado em docs/modelo-de-ameacas.md."""
import unittest
from io import BytesIO

from backend.tests import test_api


class ThreatModelTests(unittest.TestCase):
    setUpClass = classmethod(test_api.ApiTests.setUpClass.__func__)
    setUp = test_api.ApiTests.setUp
    write = test_api.ApiTests.write
    login = test_api.ApiTests.login

    def test_logout_revokes_only_the_current_device_session(self):
        self.login()
        other = self.app.test_client()
        csrf = other.get('/api/session').json['csrf']
        response = other.post('/api/auth/login', json={
            'email': 'alice@example.org', 'password': 'senha-de-teste-segura',
        }, headers={'X-CSRF-Token': csrf})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.write('/api/auth/logout', method='POST').status_code, 200)
        self.assertEqual(self.client.get('/api/data/users').status_code, 401)
        self.assertEqual(other.get('/api/data/users').status_code, 200)

    def test_json_keys_and_nesting_are_checked_recursively(self):
        self.login()
        bad_key = self.write('/api/sync', {'unsafe"key': {'nested': True}}, 'POST')
        self.assertEqual(bad_key.status_code, 400)
        value = {'leaf': True}
        for _ in range(33):
            value = {'nested': value}
        response = self.write('/api/data/posts/too-deep', {'uid': 'alice', 'text': 'ok', 'extra': value}, 'PUT')
        self.assertEqual(response.status_code, 400)

    def test_chunked_api_body_is_limited_without_content_length(self):
        self.login()
        payload = b'{"paths":[],"padding":"' + b'x' * (8 * 1024 * 1024) + b'"}'
        response = self.client.post(
            '/api/sync', data=payload, content_type='application/json',
            headers={'X-CSRF-Token': self.csrf},
            environ_overrides={'CONTENT_LENGTH': '', 'wsgi.input_terminated': True},
        )
        self.assertEqual(response.status_code, 413)

    def test_chunked_json_at_the_limit_is_accepted(self):
        self.login()
        self.app.config['MAX_CONTENT_LENGTH'] = 128
        prefix, suffix = b'{"paths":[],"padding":"', b'"}'
        for size, expected in ((128, 200), (129, 413)):
            payload = prefix + b'x' * (size - len(prefix) - len(suffix)) + suffix
            response = self.client.post('/api/sync', data=payload, content_type='application/json',
                                        headers={'X-CSRF-Token': self.csrf},
                                        environ_overrides={'CONTENT_LENGTH': '', 'wsgi.input_terminated': True})
            self.assertEqual(response.status_code, expected)

    def test_admin_unit_assignment_is_logged_and_grants_private_access(self):
        self.login()
        self.assertEqual(self.write('/api/admin/users/bob/units', {'units': ['LACAM']}, 'PATCH').status_code, 403)
        self.database.accounts['alice']['profile']['isAdmin'] = True
        self.login()
        response = self.write('/api/admin/users/bob/units', {'units': ['LACAM']}, 'PATCH')
        self.assertEqual(response.status_code, 200)
        audit = self.client.get('/api/admin/audit').json['items']
        self.assertEqual(audit[0]['action'], 'user.units')
        self.assertEqual(audit[0]['details']['after'], ['LACAM'])
        self.login('bob')
        self.assertTrue(self.client.get('/api/data/users/bob').json['data']['sectors']['LACAM'])
        self.assertEqual(self.client.get('/api/data/posts_private/LACAM').status_code, 200)

    def test_hiding_a_conversation_is_private_and_deletes_only_after_both_opt_in(self):
        self.login()
        self.assertEqual(self.write(
            '/api/data/dms/alice__bob/messages/m1',
            {'from': 'alice', 'text': 'mensagem privada', 'ts': 1}, 'PUT',
        ).status_code, 200)
        self.assertEqual(self.write('/api/conversations/delete', {'conversation': 'alice__bob'}, 'POST').status_code, 200)
        own = self.client.get('/api/data/dms/alice__bob').json['data']
        self.assertEqual(own['messages'], {})
        self.assertNotIn('deletedFor', own)
        self.assertIsNone(self.client.get('/api/data/conversations/alice').json['data'])
        self.login('bob')
        self.assertEqual(self.client.get('/api/data/dms/alice__bob').json['data']['messages']['m1']['text'], 'mensagem privada')
        self.assertEqual(self.client.get('/api/data/conversations/bob').json['data']['alice']['lastText'], 'mensagem privada')
        self.assertEqual(self.write('/api/conversations/delete', {'conversation': 'alice__bob'}, 'POST').status_code, 200)
        self.assertIsNone(self.database.document('dms', 'alice__bob'))
        self.assertIsNone(self.database.document('conversations', 'alice'))
        self.assertIsNone(self.database.document('conversations', 'bob'))

    def test_search_limit_is_applied_before_database_scans(self):
        self.app.config.update(SEARCH_LIMIT=2, SEARCH_WINDOW_SECONDS=60)
        self.login()
        statuses = [self.client.get('/api/search?q=pesquisa').status_code for _ in range(3)]
        self.assertEqual(statuses, [200, 200, 429])

    def test_new_message_resets_old_conversation_deletion_consent(self):
        self.login()
        path = '/api/data/dms/alice__bob'
        self.assertEqual(self.write(path + '/messages/old', {'from': 'alice', 'text': 'old', 'ts': 1}, 'PUT').status_code, 200)
        self.assertEqual(self.write('/api/conversations/delete', {'conversation': 'alice__bob'}, 'POST').status_code, 200)
        self.login('bob')
        self.assertEqual(self.write(path + '/messages/new', {'from': 'bob', 'text': 'new', 'ts': 2}, 'PUT').status_code, 200)
        self.assertEqual(self.write('/api/conversations/delete', {'conversation': 'alice__bob'}, 'POST').status_code, 200)
        self.assertIsNotNone(self.database.document('dms', 'alice__bob'))
        self.login()
        self.assertEqual(set(self.client.get(path).json['data']['messages']), {'new'})
        self.assertNotIn('deletedFor', self.client.get(path).json['data'])
        self.assertEqual(self.write('/api/conversations/delete', {'conversation': 'alice__bob'}, 'POST').status_code, 200)
        self.assertIsNone(self.database.document('dms', 'alice__bob'))

    def test_cannot_destroy_other_participants_history_or_forge_deletion(self):
        self.login()
        path = '/api/data/dms/alice__bob'
        self.write(path + '/messages/one', {'from': 'alice', 'text': 'retained', 'ts': 1}, 'PUT')
        self.assertEqual(self.write(path, method='DELETE').status_code, 403)
        self.assertEqual(self.write(path + '/deletedFor', {'bob': True}, 'PUT').status_code, 403)
        self.assertEqual(self.write('/api/conversations/delete', {'conversation': 'bob__carol'}, 'POST').status_code, 403)
        self.assertEqual(self.database.document('dms', 'alice__bob')['messages']['one']['text'], 'retained')

    def test_units_editor_rejects_unknown_units_and_support_write_access(self):
        self.database.accounts['alice']['profile']['isSupport'] = True
        self.login()
        self.assertEqual(self.write('/api/admin/users/bob/units', {'units': ['LACAM']}).status_code, 403)
        self.database.accounts['alice']['profile']['isAdmin'] = True
        self.login()
        for body in ({'units': []}, {'units': ['Unknown']}, {'units': 'LACAM'}, {'units': [True]}):
            self.assertEqual(self.write('/api/admin/users/bob/units', body).status_code, 400)
        self.assertEqual(self.client.get('/api/admin/audit').json['total'], 0)
        self.assertEqual(self.write('/api/admin/users/bob/units', {'units': ['LACAM', 'LabNeuroMusc']}).status_code, 200)
        self.assertEqual(self.client.get('/api/admin/users?q=bob').json['items'][0]['units'], ['LACAM', 'LabNeuroMusc'])

    def test_nested_unsafe_keys_are_rejected_but_message_text_is_preserved(self):
        self.login()
        for key in ('__proto__', 'constructor', 'unsafe"key'):
            result = self.write('/api/data/posts/invalid', {'uid': 'alice', 'text': 'text', 'extra': {'nested': {key: True}}}, 'PUT')
            self.assertEqual(result.status_code, 400)
        body = {'uid': 'alice', 'text': 'Text with <tags>, "quotes" and emoji.'}
        self.assertEqual(self.write('/api/data/posts/valid', body, 'PUT').status_code, 200)
        self.assertEqual(self.database.document('posts', 'valid')['text'], body['text'])

    def test_uploaded_html_and_svg_assets_receive_a_restrictive_csp(self):
        response = self.client.get('/assets/password-reset.html')
        policy = response.headers['Content-Security-Policy']
        self.assertIn("default-src 'none'", policy)
        self.assertIn('sandbox', policy)
        self.assertIn("frame-ancestors 'none'", policy)
        response.close()

    def test_livekit_credentials_must_be_present_as_a_strong_pair(self):
        with self.assertRaisesRegex(RuntimeError, 'LIVEKIT_API_KEY'):
            test_api.create_app({
                'TESTING': True, 'SECRET_KEY': 'x' * 40, 'STORAGE_DIR': self.folder.name,
                'LIVEKIT_API_KEY': 'short', 'LIVEKIT_API_SECRET': 's' * 32,
            }, self.database)

    def test_chunk_limit_does_not_change_the_configured_upload_limit(self):
        self.login()
        self.app.config.update(MAX_CONTENT_LENGTH=16 * 1024 * 1024, STORAGE_LIMIT_BYTES=16 * 1024 * 1024)
        upload = BytesIO(b'x' * (8 * 1024 * 1024 + 1))
        response = self.client.post(
            '/api/files',
            data={'file': (upload, 'large.csv')},
            headers={'X-CSRF-Token': self.csrf},
        )
        upload.close()
        self.assertEqual(response.status_code, 201)
        response.close()


if __name__ == '__main__':
    unittest.main()

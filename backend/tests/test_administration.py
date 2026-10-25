"""Acesso administrativo, projeções privadas e auditoria atômica."""
import json
import time
import unittest
from unittest.mock import patch
from werkzeug.security import generate_password_hash
from backend.tests.test_api import ApiTests


class AdministrationTests(unittest.TestCase):
    setUp = ApiTests.setUp
    login = ApiTests.login
    write = ApiTests.write

    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('senha-de-teste-segura')

    def admin(self):
        self.database.accounts['alice']['profile']['isAdmin'] = True
        self.login()

    def test_anonymous_and_member_cannot_read_panel(self):
        for route in ('overview', 'users', 'audit'):
            self.assertEqual(self.client.get('/api/admin/' + route).status_code, 401)
        self.login()
        for route in ('overview', 'users', 'audit'):
            self.assertEqual(self.client.get('/api/admin/' + route).status_code, 403)
        self.assertEqual(self.write('/api/admin/users/bob/role', {'role': 'admin'}).status_code, 403)

    def test_support_reads_but_cannot_manage_and_revocation_is_immediate(self):
        self.database.accounts['alice']['profile']['isSupport'] = True
        self.login()
        self.assertEqual(self.client.get('/api/admin/users').status_code, 200)
        self.assertFalse(self.client.get('/api/admin/users').json['canManageUsers'])
        self.assertEqual(self.client.get('/api/admin/overview').status_code, 200)
        self.assertEqual(self.client.get('/api/admin/audit').status_code, 200)
        self.assertEqual(self.write('/api/admin/users/bob/role', {'role': 'admin'}).status_code, 403)
        self.assertEqual(self.write('/api/data/users/alice', {'isAdmin': True}).status_code, 403)
        self.assertEqual(self.write('/api/users/bob', method='DELETE').status_code, 403)
        self.database.accounts['alice']['profile']['isSupport'] = False
        self.assertEqual(self.client.get('/api/admin/users').status_code, 403)

    def test_private_projection_search_and_pagination(self):
        self.admin()
        self.database.accounts['bob']['profile'].update(bio='not for the panel', photo='private-photo')
        for i in range(26):
            self.database.create_user('u'+str(i), f'test{i}@example.org', self.password_hash, {'name': f'User {i}'})
        result = self.client.get('/api/admin/users').json
        self.assertEqual(result['total'], 29)
        self.assertEqual(len(result['items']), 20)
        self.assertEqual(result['pages'], 2)
        self.assertEqual(len(self.client.get('/api/admin/users?page=2').json['items']), 9)
        data = self.client.get('/api/admin/users?q=BOB%40example.org').json
        self.assertEqual(data['items'][0]['email'], 'bob@example.org')
        self.assertEqual(data['total'], 1)
        serialized = json.dumps(data)
        for secret in ('password_hash', 'session_version', self.password_hash, 'not for the panel', 'private-photo'):
            self.assertNotIn(secret, serialized)
        for query in ('page=0', 'page=no', 'status=other', 'role=dev'):
            self.assertEqual(self.client.get('/api/admin/users?'+query).status_code, 400)

    def test_overview_and_online_filters_use_server_data(self):
        self.admin()
        now = int(time.time() * 1000)
        self.database.accounts['bob']['profile']['createdAt'] = now
        self.database.save_document('presence', 'bob', {'online': True, 'lastSeen': now})
        self.database.save_document('presence', 'carol', {'online': True, 'lastSeen': now-100000})
        self.database.save_document('posts', 'one', {'uid': 'bob', 'text': 'hello'})
        self.database.save_document('metas', 'done', {'done': True})
        self.database.save_document('metas', 'open', {'done': False})
        self.database.save_document('demandas_private', 'LACAM', {'open': {'done': False}})
        counts = self.client.get('/api/admin/overview').json['counts']
        self.assertEqual((counts['active'], counts['online'], counts['posts'], counts['metas'], counts['demandas'], counts['newWeek']), (3, 1, 1, 1, 1, 1))
        self.assertEqual(self.client.get('/api/admin/users?status=online').json['items'][0]['id'], 'bob')
        self.assertIsNotNone(self.client.get('/api/admin/users?q=alice').json['items'][0]['lastSeen'])

    def test_permission_and_removal_audit_and_contributions_survive(self):
        self.admin()
        self.assertEqual(self.write('/api/admin/users/bob/role', {'role': 'support'}).status_code, 200)
        self.assertTrue(self.database.user('bob')['profile']['isSupport'])
        self.assertEqual(self.write('/api/data/users/bob', {'bio': 'Updated by admin'}).status_code, 200)
        self.database.save_document('posts', 'by-bob', {'uid': 'bob', 'text': 'Preserved'})
        self.assertEqual(self.write('/api/users/bob', method='DELETE').status_code, 200)
        records = self.client.get('/api/admin/audit').json['items']
        self.assertEqual({r['action'] for r in records}, {'user.permissions', 'user.updated', 'user.removed'})
        self.assertTrue(all(r['actorId'] == 'alice' and r['targetId'] == 'bob' for r in records))
        self.assertEqual(self.database.document('posts', 'by-bob')['text'], 'Preserved')
        self.assertEqual(self.client.get('/api/admin/users?status=removed').json['items'][0]['email'], 'bob@example.org')
        self.assertEqual(self.write('/api/admin/users/bob/role', {'role': 'member'}).status_code, 404)

    def test_self_access_protection_csrf_and_invalid_roles(self):
        self.admin()
        self.assertEqual(self.write('/api/admin/users/alice/role', {'role': 'member'}).status_code, 403)
        self.assertEqual(self.write('/api/data/users/alice', {'isAdmin': False}).status_code, 403)
        self.assertEqual(self.client.patch('/api/admin/users/bob/role', json={'role': 'support'}).status_code, 403)
        for value in ({'role': 'dev'}, {'role': []}, {'role': 'admin', 'extra': True}, []):
            self.assertEqual(self.write('/api/admin/users/bob/role', value).status_code, 400)
        self.assertEqual(self.client.get('/api/admin/audit').json['total'], 0)

    def test_audit_failure_rolls_back_permission_change(self):
        self.admin()
        original = self.database.save_document
        def fail(collection, key, value):
            if collection == '_admin_audit':
                raise RuntimeError('audit unavailable')
            return original(collection, key, value)
        with patch.object(self.database, 'save_document', side_effect=fail):
            with self.assertRaises(RuntimeError):
                self.write('/api/admin/users/bob/role', {'role': 'admin'})
        self.assertFalse(self.database.user('bob')['profile'].get('isAdmin'))

    def test_internal_history_and_access_records_not_public(self):
        self.admin()
        self.write('/api/admin/users/bob/role', {'role': 'support'})
        self.login('carol')
        for path in ('_admin_audit', '_account_access/alice'):
            self.assertEqual(self.client.get('/api/data/'+path).status_code, 404)
            self.assertEqual(self.write('/api/data/'+path, {}).status_code, 404)
        self.assertNotIn('email', self.client.get('/api/data/users/alice').json['data'])


if __name__ == '__main__':
    unittest.main()

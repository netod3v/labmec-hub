"""Directory privacy is enforced on collection and direct API reads."""
import unittest
from backend.tests import test_api


class DirectoryPrivacyTests(unittest.TestCase):
    setUpClass = classmethod(test_api.ApiTests.setUpClass.__func__)
    login = test_api.ApiTests.login
    write = test_api.ApiTests.write

    def setUp(self):
        test_api.ApiTests.setUp(self)
        self.database.accounts['bob']['profile'].update(isAdmin=True, directoryHidden=True)
        self.database.accounts['carol']['profile']['isAdmin'] = True
        self.database.save_document('presence', 'bob', {'online': True, 'lastSeen': 1})
        self.database.save_document('presence', 'carol', {'online': True, 'lastSeen': 1})

    def test_member_cannot_read_hidden_profile_or_presence_by_any_path(self):
        self.login()
        for collection in ('users', 'presence'):
            records = self.client.get('/api/data/' + collection).json['data']
            self.assertNotIn('bob', records)
            self.assertIn('carol', records)
            for suffix in ('/bob', '/bob/name', '/bob/online'):
                self.assertIsNone(self.client.get('/api/data/' + collection + suffix).json['data'])
        paths = ['users', 'users/bob', 'users/bob/name', 'presence', 'presence/bob', 'presence/bob/online']
        result = self.write('/api/sync', {'paths': paths}, 'POST').json['data']
        self.assertNotIn('bob', result['users'])
        self.assertNotIn('bob', result['presence'])
        for path in paths:
            if '/bob' in path:
                self.assertIsNone(result[path])

    def test_hidden_admin_retains_own_profile_and_admin_panel_visibility(self):
        self.login('bob')
        self.assertIn('bob', self.client.get('/api/data/users').json['data'])
        self.assertIsNotNone(self.client.get('/api/data/presence/bob').json['data'])
        self.assertEqual(self.client.get('/api/admin/overview').status_code, 200)
        self.assertIn('bob', [row['id'] for row in self.client.get('/api/admin/users').json['items']])

    def test_visibility_flag_is_private_and_cannot_be_set_by_member(self):
        self.login()
        self.assertEqual(self.write('/api/data/users/alice', {'directoryHidden': True}).status_code, 403)
        self.login('carol')
        profile = self.client.get('/api/data/users/bob').json['data']
        self.assertNotIn('directoryHidden', profile)
        self.assertIsNotNone(self.client.get('/api/data/presence/bob').json['data'])

    def test_flag_does_not_hide_non_admin_accounts(self):
        self.database.accounts['bob']['profile']['isAdmin'] = False
        self.login()
        self.assertIn('bob', self.client.get('/api/data/users').json['data'])

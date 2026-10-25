import unittest
from werkzeug.security import generate_password_hash
from backend.tests import test_api


class NotificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash=generate_password_hash('senha-de-teste-segura')
    setUp=test_api.ApiTests.setUp
    login=test_api.ApiTests.login
    write=test_api.ApiTests.write

    def test_first_post_notifies_once_and_survives_edit_delete_and_login(self):
        self.login()
        result=self.write('/api/data/posts/first',{'uid':'alice','text':'Primeira publicação'},'PUT')
        self.assertTrue(result.json['firstPost'])
        notice=self.client.get('/api/data/notifications/alice').json['data']
        self.assertEqual(list(notice),['achievement-first-post'])
        self.assertEqual(notice['achievement-first-post']['title'],'Primeira voz')
        self.assertGreater(notice['achievement-first-post']['ts'],0)
        self.assertEqual(self.write('/api/data/posts/first/text','Editada','PUT').status_code,200)
        self.assertEqual(self.write('/api/data/posts/first',method='DELETE').status_code,200)
        self.assertEqual(self.write('/api/data/posts/second',{'uid':'alice','text':'Outra'},'PUT').status_code,200)
        self.login()
        self.assertEqual(self.client.get('/api/data/notifications/alice').json['data'],notice)

    def test_notices_are_private_read_only_and_failed_posts_do_not_notify(self):
        self.login()
        self.assertEqual(self.write('/api/data/posts/invalid',{'uid':'bob','text':'Inválida'},'PUT').status_code,403)
        self.assertIsNone(self.client.get('/api/data/notifications/alice').json['data'])
        self.assertEqual(self.write('/api/data/notifications/alice/fake',{'title':'Forjada'},'PUT').status_code,403)
        self.write('/api/data/posts_private/LACAM/first',{'uid':'alice','text':'Na equipe'},'PUT')
        self.assertIn('achievement-first-post',self.client.get('/api/data/notifications/alice').json['data'])
        self.login('bob')
        self.assertEqual(self.client.get('/api/data/notifications/alice').status_code,403)
        self.assertIsNone(self.client.get('/api/data/notifications').json['data'])
        result=self.client.post('/api/sync',json={'paths':['notifications/alice','notifications/bob']},headers={'X-CSRF-Token':self.csrf})
        self.assertIsNone(result.json['data']['notifications/alice'])
        self.assertIsNone(result.json['data']['notifications/bob'])

    def test_first_publication_badge_is_visible_to_others_and_server_controlled(self):
        self.login()
        self.write('/api/data/posts/first',{'uid':'alice','text':'Olá'},'PUT')
        self.assertTrue(self.client.get('/api/data/posts/first').json['data']['_firstPublication'])
        self.write('/api/data/posts/first/_firstPublication',False,'PUT')
        self.assertTrue(self.client.get('/api/data/posts/first').json['data']['_firstPublication'])
        self.write('/api/data/posts/second',{'uid':'alice','text':'Outra','_firstPublication':True},'PUT')
        self.assertNotIn('_firstPublication',self.client.get('/api/data/posts/second').json['data'])
        self.login('bob')
        self.assertTrue(self.client.get('/api/data/posts/first').json['data']['_firstPublication'])
        self.write('/api/data/posts_private/LabNeuroMusc/first',{'uid':'bob','text':'Na equipe'},'PUT')
        self.assertTrue(self.client.get('/api/data/posts_private/LabNeuroMusc/first').json['data']['_firstPublication'])
        self.login('carol')
        self.assertEqual(self.client.get('/api/data/posts_private/LabNeuroMusc/first').status_code,403)

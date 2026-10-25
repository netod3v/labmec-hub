"""Integração opcional. Use somente um banco PostgreSQL exclusivo de testes."""
import os
from io import BytesIO
import tempfile
import unittest
from uuid import uuid4

from backend.database import Database
from backend.app import create_app
from werkzeug.security import generate_password_hash


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL não configurada')
class PostgresTests(unittest.TestCase):
    def test_member_removal_preserves_file_ownership_and_revokes_credentials(self):
        database = Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        key = 'removed_' + uuid4().hex
        file_id = uuid4().hex
        try:
            with database.transaction() as repository:
                repository.create_user(key, key + '@example.org', 'previous-password-hash', {'name':'Integrante'})
                repository.add_file(dict(id=file_id, owner_id=key, name='research.pdf', project='Projeto', unit='LACAM', size=12))
                repository.save_document('presence', key, {'online': True})
                repository.remove_user_access(key)
            with database.transaction() as repository:
                removed = repository.user(key)
                self.assertEqual(removed['password_hash'], '!')
                self.assertEqual(removed['session_version'], 2)
                self.assertEqual(removed['profile'], {'name':'Conta excluída', 'isRemoved':True})
                self.assertEqual(repository.file(file_id)['owner_id'], key)
                self.assertIsNone(repository.document('presence', key))
        finally:
            with database.transaction() as repository:
                repository.delete_file(file_id)
                repository.save_document('presence', key, None)
                repository.connection.execute('DELETE FROM users WHERE id = %s', (key,))

    def test_http_attachment_roundtrip(self):
        database = Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        key = 'test_' + uuid4().hex
        file_id = None
        try:
            with database.transaction() as repository:
                repository.create_user(key, key + '@example.org', generate_password_hash('senha-segura-de-teste'), {'name': 'Teste'})
            with tempfile.TemporaryDirectory() as folder:
                app = create_app({'TESTING': True, 'SECRET_KEY': 't' * 40, 'STORAGE_DIR': folder}, database)
                client = app.test_client()
                csrf = client.get('/api/session').json['csrf']
                login = client.post('/api/auth/login', json={'email': key + '@example.org', 'password': 'senha-segura-de-teste'},
                                    headers={'X-CSRF-Token': csrf})
                self.assertEqual(login.status_code, 200)
                headers = {'X-CSRF-Token': login.json['csrf']}
                upload = client.post('/api/files', data={'file': (BytesIO(b'%PDF-1.7\nTeste'), 'artigo.pdf'), 'purpose': 'post'}, headers=headers)
                self.assertEqual(upload.status_code, 201)
                file_id = upload.json['file']['id']
                post = client.put('/api/data/posts/' + key, json={'uid': key, 'text': '', 'attachments': [{'id': file_id}]}, headers=headers)
                self.assertEqual(post.status_code, 200)
                self.assertTrue(post.json['firstPost'])
                with database.transaction() as repository:
                    self.assertEqual(repository.file(file_id)['post_path'], 'posts/' + key)
                response = client.get('/api/files/' + file_id + '?inline=1')
                self.assertEqual(response.mimetype, 'application/pdf')
                self.assertEqual(response.data, b'%PDF-1.7\nTeste')
                response.close()
                self.assertEqual(client.delete('/api/files/' + file_id, headers=headers).status_code, 200)
                demand_path = 'demandas/' + key
                demand = {'uid': key, 'text': 'Analisar dados', 'status': 'doing', 'done': False}
                self.assertEqual(client.put('/api/data/' + demand_path, json=demand, headers=headers).status_code, 200)
                self.assertEqual(client.post('/api/demands/trash', json={'path': demand_path}, headers=headers).status_code, 200)
                self.assertTrue(client.get('/api/data/' + demand_path).json['data']['deleted'])
                self.assertEqual(client.delete('/api/data/' + demand_path, headers=headers).status_code, 403)
                self.assertEqual(client.post('/api/demands/restore', json={'path': demand_path}, headers=headers).status_code, 200)
                self.assertEqual(client.get('/api/data/' + demand_path).json['data'], demand)
                search = client.get('/api/search', query_string={'q': 'analisar', 'category': 'demandas'})
                self.assertEqual(search.status_code, 200)
                self.assertTrue(any(row['target']['id'] == key for group in search.json['groups'] for row in group['items']))
        finally:
            with database.transaction() as repository:
                if file_id:
                    repository.delete_file(file_id)
                repository.save_document('posts', key, None)
                repository.save_document('_mural_milestones', key, None)
                repository.save_document('_hub_achievements', key, None)
                repository.save_document('demandas', key, None)
                repository.connection.execute('DELETE FROM users WHERE id = %s', (key,))

    def test_schema_jsonb_transactions_and_files(self):
        database = Database(os.environ['TEST_DATABASE_URL'])
        database.initialize()
        key = 'test_' + uuid4().hex
        try:
            with database.transaction() as repository:
                repository.create_user(key, key + '@example.org', 'not-a-real-password-hash', {'name': 'Teste'})
                repository.lock_document('posts', key)
                repository.save_document('posts', key, {'uid': key, 'text': 'Acentuação: pesquisa'})
                repository.add_file(dict(id=key, owner_id=key, name='teste.csv', project='Teste', unit=None, size=3))
            with database.transaction() as repository:
                self.assertEqual(repository.document('posts', key)['text'], 'Acentuação: pesquisa')
                self.assertEqual(repository.file(key)['size'], 3)
                repository.update_file_organization(key, 'Novo projeto', 'LACAM')
                self.assertEqual(repository.user_by_email(key + '@example.org')['id'], key)
                repository.bind_file_to_post(key, 'posts/' + key)
            with database.transaction() as repository:
                self.assertEqual(repository.file(key)['post_path'], 'posts/' + key)
                self.assertEqual(repository.file(key)['project'], 'Novo projeto')
                self.assertEqual(repository.file(key)['unit'], 'LACAM')
            with self.assertRaises(RuntimeError):
                with database.transaction() as repository:
                    repository.save_document('posts', key, {'text': 'Não deve persistir'})
                    raise RuntimeError('Força rollback')
            with database.transaction() as repository:
                self.assertEqual(repository.document('posts', key)['uid'], key)
        finally:
            with database.transaction() as repository:
                repository.delete_file(key)
                repository.save_document('posts', key, None)
                repository.connection.execute('DELETE FROM users WHERE id = %s', (key,))

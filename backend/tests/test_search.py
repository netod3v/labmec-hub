"""Busca unificada: filtros, resultados e isolamento de conteúdo privado."""
import unittest
from werkzeug.security import generate_password_hash

from backend.tests import test_api as fixtures


class SearchTests(unittest.TestCase):
    setUp = fixtures.ApiTests.setUp
    write = fixtures.ApiTests.write
    login = fixtures.ApiTests.login

    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('senha-de-teste-segura')

    def search(self, query='marcha', **filters):
        return self.client.get('/api/search', query_string={'q': query, **filters})

    def test_groups_and_own_goals_are_separate_without_double_counting(self):
        self.database.save_document('posts', 'p1', {'uid': 'alice', 'text': 'Marcha no laboratório', 'ts': 1})
        self.database.save_document('metas', 'm1', {'uid': 'alice', 'text': 'Estudar marcha', 'ts': 2})
        self.database.save_document('metas', 'm2', {'uid': 'bob', 'text': 'Medir marcha', 'ts': 3})
        self.database.save_document('demandas', 'd1', {'uid': 'bob', 'text': 'Coleta de marcha', 'ts': 4})
        self.login()
        result = self.search().json
        self.assertEqual(result['total'], 4)
        self.assertEqual(result['counts']['minhas_metas'], 1)
        self.assertNotIn('minhas_metas', [group['category'] for group in result['groups']])
        mine = self.search(category='minhas_metas').json
        self.assertEqual(mine['total'], 1)
        self.assertEqual(mine['groups'][0]['items'][0]['target']['id'], 'm1')

    def test_private_unit_content_does_not_leak_in_results_or_counts(self):
        self.database.save_document('posts_private', 'LabNeuroMusc', {'p1': {'uid': 'bob', 'text': 'Marcha secreta'}})
        self.database.save_document('metas_private', 'LACAM', {'m1': {'uid': 'carol', 'text': 'Marcha permitida'}})
        self.login()
        result = self.search().json
        self.assertEqual(result['counts']['mural'], 0)
        self.assertEqual(result['counts']['metas'], 1)
        self.assertNotIn('secreta', str(result))

    def test_notes_personal_demands_and_messages_are_private(self):
        self.database.save_document('private_notes', 'alice', {'tabs': [{'id': 't1', 'title': 'Marcha', 'content': '<p>Anotação privada</p>'}]})
        self.database.save_document('private_notes', 'bob', {'tabs': [{'id': 't2', 'title': 'Segredo exclusivo', 'content': 'Marcha'}]})
        self.database.save_document('personal_demands', 'alice', {'d1': {'text': 'Marcha pessoal', 'ts': 2}})
        self.database.save_document('personal_demands', 'bob', {'d2': {'text': 'Marcha proibida', 'ts': 2}})
        self.database.save_document('dms', 'alice__bob', {'messages': {'m1': {'from': 'bob', 'text': 'Marcha compartilhada', 'ts': 3}}})
        self.database.save_document('dms', 'bob__carol', {'messages': {'m2': {'from': 'bob', 'text': 'Marcha segredo exclusivo', 'ts': 3}}})
        self.login()
        result = self.search().json
        self.assertEqual(result['counts']['notas'], 1)
        self.assertEqual(result['counts']['mensagens'], 1)
        self.assertEqual(result['counts']['demandas'], 1)
        self.assertNotIn('exclusivo', str(result))
        self.assertNotIn('proibida', str(result))

    def test_files_follow_library_and_post_permissions(self):
        for key, owner in [('a', 'alice'), ('b', 'bob')]:
            self.database.add_file(dict(id=key, owner_id=owner, name='Marcha.pdf', project='Pesquisa', unit=None, size=10))
        self.database.add_file(dict(id='c', owner_id='bob', name='Marcha-compartilhada.pdf', project='Pesquisa', unit=None,
                                    size=10, purpose='post', post_path='posts_private/LACAM/p1'))
        self.database.save_document('posts_private', 'LACAM', {'p1': {'uid': 'bob', 'text': 'Estudo', 'attachments': [{'id': 'c'}]}})
        self.login()
        result = self.search(category='arquivos').json
        self.assertEqual(result['total'], 2)
        self.assertEqual({row['target']['id'] for row in result['groups'][0]['items']}, {'a', 'c'})

    def test_filters_for_created_assigned_completed_and_deleted(self):
        self.database.save_document('metas', 'own', {'uid': 'alice', 'text': 'Marcha própria', 'done': True})
        self.database.save_document('demandas', 'assigned', {'uid': 'bob', 'text': 'Marcha atribuída', 'assignedTo': {'alice': True}})
        self.database.save_document('demandas', 'deleted', {'uid': 'alice', 'text': 'Marcha excluída', 'deleted': True})
        self.login()
        self.assertEqual(self.search(scope='mine').json['total'], 1)
        self.assertEqual(self.search(scope='assigned').json['total'], 1)
        self.assertEqual(self.search(scope='completed').json['total'], 1)
        result = self.search(scope='deleted').json
        self.assertEqual(result['total'], 1)
        self.assertTrue(result['groups'][0]['items'][0]['deleted'])
        self.assertEqual(self.search().json['total'], 2)

    def test_accents_comments_and_multiple_words_are_searchable(self):
        self.database.save_document('posts', 'p1', {'uid': 'alice', 'text': 'Análise do movimento',
                                                  'comments': {'c1': {'text': 'Resultados da marcha'}}})
        self.login()
        self.assertEqual(self.search('analise marcha').json['counts']['mural'], 1)
        self.assertEqual(self.search('analise inexistente').json['total'], 0)

    def test_limits_and_input_validation(self):
        self.login()
        for index in range(24):
            self.database.save_document('metas', str(index), {'uid': 'alice', 'text': 'Marcha ' + str(index), 'ts': index})
        result = self.search(category='metas').json
        self.assertEqual(result['total'], 24)
        self.assertEqual(len(result['groups'][0]['items']), 20)
        for parameters in ({'q': 'a'}, {'q': '\u0301\u0301'}, {'q': 'a' * 121}, {'q': 'marcha', 'category': 'invalida'}, {'q': 'marcha', 'scope': 'invalido'}):
            self.assertEqual(self.client.get('/api/search', query_string=parameters).status_code, 400)

    def test_search_requires_login(self):
        self.assertEqual(self.search().status_code, 401)

    def test_legacy_field_shapes_do_not_break_search(self):
        self.database.save_document('demandas', 'old', {'uid': 'alice', 'text': 'Marcha antiga', 'assignedTo': [], 'mentions': '', 'ts': 'data antiga'})
        self.database.save_document('posts', 'old', {'uid': 'bob', 'text': 'Marcha antiga', 'attachments': 1})
        self.database.save_document('private_notes', 'alice', {'tabs': 1})
        self.login()
        response = self.search()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['total'], 2)

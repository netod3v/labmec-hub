"""Testes HTTP com repositório em memória; não substituem o teste PostgreSQL."""
from contextlib import contextmanager
from copy import deepcopy
from io import BytesIO
from pathlib import Path
import tempfile
import unittest

from werkzeug.security import generate_password_hash

from backend.app import create_app


class MemoryDatabase:
    """Dublê restrito aos testes: nunca usado pelo aplicativo em produção."""
    def __init__(self):
        self.accounts, self.records, self.files, self.attempts = {}, {}, {}, {}

    @contextmanager
    def transaction(self):
        backup = deepcopy((self.accounts, self.records, self.files, self.attempts))
        try:
            yield self
        except Exception:
            self.accounts, self.records, self.files, self.attempts = backup
            raise

    def user(self, user_id):
        return deepcopy(self.accounts.get(user_id))

    def user_by_email(self, email):
        return next((self.user(key) for key, user in self.accounts.items() if user['email'] == email), None)

    def users(self):
        return list(deepcopy(self.accounts).values())

    def administration_users(self):
        return [{key: value for key, value in row.items() if key in {'id', 'email', 'profile', 'created_at'}} for row in self.users()]

    def create_user(self, user_id, email, password_hash, profile):
        self.accounts[user_id] = dict(id=user_id, email=email, password_hash=password_hash,
                                      profile=deepcopy(profile), session_version=1)

    def update_profile(self, user_id, profile):
        self.accounts[user_id]['profile'] = deepcopy(profile)

    def change_password(self, user_id, password_hash):
        self.accounts[user_id]['password_hash'] = password_hash
        self.accounts[user_id]['session_version'] += 1

    def remove_user_access(self, user_id):
        self.accounts[user_id]['profile'] = {'name': 'Conta excluída', 'isRemoved': True}
        self.accounts[user_id]['password_hash'] = '!'
        self.accounts[user_id]['session_version'] += 1
        self.save_document('presence', user_id, None)

    def lock_document(self, *args):
        pass

    def documents(self, collection):
        return [dict(id=key, data=deepcopy(value)) for (name, key), value in self.records.items() if name == collection]

    def document(self, collection, document_id):
        return deepcopy(self.records.get((collection, document_id)))

    def game_scores_for_week(self, week):
        return [record for record in self.documents('_game_scores') if record['data'].get('week') == week]

    def save_document(self, collection, document_id, value):
        if value is None:
            self.records.pop((collection, document_id), None)
        else:
            self.records[collection, document_id] = deepcopy(value)

    def attempt_allowed(self, key, limit=15, window_seconds=900):
        self.attempts[key] = self.attempts.get(key, 0) + 1
        return self.attempts[key] <= limit

    def list_files(self):
        return list(deepcopy(self.files).values())

    def file(self, key):
        return deepcopy(self.files.get(key))

    def add_file(self, record):
        self.files[record['id']] = deepcopy(record)

    def bind_file_to_post(self, file_id, post_path):
        self.files[file_id]['post_path'] = post_path

    def update_file_organization(self, file_id, project, unit):
        self.files[file_id].update(project=project, unit=unit)

    def delete_file(self, key):
        self.files.pop(key, None)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('senha-de-teste-segura')

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.database = MemoryDatabase()
        for name, unit in [('alice', 'LACAM'), ('bob', 'LabNeuroMusc'), ('carol', 'LACAM')]:
            self.database.create_user(name, name + '@example.org', self.password_hash,
                                       dict(name=name, sectors={unit: True}))
        self.app = create_app(dict(TESTING=True, SECRET_KEY='x' * 40, STORAGE_DIR=self.folder.name,
                                   STORAGE_LIMIT_BYTES=1024, ALLOW_REGISTRATION=True, LIVEKIT_API_KEY='', LIVEKIT_API_SECRET=''), self.database)
        self.client = self.app.test_client()
        self.csrf = self.client.get('/api/session').json['csrf']

    def write(self, url, value=None, method='PATCH', **kwargs):
        return self.client.open(url, method=method, json=value,
                                headers={'X-CSRF-Token': self.csrf}, **kwargs)

    def login(self, name='alice'):
        response = self.write('/api/auth/login', dict(email=name+'@example.org', password='senha-de-teste-segura'), 'POST')
        self.assertEqual(response.status_code, 200)
        self.csrf = response.json['csrf']

    def test_login_requires_csrf_and_rejects_wrong_password(self):
        self.assertEqual(self.client.post('/api/auth/login', json={}).status_code, 403)
        response = self.write('/api/auth/login', dict(email='alice@example.org', password='errada'), 'POST')
        self.assertEqual(response.status_code, 401)

    def test_login_rotates_csrf_and_logout_clears_session(self):
        old = self.csrf
        self.login()
        self.assertNotEqual(old, self.csrf)
        self.assertEqual(self.write('/api/auth/logout', method='POST').status_code, 200)
        self.assertEqual(self.client.get('/api/data/users').status_code, 401)

    def test_self_promotion_and_unknown_units_are_denied(self):
        self.login()
        for data in ({'isAdmin': True}, {'isDev': True}, {'sectors': {'Unidade inexistente': True}}):
            self.assertEqual(self.write('/api/data/users/alice', data).status_code, 403)
        self.assertEqual(self.write('/api/data/users/alice', {'bio': 'Pesquisadora'}).status_code, 200)

    def test_members_choose_affiliation_and_existing_units(self):
        self.database.save_document('posts_private', 'LabNeuroMusc', {'notice': {'uid': 'bob', 'text': 'Equipe'}})
        self.login()
        self.assertEqual(self.client.get('/api/data/posts_private/LabNeuroMusc').status_code, 403)
        response = self.write('/api/data/users/alice', {'affiliation': 'masters', 'sectors': {'LACAM': True, 'LabNeuroMusc': True}})
        self.assertEqual(response.status_code, 200)
        profile = self.client.get('/api/data/users/alice').json['data']
        self.assertEqual(profile['affiliation'], 'masters')
        self.assertTrue(profile['sectors']['LabNeuroMusc'])
        self.assertEqual(self.client.get('/api/data/posts_private/LabNeuroMusc').status_code, 200)
        self.assertEqual(self.write('/api/data/users/bob', {'affiliation': 'masters'}).status_code, 403)
        for data in ({'affiliation': 'admin'}, {'affiliation': []}, {'affiliation': None}, {'sectors': None}, {'sectors': {}}, {'sectors': ['LACAM']}, {'sectors': {'LACAM': 'yes'}}):
            self.assertEqual(self.write('/api/data/users/alice', data).status_code, 400)
        self.assertEqual(self.write('/api/data/users/alice', {'affiliation': 'collaborator', 'sectors': {'LACAM': True}}).status_code, 200)
        self.assertEqual(self.client.get('/api/data/posts_private/LabNeuroMusc').status_code, 403)

    def test_academic_groups_cannot_be_chosen_as_new_laboratory_units(self):
        self.login()
        for unit in ['Iniciação científica', 'Pós-graduação', 'Pesquisadores']:
            self.assertEqual(self.write('/api/data/users/alice', {'sectors': {unit: True}}).status_code,403)
        self.database.accounts['alice']['profile']['sectors']['Iniciação científica'] = True
        result=self.write('/api/data/users/alice', {'affiliation':'scientific_initiation','sectors':{'LACAM':True,'Iniciação científica':True}})
        self.assertEqual(result.status_code,200)
        self.assertTrue(self.database.user('alice')['profile']['sectors']['Iniciação científica'])

    def test_password_hashes_and_emails_are_not_in_profiles(self):
        self.login()
        profiles = self.client.get('/api/data/users').json['data']
        self.assertNotIn('password_hash', str(profiles))
        self.assertNotIn('@example.org', str(profiles))

    def test_notification_states_are_private_and_do_not_delete_publications(self):
        self.database.save_document('posts', 'notice', {'uid':'bob','text':'Aviso preservado'})
        self.login()
        self.assertEqual(self.write('/api/data/notification_states/alice/n123', {'read':True}).status_code, 200)
        self.assertTrue(self.client.get('/api/data/notification_states/alice').json['data']['n123']['read'])
        self.assertEqual(self.write('/api/data/notification_states/alice/n123', {'deleted':True}).status_code, 200)
        self.assertTrue(self.client.get('/api/data/notification_states/alice').json['data']['n123']['deleted'])
        self.assertEqual(self.client.get('/api/data/posts/notice').json['data']['text'], 'Aviso preservado')
        self.assertEqual(self.write('/api/data/notification_states/bob/n123', {'deleted':True}).status_code, 403)
        self.login('bob')
        self.assertEqual(self.client.get('/api/data/notification_states/alice').status_code, 403)
        self.database.accounts['bob']['profile']['isAdmin'] = True
        self.assertEqual(self.client.get('/api/data/notification_states/alice').status_code, 403)

    def test_contact_nicknames_are_personal_and_reset_preserves_original_name(self):
        self.login()
        self.assertEqual(self.write('/api/data/contactNicknames/alice/bob', 'Meu colega', 'PUT').status_code, 200)
        self.assertEqual(self.client.get('/api/data/contactNicknames/alice').json['data']['bob'], 'Meu colega')
        self.assertEqual(self.client.get('/api/data/users/bob').json['data']['name'], 'bob')
        self.assertEqual(self.client.get('/api/data/contactNicknames/bob').status_code, 403)
        self.assertEqual(self.write('/api/data/contactNicknames/alice/bob', method='DELETE').status_code, 200)
        self.assertEqual(self.client.get('/api/data/users/bob').json['data']['name'], 'bob')
        self.login('bob')
        self.database.accounts['bob']['profile']['isAdmin'] = True
        self.assertEqual(self.client.get('/api/data/contactNicknames/alice').status_code, 403)

    def test_remove_member_revokes_sessions_login_and_hides_profile(self):
        self.database.accounts['alice']['profile']['isAdmin'] = True
        self.database.save_document('posts', 'by-bob', {'uid': 'bob', 'text': 'Contribuicao preservada'})
        self.database.save_document('presence', 'bob', {'online': True})
        bob = self.app.test_client()
        token = bob.get('/api/session').json['csrf']
        login = bob.post('/api/auth/login', json={'email': 'bob@example.org', 'password': 'senha-de-teste-segura'}, headers={'X-CSRF-Token': token})
        self.assertEqual(login.status_code, 200)
        self.login()
        self.assertEqual(self.write('/api/users/bob', method='DELETE').status_code, 200)
        self.assertEqual(bob.get('/api/data/users').status_code, 401)
        self.assertIsNone(bob.get('/api/session').json['user'])
        self.assertNotIn('bob', self.client.get('/api/data/users').json['data'])
        self.assertNotIn('bob', self.write('/api/sync', {'paths':['users']}, 'POST').json['data']['users'])
        self.assertEqual(self.database.document('posts', 'by-bob')['text'], 'Contribuicao preservada')
        self.assertIsNone(self.database.document('presence', 'bob'))
        self.assertEqual(self.write('/api/data/users/bob', {'isBanned': False}).status_code, 404)
        token = bob.get('/api/session').json['csrf']
        headers = {'X-CSRF-Token': token}
        self.assertEqual(bob.post('/api/auth/login', json={'email':'bob@example.org','password':'senha-de-teste-segura'}, headers=headers).status_code, 401)
        self.assertEqual(bob.post('/api/auth/register', json={'email':'bob@example.org','password':'senha-de-teste-segura'}, headers=headers).status_code, 409)

    def test_removal_requires_admin_and_protects_self_and_other_admins(self):
        self.login()
        self.assertEqual(self.write('/api/users/bob', method='DELETE').status_code, 403)
        self.database.accounts['alice']['profile']['isAdmin'] = True
        self.database.accounts['carol']['profile']['isAdmin'] = True
        self.assertEqual(self.write('/api/users/alice', method='DELETE').status_code, 403)
        self.assertEqual(self.write('/api/users/carol', method='DELETE').status_code, 403)
        self.assertEqual(self.client.delete('/api/users/bob').status_code, 403)
        self.assertEqual(self.write('/api/data/users/bob', {'isDev':True}).status_code, 403)

    def test_private_unit_content_is_filtered_in_sync_and_direct_reads(self):
        self.database.save_document('posts_private', 'LabNeuroMusc', {'secret': {'uid': 'bob', 'text': 'privado'}})
        self.login()
        self.assertEqual(self.client.get('/api/data/posts_private/LabNeuroMusc').status_code, 403)
        result = self.write('/api/sync', {'paths': ['posts_private/LabNeuroMusc', 'posts_private']}, 'POST')
        self.assertIsNone(result.json['data']['posts_private/LabNeuroMusc'])
        self.assertIsNone(result.json['data']['posts_private'])

    def test_posts_comments_and_likes_have_independent_owners(self):
        self.login()
        self.assertEqual(self.write('/api/data/posts/p1', {'uid': 'alice', 'text': 'Olá'}, 'PUT').status_code, 200)
        self.login('bob')
        self.assertEqual(self.write('/api/data/posts/p1', {'text': 'Alterado'}).status_code, 403)
        self.assertEqual(self.write('/api/data/posts/p1/comments/c1', {'uid': 'bob', 'text': 'Resposta'}, 'PUT').status_code, 200)
        self.login('alice')
        self.assertEqual(self.write('/api/data/posts/p1/comments/c1', {'text': 'Alterado'}).status_code, 403)
        self.assertEqual(self.write('/api/data/posts/p1/likes', {'alice': True}).status_code, 200)
        self.assertEqual(self.write('/api/data/posts/p1/likes', {'bob': True}).status_code, 403)

    def test_notes_are_private_even_from_other_unit_members(self):
        self.login()
        note = {'tabs': [{'id': 'document', 'title': 'Experimento', 'documentMode': True,
                         'content': 'Resultados privados',
                         'richContent': '<h1>Resultados</h1><table><tr><td>42</td></tr></table>'
                                        '<span class="note-equation" contenteditable="false">'
                                        '<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math></span>'}],
                'activeTabId': 'document'}
        self.assertEqual(self.write('/api/data/private_notes/alice', note, 'PUT').status_code, 200)
        self.assertEqual(self.database.document('private_notes', 'alice'), note)
        self.login('carol')
        self.assertEqual(self.client.get('/api/data/private_notes/alice').status_code, 403)

    def test_first_mural_post_is_awarded_once_across_public_and_unit_posts(self):
        self.login()
        post = {'uid': 'alice', 'text': 'Primeira publicação', 'ts': 1}
        result = self.write('/api/data/posts_private/LACAM/first', post, 'PUT')
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json['firstPost'])
        self.assertFalse(self.write('/api/data/posts_private/LACAM/first/text', 'Editada', 'PUT').json['firstPost'])
        self.assertEqual(self.write('/api/data/posts_private/LACAM/first', method='DELETE').status_code, 200)
        self.assertFalse(self.write('/api/data/posts/second', post, 'PUT').json['firstPost'])
        self.assertEqual(self.client.get('/api/data/_mural_milestones/alice').status_code, 404)
        self.assertEqual(self.write('/api/data/_mural_milestones/alice', method='DELETE').status_code, 404)
        self.login('bob')
        self.assertTrue(self.write('/api/data/posts/bob-first', {'uid': 'bob', 'text': 'Olá'}, 'PUT').json['firstPost'])

    def test_existing_mural_authors_do_not_get_first_post_award(self):
        self.database.save_document('posts_private', 'LabNeuroMusc', {'old': {'uid': 'alice', 'text': 'Anterior'}})
        self.login()
        result = self.write('/api/data/posts/new', {'uid': 'alice', 'text': 'Novo'}, 'PUT')
        self.assertEqual(result.status_code, 200)
        self.assertFalse(result.json['firstPost'])

    def test_failed_post_does_not_consume_first_post_award(self):
        self.login()
        self.assertEqual(self.write('/api/data/posts/invalid', {'uid': 'bob', 'text': 'Inválido'}, 'PUT').status_code, 403)
        self.assertIsNone(self.database.document('_mural_milestones', 'alice'))
        self.assertTrue(self.write('/api/data/posts/valid', {'uid': 'alice', 'text': 'Olá'}, 'PUT').json['firstPost'])

    def test_achievements_are_persistent_and_cannot_be_forged(self):
        self.assertEqual(self.client.get('/api/achievements/alice').status_code, 401)
        self.login()
        initial = self.client.get('/api/achievements/alice').json
        self.assertTrue(initial['own'])
        self.assertEqual(len(initial['achievements']), 6)
        self.assertEqual(len(initial['catalog']), 6)
        self.assertFalse(any(item['earnedAt'] for item in initial['achievements']))
        for i in range(5):
            result = self.write('/api/data/posts/p'+str(i), {'uid': 'alice', 'text': 'Pesquisa'}, 'PUT')
            self.assertEqual(result.status_code, 200)
        self.assertEqual([item['id'] for item in result.json['achievements']], ['five-posts'])
        self.assertFalse(self.write('/api/data/posts/p0/text', 'Editada', 'PUT').json['achievements'])
        for i in range(5):
            self.assertEqual(self.write('/api/data/posts/p'+str(i), method='DELETE').status_code, 200)
        own = self.client.get('/api/achievements/alice').json['achievements']
        self.assertEqual({item['id'] for item in own if item['earnedAt']}, {'first-post', 'five-posts'})
        self.assertEqual(self.write('/api/data/_hub_achievements/alice', {}, 'PUT').status_code, 404)
        self.login('bob')
        other = self.client.get('/api/achievements/alice').json
        self.assertFalse(other['own'])
        self.assertEqual(len(other['achievements']), 2)
        self.assertTrue(all('progress' not in item for item in other['achievements']))
        self.assertEqual(len(other['catalog']), 6)
        self.assertTrue(all(item['description'] and 'progress' not in item and 'earnedAt' not in item for item in other['catalog']))

    def test_achievement_comments_replies_and_distinct_likes(self):
        for i in range(5):
            self.database.save_document('posts', 'p'+str(i), {'uid': 'bob', 'text': 'Pesquisa'})
        self.login()
        response = self.write('/api/data/posts/p0/comments/c1', {'uid': 'alice', 'text': 'Conversa'}, 'PUT')
        self.assertEqual([item['id'] for item in response.json['achievements']], ['first-comment'])
        for i in range(9):
            response = self.write('/api/data/posts/p0/comments/c1/replies/r'+str(i), {'uid': 'alice', 'text': 'Resposta'}, 'PUT')
            self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.json['achievements']], ['ten-comments'])
        for _ in range(3):
            self.write('/api/data/posts/p0/likes/alice', True, 'PUT')
            self.write('/api/data/posts/p0/likes/alice', method='DELETE')
        status = {item['id']: item for item in self.client.get('/api/achievements/alice').json['achievements']}
        self.assertEqual(status['five-likes']['progress'], 1)
        for i in range(5):
            response = self.write('/api/data/posts/p'+str(i)+'/likes/alice', True, 'PUT')
            self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.json['achievements']], ['five-likes'])

    def test_achievements_backfill_existing_activity_without_duplicate_award(self):
        self.database.save_document('posts', 'legacy', {'uid': 'alice', 'text': 'Existente'})
        self.login()
        profile = self.client.get('/api/achievements/alice').json
        self.assertTrue(next(item for item in profile['achievements'] if item['id'] == 'first-post')['earnedAt'])
        result = self.write('/api/data/posts/next', {'uid': 'alice', 'text': 'Seguinte'}, 'PUT')
        self.assertFalse(result.json['achievements'])

    def test_achievement_visibility_is_enforced_without_erasing_awards(self):
        for i in range(5):
            self.database.save_document('posts', 'p'+str(i), {'uid': 'alice', 'text': 'Pesquisa'})
        self.login()
        preference = {'hideAll': False, 'hidden': ['first-post']}
        self.assertEqual(self.write('/api/data/users/alice', {'achievementVisibility': preference}).status_code, 200)
        own = self.client.get('/api/achievements/alice').json
        self.assertEqual(own['visibility'], preference)
        self.assertFalse(next(item for item in own['achievements'] if item['id'] == 'first-post')['visible'])
        self.assertEqual(len([item for item in own['achievements'] if item['earnedAt']]), 2)
        self.assertNotIn('achievementVisibility', self.client.get('/api/data/users/alice').json['data'])
        self.login('bob')
        public = self.client.get('/api/achievements/alice').json
        self.assertEqual([item['id'] for item in public['achievements']], ['five-posts'])
        self.assertNotIn('visibility', public)
        self.assertTrue(all('earnedAt' not in item for item in public['catalog']))
        self.login()
        preference['hideAll'] = True
        self.assertEqual(self.write('/api/data/users/alice', {'achievementVisibility': preference}).status_code, 200)
        self.login('bob')
        self.assertEqual(self.client.get('/api/achievements/alice').json['achievements'], [])
        self.login()
        self.assertEqual(self.write('/api/data/users/alice', {'achievementVisibility': {'hideAll': False, 'hidden': []}}).status_code, 200)
        self.login('bob')
        self.assertEqual(len(self.client.get('/api/achievements/alice').json['achievements']), 2)

    def test_achievement_visibility_cannot_be_changed_by_others_or_malformed(self):
        self.login()
        self.assertEqual(self.write('/api/data/users/alice', {'achievementVisibility': {'hideAll': False, 'hidden': []}}).status_code, 200)
        for value in (None, {'hideAll': 'yes', 'hidden': []}, {'hideAll': False, 'hidden': ['invalid']},
                      {'hideAll': False, 'hidden': ['first-post', 'first-post']}, {'hideAll': True, 'hidden': 'first-post'}):
            self.assertEqual(self.write('/api/data/users/alice', {'achievementVisibility': value}).status_code, 400)
        profile = self.database.user('bob')['profile']
        profile['isAdmin'] = True
        self.database.update_profile('bob', profile)
        self.login('bob')
        self.assertEqual(self.write('/api/data/users/alice', {'achievementVisibility': {'hideAll': True, 'hidden': []}}).status_code, 403)

    def test_messages_create_server_summaries_and_reject_third_party(self):
        self.login()
        message = {'from': 'alice', 'text': 'Mensagem privada', 'ts': 1}
        self.assertEqual(self.write('/api/data/dms/alice__bob/messages/m1', message, 'PUT').status_code, 200)
        self.assertEqual(self.database.document('conversations', 'bob')['alice']['lastText'], message['text'])
        self.login('carol')
        self.assertEqual(self.client.get('/api/data/dms/alice__bob').status_code, 403)
        self.assertEqual(self.write('/api/data/dms/alice__bob/messages/m2', {'from': 'carol'}, 'PUT').status_code, 403)

    def test_message_deletion_for_me_filters_reads_search_and_summary_only_for_me(self):
        path = '/api/data/dms/alice__bob'
        self.login()
        self.assertEqual(self.write(path+'/messages/m1', {'from':'alice','text':'anterior','ts':1}, 'PUT').status_code, 200)
        self.login('bob')
        self.assertEqual(self.write(path+'/messages/m2', {'from':'bob','text':'segredomensagem','ts':2}, 'PUT').status_code, 200)
        self.assertEqual(self.write('/api/messages/delete', {'conversation':'alice__bob','message':'m1','scope':'everyone'}, 'POST').status_code, 403)
        self.login()
        payload = {'conversation':'alice__bob','message':'m2','scope':'me'}
        self.assertEqual(self.write('/api/messages/delete', payload, 'POST').status_code, 200)
        self.assertNotIn('m2', self.client.get(path).json['data']['messages'])
        self.assertIsNone(self.client.get(path+'/messages/m2/text').json['data'])
        self.assertNotIn('segredomensagem', str(self.client.get('/api/data/dms').json))
        self.assertNotIn('segredomensagem', str(self.write('/api/sync', {'paths':['dms/alice__bob']}, 'POST').json))
        self.assertEqual(self.client.get('/api/search?q=segredomensagem&category=mensagens').json['counts']['mensagens'], 0)
        self.assertEqual(self.client.get('/api/data/conversations/alice').json['data']['bob']['lastText'], 'anterior')
        self.assertEqual(self.write('/api/messages/delete', {**payload,'scope':'everyone'}, 'POST').status_code, 403)
        self.login('bob')
        self.assertEqual(self.client.get(path+'/messages/m2/text').json['data'], 'segredomensagem')
        self.assertEqual(self.client.get('/api/search?q=segredomensagem&category=mensagens').json['counts']['mensagens'], 1)
        self.assertEqual(self.client.get('/api/data/conversations/bob').json['data']['alice']['lastText'], 'segredomensagem')
        self.login()
        self.assertEqual(self.write('/api/messages/delete', {'conversation':'alice__bob','message':'m1','scope':'everyone'}, 'POST').status_code, 200)
        self.assertNotIn('m1', self.database.document('dms','alice__bob')['messages'])
        self.login('bob')
        self.assertNotIn('m1', self.client.get(path).json['data']['messages'])

    def test_message_deletion_rejects_outsiders_forged_visibility_and_invalid_scope(self):
        self.login()
        self.assertEqual(self.write('/api/data/dms/alice__bob/messages/fake', {'from':'alice','text':'test','hiddenFor':{'bob':True}}, 'PUT').status_code, 403)
        self.assertEqual(self.write('/api/data/dms/alice__bob/messages/audio', {'from':'alice','audio':'data:audio/webm;base64,GkXfo0AgQoaBAQ==','ts':10}, 'PUT').status_code, 200)
        payload = {'conversation':'alice__bob','message':'audio','scope':'everyone'}
        self.assertEqual(self.write('/api/messages/delete', {**payload,'scope':{}}, 'POST').status_code, 400)
        self.login('carol')
        self.database.accounts['carol']['profile']['isAdmin'] = True
        for scope in ['me','everyone']:
            self.assertEqual(self.write('/api/messages/delete', {**payload,'scope':scope}, 'POST').status_code, 403)
        self.login()
        self.assertEqual(self.write('/api/messages/delete', payload, 'POST').status_code, 200)
        self.assertEqual(self.database.document('dms','alice__bob')['messages'], {})
        self.assertFalse(self.database.document('conversations','bob'))

    def test_audio_message_is_delivered_to_recipient_only(self):
        self.login()
        audio = {'data': 'data:audio/webm;base64,GkXfow==', 'mime': 'audio/webm', 'duration': 2, 'size': 4}
        message = {'from': 'alice', 'text': '', 'audio': audio, 'ts': 10}
        path = '/api/data/dms/alice__bob/messages/audio1'
        self.assertEqual(self.write(path, message, 'PUT').status_code, 200)
        self.login('bob')
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['data']['audio'], audio)
        self.assertEqual(self.database.document('conversations', 'bob')['alice']['lastText'], '\u00c1udio')
        self.login('carol')
        self.assertEqual(self.client.get(path).status_code, 403)

    def test_private_upload_download_delete_and_quota(self):
        self.login()
        response = self.client.post('/api/files', data={'file': (BytesIO(b'pesquisa'), '../../resultado.csv'), 'project': 'Marcha'},
                                    headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(response.status_code, 201)
        key = response.json['file']['id']
        self.assertNotIn('/', response.json['file']['name'])
        download = self.client.get('/api/files/' + key)
        self.assertEqual(download.data, b'pesquisa')
        download.close()
        self.login('bob')
        self.assertEqual(self.client.get('/api/files/' + key).status_code, 403)
        self.assertEqual(self.client.get('/api/files').json['files'], [])
        self.login('alice')
        response = self.client.post('/api/files', data={'file': (BytesIO(b'x'*2048), 'grande.bin')},
                                    headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(list(Path(self.folder.name).iterdir())), 1)
        self.assertEqual(self.write('/api/files/' + key, method='DELETE').status_code, 200)
        self.assertFalse(list(Path(self.folder.name).iterdir()))

    def test_unit_upload_is_visible_only_to_unit_members(self):
        self.login()
        response = self.client.post('/api/files', data={'file': (BytesIO(b'dados'), 'dados.csv'), 'unit': 'LACAM'},
                                    headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(response.status_code, 201)
        key = response.json['file']['id']
        self.login('carol')
        response = self.client.get('/api/files/' + key)
        self.assertEqual(response.status_code, 200)
        response.close()
        self.assertEqual(self.write('/api/files/' + key, method='DELETE').status_code, 403)

    def test_reset_password_invalidates_existing_session(self):
        self.login()
        self.database.change_password('alice', self.password_hash)
        self.assertEqual(self.client.get('/api/files').status_code, 401)

    def test_poll_owner_cannot_vote_on_behalf_of_other_people(self):
        self.login()
        post = {'uid': 'alice', 'text': 'Enquete', 'poll': {'question': 'Qual dia?', 'votes': {}}}
        self.assertEqual(self.write('/api/data/posts/poll', post, 'PUT').status_code, 200)
        self.assertEqual(self.write('/api/data/posts/poll/poll/votes/bob', 'segunda', 'PUT').status_code, 403)
        self.assertEqual(self.write('/api/data/posts/poll/poll/votes/alice', 'segunda', 'PUT').status_code, 200)

    def test_cross_origin_write_is_denied_even_with_csrf(self):
        self.login()
        response = self.client.patch('/api/data/users/alice', json={'name': 'Outro'},
                                     headers={'X-CSRF-Token': self.csrf, 'Origin': 'https://outro.example'})
        self.assertEqual(response.status_code, 403)

    def test_banned_account_and_unauthorized_file_sharing_are_denied(self):
        self.login()
        response = self.client.post('/api/files', data={'file': (BytesIO(b'dados'), 'dados.csv'), 'unit': 'LabNeuroMusc'},
                                    headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(response.status_code, 403)
        self.database.accounts['alice']['profile']['isBanned'] = True
        self.assertEqual(self.client.get('/api/files').status_code, 403)
        self.assertEqual(self.write('/api/auth/logout', method='POST').status_code, 200)

    def test_https_proxy_uses_configured_public_origin(self):
        self.login()
        self.app.config['PUBLIC_ORIGIN'] = 'https://hub.example.org'
        response = self.client.patch('/api/data/users/alice', json={'name': 'Alice'},
                                     headers={'X-CSRF-Token': self.csrf, 'Origin': 'https://hub.example.org'})
        self.assertEqual(response.status_code, 200)

    def test_registration_does_not_accept_admin_role_from_browser(self):
        response = self.write('/api/auth/register', {
            'email': 'nova@example.org', 'password': 'senha-segura-de-teste',
            'isAdmin': True, 'sectors': {'LACAM': True},
        }, 'POST')
        self.assertEqual(response.status_code, 200)
        user = self.database.user_by_email('nova@example.org')
        self.assertNotIn('isAdmin', user['profile'])
        self.assertNotIn('sectors', user['profile'])

    def test_static_server_does_not_expose_backend_or_files(self):
        for path in ('/backend/app.py', '/.env', '/var/files/file'):
            self.assertEqual(self.client.get(path).status_code, 404)
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        response.close()

    def test_frame_preview_is_explicit_and_restricted_to_local_homepage(self):
        self.app.config.update(ALLOW_LOCAL_FRAME_PREVIEW=False,PUBLIC_ORIGIN='http://127.0.0.1:5000',SESSION_COOKIE_SECURE=False)
        def header(path='/',base_url='http://127.0.0.1:5000'):
            response=self.client.get(path,base_url=base_url)
            value=response.headers.get('X-Frame-Options')
            response.close()
            return value
        self.assertEqual(header(),'SAMEORIGIN')
        self.app.config['ALLOW_LOCAL_FRAME_PREVIEW']=True
        self.assertIsNone(header())
        self.assertEqual(header('/reset-password'),'SAMEORIGIN')
        self.assertEqual(header('/assets/team-voice.js'),'SAMEORIGIN')
        self.assertEqual(header(base_url='http://hub.example.org'),'SAMEORIGIN')
        self.app.config['PUBLIC_ORIGIN']='https://hub.example.org'
        self.assertEqual(header(),'SAMEORIGIN')
        self.app.config.update(PUBLIC_ORIGIN='http://127.0.0.1:5000',SESSION_COOKIE_SECURE=True)
        self.assertEqual(header(),'SAMEORIGIN')

    def upload_attachment(self, name='animacao.gif', content=b'GIF89a' + b'\x00' * 20):
        response = self.client.post('/api/files', data={
            'file': (BytesIO(content), name), 'purpose': 'post',
        }, headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(response.status_code, 201)
        return response.json['file']

    def test_library_excludes_mural_attachments_before_and_after_publication(self):
        self.login()
        attachment = self.upload_attachment()
        uploaded = self.client.post('/api/files', data={
            'file': (BytesIO(b'%PDF-1.7\nprotocolo'), 'protocolo.pdf'),
            'project': 'Pesquisa',
        }, headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(uploaded.status_code, 201)
        library_id = uploaded.json['file']['id']
        for published in (False, True):
            if published:
                self.assertEqual(self.write('/api/data/posts/p1', {
                    'uid': 'alice', 'attachments': [{'id': attachment['id']}],
                }, 'PUT').status_code, 200)
            result = self.client.get('/api/files')
            self.assertEqual(result.status_code, 200)
            self.assertEqual([file['id'] for file in result.json['files']], [library_id])
            response = self.client.get('/api/files/' + attachment['id'] + '?inline=1')
            self.assertEqual(response.status_code, 200)
            response.close()

    def test_library_and_mural_uploads_are_independent_when_deleted(self):
        self.login()
        content = b'%PDF-1.7\nmesmo arquivo'
        for deleted in ('library', 'post'):
            with self.subTest(deleted=deleted):
                library = self.client.post('/api/files', data={
                    'file': (BytesIO(content), 'protocolo.pdf'),
                }, headers={'X-CSRF-Token': self.csrf})
                self.assertEqual(library.status_code, 201)
                library_id = library.json['file']['id']
                attachment = self.upload_attachment('protocolo.pdf', content)
                self.assertNotEqual(library_id, attachment['id'])
                post_path = '/api/data/posts/independent-' + deleted
                self.assertEqual(self.write(post_path, {
                    'uid': 'alice', 'attachments': [{'id': attachment['id']}],
                }, 'PUT').status_code, 200)
                if deleted == 'library':
                    self.assertEqual(self.write('/api/files/' + library_id, method='DELETE').status_code, 200)
                    survivor = '/api/files/' + attachment['id']
                    self.assertEqual(self.client.get(post_path).status_code, 200)
                else:
                    self.assertEqual(self.write(post_path, method='DELETE').status_code, 200)
                    self.assertEqual(self.write('/api/files/' + attachment['id'], method='DELETE').status_code, 200)
                    survivor = '/api/files/' + library_id
                response = self.client.get(survivor)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data, content)
                response.close()

    def test_library_organization_controls_existing_download_links(self):
        self.login()
        upload = self.client.post('/api/files', data={
            'file': (BytesIO(b'%PDF-1.7\nprotocolo'), 'protocolo.pdf'),
        }, headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(upload.status_code, 201)
        path = '/api/files/' + upload.json['file']['id']
        self.login('carol')
        self.assertEqual(self.client.get(path).status_code, 403)
        self.login('alice')
        self.assertEqual(self.write(path, {'unit': 'LACAM', 'project': 'Coleta'}, 'PATCH').status_code, 200)
        self.login('carol')
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200)
        response.close()
        self.assertEqual(self.write(path, {'unit': None}, 'PATCH').status_code, 403)
        self.login('alice')
        self.assertEqual(self.write(path, {'unit': None}, 'PATCH').status_code, 200)
        self.login('carol')
        self.assertEqual(self.client.get(path).status_code, 403)
        self.login('alice')
        self.assertEqual(self.write(path, {'unit': 'Unidade inexistente'}, 'PATCH').status_code, 403)
        attachment = self.upload_attachment()
        self.assertEqual(self.write('/api/files/' + attachment['id'], {'unit': 'LACAM'}, 'PATCH').status_code, 403)

    def test_attachment_is_private_until_published_then_follows_unit(self):
        self.login()
        attachment = self.upload_attachment()
        key = attachment['id']
        self.login('bob')
        self.assertEqual(self.client.get('/api/files/' + key + '?inline=1').status_code, 403)
        self.login('alice')
        post = {'uid': 'alice', 'text': '', 'attachments': [{'id': key, 'name': 'nome-forjado.html'}]}
        self.assertEqual(self.write('/api/data/posts_private/LACAM/p1', post, 'PUT').status_code, 200)
        stored = self.database.document('posts_private', 'LACAM')['p1']['attachments'][0]
        self.assertEqual(stored['name'], 'animacao.gif')
        self.assertEqual(stored['mime_type'], 'image/gif')
        self.login('carol')
        response = self.client.get('/api/files/' + key + '?inline=1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'image/gif')
        self.assertIn('inline', response.headers['Content-Disposition'])
        self.assertIn('sandbox', response.headers['Content-Security-Policy'])
        response.close()
        self.login('bob')
        self.assertEqual(self.client.get('/api/files/' + key + '?inline=1').status_code, 403)
        self.login('alice')
        self.assertEqual(self.write('/api/data/posts_private/LACAM/p1', method='DELETE').status_code, 200)
        self.login('carol')
        self.assertEqual(self.client.get('/api/files/' + key).status_code, 403)

    def test_public_attachment_requires_login_and_video_supports_ranges(self):
        self.login()
        attachment = self.upload_attachment('video.mp4', b'\x00\x00\x00\x18ftypisom' + b'\x00' * 20)
        key = attachment['id']
        post = {'uid': 'alice', 'attachments': [{'id': key}]}
        self.assertEqual(self.write('/api/data/posts/video', post, 'PUT').status_code, 200)
        self.login('bob')
        response = self.client.get('/api/files/' + key + '?inline=1', headers={'Range': 'bytes=0-7'})
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.mimetype, 'video/mp4')
        self.assertEqual(len(response.data), 8)
        response.close()
        self.write('/api/auth/logout', method='POST')
        self.assertEqual(self.client.get('/api/files/' + key).status_code, 401)

    def test_pdf_preview_and_download_are_distinct(self):
        self.login()
        attachment = self.upload_attachment('artigo.pdf', b'%PDF-1.7\nconteudo de teste')
        url = '/api/files/' + attachment['id']
        inline = self.client.get(url + '?inline=1')
        self.assertEqual(inline.mimetype, 'application/pdf')
        self.assertIn('inline', inline.headers['Content-Disposition'])
        self.assertIn("frame-ancestors 'self'", inline.headers['Content-Security-Policy'])
        self.assertEqual(inline.headers['X-Frame-Options'], 'SAMEORIGIN')
        inline.close()
        download = self.client.get(url)
        self.assertIn('attachment', download.headers['Content-Disposition'])
        download.close()

    def test_attachment_rejects_disguised_file_and_oversize_upload(self):
        self.login()
        response = self.client.post('/api/files', data={
            'file': (BytesIO(b'<html>arquivo falso</html>'), 'falso.png'), 'purpose': 'post',
        }, headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(response.status_code, 400)
        self.app.config['POST_ATTACHMENT_MAX_BYTES'] = 10
        response = self.client.post('/api/files', data={
            'file': (BytesIO(b'GIF89a' + b'x' * 20), 'grande.gif'), 'purpose': 'post',
        }, headers={'X-CSRF-Token': self.csrf})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(list(Path(self.folder.name).iterdir()))

    def test_cannot_attach_another_users_file_or_reuse_on_another_post(self):
        self.login()
        attachment = self.upload_attachment()
        key = attachment['id']
        self.login('bob')
        self.assertEqual(self.write('/api/data/posts/roubo', {
            'uid': 'bob', 'attachments': [{'id': key}],
        }, 'PUT').status_code, 403)
        self.login('alice')
        post = {'uid': 'alice', 'attachments': [{'id': key}]}
        self.assertEqual(self.write('/api/data/posts/p1', post, 'PUT').status_code, 200)
        self.assertEqual(self.write('/api/data/posts/p2', post, 'PUT').status_code, 403)
        self.assertIsNone(self.database.document('posts', 'p2'))

    def test_attachment_count_and_duplicate_ids_are_rejected(self):
        self.login()
        attachment = self.upload_attachment()
        for attachments in ([{'id': attachment['id']}] * 2, [{'id': str(i)} for i in range(7)]):
            response = self.write('/api/data/posts/p1', {'uid': 'alice', 'attachments': attachments}, 'PUT')
            self.assertEqual(response.status_code, 400)

    def test_demand_trash_and_restore_preserve_data_and_post_link(self):
        self.login()
        demand = {'uid': 'alice', 'text': 'Analisar dados', 'status': 'doing', 'done': False,
                  'priority': 'high', 'assignedTo': {'bob': True}, 'dueDate': '2026-12-20'}
        self.assertEqual(self.write('/api/data/demandas/d1', demand, 'PUT').status_code, 200)
        self.write('/api/data/posts/p1', {'uid': 'alice', 'text': 'Pesquisa', 'demandaId': 'd1'}, 'PUT')
        response = self.write('/api/demands/trash', {'path': 'demandas/d1', 'deletedBy': 'bob'}, 'POST')
        self.assertEqual(response.status_code, 200)
        saved = self.database.document('demandas', 'd1')
        self.assertTrue(saved['deleted'])
        self.assertEqual(saved['deletedBy'], 'alice')
        self.assertGreater(saved['deletedAt'], 0)
        self.assertEqual(self.database.document('posts', 'p1')['demandaId'], 'd1')
        self.assertEqual(self.write('/api/demands/restore', {'path': 'demandas/d1'}, 'POST').status_code, 200)
        self.assertEqual(self.database.document('demandas', 'd1'), demand)

    def test_demand_cannot_be_permanently_deleted_or_edited_in_trash(self):
        self.login()
        self.write('/api/data/demandas/d1', {'uid': 'alice', 'text': 'Pesquisa'}, 'PUT')
        self.assertEqual(self.write('/api/data/demandas/d1', method='DELETE').status_code, 403)
        self.assertEqual(self.write('/api/data/demandas/d1', {'deleted': True}).status_code, 403)
        self.write('/api/demands/trash', {'path': 'demandas/d1'}, 'POST')
        self.assertEqual(self.write('/api/data/demandas/d1', {'text': 'Alterada'}).status_code, 403)
        self.assertEqual(self.write('/api/data/demandas/d1', {'deleted': False}).status_code, 403)
        self.assertTrue(self.database.document('demandas', 'd1')['deleted'])

    def test_only_author_assignee_mentioned_or_admin_can_manage_trash(self):
        self.login()
        self.write('/api/data/demandas/d1', {'uid': 'alice', 'text': 'Pesquisa', 'assignedTo': {'bob': True}}, 'PUT')
        self.login('carol')
        self.assertEqual(self.write('/api/demands/trash', {'path': 'demandas/d1'}, 'POST').status_code, 403)
        self.login('bob')
        self.assertEqual(self.write('/api/demands/trash', {'path': 'demandas/d1'}, 'POST').status_code, 200)
        self.login('carol')
        self.assertEqual(self.write('/api/demands/restore', {'path': 'demandas/d1'}, 'POST').status_code, 403)
        self.database.accounts['carol']['profile']['isAdmin'] = True
        self.assertEqual(self.write('/api/demands/restore', {'path': 'demandas/d1'}, 'POST').status_code, 200)

    def test_private_demand_trash_keeps_unit_boundaries_and_history(self):
        self.login()
        archived = {'uid': 'alice', 'text': 'Finalizada', 'done': True, 'status': 'done',
                    'archived': True, 'archiveBatch': 1234, 'archivedAt': 1234}
        self.write('/api/data/demandas_private/LACAM/d1', archived, 'PUT')
        self.write('/api/data/demandas_private/LACAM/d2', {'uid': 'alice', 'text': 'Outra'}, 'PUT')
        self.assertEqual(self.write('/api/demands/trash', {'path': 'demandas_private/LACAM/d1'}, 'POST').status_code, 200)
        self.login('bob')
        self.assertEqual(self.write('/api/demands/restore', {'path': 'demandas_private/LACAM/d1'}, 'POST').status_code, 403)
        self.login('alice')
        self.assertEqual(self.write('/api/demands/restore', {'path': 'demandas_private/LACAM/d1'}, 'POST').status_code, 200)
        data = self.database.document('demandas_private', 'LACAM')
        self.assertEqual(data['d1'], archived)
        self.assertEqual(data['d2']['text'], 'Outra')

    def test_demand_trash_does_not_allow_other_collections_or_missing_records(self):
        self.login()
        self.assertEqual(self.write('/api/demands/trash', {'path': 'posts/p1'}, 'POST').status_code, 400)
        self.assertEqual(self.write('/api/demands/trash', {'path': 'demandas_private/LACAM'}, 'POST').status_code, 400)
        self.assertEqual(self.write('/api/demands/trash', {'path': 'demandas/missing'}, 'POST').status_code, 404)


if __name__ == '__main__':
    unittest.main()

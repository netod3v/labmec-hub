import base64
import hashlib
import hmac
import json
import unittest
from unittest.mock import patch
from urllib.error import URLError

from werkzeug.security import generate_password_hash
from backend.tests import test_api
from backend.team_voice import available_rooms


class TeamVoiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash=generate_password_hash('senha-de-teste-segura')
    setUp=test_api.ApiTests.setUp
    write=test_api.ApiTests.write
    login=test_api.ApiTests.login

    def configure(self):
        self.app.config.update(LIVEKIT_URL='ws://localhost:7880',LIVEKIT_INTERNAL_URL='http://voice:7880',LIVEKIT_API_KEY='test-key',LIVEKIT_API_SECRET='s'*48)

    def test_auth_membership_identity_and_camera_grant(self):
        self.assertEqual(self.client.get('/api/calls/rooms').status_code,401)
        self.login();self.configure()
        rooms=available_rooms(self.database.user('alice'))
        self.assertEqual([room['label'] for room in rooms],['Geral','LACAM'])
        allowed=rooms[1]['id']
        other=available_rooms(self.database.user('bob'))[1]['id']
        self.assertEqual(self.write('/api/calls/join',{'room':other},'POST').status_code,403)
        response=self.write('/api/calls/join',{'room':allowed,'uid':'bob','canPublishSources':['camera']},'POST')
        self.assertEqual(response.status_code,200)
        token=response.json['token'];head,payload,signature=token.split('.')
        decode=lambda value:base64.urlsafe_b64decode(value+'='*(-len(value)%4))
        data=json.loads(decode(payload));self.assertEqual(data['sub'],'alice')
        self.assertEqual(data['video']['room'],allowed)
        self.assertEqual(data['video']['canPublishSources'],['microphone','camera','screen_share'])
        self.assertTrue(data['video']['canPublishData'])
        self.assertNotIn('roomAdmin',data['video'])
        self.assertLessEqual(data['exp']-data['nbf'],305)
        self.assertEqual(decode(signature),hmac.new(('s'*48).encode(),(head+'.'+payload).encode(),hashlib.sha256).digest())
        self.assertNotIn('API_SECRET',str(response.json))
        self.assertEqual(self.client.post('/api/calls/join',json={'room':allowed}).status_code,403)

    def test_presence_comes_from_livekit_and_is_limited_to_allowed_rooms(self):
        self.login();self.configure()
        rooms=available_rooms(self.database.user('alice'))
        self.database.accounts['carol']['profile']['isRemoved']=True
        def rpc(config,method,body,room=''):
            if method=='ListRooms':
                self.assertEqual(body['names'],[item['id'] for item in rooms])
                return {'rooms':[{'name':'hub-geral','numParticipants':3}]}
            self.assertEqual(room,'hub-geral')
            return {'participants':[{'identity':'alice'},{'identity':'carol'},{'identity':'outside'}]}
        with patch('backend.team_voice.voice_rpc',side_effect=rpc):
            response=self.client.get('/api/calls/rooms')
        self.assertTrue(response.json['available'])
        self.assertEqual(response.json['rooms'][0]['participants'],[{'uid':'alice','name':'alice'}])
        self.assertEqual(response.json['rooms'][0]['count'],1)
        self.assertNotIn('@example.org',str(response.json))

    def test_unavailable_service_and_invalid_requests_are_clear(self):
        self.login();self.app.config['LIVEKIT_API_SECRET']=''
        self.assertFalse(self.client.get('/api/calls/rooms').json['available'])
        self.assertEqual(self.write('/api/calls/join',{'room':'hub-geral'},'POST').status_code,503)
        self.assertEqual(self.write('/api/calls/join',{'room':[]},'POST').status_code,400)
        self.configure()
        with patch('backend.team_voice.voice_rpc',side_effect=URLError('internal detail')):
            response=self.client.get('/api/calls/rooms')
            self.assertFalse(response.json['available'])
            self.assertNotIn('internal detail',str(response.json))
        self.database.accounts['alice']['profile']['sectors']={}
        self.assertEqual([room['label'] for room in available_rooms(self.database.user('alice'))],['Geral'])

    def test_removing_member_disconnects_only_hub_rooms(self):
        self.database.accounts['alice']['profile']['isAdmin']=True
        self.login();self.configure()
        def rpc(config,method,body,room=''):
            if method=='ListRooms':
                return {'rooms':[{'name':'hub-geral'},{'name':'hub-unit-123'},{'name':'another-app'}]}
            self.assertEqual(method,'RemoveParticipant');self.assertEqual(body['identity'],'bob')
            self.assertTrue(room.startswith('hub-'));return {}
        with patch('backend.team_voice.voice_rpc',side_effect=rpc) as mocked:
            result=self.write('/api/users/bob',method='DELETE')
        self.assertEqual(result.status_code,200)
        self.assertEqual(mocked.call_count,3)

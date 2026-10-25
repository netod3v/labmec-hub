"""Chamadas com permissões do Hub e publicação de microfone e câmera."""
import base64
import hashlib
import hmac
import json
import time
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from flask import g, jsonify, request
from werkzeug.exceptions import BadRequest, ServiceUnavailable
from .permissions import units, is_admin, DEFAULT_UNITS, require


def voice_token(config, identity='', room='', name='', service=False):
    now = int(time.time())
    grant = {'roomList':True} if service and not room else {'roomAdmin':True, 'room':room} if service else {
        'roomJoin':True, 'room':room, 'canPublish':True, 'canSubscribe':True,
        'canPublishData':True, 'canPublishSources':['microphone','camera','screen_share'],
    }
    payload = {'iss':config['LIVEKIT_API_KEY'], 'nbf':now-5, 'exp':now+300, 'video':grant}
    if identity:
        payload.update(sub=identity, name=name)
    encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b'=')
    data = encode(b'{"alg":"HS256","typ":"JWT"}') + b'.' + encode(json.dumps(payload,separators=(',',':')).encode())
    return (data+b'.'+encode(hmac.new(config['LIVEKIT_API_SECRET'].encode(),data,hashlib.sha256).digest())).decode()


def voice_rpc(config, method, body, room=''):
    token = voice_token(config,room=room,service=True)
    query = Request(config['LIVEKIT_INTERNAL_URL'].rstrip('/')+'/twirp/livekit.RoomService/'+method,
                    data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urlopen(query,timeout=4) as response:
        return json.load(response)


def available_rooms(user):
    labels = units(user) | (DEFAULT_UNITS if is_admin(user) else set())
    return [{'id':'hub-geral','label':'Geral'}] + [
        {'id':'hub-unit-'+hashlib.sha256(label.encode()).hexdigest()[:20], 'label':label}
        for label in sorted(labels)
    ]


def disconnect_voice_user(app,uid):
    if not all(app.config.get(key) for key in ('LIVEKIT_INTERNAL_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET')):
        return
    try:
        rooms=voice_rpc(app.config,'ListRooms',{}).get('rooms',[])
        for room in rooms:
            name=room.get('name','')
            if not name.startswith('hub-'):
                continue
            try:
                voice_rpc(app.config,'RemoveParticipant',{'room':name,'identity':uid},name)
            except HTTPError as error:
                if error.code!=404:
                    raise
    except (URLError,HTTPError,OSError,ValueError):
        app.logger.warning('Não foi possível encerrar a sessão de voz de uma conta removida. O cliente revalida o acesso periodicamente.')


def register_team_voice(app):
    def ready():
        return all(app.config[key] for key in ('LIVEKIT_URL','LIVEKIT_INTERNAL_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET'))

    @app.get('/api/calls/rooms')
    def call_rooms():
        rooms = available_rooms(g.user)
        if not ready():
            return jsonify(available=False,rooms=rooms,message='As salas de voz ainda não foram configuradas.')
        try:
            live = voice_rpc(app.config,'ListRooms',{'names':[room['id'] for room in rooms]})
            existing = {room['name']:room for room in live.get('rooms',[])}
            with app.database.transaction() as repository:
                people = {user['id']:user['profile'] for user in repository.users()}
            for room in rooms:
                participants = []
                if room['id'] in existing:
                    members = voice_rpc(app.config,'ListParticipants',{'room':room['id']},room['id'])
                    for person in members.get('participants',[]):
                        uid = person.get('identity')
                        profile = people.get(uid)
                        if profile is not None and not profile.get('isRemoved') and not profile.get('isBanned'):
                            participants.append({'uid':uid,'name':profile.get('name') or 'Integrante'})
                room.update(participants=participants,count=len(participants))
        except (URLError,HTTPError,OSError,ValueError):
            return jsonify(available=False,rooms=rooms,message='O serviço de voz está indisponível. Tente novamente em instantes.')
        return jsonify(available=True,rooms=rooms)

    @app.post('/api/calls/join')
    def call_join():
        body = request.get_json()
        if not isinstance(body,dict) or not isinstance(body.get('room'),str):
            raise BadRequest('Escolha uma sala de voz.')
        room = next((room for room in available_rooms(g.user) if room['id']==body['room']),None)
        require(room is not None,'Você não tem acesso a esta sala de voz.')
        if not ready():
            raise ServiceUnavailable('O serviço de voz ainda não foi configurado.')
        return jsonify(url=app.config['LIVEKIT_URL'],room=room,
                       token=voice_token(app.config,g.user['id'],room['id'],g.user['profile'].get('name') or 'Integrante'))

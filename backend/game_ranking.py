"""Ranking recreativo: partidas autenticadas, pontuação limitada e semana de Brasília."""
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from flask import g, jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.exceptions import BadRequest

COLLECTION = '_game_scores'
GAMES = {
    'quiz': {10}, 'memory': {10, *range(13, 77, 3)},
    'mines': {80}, 'word': {20, 30, 40, 50, 60}, 'rps': {10}, 'sudoku': {150},
}


def current_week():
    today = datetime.now(ZoneInfo('America/Sao_Paulo')).date()
    start = today - timedelta(days=today.weekday())
    return start.isoformat(), (start + timedelta(days=6)).isoformat()


def register_game_ranking(app):
    signer = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='labiomec-game-round-v1')

    @app.post('/api/games/rounds')
    def start_round():
        body = request.get_json()
        if not isinstance(body, dict) or not isinstance(body.get('game'), str) or body['game'] not in GAMES:
            raise BadRequest('Jogo inválido.')
        token = signer.dumps({'uid': g.user['id'], 'version': g.user['session_version'], 'game': body['game'], 'id': uuid4().hex})
        return jsonify(token=token)

    @app.post('/api/games/scores')
    def record_score():
        body = request.get_json()
        if not isinstance(body, dict) or not isinstance(body.get('token'), str) or len(body['token']) > 2048:
            raise BadRequest('Partida inválida. Inicie uma nova partida.')
        try:
            round_data, issued_at = signer.loads(body['token'], max_age=4 * 60 * 60, return_timestamp=True)
        except BadSignature:
            raise BadRequest('Esta partida expirou. Inicie uma nova partida.') from None
        if not isinstance(round_data, dict) or round_data.get('uid') != g.user['id'] or round_data.get('version') != g.user['session_version'] or round_data.get('game') not in GAMES or not isinstance(round_data.get('id'), str):
            raise BadRequest('Partida inválida para esta conta.')
        points = body.get('points')
        if type(points) is not int or points not in GAMES[round_data['game']]:
            raise BadRequest('Pontuação inválida para este jogo.')
        week, _ = current_week()
        uid = g.user['id']
        # Um registro por integrante e semana; tentativas repetidas não duplicam pontos.
        document_id = week + '/' + uid
        issued_date = issued_at.astimezone(ZoneInfo('America/Sao_Paulo')).date()
        issued_week = (issued_date - timedelta(days=issued_date.weekday())).isoformat()
        with app.database.transaction() as repository:
            if issued_week != week:
                repository.lock_document(COLLECTION, issued_week + '/' + uid)
            repository.lock_document(COLLECTION, document_id)
            record = repository.document(COLLECTION, document_id) or {'uid': uid, 'week': week, 'total': 0, 'games': {}, 'rounds': {}}
            duplicate = round_data['id'] in record['rounds']
            # A deduplicação também cobre uma repetição após a virada da semana.
            if issued_week != week:
                old = repository.document(COLLECTION, issued_week + '/' + uid) or {}
                duplicate = duplicate or round_data['id'] in old.get('rounds', {})
            if not duplicate:
                record['rounds'][round_data['id']] = True
                record['total'] += points
                game = round_data['game']
                record['games'][game] = record['games'].get(game, 0) + points
                repository.save_document(COLLECTION, document_id, record)
        return jsonify(ok=True, duplicate=duplicate, week=week)

    @app.get('/api/games/ranking')
    def ranking():
        week, end = current_week()
        with app.database.transaction() as repository:
            people = {user['id']: user['profile'] for user in repository.users()}
            records = repository.game_scores_for_week(week)
        rows = []
        for document in records:
            item = document['data']
            profile = people.get(item.get('uid'))
            if item.get('week') != week or profile is None or profile.get('isRemoved') or profile.get('isBanned'):
                continue
            rows.append({'uid': item['uid'], 'name': profile.get('name') or 'Integrante', 'total': item['total'], 'games': item['games']})
        rows.sort(key=lambda row: (-row['total'], row['name'].casefold(), row['uid']))
        previous_points, position = None, 0
        for index, row in enumerate(rows, 1):
            if row['total'] != previous_points:
                position = index
            row['position'] = position
            previous_points = row['total']
        return jsonify(week=week, end=end, timezone='America/Sao_Paulo', rows=rows)

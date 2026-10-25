import unittest
from unittest.mock import patch
from datetime import datetime, timezone, date, timedelta

from werkzeug.security import generate_password_hash

from backend.tests import test_api
from backend.game_ranking import current_week


class GameRankingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password_hash = generate_password_hash('senha-de-teste-segura')

    setUp = test_api.ApiTests.setUp
    write = test_api.ApiTests.write
    login = test_api.ApiTests.login

    def start(self, game='quiz'):
        result = self.write('/api/games/rounds', {'game':game}, 'POST')
        self.assertEqual(result.status_code, 200)
        return result.json['token']

    def score(self, token, points=10):
        return self.write('/api/games/scores', {'token':token, 'points':points, 'uid':'bob'}, 'POST')

    def test_shared_ranking_identity_duplicate_names_and_retry(self):
        self.login()
        self.database.accounts['bob']['profile']['name'] = 'alice'
        token = self.start()
        self.assertEqual(self.score(token).status_code, 200)
        self.assertTrue(self.score(token).json['duplicate'])
        self.login('bob')
        self.assertEqual(self.score(token).status_code, 400)
        self.assertEqual(self.score(self.start('mines'),80).status_code, 200)
        rows = self.client.get('/api/games/ranking').json['rows']
        self.assertEqual([(row['uid'],row['total']) for row in rows], [('bob',80),('alice',10)])
        self.assertNotIn('rounds', str(rows))
        self.assertNotIn('password_hash', str(rows))
        self.assertNotIn('@example.org', str(rows))
        self.assertEqual(rows[0]['games'], {'mines':80})

    def test_server_week_and_old_scores_are_preserved_but_not_ranked(self):
        self.login()
        week, end = current_week()
        next_week = (date.fromisoformat(week) + timedelta(days=7)).isoformat()
        next_end = (date.fromisoformat(end) + timedelta(days=7)).isoformat()
        with patch('backend.game_ranking.current_week', return_value=(week,end)):
            token = self.start()
            self.assertEqual(self.score(token).status_code, 200)
        with patch('backend.game_ranking.current_week', return_value=(next_week,next_end)):
            self.assertEqual(self.client.get('/api/games/ranking').json['rows'], [])
            self.assertTrue(self.score(token).json['duplicate'])
            self.assertEqual(self.client.get('/api/games/ranking').json['rows'], [])
        with patch('backend.game_ranking.current_week', return_value=(week,end)):
            self.assertEqual(self.client.get('/api/games/ranking').json['rows'][0]['total'],10)

    def test_invalid_points_round_and_untrusted_generic_writes_are_rejected(self):
        self.assertEqual(self.client.get('/api/games/ranking').status_code,401)
        self.login()
        for game in ['unknown', [], None]:
            self.assertEqual(self.write('/api/games/rounds',{'game':game},'POST').status_code,400)
        token=self.start()
        for value in [100000, -10, True, 10.0, '10', None]:
            self.assertEqual(self.score(token,value).status_code,400)
        self.assertEqual(self.score('forged').status_code,400)
        self.assertEqual(self.client.post('/api/games/scores',json={'token':token,'points':10}).status_code,403)
        self.assertEqual(self.write('/api/data/_game_scores/forged',{'total':100000},'PUT').status_code,404)
        self.assertEqual(self.client.get('/api/data/_game_scores').status_code,404)
        self.assertEqual(self.client.get('/api/games/ranking').json['rows'],[])

    def test_ties_names_update_removed_users_and_other_games(self):
        self.login()
        self.score(self.start())
        self.login('bob')
        self.score(self.start())
        rows=self.client.get('/api/games/ranking').json['rows']
        self.assertEqual([row['position'] for row in rows],[1,1])
        self.database.accounts['alice']['profile']['name']='New name'
        self.assertEqual(next(row['name'] for row in self.client.get('/api/games/ranking').json['rows'] if row['uid']=='alice'),'New name')
        self.database.accounts['alice']['profile']['isRemoved']=True
        self.assertEqual([row['uid'] for row in self.client.get('/api/games/ranking').json['rows']],['bob'])
        for game,points in [('memory',76),('word',60),('sudoku',150),('rps',10)]:
            self.assertEqual(self.score(self.start(game),points).status_code,200)
        self.assertEqual(self.client.get('/api/games/ranking').json['rows'][0]['total'],306)

    def test_week_boundary_uses_brasilia_not_utc(self):
        with patch('backend.game_ranking.datetime') as clock:
            clock.now.return_value=datetime(2026,10,26,2,59,tzinfo=timezone.utc).astimezone(__import__('zoneinfo').ZoneInfo('America/Sao_Paulo'))
            self.assertEqual(current_week(),('2026-10-19','2026-10-25'))
            clock.now.return_value=datetime(2026,10,26,3,0,tzinfo=timezone.utc).astimezone(__import__('zoneinfo').ZoneInfo('America/Sao_Paulo'))
            self.assertEqual(current_week(),('2026-10-26','2026-11-01'))

from concurrent.futures import ThreadPoolExecutor
import os
import tempfile
import unittest
from uuid import uuid4

from backend.app import create_app
from backend.database import Database
from backend.game_ranking import current_week, COLLECTION
from itsdangerous import URLSafeTimedSerializer


@unittest.skipUnless(os.environ.get('TEST_DATABASE_URL'), 'TEST_DATABASE_URL não configurada')
class GameRankingPostgresTests(unittest.TestCase):
    def test_concurrent_scores_and_retries_do_not_lose_or_duplicate_points(self):
        database = Database(os.environ['TEST_DATABASE_URL']);database.initialize()
        uid = 'game_test_' + uuid4().hex
        with database.transaction() as repository:
            repository.create_user(uid, uid + '@example.org', 'unused-password', {'name':'Mesmo nome'})
        try:
            with tempfile.TemporaryDirectory() as folder:
                app = create_app({'TESTING':True,'SECRET_KEY':'g'*40,'STORAGE_DIR':folder}, database)
                signer = URLSafeTimedSerializer('g'*40,salt='labiomec-game-round-v1')
                tokens = [signer.dumps({'uid':uid,'version':1,'id':uuid4().hex,'game':'quiz'}) for _ in range(2)]

                def score(token):
                    client = app.test_client()
                    with client.session_transaction() as session:
                        session.update(user_id=uid,version=1,csrf='test-csrf')
                    response = client.post('/api/games/scores',json={'token':token,'points':10},headers={'X-CSRF-Token':'test-csrf'})
                    return response.status_code

                with ThreadPoolExecutor(max_workers=4) as executor:
                    self.assertEqual(list(executor.map(score,tokens+tokens)),[200]*4)
                with database.transaction() as repository:
                    records=repository.game_scores_for_week(current_week()[0])
                    record=next(record['data'] for record in records if record['data']['uid']==uid)
                    self.assertEqual(record['total'],20)
                    self.assertEqual(record['games'],{'quiz':20})
                    self.assertEqual(len(record['rounds']),2)
        finally:
            with database.transaction() as repository:
                repository.save_document(COLLECTION,current_week()[0]+'/'+uid,None)
                repository.connection.execute('DELETE FROM users WHERE id = %s',(uid,))

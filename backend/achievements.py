"""Persistent, server-verified achievements. Event keys contain no post content."""
from hashlib import sha256
from time import time

CATALOG = [
    ('first-post', 'Primeira voz', 'Faça sua primeira publicação no mural.', 'posts', 1, 'star'),
    ('five-posts', 'Em movimento', 'Compartilhe 5 publicações no mural.', 'posts', 5, 'spark'),
    ('twenty-posts', 'Presença no mural', 'Compartilhe 20 publicações no mural.', 'posts', 20, 'crown'),
    ('first-comment', 'Puxa conversa', 'Faça seu primeiro comentário ou resposta.', 'comments', 1, 'chat'),
    ('ten-comments', 'Troca de ideias', 'Participe com 10 comentários ou respostas.', 'comments', 10, 'chat'),
    ('five-likes', 'Espírito de equipe', 'Curta 5 publicações diferentes.', 'likes', 5, 'heart'),
]


def achievement_catalog():
    return [{'id': key, 'title': title, 'description': description, 'target': target, 'icon': icon}
            for key, title, description, metric, target, icon in CATALOG]


def events(path, post, uid):
    if not isinstance(post, dict):
        return {}
    found = {}

    def add(key, metric):
        found[sha256(key.encode()).hexdigest()] = metric

    if post.get('uid') == uid:
        add(path, 'posts')
    if isinstance(post.get('likes'), dict) and post['likes'].get(uid):
        add(path + '/like', 'likes')

    def comments(items, prefix):
        if not isinstance(items, dict):
            return
        for key, item in items.items():
            if not isinstance(item, dict):
                continue
            item_path = prefix + '/' + key
            if item.get('uid') == uid:
                add(item_path, 'comments')
            comments(item.get('replies'), item_path + '/replies')

    comments(post.get('comments'), path + '/comments')
    return found


def unlock(ledger):
    totals = {metric: list(ledger['events'].values()).count(metric) for metric in ('posts', 'comments', 'likes')}
    awarded = []
    for key, title, description, metric, target, icon in CATALOG:
        if totals[metric] >= target and key not in ledger['earned']:
            ledger['earned'][key] = int(time() * 1000)
            awarded.append({'id': key, 'title': title, 'description': description, 'icon': icon})
    return awarded, totals


def load_ledger(repository, uid):
    repository.lock_document('_hub_achievements', uid)
    ledger = repository.document('_hub_achievements', uid)
    if ledger is not None:
        return ledger
    ledger = {'events': {}, 'earned': {}}
    for row in repository.documents('posts'):
        ledger['events'].update(events('posts/' + row['id'], row['data'], uid))
    for row in repository.documents('posts_private'):
        if isinstance(row['data'], dict):
            for key, post in row['data'].items():
                ledger['events'].update(events('posts_private/' + row['id'] + '/' + key, post, uid))
    if repository.document('_mural_milestones', uid) and 'posts' not in ledger['events'].values():
        ledger['events']['legacy-first-post'] = 'posts'
    unlock(ledger)
    return ledger


def record_achievements(repository, user, collection, document_id, old, new):
    if collection not in {'posts', 'posts_private'}:
        return []
    uid = user['id']
    if collection == 'posts':
        current = events('posts/' + document_id, new, uid)
        added = current.keys() - events('posts/' + document_id, old, uid).keys()
    else:
        current, previous = {}, {}
        for key, post in (new or {}).items():
            current.update(events('posts_private/' + document_id + '/' + key, post, uid))
        for key, post in (old or {}).items():
            previous.update(events('posts_private/' + document_id + '/' + key, post, uid))
        added = current.keys() - previous.keys()
    if not added:
        return []
    ledger = load_ledger(repository, uid)
    ledger['events'].update({key: current[key] for key in added})
    awarded, _ = unlock(ledger)
    repository.save_document('_hub_achievements', uid, ledger)
    if awarded:
        repository.lock_document('notifications', uid)
        notices = repository.document('notifications', uid) or {}
        for award in awarded:
            key = 'achievement-' + award['id']
            notices.setdefault(key, {'kind': 'achievement', 'achievementId': award['id'],
                                    'title': award['title'], 'ts': ledger['earned'][award['id']],
                                    'description': 'Parabéns pela sua primeira publicação no mural! Você desbloqueou a conquista Primeira voz.'
                                    if award['id'] == 'first-post' else 'Você desbloqueou uma nova conquista: ' + award['title'] + '.'})
        repository.save_document('notifications', uid, notices)
    return awarded


def profile_achievements(repository, uid, own):
    ledger = load_ledger(repository, uid)
    _, totals = unlock(ledger)
    repository.save_document('_hub_achievements', uid, ledger)
    result = []
    visibility = repository.user(uid)['profile'].get('achievementVisibility') or {}
    for key, title, description, metric, target, icon in CATALOG:
        earned = ledger['earned'].get(key)
        visible = not visibility.get('hideAll') and key not in visibility.get('hidden', [])
        if own or (earned and visible):
            item = {'id': key, 'title': title, 'description': description, 'icon': icon, 'earnedAt': earned}
            if own:
                item.update(progress=min(totals[metric], target), target=target, visible=visible)
            result.append(item)
    return result

"""Server-owned milestones, outside generic data and sync routes."""
from time import time


def record_first_post(repository, user, collection, document_id, old, new):
    uid = user['id']
    if collection == 'posts':
        if isinstance(new, dict):
            new.pop('_firstPublication', None)
            if isinstance(old, dict) and old.get('_firstPublication') is True:
                new['_firstPublication'] = True
        created = old is None and isinstance(new, dict) and new.get('uid') == uid
    elif collection == 'posts_private' and isinstance(new, dict):
        for key, post in new.items():
            if isinstance(post, dict):
                post.pop('_firstPublication', None)
                if isinstance((old or {}).get(key), dict) and old[key].get('_firstPublication') is True:
                    post['_firstPublication'] = True
        created = any(key not in (old or {}) and isinstance(post, dict) and post.get('uid') == uid
                      for key, post in new.items())
    else:
        return False
    if not created:
        return False
    repository.lock_document('_mural_milestones', uid)
    if repository.document('_mural_milestones', uid):
        return False
    previous = any(isinstance(row['data'], dict) and row['data'].get('uid') == uid
                   for row in repository.documents('posts'))
    if not previous:
        previous = any(isinstance(post, dict) and post.get('uid') == uid
                       for row in repository.documents('posts_private')
                       if isinstance(row['data'], dict) for post in row['data'].values())
    repository.save_document('_mural_milestones', uid, {'firstPostAt': int(time() * 1000)})
    if not previous:
        if collection == 'posts':
            new['_firstPublication'] = True
        else:
            first = next(post for key, post in new.items() if key not in (old or {}) and isinstance(post, dict) and post.get('uid') == uid)
            first['_firstPublication'] = True
    return not previous

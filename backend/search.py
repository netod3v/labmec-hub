"""Busca unificada: primeiro autoriza cada fonte, depois procura o texto."""
import html
import re
import unicodedata

from werkzeug.exceptions import BadRequest

from .permissions import can_read, can_read_file, public_profile

CATEGORIES = {'mural': 'Mural', 'demandas': 'Demandas', 'metas': 'Metas',
              'minhas_metas': 'Metas que criei', 'pessoas': 'Pessoas',
              'arquivos': 'Arquivos', 'notas': 'Notas', 'mensagens': 'Mensagens'}
SCOPES = {'all', 'mine', 'assigned', 'completed', 'deleted'}
RESULT_LIMIT = 20


def mapping(value):
    """Documentos antigos podem ter campos vazios ou formatos diferentes."""
    return value if isinstance(value, dict) else {}


def normalize(text):
    return ''.join(character for character in unicodedata.normalize('NFKD', str(text)).casefold()
                   if not unicodedata.combining(character))


def plain_text(text):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', str(text or '')))).strip()


def comment_text(comments, depth=0):
    if not isinstance(comments, dict) or depth > 12:
        return ''
    return ' '.join(str(value.get('text', '')) + ' ' + comment_text(value.get('replies'), depth + 1)
                    for value in comments.values() if isinstance(value, dict))


def search_hub(repository, user, query, category='all', scope='all'):
    query = query.strip()
    if not 2 <= len(query) <= 120:
        raise BadRequest('Digite de 2 a 120 caracteres para pesquisar.')
    if category not in {'all', *CATEGORIES} or scope not in SCOPES:
        raise BadRequest('Filtro de pesquisa inválido.')
    terms = normalize(query).split()
    if not terms:
        raise BadRequest('Digite um texto para pesquisar.')
    profiles = {row['id']: public_profile(row['profile']) for row in repository.users() if not row['profile'].get('isRemoved')}
    buckets = {key: [] for key in CATEGORIES}

    def add(group, key, title, text, owner_id, target, timestamp=0, assigned=None, completed=False, deleted=False, extra=''):
        if bool(deleted) != (scope == 'deleted'):
            return
        if scope == 'mine' and owner_id != user['id']:
            return
        if scope == 'assigned' and user['id'] not in (assigned or set()):
            return
        if scope == 'completed' and not completed:
            return
        title, text = plain_text(title), plain_text(text)
        owner = profiles.get(owner_id, {}).get('name', '')
        haystack = normalize(' '.join((title, text, str(owner), extra)))
        if not all(term in haystack for term in terms):
            return
        normalized_title = normalize(title)
        score = sum(3 for term in terms if term in normalized_title)
        excerpt = text
        # Se a correspondência está no meio de um texto longo, traz esse trecho.
        match_position = normalize(text).find(terms[0])
        if match_position > 100:
            excerpt = '…' + text[max(0, match_position - 70):]
        try:
            timestamp = int(timestamp or 0)
        except (TypeError, ValueError, OverflowError):
            timestamp = 0
        entry = dict(id=key, category=group, title=title[:160] or 'Sem título',
                     excerpt=excerpt[:260], author=str(owner), timestamp=timestamp or 0,
                     completed=bool(completed), deleted=bool(deleted), target=target,
                     score=score)
        buckets[group].append(entry)
        if group == 'metas' and owner_id == user['id']:
            buckets['minhas_metas'].append(dict(entry, category='minhas_metas'))

    for collection, group in [('posts', 'mural'), ('posts_private', 'mural'),
                               ('demandas', 'demandas'), ('demandas_private', 'demandas'),
                               ('metas', 'metas'), ('metas_private', 'metas')]:
        for document in repository.documents(collection):
            if not can_read(user, collection, document['id'], document['data']):
                continue
            private = collection.endswith('_private')
            items = mapping(document['data']).items() if private else [(document['id'], document['data'])]
            for item_id, item in items:
                if not isinstance(item, dict):
                    continue
                path = collection + '/' + document['id'] + ('/' + item_id if private else '')
                files = item.get('attachments')
                attachments = ' '.join(str(file.get('name', '')) for file in (files if isinstance(files, list) else []) if isinstance(file, dict))
                text = ' '.join((str(item.get('text', '')), comment_text(item.get('comments')), attachments))
                assigned = {key for field in ('assignedTo', 'mentions') for key, enabled in mapping(item.get(field)).items() if enabled}
                add(group, path, item.get('text') or attachments or 'Publicação com anexos', text,
                    item.get('uid'), dict(kind=group, id=item_id, path=path, sector=document['id'] if private else None,
                                         archived=bool(item.get('archived')), deleted=bool(item.get('deleted'))),
                    item.get('ts'), assigned=assigned, completed=item.get('done') or item.get('status') == 'done',
                    deleted=item.get('deleted'), extra=str(profiles.get(next(iter(mapping(item.get('assignedTo'))), ''), {}).get('name', '')))

    for person_id, profile in profiles.items():
        description = ' · '.join(filter(None, [str(profile.get('bio') or ''), ', '.join(mapping(profile.get('sectors')).keys())]))
        add('pessoas', person_id, profile.get('name', ''), description, person_id,
            dict(kind='pessoas', id=person_id), profile.get('createdAt'))

    for file in repository.list_files():
        if can_read_file(user, file, repository):
            add('arquivos', file['id'], file['name'], file['project'], file['owner_id'],
                dict(kind='arquivos', id=file['id']), extra=file.get('unit') or '')

    personal = mapping(repository.document('personal_demands', user['id']))
    for item_id, item in personal.items():
        if isinstance(item, dict):
            add('demandas', 'personal_demands/' + user['id'] + '/' + item_id, item.get('text', ''),
                'Demanda pessoal · ' + str(item.get('text', '')), user['id'],
                dict(kind='pessoal', id=item_id), item.get('ts'), assigned={user['id']}, completed=item.get('done'))

    notes = mapping(repository.document('private_notes', user['id']))
    note_tabs = notes.get('tabs')
    for tab in note_tabs if isinstance(note_tabs, list) else []:
        if isinstance(tab, dict):
            add('notas', str(tab.get('id', '')), tab.get('title') or 'Nota privada',
                tab.get('content', ''), user['id'], dict(kind='notas', id=tab.get('id')), notes.get('updatedAt'))

    for conversation in repository.documents('dms'):
        if not can_read(user, 'dms', conversation['id'], conversation['data']):
            continue
        other_id = next(value for value in conversation['id'].split('__') if value != user['id'])
        other_name = str(profiles.get(other_id, {}).get('name') or 'Integrante')
        for message_id, message in mapping(mapping(conversation['data']).get('messages')).items():
            if isinstance(message, dict) and not (message.get('hiddenFor') or {}).get(user['id']):
                add('mensagens', conversation['id'] + '/' + message_id, 'Conversa com ' + other_name,
                    message.get('text', ''), message.get('from'), dict(kind='mensagens', id=message_id, other_uid=other_id), message.get('ts'))

    counts = {key: len(items) for key, items in buckets.items()}
    visible_categories = [category] if category != 'all' else [key for key in CATEGORIES if key != 'minhas_metas']
    groups = []
    for key in visible_categories:
        items = sorted(buckets[key], key=lambda item: (-item['score'], -item['timestamp']))
        if items:
            groups.append(dict(category=key, label=CATEGORIES[key], total=len(items),
                               items=[{field: value for field, value in item.items() if field != 'score'} for item in items[:RESULT_LIMIT]]))
    return dict(query=query, category=category, scope=scope, counts=counts, groups=groups,
                total=sum(counts[key] for key in visible_categories), limit_per_category=RESULT_LIMIT)

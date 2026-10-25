"""Regras de acesso. A interface nunca é a autoridade sobre permissões."""
import re
from copy import deepcopy
from werkzeug.exceptions import Forbidden, BadRequest
from .achievements import CATALOG

PUBLIC_COLLECTIONS = {'posts', 'metas', 'demandas', 'presence'}
PRIVATE_COLLECTIONS = {'posts_private', 'metas_private', 'demandas_private'}
PERSONAL_COLLECTIONS = {'private_notes', 'personal_demands', 'contactNicknames', 'conversations', 'notification_states', 'notifications'}
PROFILE_FIELDS = {'name', 'bio', 'photo', 'affiliation'}
AFFILIATIONS = {'undergraduate', 'scientific_initiation', 'masters', 'doctorate', 'postdoc', 'researcher', 'professor', 'technician', 'collaborator', 'other'}
DEFAULT_UNITS = {'LACAM', 'LabNeuroMusc'}
LEGACY_AFFILIATION_UNITS = {'Pesquisadores', 'Pós-graduação', 'Iniciação científica', 'Equipe técnica'}
ROLE_FIELDS = {'isAdmin', 'isSupport', 'isDev', 'isBanned'}


def require(condition, message='Você não tem permissão para esta ação.'):
    if not condition:
        raise Forbidden(message)


def units(user):
    profile = user['profile']
    return {key for key, enabled in (profile.get('sectors') or {}).items() if enabled}


def is_admin(user):
    return user['profile'].get('isAdmin') is True


# A foto é sempre uma imagem embutida (data URL). Qualquer outro formato é rejeitado: ela vai parar em <img src>.
PHOTO_DATA_URL = re.compile(r'data:image/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}')
MAX_PHOTO_CHARS = 1_500_000


def safe_photo(value):
    """Devolve a foto se for uma imagem embutida válida; senão None (inclusive dados antigos adulterados)."""
    if isinstance(value, str) and len(value) <= MAX_PHOTO_CHARS and PHOTO_DATA_URL.fullmatch(value):
        return value
    return None


def public_profile(profile):
    # E-mail e dados de autenticação não são incluídos na lista de pessoas.
    allowed = PROFILE_FIELDS | (ROLE_FIELDS - {'isDev'}) | {'sectors', 'sector', 'createdAt'}
    result = {key: value for key, value in profile.items() if key in allowed}
    if result.get('photo'):
        result['photo'] = safe_photo(result['photo'])
    return result


def can_read(user, collection, document_id, data):
    if collection in PUBLIC_COLLECTIONS:
        return True
    if collection in PRIVATE_COLLECTIONS:
        return is_admin(user) or document_id in units(user)
    if collection in PERSONAL_COLLECTIONS:
        return document_id == user['id']
    if collection == 'dms':
        participants = document_id.split('__')
        return (len(participants) == 2 and participants[0] != participants[1] and
                document_id == '__'.join(sorted(participants)) and user['id'] in participants)
    if collection == 'team_call':
        return document_id == 'participants'
    return False


def at_path(value, parts):
    for part in parts:
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def replace_path(document, parts, value):
    if not parts:
        return deepcopy(value)
    result = deepcopy(document) if isinstance(document, dict) else {}
    cursor = result
    for part in parts[:-1]:
        if not isinstance(cursor.get(part), dict):
            cursor[part] = {}
        cursor = cursor[part]
    if value is None:
        cursor.pop(parts[-1], None)
    else:
        cursor[parts[-1]] = deepcopy(value)
    return result


def validate_comment_changes(old, new, user):
    """Cada comentário/resposta tem seu próprio autor; curtidas são individuais."""
    require(isinstance(new, dict) or new is None)
    for key in set(old or {}) | set(new or {}):
        before, after = (old or {}).get(key), (new or {}).get(key)
        if before == after:
            continue
        if before is None:
            require(isinstance(after, dict) and after.get('uid') == user['id'])
            require(not after.get('likes') and not after.get('replies'))
            continue
        if after is None:
            require(before.get('uid') == user['id'])
            continue
        require(isinstance(after, dict))
        require(after.get('uid') == before.get('uid'))
        for field in set(before) | set(after):
            if before.get(field) == after.get(field):
                continue
            if field == 'likes':
                validate_own_map(before.get(field), after.get(field), user)
            elif field == 'replies':
                validate_comment_changes(before.get(field), after.get(field), user)
            else:
                require(before.get('uid') == user['id'] and field in {'text', 'editedAt'})


def validate_own_map(old, new, user):
    require(isinstance(new, dict) or new is None)
    for key in set(old or {}) | set(new or {}):
        if (old or {}).get(key) != (new or {}).get(key):
            require(key == user['id'])


def validate_item(old, new, user, kind):
    if kind == 'demandas' and old != new:
        require(new is not None, 'Use a seção Excluídas para remover demandas sem apagar seus dados.')
        before, after = old or {}, new or {}
        require(isinstance(after, dict))
        require(not before.get('deleted'), 'Restaure a demanda antes de alterá-la.')
        require(all(before.get(field) == after.get(field) for field in ('deleted', 'deletedAt', 'deletedBy')),
                'Use as ações de excluir ou restaurar demandas.')
    if old == new or is_admin(user):
        return
    if old is None:
        require(isinstance(new, dict) and new.get('uid') == user['id'])
        require(not any(new.get(key) for key in ('comments', 'likes', 'views', 'pinned')))
        require(not (new.get('poll') or {}).get('votes'))
        return
    if new is None:
        require(old.get('uid') == user['id'])
        return
    require(isinstance(new, dict))
    require(old.get('uid') == new.get('uid'))
    owner = old.get('uid') == user['id']
    for field in set(old) | set(new):
        if old.get(field) == new.get(field):
            continue
        if field in {'likes', 'views'}:
            validate_own_map(old.get(field), new.get(field), user)
        elif field == 'comments':
            validate_comment_changes(old.get(field), new.get(field), user)
        elif field == 'poll':
            before, after = old.get(field) or {}, new.get(field) or {}
            require(isinstance(after, dict))
            if not owner:
                require({k: v for k, v in before.items() if k != 'votes'} ==
                        {k: v for k, v in after.items() if k != 'votes'})
            validate_own_map(before.get('votes'), after.get('votes'), user)
        elif kind in {'metas', 'demandas'} and field in {
            'done', 'status', 'doneAt', 'archived', 'archivedAt', 'archiveBatch'
        }:
            require(owner or bool((old.get('assignedTo') or {}).get(user['id'])))
        else:
            require(owner and field not in {'uid', 'pinned'})


def can_manage_demand(user, demand):
    return (is_admin(user) or demand.get('uid') == user['id'] or
            bool((demand.get('assignedTo') or {}).get(user['id'])) or
            bool((demand.get('mentions') or {}).get(user['id'])))


def validate_write(user, collection, document_id, old, new):
    require(collection != 'notifications', 'Notificações são geradas pelo sistema.')
    require(isinstance(new, dict) or new is None, 'O registro deve ser um objeto.')
    require(can_read(user, collection, document_id, old))
    if collection in PERSONAL_COLLECTIONS:
        return
    if collection == 'presence':
        require(document_id == user['id'])
        return
    if collection == 'team_call':
        validate_own_map(old, new, user)
        return
    if collection == 'dms':
        if new is None:
            return  # Qualquer participante pode excluir a conversa inteira.
        require(isinstance(new, dict))
        require(set(new) <= {'messages', 'readBy'})
        validate_own_map((old or {}).get('readBy'), new.get('readBy'), user)
        for key in set((old or {}).get('messages') or {}) | set(new.get('messages') or {}):
            before = ((old or {}).get('messages') or {}).get(key)
            after = (new.get('messages') or {}).get(key)
            if before != after:
                require(before is None and isinstance(after, dict) and after.get('from') == user['id'])
                require('hiddenFor' not in after, 'Use as opções de exclusão da mensagem.')
        return
    if collection in PRIVATE_COLLECTIONS:
        require(isinstance(new, dict) or new is None)
        for key in set(old or {}) | set(new or {}):
            validate_item((old or {}).get(key), (new or {}).get(key), user, collection.split('_')[0])
    else:
        validate_item(old, new, user, collection)


def update_profile(user, target, new, known_units=None):
    require(user['id'] == target['id'] or is_admin(user))
    require(isinstance(new, dict))
    old = target['profile']
    for key in set(old) | set(new):
        if old.get(key) == new.get(key):
            continue
        require(key != 'isDev', 'A marca de desenvolvedor foi removida.')
        if key in ROLE_FIELDS:
            require(is_admin(user), 'Somente a administração pode alterar permissões administrativas.')
            if key in {'isAdmin', 'isSupport'}:
                require(user['id'] != target['id'], 'Outro administrador precisa alterar o seu acesso.')
        elif key in {'sectors', 'sector'}:
            available = DEFAULT_UNITS | set(known_units or ())
            if key == 'sectors':
                selected = {} if new.get(key) is None else new[key]
                if not isinstance(selected, dict) or any(not isinstance(k, str) or not k.strip() or len(k) > 120 or not isinstance(v, bool) for k, v in selected.items()):
                    raise BadRequest('Escolha unidades válidas.')
                previous = {key for key, enabled in (old.get('sectors') or {}).items() if enabled}
                previous.update([old['sector']] if isinstance(old.get('sector'), str) else [])
                require(not any(enabled and key in LEGACY_AFFILIATION_UNITS and key not in previous for key, enabled in selected.items()),
                        'Escolha seu vínculo no campo acadêmico ou profissional e um laboratório ou equipe nas unidades.')
                require(is_admin(user) or set(selected) <= available, 'Escolha uma unidade existente no laboratório.')
            else:
                require(new.get(key) is None or (isinstance(new[key], str) and (is_admin(user) or new[key] in available)))
        elif key == 'photo':
            if new.get(key) not in (None, '') and safe_photo(new.get(key)) is None:
                raise BadRequest('Use uma imagem JPG, PNG, WebP ou GIF para a foto (até cerca de 1 MB).')
        elif key == 'achievementVisibility':
            require(user['id'] == target['id'], 'Somente a própria conta escolhe a visibilidade das conquistas.')
            value = new.get(key)
            allowed = {item[0] for item in CATALOG}
            if (not isinstance(value, dict) or set(value) != {'hideAll', 'hidden'}
                    or not isinstance(value.get('hideAll'), bool)
                    or not isinstance(value.get('hidden'), list) or len(value['hidden']) > len(allowed)
                    or any(not isinstance(item, str) or item not in allowed for item in value['hidden'])
                    or len(set(value['hidden'])) != len(value['hidden'])):
                raise BadRequest('Escolha uma visibilidade válida para as conquistas.')
        else:
            require(key in PROFILE_FIELDS or (key == 'email' and new.get(key) == target['email']))
    if not str(new.get('name', '')).strip() or len(str(new.get('name'))) > 120:
        raise BadRequest('Informe um nome com até 120 caracteres.')
    completing_profile = 'affiliation' in new or bool(old.get('affiliation'))
    if completing_profile and (not isinstance(new.get('affiliation'), str) or new['affiliation'] not in AFFILIATIONS):
        raise BadRequest('Escolha um vínculo acadêmico válido.')
    if completing_profile and not any((new.get('sectors') or {}).values()):
        raise BadRequest('Selecione pelo menos uma unidade ou equipe do laboratório.')
    return new


def can_read_file(user, record, repository=None):
    if is_admin(user) or record['owner_id'] == user['id']:
        return True
    if record.get('purpose') == 'post':
        from .attachments import can_read_post_attachment
        return can_read_post_attachment(user, record, repository)
    return bool(record['unit'] and record['unit'] in units(user))

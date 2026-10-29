"""Painel administrativo: projeções explícitas, autorização e histórico no servidor."""
import math
import time
from datetime import datetime
from uuid import uuid4

from flask import g, jsonify, request
from werkzeug.exceptions import BadRequest, NotFound

from .permissions import DEFAULT_UNITS, LEGACY_AFFILIATION_UNITS, is_admin, require


def now_ms():
    return int(time.time() * 1000)


def can_access(user):
    return is_admin(user) or user['profile'].get('isSupport') is True


def audit(repository, actor, action, target_id, target_name='', details=None):
    repository.save_document('_admin_audit', uuid4().hex, {
        'ts': now_ms(), 'actorId': actor['id'], 'actorName': actor['profile'].get('name', 'Administrador'),
        'action': action, 'targetId': target_id, 'targetName': str(target_name)[:160], 'details': details or {},
    })


def stamp(value):
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    return int(value) if isinstance(value, (int, float)) and math.isfinite(value) and value > 0 else None


def user_rows(repository):
    presence = {r['id']: r['data'] for r in repository.documents('presence')}
    access = {r['id']: r['data'] for r in repository.documents('_account_access')}
    now = now_ms()
    result = []
    for row in repository.administration_users():
        profile = row['profile']
        if profile.get('isRemoved') is True:
            continue
        seen = stamp(presence.get(row['id'], {}).get('lastSeen'))
        login = stamp(access.get(row['id'], {}).get('lastLoginAt'))
        blocked = profile.get('isBanned') is True
        result.append({
            'id': row['id'], 'name': profile.get('name') or 'Sem nome', 'email': row['email'],
            'units': sorted(k for k, v in (profile.get('sectors') or {}).items() if v),
            'affiliation': profile.get('affiliation'),
            'role': 'admin' if profile.get('isAdmin') is True else 'support' if profile.get('isSupport') is True else 'member',
            'status': 'blocked' if blocked else 'active',
            'createdAt': stamp(row.get('created_at')) or stamp(profile.get('createdAt')),
            'lastSeen': max(seen or 0, login or 0) or None,
            'online': bool(not blocked and presence.get(row['id'], {}).get('online') is True and seen and 0 <= now - seen < 90000),
        })
    return result


def page(items):
    try:
        number = int(request.args.get('page', '1'))
    except (ValueError, TypeError):
        raise BadRequest('Página inválida.')
    if not 1 <= number <= 1000000:
        raise BadRequest('Página inválida.')
    pages = max(1, math.ceil(len(items) / 20))
    number = min(number, pages)
    return {'items': items[(number - 1) * 20:number * 20], 'page': number, 'pages': pages, 'total': len(items)}


def register_administration(app):
    @app.get('/api/admin/overview')
    def overview():
        require(can_access(g.user))
        with app.database.transaction() as repository:
            users = user_rows(repository)
            counts = {}
            for name in ('posts', 'metas', 'demandas'):
                records = [r['data'] for r in repository.documents(name)]
                for unit in repository.documents(name + '_private'):
                    records.extend(v for v in unit['data'].values() if isinstance(v, dict))
                counts[name] = len(records) if name == 'posts' else sum(not item.get('done') for item in records)
        return jsonify({
            'counts': {**counts, 'total': len(users), 'active': sum(u['status'] == 'active' for u in users),
                       'online': sum(u['online'] for u in users), 'blocked': sum(u['status'] == 'blocked' for u in users),
                       'newWeek': sum(bool(u['createdAt'] and now_ms() - 7 * 86400000 <= u['createdAt'] <= now_ms()) for u in users)},
            'canManageUsers': is_admin(g.user), 'updatedAt': now_ms(),
        })

    @app.get('/api/admin/users')
    def users():
        require(can_access(g.user))
        query = request.args.get('q', '').strip().casefold()
        status, role = request.args.get('status', 'all'), request.args.get('role', 'all')
        if len(query) > 120 or status not in {'all', 'active', 'removed', 'blocked', 'online'} or role not in {'all', 'admin', 'support', 'member'}:
            raise BadRequest('Filtros inválidos.')
        with app.database.transaction() as repository:
            rows = user_rows(repository)
            known_units = sorted((DEFAULT_UNITS | {unit for row in rows for unit in row['units']}) - LEGACY_AFFILIATION_UNITS)
        rows = [u for u in rows if (not query or query in (u['name'] + ' ' + u['email'] + ' ' + u['id']).casefold())
                and (status == 'all' or (u['online'] if status == 'online' else u['status'] == status))
                and (role == 'all' or u['role'] == role)]
        rows.sort(key=lambda u: (u['name'].casefold(), u['id']))
        return jsonify(**page(rows), canManageUsers=is_admin(g.user), knownUnits=known_units)

    @app.get('/api/admin/audit')
    def history():
        require(can_access(g.user))
        with app.database.transaction() as repository:
            records = [dict(r['data'], id=r['id']) for r in repository.documents('_admin_audit')]
        records.sort(key=lambda item: (item['ts'], item['id']), reverse=True)
        return jsonify(page(records))

    @app.patch('/api/admin/users/<uid>/role')
    def role(uid):
        require(is_admin(g.user))
        body = request.get_json()
        if not isinstance(body, dict) or set(body) != {'role'} or body['role'] not in ('admin', 'support', 'member'):
            raise BadRequest('Escolha um nível de acesso válido.')
        require(uid != g.user['id'], 'Outro administrador precisa alterar o seu acesso.')
        with app.database.transaction() as repository:
            repository.lock_document('_admin_roles', 'global')
            actor = repository.user(g.user['id'])
            require(actor is not None and is_admin(actor))
            repository.lock_document('users', uid)
            target = repository.user(uid)
            if not target or target['profile'].get('isRemoved'):
                raise NotFound('Conta não encontrada.')
            profile = dict(target['profile'])
            before = {'isAdmin': profile.get('isAdmin') is True, 'isSupport': profile.get('isSupport') is True}
            after = {'isAdmin': body['role'] == 'admin', 'isSupport': body['role'] == 'support'}
            if before != after:
                profile.update(after)
                repository.update_profile(uid, profile)
                audit(repository, actor, 'user.permissions', uid, profile.get('name'), {'before': before, 'after': after})
        return jsonify(ok=True)

    @app.patch('/api/admin/users/<uid>/units')
    def assign_units(uid):
        require(is_admin(g.user))
        body = request.get_json()
        if (not isinstance(body, dict) or set(body) != {'units'} or not isinstance(body['units'], list)
                or not 1 <= len(body['units']) <= 30
                or any(not isinstance(unit, str) or not unit.strip() or len(unit) > 120 for unit in body['units'])):
            raise BadRequest('Selecione pelo menos uma unidade válida, até o limite de 30.')
        chosen = set(body['units'])
        with app.database.transaction() as repository:
            repository.lock_document('_admin_roles', 'global')
            actor = repository.user(g.user['id'])
            require(actor is not None and is_admin(actor))
            repository.lock_document('users', uid)
            target = repository.user(uid)
            if not target or target['profile'].get('isRemoved'):
                raise NotFound('Conta não encontrada.')
            profile = dict(target['profile'])
            before = sorted(k for k, enabled in (profile.get('sectors') or {}).items() if enabled)
            known = DEFAULT_UNITS | {k for row in repository.users() for k in (row['profile'].get('sectors') or {})}
            permitted = (known - LEGACY_AFFILIATION_UNITS) | set(before)
            if not chosen <= permitted:
                raise BadRequest('Escolha uma unidade existente no laboratório.')
            if chosen != set(before):
                profile['sectors'] = {unit: True for unit in sorted(chosen)}
                repository.update_profile(uid, profile)
                audit(repository, actor, 'user.units', uid, profile.get('name'), {'before': before, 'after': sorted(chosen)})
        return jsonify(ok=True)

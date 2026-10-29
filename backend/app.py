"""API e arquivos estáticos do hub, no mesmo endereço (sem CORS aberto)."""
import hashlib
import math
import os
import re
import secrets
import shutil
import time
import tempfile
from datetime import timedelta
from functools import lru_cache
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlsplit

import click
import psycopg
from dotenv import load_dotenv
from flask import Flask, Response, g, jsonify, request, send_file, send_from_directory, session
from .messages import visible_document
from werkzeug.exceptions import BadRequest, Forbidden, HTTPException, NotFound, TooManyRequests, RequestEntityTooLarge
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

from .object_storage import SupabaseFileStorage
from .database import Database
from .passwords import validate_password
from .password_reset import register_password_reset
from .game_ranking import register_game_ranking
from .team_voice import register_team_voice, disconnect_voice_user
from .attachments import INLINE_TYPES, bind_post_attachments, detect_media_type
from .mural_milestones import record_first_post
from .achievements import record_achievements, profile_achievements, achievement_catalog
from .search import search_hub
from .administration import register_administration, audit
from .permissions import (
    PERSONAL_COLLECTIONS, PRIVATE_COLLECTIONS, PUBLIC_COLLECTIONS,
    at_path, can_read, can_read_file, can_manage_demand, is_admin, public_profile,
    replace_path, require, safe_photo, units, update_profile, validate_write,
)

ROOT = Path(__file__).resolve().parent.parent
# Caracteres que nunca fazem parte de identificadores legítimos e permitem quebrar atributos HTML.
UNSAFE_PATH_CHARS = re.compile(r'[<>"\'`\x00-\x1f\x7f]')
ALLOWED_COLLECTIONS = PUBLIC_COLLECTIONS | PRIVATE_COLLECTIONS | PERSONAL_COLLECTIONS | {'dms', 'team_call'}


def milliseconds():
    return int(time.time() * 1000)


def validate_json(value, depth=0):
    if depth > 32:
        raise BadRequest('Dados com níveis demais de organização.')
    if isinstance(value, dict):
        for key, item in value.items():
            if (len(key) > 1024 or UNSAFE_PATH_CHARS.search(key)
                    or any(part in {'__proto__', 'constructor', 'prototype'} for part in key.split('/'))):
                raise BadRequest('Os dados contêm uma chave inválida.')
            validate_json(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            validate_json(item, depth + 1)
    elif isinstance(value, float) and not math.isfinite(value):
        raise BadRequest('Os dados contêm um número inválido.')


@lru_cache(maxsize=1)
def dummy_password_hash():
    """Hash descartável: mantém o tempo de resposta igual para contas que não existem."""
    return generate_password_hash(secrets.token_urlsafe(24))


def create_app(settings=None, database=None):
    env_file = os.environ.get('HUB_ENV_FILE', '.env')
    load_dotenv(ROOT / env_file)
    on_vercel = os.environ.get('VERCEL') == '1'
    cloud_files = os.environ.get('STORAGE_BACKEND', 'supabase' if on_vercel else 'local') == 'supabase'
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=os.environ.get('SECRET_KEY'),
        DATABASE_URL=os.environ.get('DATABASE_URL'),
        STORAGE_DIR=os.environ.get('STORAGE_DIR', str(Path(tempfile.gettempdir()) / 'labiomec-files') if on_vercel or cloud_files else str(ROOT / 'var' / 'files')),
        STORAGE_BACKEND=os.environ.get('STORAGE_BACKEND', 'supabase' if on_vercel else 'local'),
        SUPABASE_URL=os.environ.get('SUPABASE_URL', ''),
        SUPABASE_SECRET_KEY=os.environ.get('SUPABASE_SECRET_KEY', ''),
        SUPABASE_STORAGE_BUCKET=os.environ.get('SUPABASE_STORAGE_BUCKET', 'hub-files'),
        MAX_CONTENT_LENGTH=int(os.environ.get('MAX_UPLOAD_MB', '4' if on_vercel else '2048')) * 1024 * 1024,
        STORAGE_LIMIT_BYTES=int(os.environ.get('STORAGE_LIMIT_GB', '1' if on_vercel else '100')) * 1024**3,
        POST_ATTACHMENT_MAX_BYTES=int(os.environ.get('POST_ATTACHMENT_MAX_MB', '250')) * 1024**2,
        SESSION_COOKIE_NAME='labiomec_session',
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_SECURE=os.environ.get('COOKIE_SECURE', 'true' if on_vercel else 'false').lower() == 'true',
        PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
        TRUSTED_PROXY_COUNT=int(os.environ.get('TRUSTED_PROXY_COUNT', '0')),
        UPLOADS_PER_HOUR=int(os.environ.get('UPLOADS_PER_HOUR', '200')),
        SEARCH_LIMIT=int(os.environ.get('SEARCH_LIMIT', '30')),
        SEARCH_WINDOW_SECONDS=int(os.environ.get('SEARCH_WINDOW_SECONDS', '60')),
        ALLOW_REGISTRATION=os.environ.get('ALLOW_REGISTRATION', 'false').lower() == 'true',
        ALLOW_LOCAL_FRAME_PREVIEW=os.environ.get('ALLOW_LOCAL_FRAME_PREVIEW', 'false').lower() == 'true',
        PUBLIC_ORIGIN=os.environ.get('PUBLIC_ORIGIN', '').rstrip('/'),
        SMTP_HOST=os.environ.get('SMTP_HOST', ''),
        SMTP_PORT=int(os.environ.get('SMTP_PORT', '587')),
        SMTP_USERNAME=os.environ.get('SMTP_USERNAME', ''),
        SMTP_PASSWORD=os.environ.get('SMTP_PASSWORD', ''),
        SMTP_FROM=os.environ.get('SMTP_FROM', ''),
        LIVEKIT_URL=os.environ.get('LIVEKIT_URL', ''),
        LIVEKIT_INTERNAL_URL=os.environ.get('LIVEKIT_INTERNAL_URL', ''),
        LIVEKIT_API_KEY=os.environ.get('LIVEKIT_API_KEY', ''),
        LIVEKIT_API_SECRET=os.environ.get('LIVEKIT_API_SECRET', ''),
    )
    if settings:
        app.config.update(settings)
    voice_key, voice_secret = app.config['LIVEKIT_API_KEY'], app.config['LIVEKIT_API_SECRET']
    if voice_key or voice_secret:
        if not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', voice_key or ''):
            raise RuntimeError('Defina LIVEKIT_API_KEY com 8 a 128 letras, números, hífen ou sublinhado.')
        if not voice_secret or len(voice_secret) < 32:
            raise RuntimeError('Defina LIVEKIT_API_SECRET com pelo menos 32 caracteres, junto de LIVEKIT_API_KEY.')
    if not app.config['SECRET_KEY'] or len(app.config['SECRET_KEY']) < 32:
        raise RuntimeError('Defina SECRET_KEY com pelo menos 32 caracteres aleatórios.')
    if 'SUBSTITUA' in app.config['SECRET_KEY']:
        raise RuntimeError('Substitua o exemplo de SECRET_KEY por um segredo aleatório.')
    # Com HTTPS, o cookie precisa do prefixo __Host- (preso ao domínio, sem Domain e com Secure).
    if app.config['SESSION_COOKIE_SECURE'] and app.config['SESSION_COOKIE_NAME'] == 'labiomec_session':
        app.config['SESSION_COOKIE_NAME'] = '__Host-labiomec_session'
    if app.config['PUBLIC_ORIGIN'].startswith('https://') and not app.config['SESSION_COOKIE_SECURE']:
        app.logger.warning('PUBLIC_ORIGIN usa HTTPS, mas COOKIE_SECURE=false: o cookie de sessão pode vazar por HTTP.')
    if app.config['TRUSTED_PROXY_COUNT'] > 0:
        # Só confie nos cabeçalhos X-Forwarded-* se houver proxy reverso confiável à frente.
        proxies = app.config['TRUSTED_PROXY_COUNT']
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=proxies, x_proto=proxies, x_host=proxies)
    if database is None and not app.config['DATABASE_URL']:
        raise RuntimeError('Defina DATABASE_URL para conectar ao PostgreSQL.')
    app.database = database or Database(app.config['DATABASE_URL'])
    storage = Path(app.config['STORAGE_DIR']).resolve()
    storage.mkdir(parents=True, exist_ok=True)
    backend = app.config['STORAGE_BACKEND']
    if backend not in {'local', 'supabase'}:
        raise RuntimeError('STORAGE_BACKEND deve ser local ou supabase.')
    if on_vercel and backend != 'supabase':
        raise RuntimeError('Na Vercel, use armazenamento persistente Supabase, nunca disco local.')
    object_storage = SupabaseFileStorage(app.config['SUPABASE_URL'], app.config['SUPABASE_SECRET_KEY'],
                                        app.config['SUPABASE_STORAGE_BUCKET']) if backend == 'supabase' else None
    app.object_storage = object_storage


    @app.before_request
    def protect_request():
        if not request.path.startswith('/api/'):
            return
        if request.path != '/api/files':
            api_limit = min(app.config['MAX_CONTENT_LENGTH'], 8 * 1024 * 1024)
            request.max_content_length = api_limit
            if request.content_length is not None and request.content_length > api_limit:
                raise RequestEntityTooLarge('Dados muito grandes. Use a área de arquivos para enviar anexos.')
        # Toda escrita exige token e origem compatível, inclusive o login.
        if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
            token = request.headers.get('X-CSRF-Token', '')
            require(bool(token) and secrets.compare_digest(token, session.get('csrf', '')), 'Sessão expirada. Atualize a página.')
            origin = request.headers.get('Origin')
            expected_origin = app.config['PUBLIC_ORIGIN'] or request.host_url.rstrip('/')
            require(not origin or origin == expected_origin, 'Origem não autorizada.')
        if request.is_json and request.path != '/api/files':
            try:
                # O byte adicional distingue um corpo exatamente no limite de um
                # stream truncado, antes que o parser o confunda com JSON inválido.
                request.max_content_length = api_limit + 1
                if len(request.get_data(cache=True)) > api_limit:
                    raise RequestEntityTooLarge('Dados muito grandes. Use a área de arquivos para enviar anexos.')
                validate_json(request.get_json())
            except RecursionError:
                raise BadRequest('Dados com níveis demais de organização.') from None
        if request.path in {'/api/session', '/api/health', '/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/forgot-password', '/api/auth/reset-password'}:
            return
        with app.database.transaction() as repository:
            user = authenticated_user(repository)
        if not user or user['profile'].get('isRemoved') or user['session_version'] != session.get('version'):
            return jsonify(error='Entre na sua conta.', code='auth/unauthenticated'), 401
        require(not user['profile'].get('isBanned'), 'Esta conta está bloqueada.')
        g.user = user

    def local_preview():
        # Exceção explícita apenas para a página inicial no desenvolvimento local.
        # Documentos, recuperação e qualquer origem pública mantêm a proteção.
        origin = urlsplit(app.config['PUBLIC_ORIGIN'])
        local_hosts = {'localhost', '127.0.0.1', '::1'}
        return bool(app.config['ALLOW_LOCAL_FRAME_PREVIEW'] and request.path == '/'
                    and origin.scheme == 'http' and origin.hostname in local_hosts
                    and urlsplit(request.host_url).hostname in local_hosts
                    and not app.config['SESSION_COOKIE_SECURE'])

    def content_security_policy(nonce=None):
        """Política das páginas HTML: scripts só do próprio site (o inline exige nonce por requisição)."""
        connect = ["'self'"]
        voice = urlsplit(app.config['LIVEKIT_URL'])
        if voice.scheme in {'ws', 'wss', 'http', 'https'} and voice.netloc:
            secure = voice.scheme in {'wss', 'https'}
            connect += [('wss://' if secure else 'ws://') + voice.netloc, ('https://' if secure else 'http://') + voice.netloc]
        scripts = "'self' 'wasm-unsafe-eval'" + (f" 'nonce-{nonce}'" if nonce else '')
        parts = [
            "default-src 'self'", 'script-src ' + scripts,
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob:", "media-src 'self' data: blob:",
            'connect-src ' + ' '.join(connect), "worker-src 'self' blob:",
            "object-src 'none'", "base-uri 'none'", "form-action 'self'",
        ]
        if not local_preview():
            parts.append("frame-ancestors 'self'")
        if app.config['SESSION_COOKIE_SECURE']:
            parts.append('upgrade-insecure-requests')
        return '; '.join(parts)

    @app.after_request
    def response_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        if not local_preview():
            response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
        response.headers['Cross-Origin-Resource-Policy'] = 'same-origin'
        response.headers['Permissions-Policy'] = ('camera=(self), microphone=(self), display-capture=(self), '
                                                  'geolocation=(), payment=(), usb=(), interest-cohort=()')
        if request.path.startswith('/assets/') and response.mimetype in {'text/html', 'image/svg+xml'}:
            response.headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'"
            response.headers['X-Frame-Options'] = 'DENY'
        if app.config['SESSION_COOKIE_SECURE']:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
            # Respostas da API nunca são páginas; arquivos enviados definem a própria política.
            response.headers.setdefault('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'")
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description, code='api/error'), error.code

    @app.errorhandler(psycopg.Error)
    def database_error(error):
        app.logger.exception('Falha na operação com o banco')
        return jsonify(error='O banco está indisponível. Tente novamente.', code='api/database-unavailable'), 503

    index_cache = {}

    def index_html():
        path = ROOT / 'index.html'
        stamp = path.stat().st_mtime_ns
        if index_cache.get('stamp') != stamp:
            index_cache.update(stamp=stamp, text=path.read_text(encoding='utf-8'))
        return index_cache['text']

    @app.get('/')
    def index():
        # O único script inline recebe um nonce novo a cada resposta; qualquer outro inline é bloqueado.
        nonce = secrets.token_urlsafe(18)
        marker = '<script type="module">'
        html = index_html()
        if marker not in html:
            raise RuntimeError('index.html precisa conter <script type="module"> para receber o nonce da CSP.')
        response = Response(html.replace(marker, f'<script type="module" nonce="{nonce}">', 1), mimetype='text/html')
        response.headers['Content-Security-Policy'] = content_security_policy(nonce)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/lab-config.js')
    def frontend_config():
        return send_from_directory(ROOT, 'lab-config.js')

    @app.get('/reset-password')
    def password_reset_page():
        response = send_from_directory(ROOT / 'assets', 'password-reset.html')
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = content_security_policy()
        return response

    register_password_reset(app)
    register_game_ranking(app)
    register_team_voice(app)
    register_administration(app)

    @app.get('/assets/<path:name>')
    def assets(name):
        return send_from_directory(ROOT / 'assets', name)

    @app.get('/api/health')
    def health():
        with app.database.transaction() as repository:
            repository.users()
        return jsonify(status='ok')

    def password_matches(user, password):
        # Sempre calcula um hash, mesmo sem conta, para não revelar quais e-mails existem pelo tempo de resposta.
        usable = bool(user) and not user['profile'].get('isRemoved')
        valid = check_password_hash(user['password_hash'] if usable else dummy_password_hash(), password)
        return usable and valid

    def session_key():
        token = session.get('sid')
        return hashlib.sha256(token.encode()).hexdigest() if isinstance(token, str) and len(token) == 43 else None

    def authenticated_user(repository):
        key = session_key()
        record = repository.document('_sessions', key) if key else None
        if not record or record.get('uid') != session.get('user_id') or record.get('expires', 0) <= time.time():
            return None
        user = repository.user(record['uid'])
        if not user or user['session_version'] != session.get('version') or record.get('version') != user['session_version']:
            return None
        return user

    def establish_session(user):
        token = secrets.token_urlsafe(32)
        key = hashlib.sha256(token.encode()).hexdigest()
        with app.database.transaction() as repository:
            old_key = session_key()
            if old_key:
                repository.save_document('_sessions', old_key, None)
            repository.save_document('_sessions', key, {
                'uid': user['id'], 'version': user['session_version'],
                'expires': time.time() + app.config['PERMANENT_SESSION_LIFETIME'].total_seconds(),
            })
        session.clear()
        session.update(user_id=user['id'], version=user['session_version'], sid=token, csrf=secrets.token_urlsafe(32))
        session.permanent = True
        return jsonify(user={'uid': user['id'], 'email': user['email']}, csrf=session['csrf'])

    @app.get('/api/session')
    def current_session():
        session.setdefault('csrf', secrets.token_urlsafe(32))
        user = None
        if session.get('user_id'):
            with app.database.transaction() as repository:
                user = authenticated_user(repository)
            if user and (user['session_version'] != session.get('version') or user['profile'].get('isBanned') or user['profile'].get('isRemoved')):
                user = None
        return jsonify(user={'uid': user['id'], 'email': user['email']} if user else None, csrf=session['csrf'])

    @app.post('/api/auth/<action>')
    def authenticate(action):
        if action == 'logout':
            key = session_key()
            if key:
                with app.database.transaction() as repository:
                    repository.save_document('_sessions', key, None)
            session.clear()
            return jsonify(ok=True)
        if action not in {'login', 'register'}:
            raise NotFound()
        body = request.get_json()
        if not isinstance(body, dict) or not isinstance(body.get('email'), str) or not isinstance(body.get('password'), str):
            raise BadRequest('Informe e-mail e senha válidos.')
        email, password = body['email'].strip().lower(), body['password']
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email) or len(email) > 254:
            return jsonify(error='E-mail inválido.', code='auth/invalid-email'), 400
        if len(password) > 256:
            raise BadRequest('A senha deve ter até 256 caracteres.')
        # Aplica limites por IP e por conta, sem armazenar IP ou email na tabela de tentativas.
        with app.database.transaction() as repository:
            keys = [hashlib.sha256(value.encode()).hexdigest() for value in
                    ('ip:' + (request.remote_addr or ''), 'email:' + email)]
            allowed = [repository.attempt_allowed(key) for key in keys]
        if not all(allowed):
            app.logger.warning('seguranca: limite de tentativas atingido (conta=%s)', keys[1][:12])
            return jsonify(error='Aguarde 15 minutos antes de tentar novamente.', code='auth/too-many-requests'), 429
        with app.database.transaction() as repository:
            if action == 'register':
                # Serializa cadastros do mesmo e-mail, inclusive entre processos.
                repository.lock_document('registration', email)
            user = repository.user_by_email(email)
            if action == 'register':
                require(app.config['ALLOW_REGISTRATION'], 'Cadastro fechado. Solicite uma conta à administração.')
                problem = validate_password(password, email)
                if problem:
                    return jsonify(error=problem, code='auth/weak-password'), 400
                if user:
                    return jsonify(error='Não foi possível cadastrar essa conta.', code='auth/email-already-in-use'), 409
                user_id = uuid4().hex
                repository.create_user(user_id, email, generate_password_hash(password),
                                       {'name': email.split('@')[0], 'createdAt': milliseconds()})
                user = repository.user(user_id)
            elif not password_matches(user, password):
                app.logger.warning('seguranca: login recusado (conta=%s)', hashlib.sha256(email.encode()).hexdigest()[:12])
                return jsonify(error='E-mail ou senha incorretos.', code='auth/invalid-credential'), 401
            require(not user['profile'].get('isBanned'), 'Esta conta está bloqueada.')
            repository.save_document('_account_access', user['id'], {'lastLoginAt': milliseconds()})
        return establish_session(user)

    @app.delete('/api/users/<user_id>')
    def remove_member(user_id):
        require(is_admin(g.user))
        require(user_id != g.user['id'], 'Você não pode excluir sua própria conta por aqui.')
        with app.database.transaction() as repository:
            repository.lock_document('_admin_roles', 'global')
            require(is_admin(repository.user(g.user['id'])))
            repository.lock_document('users', user_id)
            target = repository.user(user_id)
            if not target or target['profile'].get('isRemoved'):
                raise NotFound()
            require(not is_admin(target), 'Não é possível excluir outra conta administrativa.')
            repository.remove_user_access(user_id)
            audit(repository, g.user, 'user.removed', user_id, target['profile'].get('name'))
        disconnect_voice_user(app,user_id)
        return jsonify(ok=True)

    def path_parts(path):
        parts = path.split('/')
        if len(parts) > 24 or any(not part or len(part) > 180 or part in {'.', '..', '__proto__', 'constructor', 'prototype'} or UNSAFE_PATH_CHARS.search(part) for part in parts):
            raise BadRequest('Caminho inválido.')
        return parts

    @app.post('/api/sync')
    def sync():
        """Atualiza todos os painéis em uma requisição, sem conexões por painel."""
        body = request.get_json(silent=True)
        paths = body.get('paths', []) if isinstance(body, dict) else None
        if not isinstance(paths, list) or len(paths) > 200:
            raise BadRequest('Lista de caminhos inválida.')
        result, collections = {}, {}
        with app.database.transaction() as repository:
            for path in paths:
                if not isinstance(path, str):
                    raise BadRequest('Caminho inválido.')
                parts = path_parts(path)
                collection = parts[0]
                if collection != 'users' and collection not in ALLOWED_COLLECTIONS:
                    raise NotFound()
                if collection not in collections:
                    if collection == 'users':
                        records = {row['id']: public_profile(row['profile']) for row in repository.users() if not row['profile'].get('isRemoved')}
                    else:
                        records = {row['id']: visible_document(collection, row['data'], g.user) for row in repository.documents(collection)
                                   if can_read(g.user, collection, row['id'], row['data'])}
                    if collection == 'presence':
                        now = milliseconds()
                        records = {key: dict(value, online=bool(value.get('online') and now - value.get('lastSeen', 0) < 90000))
                                   for key, value in records.items()}
                    collections[collection] = records
                result[path] = at_path(collections[collection], parts[1:]) or None
        return jsonify(data=result)

    @app.route('/api/data/<path:path>', methods=['GET', 'PUT', 'PATCH', 'DELETE'])
    def data(path):
        first_post = False
        achievements = []
        parts = path_parts(path)
        collection = parts[0]
        if collection != 'users' and collection not in ALLOWED_COLLECTIONS:
            raise NotFound()
        if request.method != 'GET' and len(parts) < 2:
            raise Forbidden('Operações devem indicar um registro específico.')
        with app.database.transaction() as repository:
            if collection == 'users':
                if request.method == 'GET':
                    profiles = {row['id']: public_profile(row['profile']) for row in repository.users() if not row['profile'].get('isRemoved')}
                    return jsonify(data=at_path(profiles, parts[1:]))
                require(request.method == 'PATCH', 'Perfis só podem ser atualizados.')
                target = repository.user(parts[1])
                if not target or target['profile'].get('isRemoved'):
                    raise NotFound()
                if is_admin(g.user):
                    repository.lock_document('_admin_roles', 'global')
                    require(is_admin(repository.user(g.user['id'])))
                repository.lock_document('users', target['id'])
                target = repository.user(parts[1])
                new = apply_change(target['profile'], parts[2:])
                known_units = {unit for row in repository.users() for unit in (row['profile'].get('sectors') or {})}
                validated = update_profile(g.user, target, new, known_units)
                repository.update_profile(target['id'], validated)
                changed = sorted(key for key in set(target['profile']) | set(validated) if target['profile'].get(key) != validated.get(key))
                if is_admin(g.user) and changed:
                    audit(repository, g.user, 'user.updated', target['id'], target['profile'].get('name'), {'fields': changed})
                return jsonify(ok=True)
            if request.method == 'GET' and len(parts) == 1:
                records = {row['id']: visible_document(collection, row['data'], g.user) for row in repository.documents(collection)
                           if can_read(g.user, collection, row['id'], row['data'])}
                if collection == 'presence':
                    now = milliseconds()
                    records = {key: dict(value, online=bool(value.get('online') and now - value.get('lastSeen', 0) < 90000))
                               for key, value in records.items()}
                return jsonify(data=records or None)
            document_id = parts[1]
            if request.method != 'GET':
                repository.lock_document(collection, document_id)
            old = repository.document(collection, document_id)
            require(can_read(g.user, collection, document_id, old))
            if request.method == 'GET':
                return jsonify(data=at_path(visible_document(collection, old, g.user), parts[2:]))
            new = apply_change(old, parts[2:])
            if collection == 'presence' and new is not None:
                if not isinstance(new, dict):
                    raise BadRequest('Presença inválida.')
                new = {'online': new.get('online') is True, 'lastSeen': milliseconds()}
            validate_write(g.user, collection, document_id, old, new)
            if collection == 'dms' and new is not None:
                # Mensagens novas iniciam um novo ciclo: ocultações anteriores continuam
                # privadas, mas não autorizam apagar mensagens que chegaram depois.
                if set(new.get('messages') or {}) - set((old or {}).get('messages') or {}):
                    new.pop('deletedFor', None)
            bind_post_attachments(repository, g.user, collection, document_id, old, new)
            achievements = record_achievements(repository, g.user, collection, document_id, old, new)
            first_post = record_first_post(repository, g.user, collection, document_id, old, new)
            repository.save_document(collection, document_id, new)
            if is_admin(g.user) and request.method == 'DELETE' and old is not None:
                audit(repository, g.user, 'content.deleted', collection + '/' + document_id, details={'collection': collection})
            if collection == 'dms':
                update_conversation_summaries(repository, document_id, old, new)
        return jsonify(ok=True, firstPost=first_post, achievements=achievements)

    @app.get('/api/achievements/<uid>')
    def achievements_profile(uid):
        with app.database.transaction() as repository:
            target = repository.user(uid)
            if not target or target['profile'].get('isRemoved'):
                raise NotFound()
            own = uid == g.user['id']
            result = {'achievements': profile_achievements(repository, uid, own), 'own': own, 'catalog': achievement_catalog()}
            if own:
                result['visibility'] = target['profile'].get('achievementVisibility') or {'hideAll': False, 'hidden': []}
            return jsonify(result)

    def update_conversation_summaries(repository, conversation_id, old, new):
        """Resumos para os dois participantes são gerados pelo servidor."""
        participants = conversation_id.split('__')
        require(len(participants) == 2 and participants[0] != participants[1])
        for owner_id, other_id in (participants, participants[::-1]):
            other = repository.user(other_id)
            require(other is not None, 'Participante não encontrado.')
            repository.lock_document('conversations', owner_id)
            summaries = repository.document('conversations', owner_id) or {}
            if new is None:
                summaries.pop(other_id, None)
            else:
                messages = new.get('messages') or {}
                latest = max((message for message in messages.values() if not (message.get('hiddenFor') or {}).get(owner_id)), key=lambda message: message.get('ts', 0), default=None)
                if latest:
                    summaries[other_id] = dict(name=other['profile'].get('name'), photo=safe_photo(other['profile'].get('photo')),
                                               lastText=latest.get('text') or 'Áudio', lastTs=latest.get('ts'),
                                               lastFrom=latest.get('from'))
                else:
                    summaries.pop(other_id, None)
            repository.save_document('conversations', owner_id, summaries or None)

    @app.post('/api/messages/delete')
    def delete_message():
        body = request.get_json()
        if not isinstance(body, dict):
            raise BadRequest('Informe a mensagem a apagar.')
        conversation_id, message_id, scope = body.get('conversation'), body.get('message'), body.get('scope')
        if not isinstance(conversation_id, str) or not isinstance(message_id, str) or scope not in ('me', 'everyone'):
            raise BadRequest('Informe uma mensagem e uma opção de exclusão válidas.')
        with app.database.transaction() as repository:
            require(can_read(g.user, 'dms', conversation_id, None))
            repository.lock_document('dms', conversation_id)
            chat = repository.document('dms', conversation_id)
            message = ((chat or {}).get('messages') or {}).get(message_id)
            if not message:
                raise NotFound('Essa mensagem não está mais disponível.')
            if scope == 'everyone':
                require(message.get('from') == g.user['id'], 'Você só pode apagar para todos as mensagens que enviou.')
                del chat['messages'][message_id]
            else:
                message.setdefault('hiddenFor', {})[g.user['id']] = True
            repository.save_document('dms', conversation_id, chat)
            update_conversation_summaries(repository, conversation_id, None, chat)
        return jsonify(ok=True)

    @app.post('/api/conversations/delete')
    def hide_conversation():
        body = request.get_json()
        if not isinstance(body, dict) or not isinstance(body.get('conversation'), str):
            raise BadRequest('Informe a conversa que deseja ocultar.')
        conversation_id = body['conversation']
        require(can_read(g.user, 'dms', conversation_id, None))
        with app.database.transaction() as repository:
            repository.lock_document('dms', conversation_id)
            chat = repository.document('dms', conversation_id)
            if chat is not None:
                hidden = dict(chat.get('deletedFor') or {})
                hidden[g.user['id']] = True
                for message in (chat.get('messages') or {}).values():
                    message.setdefault('hiddenFor', {})[g.user['id']] = True
                chat['deletedFor'] = hidden
                if all(hidden.get(uid) for uid in conversation_id.split('__')):
                    chat = None
                repository.save_document('dms', conversation_id, chat)
            update_conversation_summaries(repository, conversation_id, None, chat)
        return jsonify(ok=True)

    def apply_change(old, tail):
        if request.method == 'DELETE':
            return replace_path(old, tail, None)
        if request.content_length and request.content_length > 8 * 1024 * 1024:
            raise BadRequest('Dados muito grandes. Envie arquivos pela área de arquivos.')
        body = request.get_json()
        if request.method == 'PUT':
            return replace_path(old, tail, body)
        if not isinstance(body, dict):
            raise BadRequest('A atualização deve conter um objeto.')
        new = old
        for key, value in body.items():
            new = replace_path(new, tail + path_parts(key), value)
        return new

    @app.get('/api/search')
    def global_search():
        key = hashlib.sha256(('search:' + (request.remote_addr or '')).encode()).hexdigest()
        with app.database.transaction() as repository:
            allowed = repository.attempt_allowed(key, limit=app.config['SEARCH_LIMIT'], window_seconds=app.config['SEARCH_WINDOW_SECONDS'])
        if not allowed:
            raise TooManyRequests('Muitas buscas em pouco tempo. Aguarde um instante e tente novamente.')
        with app.database.transaction() as repository:
            result = search_hub(repository, g.user, request.args.get('q', ''),
                                request.args.get('category', 'all'), request.args.get('scope', 'all'))
        return jsonify(result)

    @app.post('/api/demands/<action>')
    def demand_lifecycle(action):
        """Exclusão reversível: autoria e data são definidas pelo servidor."""
        if action not in {'trash', 'restore'}:
            raise NotFound()
        body = request.get_json()
        path = body.get('path') if isinstance(body, dict) else None
        if not isinstance(path, str):
            raise BadRequest('Informe o caminho da demanda.')
        parts = path_parts(path)
        valid = ((parts[0] == 'demandas' and len(parts) == 2) or
                 (parts[0] == 'demandas_private' and len(parts) == 3))
        if not valid:
            raise BadRequest('Caminho de demanda inválido.')
        collection, document_id, *tail = parts
        with app.database.transaction() as repository:
            repository.lock_document(collection, document_id)
            document = repository.document(collection, document_id)
            require(can_read(g.user, collection, document_id, document))
            demand = at_path(document, tail)
            if not isinstance(demand, dict):
                raise NotFound('Demanda não encontrada.')
            require(can_manage_demand(g.user, demand))
            changed = dict(demand)
            if action == 'trash' and not demand.get('deleted'):
                changed.update(deleted=True, deletedAt=milliseconds(), deletedBy=g.user['id'])
            elif action == 'restore':
                for field in ('deleted', 'deletedAt', 'deletedBy'):
                    changed.pop(field, None)
            repository.save_document(collection, document_id, replace_path(document, tail, changed))
        return jsonify(ok=True)

    @app.get('/api/files')
    def list_files():
        with app.database.transaction() as repository:
            records = [dict(row) for row in repository.list_files()
                       if row.get('purpose', 'library') == 'library' and can_read_file(g.user, row, repository)]
        return jsonify(files=records)

    @app.post('/api/files')
    def upload_file():
        with app.database.transaction() as repository:
            allowed = repository.attempt_allowed(hashlib.sha256(('upload:' + g.user['id']).encode()).hexdigest(),
                                                 limit=app.config['UPLOADS_PER_HOUR'], window_seconds=3600)
        if not allowed:
            raise TooManyRequests('Muitos envios em pouco tempo. Tente novamente mais tarde.')
        upload = request.files.get('file')
        if not upload or not upload.filename:
            raise BadRequest('Selecione um arquivo.')
        name = secure_filename(upload.filename)[:200] or 'arquivo'
        purpose = request.form.get('purpose', 'library')
        if purpose not in {'library', 'post'}:
            raise BadRequest('Finalidade de arquivo inválida.')
        unit = request.form.get('unit') or None
        if purpose == 'post':
            unit = None  # O acesso será herdado da publicação, após publicar.
        require(not unit or unit in units(g.user) or is_admin(g.user))
        file_id = uuid4().hex
        temporary, destination = storage / (file_id + '.part'), storage / file_id
        remote_attempted = False
        try:
            # Copia em blocos: o arquivo inteiro nunca é carregado na RAM.
            with temporary.open('xb') as output:
                shutil.copyfileobj(upload.stream, output, length=1024 * 1024)
            size = temporary.stat().st_size
            mime_type = detect_media_type(temporary, name)
            if purpose == 'post':
                if mime_type not in INLINE_TYPES:
                    raise BadRequest('Formato não aceito. Use JPG, PNG, GIF, WebP, MP4, WebM ou PDF.')
                if size > app.config['POST_ATTACHMENT_MAX_BYTES']:
                    raise BadRequest('O anexo excede o limite por arquivo do mural.')
            with app.database.transaction() as repository:
                repository.lock_document('files', 'quota')
                used = sum(row['size'] for row in repository.list_files())
                if used + size > app.config['STORAGE_LIMIT_BYTES']:
                    raise BadRequest('O limite de armazenamento do laboratório foi atingido.')
                record = dict(id=file_id, owner_id=g.user['id'], name=name,
                              project=request.form.get('project', '').strip()[:120], unit=unit, size=size,
                              mime_type=mime_type, purpose=purpose)
                if object_storage:
                    remote_attempted = True
                    object_storage.upload(file_id, temporary, mime_type)
                else:
                    temporary.replace(destination)
                repository.add_file(record)
            return jsonify(file=record), 201
        except Exception:
            destination.unlink(missing_ok=True)
            if object_storage and remote_attempted:
                try:
                    object_storage.delete(file_id)
                except Exception:
                    app.logger.error('Falha ao limpar um upload incompleto; revisar armazenamento.')
            raise
        finally:
            temporary.unlink(missing_ok=True)

    @app.route('/api/files/<file_id>', methods=['GET', 'PATCH', 'DELETE'])
    def file_detail(file_id):
        if not re.fullmatch('[a-f0-9]{32}', file_id):
            raise NotFound()
        with app.database.transaction() as repository:
            record = repository.file(file_id)
            if not record:
                raise NotFound()
            require(can_read_file(g.user, record, repository))
            if request.method == 'PATCH':
                require(record['owner_id'] == g.user['id'] or is_admin(g.user))
                require(record.get('purpose', 'library') == 'library')
                body = request.get_json()
                if not isinstance(body, dict):
                    raise BadRequest('Informe o projeto e o acesso do arquivo.')
                project = body.get('project', record.get('project', ''))
                unit = body.get('unit', record.get('unit')) or None
                if not isinstance(project, str) or (unit is not None and not isinstance(unit, str)):
                    raise BadRequest('Projeto ou acesso inválido.')
                require(not unit or unit in units(g.user) or is_admin(g.user))
                repository.update_file_organization(file_id, project.strip()[:120], unit)
                return jsonify(ok=True)
            if request.method == 'DELETE':
                require(record['owner_id'] == g.user['id'] or is_admin(g.user))
                if object_storage:
                    object_storage.delete(file_id)
                repository.delete_file(file_id)
                if is_admin(g.user):
                    audit(repository, g.user, 'file.deleted', file_id, record['name'])
        location = storage / file_id
        if request.method == 'DELETE':
            location.unlink(missing_ok=True)
            return jsonify(ok=True)
        if object_storage:
            location = storage / (uuid4().hex + '.download')
            object_storage.download(file_id, location, record['size'])
        if not location.is_file():
            raise NotFound('Arquivo não encontrado no disco. Contate a administração.')
        inline = request.args.get('inline') == '1' and record.get('mime_type') in INLINE_TYPES
        try:
            response = send_file(location, as_attachment=not inline, download_name=record['name'],
                                 mimetype=record.get('mime_type') if inline else 'application/octet-stream', conditional=True,
                                 etag=file_id if object_storage else True)
        except Exception:
            if object_storage:
                location.unlink(missing_ok=True)
            raise
        if object_storage:
            # Close the WSGI file wrapper before removing the request-local copy.
            response.direct_passthrough = False
            response.call_on_close(lambda: location.unlink(missing_ok=True))
        if inline:
            response.headers['Content-Security-Policy'] = (
                "default-src 'none'; frame-ancestors 'self'" if record['mime_type'] == 'application/pdf'
                else "sandbox; default-src 'none'"
            )
        return response

    @app.cli.command('init-db')
    def init_db():
        """Cria as tabelas sem apagar dados existentes."""
        app.database.initialize()
        click.echo('Banco inicializado.')

    @app.cli.command('create-user')
    @click.argument('email')
    @click.option('--name', required=True)
    @click.option('--admin', is_flag=True)
    @click.option('--unit', multiple=True)
    @click.password_option(confirmation_prompt=True)
    def create_user(email, name, admin, unit, password):
        """Cria contas pela administração; a senha é solicitada sem eco."""
        problem = validate_password(password, email)
        if problem:
            raise click.ClickException(problem)
        with app.database.transaction() as repository:
            repository.create_user(uuid4().hex, email.strip().lower(), generate_password_hash(password),
                                   dict(name=name, isAdmin=admin, sectors={value: True for value in unit}, createdAt=milliseconds()))
        click.echo('Conta criada.')

    @app.cli.command('set-units')
    @click.argument('email')
    @click.option('--unit', multiple=True)
    def set_units(email, unit):
        """Substitui as unidades autorizadas de uma conta."""
        with app.database.transaction() as repository:
            user = repository.user_by_email(email.strip().lower())
            if not user:
                raise click.ClickException('Conta não encontrada.')
            repository.lock_document('users', user['id'])
            user = repository.user(user['id'])
            profile = dict(user['profile'], sectors={value: True for value in unit})
            repository.update_profile(user['id'], profile)
        click.echo('Unidades atualizadas.')

    @app.cli.command('reset-password')
    @click.argument('email')
    @click.password_option(confirmation_prompt=True)
    def reset_password(email, password):
        """Redefine a senha e invalida as sessões anteriores."""
        problem = validate_password(password, email)
        if problem:
            raise click.ClickException(problem)
        with app.database.transaction() as repository:
            user = repository.user_by_email(email.strip().lower())
            if not user:
                raise click.ClickException('Conta não encontrada.')
            repository.lock_document('users', user['id'])
            repository.change_password(user['id'], generate_password_hash(password))
        click.echo('Senha atualizada; sessões anteriores invalidadas.')

    return app


if __name__ == '__main__':
    from waitress import serve
    application = create_app()
    serve(application, host=os.environ.get('HOST', '127.0.0.1'), port=int(os.environ.get('PORT', '5000')),
          max_request_body_size=application.config['MAX_CONTENT_LENGTH'])

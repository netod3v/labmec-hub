"""Códigos temporários de recuperação e envio SMTP com TLS obrigatório."""
import hashlib
import re
import secrets
import smtplib
import ssl
import time
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from html import escape
from pathlib import Path

from flask import jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.exceptions import BadRequest
from werkzeug.security import generate_password_hash

from .reset_codes import CHALLENGES, challenge_key, code_for, new_nonce, prepare_code
from .passwords import validate_password
from .reset_mail_queue import enqueue_reset_mail, queue_ready, valid_reset_origin


def create_reset_email(config, email, code):
    message = EmailMessage()
    message['Subject'] = 'Redefinir sua senha · LABIOMEC Hub'
    address = parseaddr(config['SMTP_FROM'] or config['SMTP_USERNAME'])[1]
    message['From'] = formataddr(('LABIOMEC Hub', address))
    message['To'] = email
    message.set_content(
        'Seu código de verificação do LABIOMEC Hub: ' + code + '\n\n'
        'Digite esse código na tela de recuperação. Válido por 10 minutos.\n'
        'Não compartilhe o código. Se não foi você, ignore este e-mail.'
    )
    logo = Path(__file__).resolve().parent.parent / 'assets' / 'labiomec-logo-transparent.png'
    html = Path(__file__).with_name('templates').joinpath('password-reset-email.html').read_text(encoding='utf-8')
    html = html.replace('{{RESET_CODE}}', escape(code, quote=True))
    logo_html = '<img src="cid:labiomec-logo" width="116" height="116" alt="Laboratório de Biomecânica · UFRJ" style="display:block;margin:0 auto 12px;width:116px;height:116px;">' if logo.is_file() else ''
    message.add_alternative(html.replace('{{LOGO}}', logo_html), subtype='html')
    if logo.is_file():
        message.get_payload()[-1].add_related(logo.read_bytes(), maintype='image', subtype='png', cid='<labiomec-logo>', disposition='inline', filename='labiomec.png')
    return message


def send_reset_email(config, email, code):
    message = create_reset_email(config, email, code)
    context = ssl.create_default_context()
    if config['SMTP_PORT'] == 465:
        connection = smtplib.SMTP_SSL(config['SMTP_HOST'], config['SMTP_PORT'], timeout=5, context=context)
    else:
        connection = smtplib.SMTP(config['SMTP_HOST'], config['SMTP_PORT'], timeout=5)
    with connection as server:
        if config['SMTP_PORT'] != 465:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
        server.login(config['SMTP_USERNAME'], config['SMTP_PASSWORD'])
        server.send_message(message)


# Bounded queue: mail delivery must not hold an HTTP worker or disclose accounts.
_mail_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='hub-reset-mail')
_mail_slots = BoundedSemaphore(4)


def dispatch_reset_email(app, email, code):
    def deliver():
        try:
            send_reset_email(app.config, email, code)
        except (OSError, smtplib.SMTPException, ValueError):
            app.logger.error('Falha no envio de recuperacao; verifique a configuracao SMTP.')
        finally:
            _mail_slots.release()

    if app.testing:
        # Existing integration tests replace SMTP and verify token round trips.
        send_reset_email(app.config, email, code)
        return
    if not _mail_slots.acquire(blocking=False):
        app.logger.warning('Fila de recuperacao ocupada; envio nao agendado.')
        return
    try:
        _mail_executor.submit(deliver)
    except RuntimeError:
        _mail_slots.release()
        app.logger.error('Servico de envio de recuperacao indisponivel.')


def register_password_reset(app):
    serializer = URLSafeTimedSerializer(app.config['SECRET_KEY'], salt='labiomec-password-reset-v1')
    generic_message = 'Se este e-mail tiver uma conta ativa, você receberá um código de 6 dígitos. Confira também o spam.'

    def rate_limit(email=''):
        values = ['password-reset:ip:' + (request.remote_addr or '')]
        if email:
            values.append('password-reset:email:' + email)
        with app.database.transaction() as repository:
            allowed = [repository.attempt_allowed(hashlib.sha256(value.encode()).hexdigest()) for value in values]
        if not all(allowed):
            return jsonify(error='Aguarde 15 minutos antes de tentar novamente.', code='auth/too-many-requests'), 429

    @app.post('/api/auth/forgot-password')
    def forgot_password():
        body = request.get_json()
        if not isinstance(body, dict):
            raise BadRequest('Dados inválidos.')
        email = str(body.get('email', '')).strip().lower()
        if len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            raise BadRequest('Informe um e-mail válido.')
        limited = rate_limit(email)
        if limited:
            return limited
        origin = app.config['PUBLIC_ORIGIN']
        valid_origin = valid_reset_origin(origin)
        if not valid_origin or not all(app.config[name] for name in ('SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD')):
            return jsonify(error='A recuperação por e-mail ainda está sendo configurada. Entre em contato com o suporte: pedroalexandrinoneto55@gmail.com.', code='auth/recovery-unavailable'), 503
        queued = app.config['RESET_MAIL_DELIVERY'] == 'queue'
        if queued and not queue_ready(app):
            return jsonify(error='A recuperação por e-mail está temporariamente indisponível. Tente novamente mais tarde ou contate o suporte.', code='auth/recovery-unavailable'), 503
        with app.database.transaction() as repository:
            user = repository.user_by_email(email)
        if user and not user['profile'].get('isRemoved') and not user['profile'].get('isBanned'):
            if queued:
                enqueue_reset_mail(app, user)
                return jsonify(ok=True, message=generic_message)
            code = prepare_code(app, user, new_nonce())
            try:
                dispatch_reset_email(app, email, code)
            except (OSError, smtplib.SMTPException, ValueError):
                # Não registra credenciais, endereço, conteúdo do e-mail ou token.
                app.logger.error('Não foi possível enviar um e-mail de recuperação. Verifique a configuração SMTP.')
        return jsonify(ok=True, message=generic_message)

    @app.post('/api/auth/verify-reset-code')
    def verify_reset_code():
        body = request.get_json()
        if not isinstance(body, dict):
            raise BadRequest('Dados inválidos.')
        email = str(body.get('email', '')).strip().lower()
        supplied = body.get('code')
        if len(email) > 254:
            raise BadRequest('Código inválido ou expirado.')
        # Separate shared buckets from requesting mail and from password writes.
        with app.database.transaction() as repository:
            allowed = [repository.attempt_allowed(hashlib.sha256(value.encode()).hexdigest())
                       for value in ('reset-code:ip:' + (request.remote_addr or ''), 'reset-code:email:' + email)]
        if not all(allowed):
            return jsonify(error='Aguarde 15 minutos antes de tentar novamente.'), 429
        token = None
        with app.database.transaction() as repository:
            user = repository.user_by_email(email)
            if user:
                key = challenge_key(user['id'])
                repository.lock_document('users', user['id'])
                user = repository.user(user['id'])
                repository.lock_document(CHALLENGES, key)
                row = repository.document(CHALLENGES, key)
                if (user and row and row.get('expiresAt', 0) > time.time() and not row.get('verified')
                        and row.get('attempts', 0) < 5 and row.get('version') == user['session_version']
                        and not user['profile'].get('isRemoved') and not user['profile'].get('isBanned')):
                    row['attempts'] += 1
                    if isinstance(supplied, str) and re.fullmatch(r'[0-9]{6}', supplied) and secrets.compare_digest(supplied, code_for(app, row['nonce'])):
                        row['verified'] = True
                        row['expiresAt'] = time.time() + 300
                        token = serializer.dumps({'uid': user['id'], 'version': user['session_version'], 'nonce': row['nonce']})
                    repository.save_document(CHALLENGES, key, row)
        if not token:
            raise BadRequest('Código inválido, expirado ou já utilizado. Solicite outro se necessário.')
        return jsonify(ok=True, token=token)

    @app.post('/api/auth/reset-password')
    def reset_password_after_verification():
        limited = rate_limit()
        if limited:
            return limited
        body = request.get_json()
        if not isinstance(body, dict):
            raise BadRequest('Dados inválidos.')
        token, password = body.get('token'), body.get('password')
        problem = validate_password(password)
        if problem:
            raise BadRequest(problem)
        invalid = 'Verificação expirada ou já utilizada. Solicite um novo código.'
        if not isinstance(token, str) or not token or len(token) > 2048:
            raise BadRequest(invalid)
        try:
            payload = serializer.loads(token, max_age=300)
        except BadSignature:
            raise BadRequest(invalid) from None
        if not isinstance(payload, dict) or not isinstance(payload.get('uid'), str) or type(payload.get('version')) is not int or not isinstance(payload.get('nonce'), str):
            raise BadRequest(invalid)
        password_hash = generate_password_hash(password)
        with app.database.transaction() as repository:
            # A mesma trava é usada na exclusão de conta e na redefinição administrativa.
            repository.lock_document('users', payload['uid'])
            user = repository.user(payload['uid'])
            if not user or user['profile'].get('isRemoved') or user['profile'].get('isBanned') or user['session_version'] != payload['version']:
                raise BadRequest(invalid)
            key = challenge_key(user['id'])
            repository.lock_document(CHALLENGES, key)
            challenge = repository.document(CHALLENGES, key)
            if (not challenge or not challenge.get('verified') or challenge.get('expiresAt', 0) <= time.time()
                    or challenge.get('nonce') != payload['nonce'] or challenge.get('version') != payload['version']):
                raise BadRequest(invalid)
            problem = validate_password(password, user['email'])
            if problem:
                raise BadRequest(problem)
            repository.change_password(user['id'], password_hash)
            repository.save_document(CHALLENGES, key, None)
        return jsonify(ok=True, message='Senha atualizada! Entre com sua nova senha.')

"""Links temporários de recuperação e envio SMTP com TLS obrigatório."""
import hashlib
import re
import smtplib
import ssl
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

from flask import jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.exceptions import BadRequest
from werkzeug.security import generate_password_hash

from .passwords import validate_password


def create_reset_email(config, email, link):
    message = EmailMessage()
    message['Subject'] = 'Redefinir sua senha · LABIOMEC Hub'
    address = parseaddr(config['SMTP_FROM'] or config['SMTP_USERNAME'])[1]
    message['From'] = formataddr(('LABIOMEC Hub', address))
    message['To'] = email
    message.set_content(
        'Você solicitou uma nova senha para o LABIOMEC Hub.\n\n'
        f'Abra este link em até 30 minutos:\n{link}\n\n'
        'Após redefinir sua senha, o link deixa de funcionar e os acessos anteriores são encerrados.\n'
        'Se não foi você, ignore este e-mail. Sua senha permanece igual.'
    )
    logo = Path(__file__).resolve().parent.parent / 'assets' / 'labiomec-logo-transparent.png'
    html = Path(__file__).with_name('templates').joinpath('password-reset-email.html').read_text(encoding='utf-8')
    html = html.replace('{{RESET_URL}}', escape(link, quote=True))
    logo_html = '<img src="cid:labiomec-logo" width="116" height="116" alt="Laboratório de Biomecânica · UFRJ" style="display:block;margin:0 auto 12px;width:116px;height:116px;">' if logo.is_file() else ''
    message.add_alternative(html.replace('{{LOGO}}', logo_html), subtype='html')
    if logo.is_file():
        message.get_payload()[-1].add_related(logo.read_bytes(), maintype='image', subtype='png', cid='<labiomec-logo>', disposition='inline', filename='labiomec.png')
    return message


def send_reset_email(config, email, link):
    message = create_reset_email(config, email, link)
    context = ssl.create_default_context()
    if config['SMTP_PORT'] == 465:
        connection = smtplib.SMTP_SSL(config['SMTP_HOST'], config['SMTP_PORT'], timeout=15, context=context)
    else:
        connection = smtplib.SMTP(config['SMTP_HOST'], config['SMTP_PORT'], timeout=15)
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


def dispatch_reset_email(app, email, link):
    def deliver():
        try:
            send_reset_email(app.config, email, link)
        except (OSError, smtplib.SMTPException, ValueError):
            app.logger.error('Falha no envio de recuperacao; verifique a configuracao SMTP.')
        finally:
            _mail_slots.release()

    if app.testing:
        # Existing integration tests replace SMTP and verify token round trips.
        send_reset_email(app.config, email, link)
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
    generic_message = 'Se este e-mail tiver uma conta ativa, você receberá um link para redefinir a senha. Confira também o spam.'

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
        parsed = urlsplit(origin)
        valid_origin = (parsed.scheme == 'https' or parsed.scheme == 'http' and parsed.hostname in {'localhost', '127.0.0.1', '::1'}) and parsed.netloc and not parsed.username and not parsed.password and parsed.path in {'', '/'} and not parsed.query and not parsed.fragment
        if not valid_origin or not all(app.config[name] for name in ('SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD')):
            return jsonify(error='A recuperação por e-mail ainda está sendo configurada. Entre em contato com o suporte: pedroalexandrinoneto55@gmail.com.', code='auth/recovery-unavailable'), 503
        with app.database.transaction() as repository:
            user = repository.user_by_email(email)
        if user and not user['profile'].get('isRemoved') and not user['profile'].get('isBanned'):
            token = serializer.dumps({'uid': user['id'], 'version': user['session_version']})
            try:
                dispatch_reset_email(app, email, origin.rstrip('/') + '/reset-password#token=' + token)
            except (OSError, smtplib.SMTPException, ValueError):
                # Não registra credenciais, endereço, conteúdo do e-mail ou token.
                app.logger.error('Não foi possível enviar um e-mail de recuperação. Verifique a configuração SMTP.')
        return jsonify(ok=True, message=generic_message)

    @app.post('/api/auth/reset-password')
    def reset_password_from_link():
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
        invalid = 'Este link expirou ou já foi utilizado. Solicite uma nova recuperação na tela de entrada.'
        if not isinstance(token, str) or not token or len(token) > 2048:
            raise BadRequest(invalid)
        try:
            payload = serializer.loads(token, max_age=1800)
        except BadSignature:
            raise BadRequest(invalid) from None
        if not isinstance(payload, dict) or not isinstance(payload.get('uid'), str) or type(payload.get('version')) is not int:
            raise BadRequest(invalid)
        password_hash = generate_password_hash(password)
        with app.database.transaction() as repository:
            # A mesma trava é usada na exclusão de conta e na redefinição administrativa.
            repository.lock_document('users', payload['uid'])
            user = repository.user(payload['uid'])
            if not user or user['profile'].get('isRemoved') or user['profile'].get('isBanned') or user['session_version'] != payload['version']:
                raise BadRequest(invalid)
            problem = validate_password(password, user['email'])
            if problem:
                raise BadRequest(problem)
            repository.change_password(user['id'], password_hash)
        return jsonify(ok=True, message='Senha atualizada! Entre com sua nova senha.')

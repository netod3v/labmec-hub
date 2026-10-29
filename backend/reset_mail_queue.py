"""Durable reset-mail outbox. No SMTP work runs after an HTTP response."""
import hashlib
import secrets
import smtplib
import time
from urllib.parse import urlsplit

import click
from flask import jsonify, request
from .reset_codes import new_nonce, prepare_code
from werkzeug.exceptions import Unauthorized

JOBS = '_reset_mail_jobs'
CONTROL = '_reset_mail_control'
WORKER_PATH = '/api/internal/reset-mail'
LEASE_SECONDS = 120
MAX_ATTEMPTS = 5


def smtp_ready(app):
    return all(app.config.get(key) for key in ('SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD'))


def valid_reset_origin(origin, *, https_only=False):
    try:
        parsed = urlsplit(origin)
        local = parsed.scheme == 'http' and parsed.hostname in {'localhost', '127.0.0.1', '::1'}
        return bool((parsed.scheme == 'https' or local and not https_only) and parsed.netloc
                    and not parsed.username and not parsed.password and parsed.path in ('', '/')
                    and not parsed.query and not parsed.fragment)
    except ValueError:
        return False


def authorize_worker(app):
    secret = app.config.get('RESET_MAIL_WORKER_SECRET', '')
    supplied = request.headers.get('Authorization', '')
    if len(secret) < 32 or not secrets.compare_digest(supplied.encode('utf-8'), ('Bearer ' + secret).encode('utf-8')):
        raise Unauthorized('Processamento não autorizado.')


def queue_ready(app):
    if len(app.config.get('RESET_MAIL_WORKER_SECRET', '')) < 32:
        return False
    with app.database.transaction() as repository:
        worker = repository.document(CONTROL, 'worker') or {}
    age = time.time() - worker.get('lastSeen', 0)
    return 0 <= age <= 180


def enqueue_reset_mail(app, user):
    now = time.time()
    key = hashlib.sha256(user['id'].encode()).hexdigest()
    with app.database.transaction() as repository:
        repository.lock_document(JOBS, key)
        old = repository.document(JOBS, key)
        if (old and old.get('status') == 'pending' and old.get('expiresAt', 0) > now
                and old.get('version') == user['session_version']):
            return
        repository.save_document(JOBS, key, {
            'uid': user['id'], 'version': user['session_version'],
            'nonce': new_nonce(), 'status': 'pending', 'createdAt': now, 'expiresAt': now + 1800,
            'attempts': 0, 'nextAttempt': now, 'leaseUntil': 0,
        })


def process_reset_mail(app):
    """Claim short leases, release DB connections, then send bounded SMTP work.

    Delivery is at least once: a crash after SMTP accepts but before the database
    acknowledgement may resend. Verification codes and reset grants remain single-use.
    """
    from .password_reset import send_reset_email

    started = time.monotonic()
    result = dict(sent=0, retried=0, discarded=0, failed=0)
    with app.database.transaction() as repository:
        repository.save_document(CONTROL, 'worker', {'lastSeen': time.time()})
        repository.prune_reset_mail_jobs(time.time())
    for _ in range(2):
        if time.monotonic() - started > 20:
            break
        lease = secrets.token_urlsafe(24)
        with app.database.transaction() as repository:
            row = repository.claim_reset_mail_job(time.time(), lease, LEASE_SECONDS)
            user = repository.user(row['data']['uid']) if row else None
        if not row:
            break
        key, job = row['id'], row['data']
        valid = (job['expiresAt'] > time.time() and job['attempts'] <= MAX_ATTEMPTS
                 and user and user['session_version'] == job['version']
                 and not user['profile'].get('isBanned') and not user['profile'].get('isRemoved'))
        if not valid:
            with app.database.transaction() as repository:
                repository.finish_reset_mail_job(key, lease)
            result['discarded'] += 1
            continue
        code = prepare_code(app, user, job.get('nonce', key + ':' + str(job['createdAt'])))
        if code is None:
            with app.database.transaction() as repository:
                repository.finish_reset_mail_job(key, lease)
            result['discarded'] += 1
            continue
        try:
            send_reset_email(app.config, user['email'], code)
        except (OSError, smtplib.SMTPException, ValueError):
            job.pop('lease', None)
            job['leaseUntil'] = 0
            if job['attempts'] >= MAX_ATTEMPTS:
                job['status'] = 'failed'
                job['expiresAt'] = time.time() + 86400
                result['failed'] += 1
                app.logger.error('Recuperacao: tentativas de envio esgotadas.')
            else:
                job['nextAttempt'] = time.time() + 60 * 2 ** (job['attempts'] - 1)
                result['retried'] += 1
                app.logger.warning('Recuperacao: envio adiado para nova tentativa.')
            with app.database.transaction() as repository:
                repository.finish_reset_mail_job(key, lease, job)
        else:
            with app.database.transaction() as repository:
                repository.finish_reset_mail_job(key, lease)
            result['sent'] += 1
    return result


def register_reset_mail_worker(app):
    def configured():
        return (app.config['RESET_MAIL_DELIVERY'] == 'queue' and smtp_ready(app)
                and valid_reset_origin(app.config['PUBLIC_ORIGIN'], https_only=True))

    @app.post(WORKER_PATH)
    def reset_mail_worker():
        # Also checked in before_request, before the normal cookie/CSRF flow.
        authorize_worker(app)
        if not configured():
            return jsonify(error='Processamento de recuperação não configurado.'), 503
        return jsonify(ok=True, **process_reset_mail(app))

    @app.cli.command('process-reset-mail')
    def process_reset_mail_command():
        """Processa um lote da fila persistente, sem imprimir destinatários ou tokens."""
        if not configured():
            raise click.ClickException('Configure fila, origem HTTPS e SMTP antes de processar.')
        result = process_reset_mail(app)
        click.echo(' '.join(f'{key}={value}' for key, value in result.items()))

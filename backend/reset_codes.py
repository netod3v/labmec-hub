"""Private, shared verification challenges; never persist a plaintext code."""
import hashlib
import hmac
import secrets
import time

CHALLENGES = '_reset_codes'
CODE_SECONDS = 600


def challenge_key(uid):
    return hashlib.sha256(uid.encode()).hexdigest()


def code_for(app, nonce):
    digest = hmac.new(app.config['SECRET_KEY'].encode(),
                      ('reset-code-v1:' + nonce).encode(), hashlib.sha256).digest()
    return f'{int.from_bytes(digest, "big") % 1000000:06d}'


def prepare_code(app, user, nonce):
    """Commit before SMTP; retries reuse the same code and expiry."""
    key = challenge_key(user['id'])
    with app.database.transaction() as repository:
        repository.lock_document(CHALLENGES, key)
        row = repository.document(CHALLENGES, key)
        if row and row.get('nonce') == nonce:
            if row.get('expiresAt', 0) <= time.time() or row.get('verified') or row.get('attempts', 0) >= 5:
                return None
        else:
            row = dict(nonce=nonce, version=user['session_version'], expiresAt=time.time() + CODE_SECONDS,
                       attempts=0, verified=False)
            repository.save_document(CHALLENGES, key, row)
    return code_for(app, nonce)


def new_nonce():
    return secrets.token_urlsafe(32)

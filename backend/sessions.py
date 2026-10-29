"""Identificadores de sessão revogáveis armazenados como hashes."""
import hashlib


def session_hash(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

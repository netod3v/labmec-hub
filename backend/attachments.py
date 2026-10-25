"""Tipos aceitos no mural e vínculo transacional entre arquivo e publicação."""
import re
from pathlib import Path

from werkzeug.exceptions import BadRequest

from .permissions import at_path, can_read, require

MAX_ATTACHMENTS = 6
INLINE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'video/mp4', 'video/webm', 'application/pdf'}


def detect_media_type(path, name):
    """Confere a extensão e a assinatura do arquivo, sem confiar no MIME do navegador."""
    with path.open('rb') as source:
        header = source.read(32)
    extension = Path(name).suffix.lower()
    if extension in {'.jpg', '.jpeg'} and header.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if extension == '.png' and header.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if extension == '.gif' and header[:6] in {b'GIF87a', b'GIF89a'}:
        return 'image/gif'
    if extension == '.webp' and header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        return 'image/webp'
    if extension == '.mp4' and header[4:8] == b'ftyp':
        return 'video/mp4'
    if extension == '.webm' and header.startswith(b'\x1a\x45\xdf\xa3'):
        return 'video/webm'
    if extension == '.pdf' and header.startswith(b'%PDF-'):
        return 'application/pdf'
    return 'application/octet-stream'


def bind_post_attachments(repository, user, collection, document_id, old, new):
    """Só o dono do upload pode anexá-lo; os metadados vêm do banco."""
    if collection not in {'posts', 'posts_private'}:
        return
    previous = old or {}
    following = new or {}
    items = [(document_id, previous, following)] if collection == 'posts' else [
        (key, previous.get(key) or {}, following.get(key) or {})
        for key in set(previous) | set(following)
    ]
    for post_id, before, after in items:
        attachments = after.get('attachments') or []
        if attachments == (before.get('attachments') or []):
            continue
        if not isinstance(attachments, list) or len(attachments) > MAX_ATTACHMENTS:
            raise BadRequest('Cada publicação aceita até 6 anexos.')
        post_path = f'{collection}/{document_id}' + (f'/{post_id}' if collection == 'posts_private' else '')
        canonical, seen = [], set()
        for attachment in attachments:
            file_id = attachment.get('id', '') if isinstance(attachment, dict) else ''
            if not isinstance(file_id, str) or not re.fullmatch('[a-f0-9]{32}', file_id) or file_id in seen:
                raise BadRequest('Anexo inválido ou repetido.')
            seen.add(file_id)
            repository.lock_document('files', file_id)
            record = repository.file(file_id)
            require(record is not None, 'Anexo não encontrado.')
            require(record['owner_id'] == user['id'], 'Você só pode anexar seus próprios uploads.')
            require(record.get('purpose') == 'post' and record.get('mime_type') in INLINE_TYPES,
                    'Este arquivo não foi enviado como anexo do mural.')
            require(record.get('post_path') in {None, post_path}, 'O anexo já pertence a outra publicação.')
            repository.bind_file_to_post(file_id, post_path)
            canonical.append({key: record[key] for key in ('id', 'name', 'mime_type', 'size')})
        if 'attachments' in after:
            after['attachments'] = canonical


def can_read_post_attachment(user, record, repository):
    """Confere a publicação atual em cada download; não cria links públicos."""
    path = record.get('post_path')
    if not path or repository is None:
        return False
    parts = path.split('/')
    if len(parts) < 2 or parts[0] not in {'posts', 'posts_private'}:
        return False
    document = repository.document(parts[0], parts[1])
    if not can_read(user, parts[0], parts[1], document):
        return False
    post = at_path(document, parts[2:])
    return isinstance(post, dict) and any(
        isinstance(attachment, dict) and attachment.get('id') == record['id']
        for attachment in (post.get('attachments') or [])
    )

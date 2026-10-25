"""Consultas SQL parametrizadas e transações curtas, uma por requisição."""
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class Database:
    def __init__(self, url):
        self.url = url

    @contextmanager
    def transaction(self):
        # O context manager faz commit ou rollback e sempre fecha a conexão.
        with psycopg.connect(self.url, row_factory=dict_row, connect_timeout=5) as connection:
            yield Repository(connection)

    def initialize(self):
        with self.transaction() as repository:
            repository.connection.execute(Path(__file__).with_name('schema.sql').read_text('utf-8'))


class Repository:
    def __init__(self, connection):
        self.connection = connection

    def user(self, user_id):
        return self.connection.execute('SELECT * FROM users WHERE id = %s', (user_id,)).fetchone()

    def user_by_email(self, email):
        return self.connection.execute('SELECT * FROM users WHERE email = %s', (email,)).fetchone()

    def users(self):
        return self.connection.execute('SELECT id, profile FROM users ORDER BY created_at').fetchall()

    def administration_users(self):
        return self.connection.execute('SELECT id, email, profile, created_at FROM users ORDER BY created_at').fetchall()

    def create_user(self, user_id, email, password_hash, profile):
        self.connection.execute(
            'INSERT INTO users (id, email, password_hash, profile) VALUES (%s, %s, %s, %s)',
            (user_id, email, password_hash, Jsonb(profile)),
        )

    def update_profile(self, user_id, profile):
        self.connection.execute('UPDATE users SET profile = %s WHERE id = %s', (Jsonb(profile), user_id))

    def change_password(self, user_id, password_hash):
        self.connection.execute(
            'UPDATE users SET password_hash = %s, session_version = session_version + 1 WHERE id = %s',
            (password_hash, user_id),
        )

    def remove_user_access(self, user_id):
        # Retém apenas uma referência para arquivos/histórico e o e-mail para impedir novo cadastro.
        self.connection.execute(
            "UPDATE users SET profile = %s, password_hash = '!', session_version = session_version + 1 WHERE id = %s",
            (Jsonb({'name': 'Conta excluída', 'isRemoved': True}), user_id),
        )
        self.save_document('presence', user_id, None)

    def lock_document(self, collection, document_id):
        # Serializa também a criação concorrente de documentos ainda inexistentes.
        self.connection.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))',
                                (collection + '/' + document_id,))

    def documents(self, collection):
        return self.connection.execute(
            'SELECT id, data FROM documents WHERE collection = %s', (collection,),
        ).fetchall()

    def document(self, collection, document_id):
        row = self.connection.execute(
            'SELECT data FROM documents WHERE collection = %s AND id = %s',
            (collection, document_id),
        ).fetchone()
        return row['data'] if row else None

    def game_scores_for_week(self, week):
        return self.connection.execute(
            "SELECT id, data FROM documents WHERE collection = '_game_scores' AND data->>'week' = %s",
            (week,),
        ).fetchall()

    def save_document(self, collection, document_id, data):
        if data is None:
            self.connection.execute('DELETE FROM documents WHERE collection = %s AND id = %s',
                                    (collection, document_id))
        else:
            self.connection.execute(
                'INSERT INTO documents (collection, id, data) VALUES (%s, %s, %s) '
                'ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
                (collection, document_id, Jsonb(data)),
            )

    def attempt_allowed(self, key, limit=15, window_seconds=900):
        row = self.connection.execute(
            "INSERT INTO login_attempts (key, attempts) VALUES (%s, 1) ON CONFLICT (key) DO UPDATE SET "
            "attempts = CASE WHEN login_attempts.started_at < now() - %s::double precision * interval '1 second' "
            "THEN 1 ELSE login_attempts.attempts + 1 END, "
            "started_at = CASE WHEN login_attempts.started_at < now() - %s::double precision * interval '1 second' "
            "THEN now() ELSE login_attempts.started_at END RETURNING attempts", (key, window_seconds, window_seconds),
        ).fetchone()
        self.connection.execute("DELETE FROM login_attempts WHERE started_at < now() - interval '1 day'")
        return row['attempts'] <= limit

    def list_files(self):
        return self.connection.execute('SELECT * FROM files ORDER BY created_at DESC').fetchall()

    def file(self, file_id):
        return self.connection.execute('SELECT * FROM files WHERE id = %s', (file_id,)).fetchone()

    def add_file(self, record):
        self.connection.execute(
            'INSERT INTO files (id, owner_id, name, project, unit, size, mime_type, purpose) '
            'VALUES (%s, %s, %s, %s, %s, %s, %s, %s)',
            tuple(record[key] for key in ('id', 'owner_id', 'name', 'project', 'unit', 'size')) +
            (record.get('mime_type', 'application/octet-stream'), record.get('purpose', 'library')),
        )

    def bind_file_to_post(self, file_id, post_path):
        self.connection.execute('UPDATE files SET post_path = %s WHERE id = %s', (post_path, file_id))

    def update_file_organization(self, file_id, project, unit):
        self.connection.execute('UPDATE files SET project = %s, unit = %s WHERE id = %s',
                                (project, unit, file_id))

    def delete_file(self, file_id):
        self.connection.execute('DELETE FROM files WHERE id = %s', (file_id,))

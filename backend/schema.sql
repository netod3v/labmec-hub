-- Senhas nunca fazem parte dos perfis enviados ao navegador.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    profile JSONB NOT NULL DEFAULT '{}',
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Um documento por publicação, meta, demanda ou conversa, sem uma árvore global.
-- JSONB preserva os campos da interface e permite adicionar campos sem perder dados.
CREATE TABLE IF NOT EXISTS documents (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection, id)
);

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    project TEXT NOT NULL DEFAULT '',
    unit TEXT,
    size BIGINT NOT NULL CHECK (size >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_owner_idx ON files(owner_id);
CREATE INDEX IF NOT EXISTS files_unit_idx ON files(unit);

-- Migração compatível com bancos já criados: init-db pode ser executado novamente.
ALTER TABLE files ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT 'application/octet-stream';
ALTER TABLE files ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'library';
ALTER TABLE files ADD COLUMN IF NOT EXISTS post_path TEXT;
CREATE INDEX IF NOT EXISTS files_post_path_idx ON files(post_path);

-- Limite de tentativas compartilhado entre processos do servidor.
CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backend-only tables: Supabase anonymous/authenticated clients must not bypass Flask.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE users, documents, files, login_attempts FROM PUBLIC;
DO $hub_security$
DECLARE role_name TEXT;
BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON TABLE users, documents, files, login_attempts FROM %I', role_name);
        END IF;
    END LOOP;
END;
$hub_security$;

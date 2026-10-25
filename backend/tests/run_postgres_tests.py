"""Cria um banco temporário, executa a suíte e remove apenas esse banco.

Uso no Compose: python -m backend.tests.run_postgres_tests
DATABASE_URL deve usar uma conta com permissão para criar bancos de teste.
O banco configurado pelo aplicativo não tem suas tabelas alteradas.
"""
import os
import unittest
from uuid import uuid4

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo


def main():
    database_name = 'labiomec_test_' + uuid4().hex
    original_url = os.environ['DATABASE_URL']
    with psycopg.connect(original_url, autocommit=True) as connection:
        connection.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database_name)))
        try:
            os.environ['TEST_DATABASE_URL'] = make_conninfo(original_url, dbname=database_name)
            suite = unittest.defaultTestLoader.discover('backend/tests')
            result = unittest.TextTestRunner(verbosity=2).run(suite)
            return 0 if result.wasSuccessful() else 1
        finally:
            # Nome criado nesta execução; nunca utiliza o nome do banco do aplicativo.
            connection.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(database_name)))


if __name__ == '__main__':
    raise SystemExit(main())

# Resultado da revisão de segurança — 28/10/2026

- Suíte final: **181 testes Python, 181 passaram, zero falhas e zero ignorados**. Executada com Python 3.13 em contêiner e banco PostgreSQL 17 temporário. Comando: `python -B -m backend.tests.run_postgres_tests`.
- **9 verificações JavaScript passaram**, em `backend/tests/*.cjs`, incluindo controles mobile, notificações, mensagens da call e filtro de áudio.
- Todos os arquivos Python foram analisados sintaticamente; o módulo inline do HTML passou em `node --input-type=module --check`.
- **11 dependências fixadas auditadas**, sem vulnerabilidades conhecidas no resultado do pip-audit. Evidência em `dependencias-seguranca-2026-10-28.json`.
- Regressões novas: reutilização de cookie após logout, expiração, cookie legado, coleção interna de sessões, elevação por unidade, primeiro acesso sem unidade, SMTP lento, fila cheia e revogação entre duas instâncias com PostgreSQL real.
- O teste de ranking concorrente foi adaptado para autenticar pelo login real: anteriormente ele fabricava um cookie sem registro no servidor, que a nova proteção passou a rejeitar. A concorrência e a idempotência continuam sendo verificadas.
- Sem envio de e-mail real, testes de carga, exploração da hospedagem pública ou participação em chamadas reais. Dados reais não foram usados nos testes destrutivos.

Consulte a [matriz STRIDE/DREAD, correções e riscos residuais](revisao-stride-dread-2026-10-28.md). Passar nos testes não prova ausência de outras falhas.

# Revisão de segurança — STRIDE e DREAD

Data: 28/10/2026. Escopo: API Flask, navegador, PostgreSQL, uploads e configuração local do LiveKit. Revisão de código e testes isolados; não é certificação ou pentest de uma hospedagem pública.

## Fronteiras de confiança

O navegador envia entradas não confiáveis à API. A API autoriza operações antes de acessar PostgreSQL e arquivos. SMTP usa TLS. A API emite tokens limitados às salas autorizadas do LiveKit. Ocultar controles na interface não substitui autorização no servidor.

## DREAD

Notas de 1 a 10 para Dano, Reprodutibilidade, Explorabilidade, Afetados e Descoberta. A média ordena a prioridade; não representa probabilidade estatística. Notas referentes ao cenário anterior à correção, salvo os riscos residuais.

| Ameaça | STRIDE | D | R | E | A | D | Média | Resultado |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Autoatribuição de unidade para ler conteúdo privado | Elevação / divulgação | 9 | 10 | 10 | 9 | 10 | 9,6 | Reproduzida e corrigida |
| Cookie copiado funciona após logout | Falsificação | 8 | 10 | 5 | 6 | 8 | 7,4 | Reproduzida e corrigida |
| Acesso indevido a perfis, arquivos, notas e mensagens | Divulgação / adulteração | 9 | 8 | 6 | 8 | 7 | 7,6 | Controles existentes exercitados; cobertura não exaustiva |
| Nomes especiais no Windows travam leitura de arquivos | Negação de serviço | 5 | 8 | 7 | 8 | 8 | 7,2 | Werkzeug 3.1.7 atualizado para 3.1.9 |
| JSON profundo ou corpo HTTP sem comprimento excede limite | Negação de serviço | 7 | 8 | 6 | 10 | 4 | 7,0 | Limites existentes verificados |
| Participante apaga histórico da outra pessoa | Repúdio | 6 | 10 | 9 | 2 | 8 | 7,0 | Ocultação individual e consentimento dos dois já protegidos |
| Segredo LiveKit aparece nos argumentos do processo | Divulgação / falsificação | 7 | 8 | 5 | 8 | 5 | 6,6 | Movido de argumentos para ambiente |
| Tempo do SMTP revela existência de conta | Divulgação | 3 | 7 | 6 | 6 | 4 | 5,2 | Envio desacoplado, fila limitada, resposta genérica |
| Pontuação de jogo forjada | Adulteração | 2 | 10 | 8 | 3 | 7 | 6,0 | Residual: limites não comprovam execução da partida |
| Cache offline de notas permanece no navegador | Divulgação | 6 | 8 | 6 | 5 | 4 | 5,8 | Residual: preservado para não apagar rascunhos pendentes |

## Correções

- **Unidades:** somente administradores alteram `sectors` e o campo legado `sector`. Membros continuam editando nome, vínculo, biografia e foto. Usuários novos concluem o perfil sem unidade e acessam conteúdo geral enquanto aguardam liberação. O painel mantém atribuições com auditoria. Unidades previamente atribuídas foram preservadas e precisam de revisão administrativa se houve autoatribuição anterior.
- **Sessões:** login gera token aleatório de 256 bits; somente SHA-256 e metadados ficam na coleção interna `_sessions`. Cada requisição autenticada confere registro, usuário, versão e validade absoluta de 12 horas. Logout revoga apenas aquele dispositivo. Alteração de senha invalida a versão anterior. Cookies antigos sem token exigem novo login. Nenhuma mudança de esquema SQL é necessária.
- **E-mail:** duas threads e no máximo quatro tarefas em andamento/pendentes limitam a fila. SMTP não prende o worker HTTP. Quando a fila está cheia, a resposta permanece genérica; a pessoa precisa solicitar novo envio. Não há fila durável ou retentativa automática. Não foi enviado e-mail real nesta revisão.
- **LiveKit:** Compose exige credenciais e usa `LIVEKIT_KEYS`, sem segredos em `command`. Quem administra o host/Docker ainda pode ler o ambiente; isso não é um cofre de segredos.
- **Dependências:** pip-audit consultou o lock atualizado sem encontrar vulnerabilidades conhecidas. Não cobre imagem base, binário LiveKit, CDN ou vulnerabilidades desconhecidas.

## Evidência e validação

Antes das correções, `test_copied_cookie_is_rejected_after_logout` e `test_member_cannot_join_other_unit_to_read_private_data` falharam: retornaram HTTP 200 em vez de negar acesso. Depois passaram. Foram adicionados cenários de expiração, cookies antigos, proteção de registros internos, primeiro acesso sem unidade e SMTP lento/fila cheia.

`test_security_review_postgres.py` verifica a revogação entre duas aplicações que compartilham PostgreSQL. A rotina `backend.tests.run_postgres_tests` cria e remove um banco temporário. Não executa os cenários destrutivos nas tabelas reais do Hub. Resultados finais em `resultado-seguranca-2026-10-28.md`.

## Riscos residuais

1. Não há MFA para administradores, dupla aprovação ou verificação de e-mail. Revisar administradores, suporte e unidades já atribuídas.
2. Publicação exige HTTPS, `COOKIE_SECURE=true`, origem pública exata e configuração correta dos proxies. HTTP local não comprova segurança de futura hospedagem.
3. Notas offline podem permanecer neste navegador. Remoção segura precisa tratar rascunhos pendentes antes de apagar cache.
4. Limites de login podem indisponibilizar temporariamente uma conta. Ainda são necessários ensaios de carga isolados. Uploads não passam por antivírus.
5. Sessões expiradas não autenticam, mas seus registros podem permanecer até manutenção. Planejar limpeza periódica e retenção de auditoria.
6. CSP permite estilos inline. Não há garantia de ausência de XSS em todos os caminhos.
7. Se `.env` já foi publicado no Git, removê-lo não revoga credenciais. O histórico externo do repositório não foi verificado nesta revisão.

## Referências

- [OWASP — gestão de sessões e invalidação no logout](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- [Aviso oficial Werkzeug GHSA-g6x2-hccm-hh4m](https://github.com/pallets/werkzeug/security/advisories/GHSA-g6x2-hccm-hh4m): versões menores que 3.1.9 afetadas.
- [Histórico oficial Werkzeug 3.1.9](https://werkzeug.palletsprojects.com/en/stable/changes/).

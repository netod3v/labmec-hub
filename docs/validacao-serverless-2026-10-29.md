# Validação de arquitetura serverless — 29/10/2026

## Resultado

**215 testes Python passaram, sem falhas e sem testes ignorados**, usando Python
3.13 e PostgreSQL 17 em contêineres. O runner criou um banco temporário separado
e removeu esse banco ao terminar. Não foram utilizados usuários, arquivos ou
conexões do banco de produção; o SMTP foi substituído nos testes de envio.

Comando: `python -B -m backend.tests.run_postgres_tests`, com `DATABASE_URL`
apontando exclusivamente para o PostgreSQL da rede privada de testes.

## O que foi verificado

| Aspecto | Evidência |
| --- | --- |
| PostgreSQL e pooler | Prepared statements desativados; TLS exigido na Vercel, com `require` quando a URI não informa modo e preservação de `verify-ca`/`verify-full` |
| Limites concorrentes | 40 tentativas em oito threads e duas instâncias, com exatamente sete aceitações para limite sete; no HTTP, duas instâncias compartilham o limite de 15 falhas de login |
| Sessões | Revogação de cookie após logout em outra instância; expiração, versão e uso único de links de recuperação |
| Arquivos | Permissões, downloads parciais, temporários, cotas, falha remota e remoção do objeto após falha de commit do upload |
| LiveKit | Identidade vinculada à sessão, autorização de sala e ausência de privilégio administrativo nos tokens de participantes |
| Recuperação | Pedido persistido sem SMTP na requisição de entrada, processamento em outra instância, agrupamento concorrente, reservas e retomada após interrupção |
| Reenvio | Espera progressiva, limite de tentativas, descarte de pedidos expirados/bloqueados e retomada se o banco falhar após a aceitação SMTP |
| Proteção do processador | Segredo dedicado obrigatório, sem autenticação por cookie; fila inacessível pelas rotas genéricas, inclusive à administração; cabeçalho inválido não causa erro interno |
| Recursos | Nenhuma transação de banco fica aberta durante o envio SMTP; testes existentes de CSP, CSRF, dados privados e entrada Flask permanecem passando |

Os testes de concorrência representam instâncias Flask e conexões independentes
no mesmo ambiente de teste. A retomada simula interrupções e reservas expiradas;
não é um ensaio de encerramento de máquinas reais nem de escala máxima da Vercel.

## Ativação e limitações

- A fila usa coleções internas da tabela existente `documents`, sem migração de
  dados ou tabela nova. O modo `thread` é recusado na Vercel; a instalação local
  pode continuar utilizando threads em servidor persistente.
- SMTP, segredo e agendamento precisam ser configurados pelo operador seguindo
  [recuperacao-serverless.md](recuperacao-serverless.md). O agendamento externo
  não é criado pelo deploy. Nenhum e-mail real foi enviado nesta validação.
- Entrega é pelo menos uma vez. Uma confirmação SMTP ambígua pode gerar e-mail
  duplicado; os links continuam sendo invalidados pela troca da senha.
- Sem um processador configurado e ativo nos últimos três minutos, a recuperação
  retorna indisponibilidade, mantendo respostas iguais para contas existentes e inexistentes.
- Banco e Supabase Storage continuam sem transação distribuída. Falhas de limpeza
  podem deixar objetos órfãos. Na exclusão, uma falha de commit após remoção do
  objeto pode exigir recuperação por backup. Essa limitação não foi eliminada pela fila de e-mails.
- Os uploads intermediados continuam com a configuração inicial de 4 MiB. Não
  foi implementado envio direto assinado para anexos maiores.
- Não foram executados testes de carga no serviço público, chamadas LiveKit reais,
  confirmação de entrega Gmail ou execução do SQL de cron no projeto Supabase real.
  As quantidades pequenas de concorrência não comprovam capacidade para qualquer
  número de usuários; limites do pooler, provedor e aplicação precisam de monitoramento.

Os testes não comprovam ausência de outras falhas. As alterações não substituem
backup, observabilidade e validação operacional das credenciais e agendamentos.

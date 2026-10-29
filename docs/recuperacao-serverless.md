# Recuperação de senha em ambiente serverless

O envio na Vercel usa uma fila persistente no PostgreSQL. A requisição de
recuperação grava o pedido; uma chamada agendada e autenticada processa o SMTP
antes de terminar sua própria resposta HTTP. Não existe thread de envio após
a resposta nesse modo. O servidor local mantém o modo `thread` para compatibilidade.

## Configuração e ativação

1. Na Vercel, configure `RESET_MAIL_DELIVERY=queue` e uma
   `RESET_MAIL_WORKER_SECRET` exclusiva, aleatória, com pelo menos 32 caracteres.
   Use o tipo **Secret**; não reutilize chaves do Supabase ou LiveKit.
2. Configure `PUBLIC_ORIGIN=https://labmechub.vercel.app` (ou seu domínio exato),
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` e, opcionalmente,
   `SMTP_FROM`. Para Gmail, use senha de app, nunca a senha normal da conta.
   Faça um novo deploy depois de alterar as variáveis.
3. No Supabase, habilite as extensões `pg_cron` e `pg_net`. No Vault, crie:
   - `hub_reset_mail_url`: `https://labmechub.vercel.app/api/internal/reset-mail`;
   - `hub_reset_mail_secret`: exatamente a `RESET_MAIL_WORKER_SECRET` da Vercel,
     sem o prefixo `Bearer`.
4. Execute [agendar-recuperacao-supabase.sql](agendar-recuperacao-supabase.sql)
   no SQL Editor do projeto correto. O script agenda somente `hub-reset-mail`
   e pode ser executado novamente para atualizar esse agendamento.
5. No histórico do Cron e nas respostas HTTP do `pg_net`, confira **HTTP 200**,
   não apenas a execução bem-sucedida do SQL: o envio HTTP é assíncrono.
   Não compartilhe cabeçalhos, registros do Vault ou a fila de requisições.
6. Depois da primeira chamada válida, solicite a recuperação pela tela de
   entrada de uma conta de teste sua e confira recebimento, redefinição e
   validação do código de seis dígitos, redefinição e rejeição do código após o uso. Essa validação real exige sua ação;
   os testes automatizados não enviam e-mails.

O agendamento não é criado automaticamente ao publicar o código. A API retorna
indisponibilidade se não houver SMTP, segredo ou um processador ativo nos últimos
três minutos. Assim, não confirma o agendamento de um e-mail quando a fila ainda
não está operacional. A resposta permanece igual para contas existentes e inexistentes.

As instruções seguem os mecanismos de
[Cron e HTTP do Supabase](https://supabase.com/docs/guides/functions/schedule-functions).
Não usamos cron frequente na Vercel Hobby: sua
[limitação de frequência](https://vercel.com/docs/cron-jobs/usage-and-pricing)
não atende ao prazo de recuperação.

## Garantias e limites

- Pedidos ficam em coleções internas da tabela `documents`; não é necessária
  uma tabela nova nem migração de dados para ativar a fila.
- A fila armazena ID da conta, versão da sessão, horários e estado. Não guarda
  senha, e-mail, credenciais SMTP nem código em texto puro.
- Solicitações repetidas para a mesma conta com um pedido pendente são agrupadas.
- Processadores concorrentes usam `FOR UPDATE SKIP LOCKED` e reservas de dois
  minutos. Uma reserva abandonada pode ser retomada; a confirmação de um
  processador antigo não pode apagar a reserva de outro.
- Nenhuma conexão ou transação de banco fica aberta durante o SMTP.
- Cada chamada processa no máximo dois pedidos e não inicia outro envio depois
  de consumir 20 segundos. Operações SMTP têm timeout de socket de cinco segundos;
  esse timeout não é um limite total de duração. Se a plataforma encerrar a chamada,
  a reserva expira e outra execução pode retomar o pedido.
- Há até cinco tentativas, com espera progressiva. Pedidos expiram após 30 minutos
  na fila. Falhas finais ficam registradas por até um dia e geram log sem dados
  pessoais; não há garantia de recebimento na caixa de entrada ou de ausência de spam.
- Uma chamada por minuto pode processar até dois pedidos nesse intervalo em
  condições normais; essa é uma capacidade inicial, não um teste de carga.
- A entrega é **pelo menos uma vez**: se o SMTP aceitar a mensagem e o processo
  cair antes da confirmação no banco, uma mensagem pode ser reenviada. Não existe
  garantia de envio exatamente uma vez com SMTP. Retentativas do mesmo pedido
  preservam o código e sua expiração, sem renovar as tentativas de verificação.
- O código de seis dígitos vale dez minutos a partir do preparo para envio, com
  no máximo cinco verificações erradas. É derivado por HMAC com segredo do servidor
  e nonce aleatório; o banco privado guarda o nonce, versão, prazo e tentativas,
  nunca o código em texto puro. Uma solicitação nova após o envio substitui o anterior.
- Verificar o código uma vez emite uma autorização assinada de cinco minutos,
  guardada só na memória da página. A troca da senha exige essa autorização e o
  desafio verificado no banco, consome ambos e invalida sessões anteriores.
  Travas compartilhadas impedem dois usos concorrentes. Links antigos deixam
  de funcionar após esta atualização; solicite um código novo.
- Antes do envio, o processador verifica novamente versão da sessão, bloqueio e
  remoção da conta. Usuários do Hub, inclusive administradores, não podem consultar
  ou escrever a fila pelas rotas genéricas.
- A pausa do banco/projeto, falhas de agendamento, bloqueio SMTP ou rede impedem
  o processamento. Monitore o cron e o HTTP, e configure um canal de suporte.

O Vault não elimina o acesso dos operadores do banco aos segredos. O `pg_net`
mantém o cabeçalho temporariamente na sua fila; o script retira o acesso público
e das funções `anon`/`authenticated` a essa tabela. Não conceda credenciais de
login no PostgreSQL a integrantes do Hub.

Para processar um lote por um agendador próprio ou diagnóstico local com o
ambiente de nuvem selecionado, use `flask --app backend.app process-reset-mail`.
Esse comando pode enviar e-mails reais pendentes: não o use como teste automatizado.
Para suspender o agendamento: `select cron.unschedule('hub-reset-mail');`.
Ao mudar domínio ou segredo, atualize Vercel e Vault juntos; não remova registros
pendentes da fila para contornar uma configuração incompleta.

## Validação isolada

`backend/tests/test_reset_mail_queue.py` verifica autenticação do processador,
indisponibilidade segura, gravação sem envio na requisição de entrada, retomada,
tentativas, expiração e proteção dos dados internos.
`backend/tests/test_cloud_concurrency_postgres.py` usa duas instâncias e conexões
PostgreSQL reais para conferir o limite de login compartilhado, contagem atômica,
agrupamento concorrente, reservas e recuperação após interrupções.

Execute a suíte pelo procedimento de banco temporário descrito no README.
Use somente banco de teste; o SMTP é substituído por um dublê nos testes.

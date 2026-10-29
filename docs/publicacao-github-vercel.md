# GitHub e publicação

Esta atualização reúne a versão local validada do Hub, seus ajustes visuais e as correções de segurança. `app.py` é apenas a entrada WSGI: a implementação fica em `backend/app.py`, evitando duas versões do servidor. `requirements.txt` usa as versões fixadas no lock.

## Estado atual

Enviar ao GitHub não publica automaticamente os dados locais. O projeto continua funcionando com Docker, PostgreSQL e armazenamento persistente. A pasta oficial local mantém seu `.env`; esse arquivo não entra no Git nem no pacote da Vercel.

## Antes de publicar na Vercel

- Configurar PostgreSQL acessível pela hospedagem, com TLS e credenciais próprias; preparar o esquema com o comando administrativo e planejar a migração dos dados existentes.
- Configurar o armazenamento privado Supabase implementado nesta atualizacao; instrucoes em `nuvem-gratuita.md`. Disco local nao e persistente na Vercel, e os uploads intermediados pela API usam limite conservador de 4 MiB.
- Hospedar LiveKit separadamente ou configurar serviço gerenciado. O Docker Compose local não é iniciado pelo simples deploy do repositório.
- Definir origem HTTPS pública, cookies seguros, segredos exclusivos de produção e configuração dos proxies. Não copiar o `.env` para o GitHub ou para o código cliente.
- Adaptar o envio de recuperação para uma tarefa suportada pelo ciclo de vida da hospedagem; threads locais não garantem entrega após o término de uma execução serverless.
- Verificar os limites atuais de payload e duração da hospedagem antes de liberar os uploads existentes.

A entrada Python e as dependências corrigem a organização do pacote, mas não tornam a versão atual pronta para produção na Vercel sem configurar esses serviços e concluir as pendências indicadas em `nuvem-gratuita.md`. Não definir `/tmp` como solução permanente nem expor apenas o HTML com uma API ainda apontando para localhost.

Referências: [Flask na Vercel](https://vercel.com/docs/frameworks/backend/flask), [limites das funções](https://vercel.com/docs/functions/limitations), [sistema de arquivos das funções](https://vercel.com/docs/functions/runtimes).

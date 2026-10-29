# Primeira versão online para testes

O ambiente online começa com dados novos, conforme escolha do usuário. Não importar usuários, publicações ou arquivos locais nesta etapa.

## Configuração

- `HUB_ENV_FILE=.env.cloud` carrega explicitamente o arquivo privado para comandos locais. Por padrão continua sendo usado `.env`.
- Na Vercel, configurar as variáveis pelo painel privado; `.env.cloud` não é enviado. O runtime define `VERCEL=1`, que seleciona Supabase e cookies seguros por padrão. Disco local é recusado como armazenamento permanente nesse ambiente.
- `DATABASE_URL`: Transaction pooler, porta 6543, TLS obrigatório (`sslmode=require`). Psycopg usa `prepare_threshold=None` para não enviar prepared statements incompatíveis com o pooler.
- `STORAGE_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_STORAGE_BUCKET=hub-files`.
- `SECRET_KEY`: segredo próprio deste ambiente, diferente do desenvolvimento local.
- `COOKIE_SECURE=true`, `ALLOW_LOCAL_FRAME_PREVIEW=false`, `PUBLIC_ORIGIN=https://ENDERECO-EXATO-DO-HUB`.
- `MAX_UPLOAD_MB=4`, `POST_ATTACHMENT_MAX_MB=4`, `STORAGE_LIMIT_GB=1` para os primeiros testes gratuitos. O limite é por corpo HTTP: um arquivo próximo de 4 MiB pode exceder o limite ao incluir o formulário.
- `ALLOW_REGISTRATION=true` permite testar cadastro, sem atribuir privilégios administrativos ou acesso a unidades automaticamente. A primeira conta administrativa precisa de concessão pelo operador.
- LiveKit Cloud precisa de `LIVEKIT_URL=wss://...`, `LIVEKIT_INTERNAL_URL=https://...` e o par de credenciais do projeto. Campos vazios mantêm chamadas indisponíveis, sem usar o serviço local.

## Arquivos privados

O navegador continua enviando arquivos para a API do Hub. O backend valida sessão, permissões, assinatura do arquivo e cota, e envia ao bucket privado com a chave secreta em cabeçalho. A chave nunca é devolvida ao navegador. URLs do provedor não são usadas para conceder acesso público.

Downloads passam novamente pela autorização da API e usam uma cópia temporária por requisição. A cópia é removida ao fechar a resposta, inclusive respostas parciais. Os objetos persistem no Supabase, não em `/tmp`. As permissões da publicação continuam determinando o acesso aos anexos.

O esquema ativa RLS nas quatro tabelas internas e revoga acesso das funções públicas do Supabase. O backend usa a conexão PostgreSQL privada. Não adicionar políticas públicas para essas tabelas nem para o bucket.

## Limitações desta etapa

- A Vercel documenta limite de payload de 4,5 MB para requisições e respostas de funções; por isso o upload intermediado pela API usa limite conservador de 4 MiB. Arquivos maiores exigem um fluxo separado de envio direto assinado, com validação posterior; ainda não implementado.
- O Supabase Free oferece 500 MB de banco e 1 GB de arquivos, com suspensão por inatividade e limites de transferência. Sem migração automática do ambiente local.
- Supabase e PostgreSQL não formam uma única transação distribuída. Falha de upload tenta remover o objeto; falhas de limpeza são registradas. Reconciliar objetos órfãos em manutenção. Na exclusão, uma falha de commit após apagar o objeto também requer reconciliação.
- Recuperação por e-mail continua pendente da configuração de produção. O envio em thread usado no servidor local não é uma fila durável suportada para execução serverless. Manter SMTP não configurado na Vercel até implementar e validar um mecanismo de entrega compatível; a API retorna indisponibilidade explícita.
- LiveKit, publicação na Vercel e a primeira conta administrativa ainda exigem configuração privada e validação online.

Referências: [Vercel — limites](https://vercel.com/docs/functions/limitations), [Supabase — pooler](https://supabase.com/docs/guides/database/connecting-to-postgres), [Supabase — prepared statements](https://supabase.com/kb/troubleshooting/disabling-prepared-statements-qL8lEL), [Supabase — preços](https://supabase.com/pricing).

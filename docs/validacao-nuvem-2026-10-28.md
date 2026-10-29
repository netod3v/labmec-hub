# Validação da adaptação para nuvem — 28/10/2026

- Suíte com PostgreSQL temporário: **191 testes, todos passaram**, sem ignorados.
- Nove verificações JavaScript existentes passaram.
- Testes de armazenamento cobrem acesso privado, requisições parciais, limpeza de cópias temporárias, rollback de upload, cota, limite de corpo, respostas incompletas, erro do provedor sem exposição de chave, configuração serverless e desativação de prepared statements.
- Um arquivo de poucos bytes foi enviado e baixado pelo adaptador usando o bucket real. Conteúdo conferido, tentativa pública negada e objeto temporário removido ao final. Nenhum arquivo preexistente foi alterado.
- A URL e a chave secreta foram validadas sem aparecerem nos resultados ou no Git.
- O banco local e os dados existentes não foram migrados. O ambiente online começa com dados novos por escolha do usuário.
- A publicação real na Vercel, as credenciais do LiveKit Cloud, a primeira conta administrativa e a recuperação por e-mail ainda precisam de configuração e validação.

Detalhes e limites em [nuvem-gratuita.md](nuvem-gratuita.md). A API intermediada limita o corpo de uploads a 4 MiB na primeira configuração para Vercel; arquivos maiores precisam de uma implementação de envio direto assinado.

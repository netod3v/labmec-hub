# Modelo de ameaças do LABIOMEC Hub

## Escopo e método

Esta revisão considera a API Flask, o cliente web, o PostgreSQL, os uploads e o serviço LiveKit, com foco em autorização e lógica de negócio além de injeções clássicas. STRIDE identifica a categoria da ameaça; DREAD usa notas de 1 a 10 para Dano, Reprodutibilidade, Explorabilidade, Usuários afetados e Descoberta. A média ordena os itens. As notas são uma priorização qualitativa para este sistema, não uma probabilidade estatística nem uma garantia de ausência de falhas.

## Ameaças avaliadas

| # | Ameaça | STRIDE | Dano | Reprodutibilidade | Explorabilidade | Usuários afetados | Descoberta | Média | Situação |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | Uma pessoa se inclui em outra unidade e lê murais, arquivos e salas privadas | Elevação de privilégio | 9 | 10 | 10 | 9 | 10 | **9,6** | Corrigida por padrão |
| 2 | IDs antigos ou novos com marcação quebram atributos `data-id` e injetam HTML | Adulteração | 6 | 10 | 7 | 9 | 6 | **7,6** | Corrigida |
| 3 | Corpo chunked sem `Content-Length` ultrapassa o limite de 8 MiB da API | Negação de serviço | 7 | 8 | 6 | 10 | 4 | **7,0** | Corrigida |
| 4 | Participante apaga a conversa dos dois e elimina provas | Repúdio | 6 | 10 | 9 | 2 | 8 | **7,0** | Corrigida |
| 5 | Buscas ilimitadas leem repetidamente todas as fontes de dados | Negação de serviço | 4 | 10 | 7 | 8 | 5 | **6,8** | Mitigada por limite |
| 6 | Werkzeug 3.1.7 pode travar no Windows ao servir diretórios (PYSEC-2026-4312) | Negação de serviço | 5 | 5 | 7 | 10 | 6 | **6,6** | Corrigida; versão fixada em 3.1.9 |
| 7 | LiveKit inicia com credencial pública conhecida e expõe segredo nos argumentos | Falsificação | 7 | 8 | 5 | 8 | 5 | **6,6** | Corrigida |
| 8 | Pontuação enviada pelo navegador permite inflar o ranking | Adulteração | 2 | 10 | 8 | 3 | 7 | **6,0** | Mitigada; limite de 45 partidas por semana |
| 9 | Notas privadas locais permanecem no navegador depois de sair | Divulgação de informação | 6 | 8 | 6 | 5 | 4 | **5,8** | Corrigida |
| 10 | Cookie copiado continua válido depois do logout | Falsificação | 7 | 6 | 5 | 4 | 5 | **5,4** | Corrigida com revogação no servidor |
| 11 | Tempo de resposta do SMTP revela se um e-mail tem conta | Divulgação de informação | 3 | 7 | 6 | 6 | 4 | **5,2** | Mitigada; envio em segundo plano |
| 12 | Arquivos HTML/SVG de `/assets` são servidos sem CSP | Adulteração | 3 | 5 | 3 | 5 | 5 | **4,2** | Corrigida |

## Controles aplicados

- **Unidades e autorização:** membros não podem adicionar unidades ao próprio perfil por padrão; podem removê-las. Um administrador pode editar as unidades no painel, e a alteração entra na auditoria. `SELF_SERVICE_UNITS=true` restaura o comportamento anterior e não é recomendado.
- **Chaves e conteúdo antigo:** o servidor rejeita chaves JSON perigosas em qualquer nível e limita a profundidade a 32. O frontend ignora IDs antigos incompatíveis com atributos HTML e valida fotos antes de usá-las como fonte.
- **Corpos HTTP:** requisições de API têm teto de 8 MiB, inclusive streams sem comprimento declarado; o endpoint de upload usa o limite independente `MAX_UPLOAD_MB`.
- **Conversas e sessões:** ocultar uma conversa remove-a somente da lista de quem pediu. O conteúdo só é apagado quando ambos optam por ocultá-la. Sessões são identificadas por tokens aleatórios; somente o hash fica no banco, e logout revoga o token daquele dispositivo.
- **Abuso de recursos:** buscas são limitadas por IP (30 por minuto por padrão); o ranking aceita no máximo 45 partidas pontuadas por conta por semana.
- **Dependências e LiveKit:** Werkzeug está fixado em 3.1.9. O Compose exige `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`; LiveKit os recebe pela variável `LIVEKIT_KEYS`, em vez de argumentos da linha de comando.
- **Privacidade e resposta:** notas locais são removidas do armazenamento do navegador ao sair. O e-mail de recuperação é enviado em thread de segundo plano; a resposta continua genérica para contas existentes ou não.
- **Arquivos estáticos:** respostas em `/assets` recebem CSP restritiva com `sandbox`; páginas confiáveis mantêm a política nonce já existente.

## Riscos residuais e decisões

- **MFA:** ainda não há segundo fator para administradores.
- **Bloqueio de conta:** 15 tentativas erradas por e-mail em 15 minutos podem bloquear temporariamente a própria pessoa, permitindo negação de serviço.
- **Administração:** um administrador pode rebaixar ou bloquear outro sem aprovação independente.
- **Uploads:** `MAX_UPLOAD_MB` continua em 2048 MiB por padrão; reduza o limite se arquivos desse tamanho não forem necessários.
- **Ranking:** os pontos possíveis por jogo são validados, mas a pontuação continua vindo do cliente. O teto semanal reduz o abuso, mas não comprova que a partida ocorreu.
- **CSS:** `style-src 'unsafe-inline'` permanece na CSP por causa da interface e amplia o impacto de uma eventual injeção de CSS.
- **SMTP:** o envio fora da requisição reduz a diferença de tempo, mas não substitui uma medição específica de canal lateral em produção.

## Operação e publicação

1. Configure `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` com valores aleatórios de pelo menos 32 caracteres. Sem ambos, o Compose não inicia.
2. Para produção, use HTTPS, `COOKIE_SECURE=true`, `PUBLIC_ORIGIN` exata e `TRUSTED_PROXY_COUNT` correspondente ao proxy real.
3. Ao implantar a nova tabela de sessões, cookies antigos sem token registrado deixam de autenticar: todas as pessoas precisarão entrar novamente uma vez. O esquema é aplicado por `flask --app backend.app init-db`.
4. Não inclua `.env`, `.venv`, dados do laboratório ou segredos em cópias de distribuição.
5. Consulte também o checklist de publicação em [`SECURITY.md`](../SECURITY.md).

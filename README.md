# LABIOMEC Hub

Espaço de trabalho do Laboratório de Biomecânica do PEB/COPPE/UFRJ para conectar a equipe e organizar publicações, metas, demandas, arquivos, conversas e notas privadas.

**Acessar o Hub:** [labmechub.vercel.app](https://labmechub.vercel.app)

A interface usa HTML, CSS e JavaScript; a API usa Flask e PostgreSQL. Os arquivos podem ficar em disco persistente na instalação local ou em um bucket privado do Supabase na nuvem. As chamadas usam LiveKit. O projeto não depende do Firebase.

## Recursos

| Área | O que está disponível |
| --- | --- |
| Mural | Publicações, comentários, enquetes e anexos de imagem, GIF, vídeo e PDF |
| Trabalho | Metas, demandas pessoais e de unidades, filtros, histórico e restauração de demandas excluídas |
| Meu Espaço | Notas privadas e editor de documentos com formatação, tabelas, fórmulas e impressão |
| Quadro de desenho | Canetas, marca-texto, laser, borracha, formas, carimbo da logo, seleção, laço e recorte |
| Arquivos | Biblioteca com projeto, unidades, cotas e downloads autorizados pelo backend |
| Comunicação | Mensagens, notificações, presença e chamadas de equipe com LiveKit |
| Equipe | Perfis, vínculos, unidades, conquistas e administração de contas |
| Navegação | Busca unificada, temas e layouts para desktop, celular e tablet |

O quadro permite importar imagens e páginas de PDF, exportar PNG/PDF, personalizar o fundo e usar tela cheia. Em telas de toque, um dedo desenha; dois dedos movem o quadro; a pinça ajusta o zoom. Veja [Quadro de desenho](#quadro-de-desenho).

## Como executar

- **No computador ou servidor próprio:** [com Docker](#iniciar-com-docker) ou [sem Docker](#iniciar-sem-docker).
- **Na nuvem:** [Vercel, Supabase e LiveKit Cloud](#publicar-na-vercel).
- **Para manter o projeto:** [testes](#testes), [segurança](#segurança) e [backup](#backup).

## Organização do código

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Interface, mural, metas, demandas e arquivos |
| `app.py` | Entrada Flask/WSGI usada na publicação |
| `assets/lab-api.js` | Sessão, chamadas HTTP e atualização dos painéis |
| `assets/global-search.js` | Campo de busca, categorias e resultados no header |
| `assets/note-document.js` | Editor de documentos e ferramentas de texto |
| `assets/note-drawing-toolbar.js` | Barra de ferramentas do quadro e menus adaptados à tela |
| `assets/note-whiteboard-model.js` | Preferências, reconhecimento e desenho das formas |
| `assets/note-whiteboard-settings.js` | Fundo, comportamento, ferramentas e atalhos |
| `assets/note-whiteboard-files.js` | Importação de imagens/PDF e exportação do quadro |
| `assets/note-fullscreen.js` | Tela cheia do editor e alternativa de janela ampliada |
| `lab-config.js` | Configuração pública da API e do apoio voluntário |
| `backend/app.py` | Rotas HTTP e comandos administrativos |
| `backend/database.py` | Consultas SQL parametrizadas e transações |
| `backend/permissions.py` | Regras de leitura e alteração |
| `backend/search.py` | Busca unificada e filtros sobre conteúdo autorizado |
| `backend/schema.sql` | Estrutura do banco |
| `backend/tests/` | Testes de API, permissões e banco |
| `pyproject.toml` | Python 3.13, dependências fixadas e entrada `app:app` para a Vercel |
| `compose.yaml` | Serviços locais de PostgreSQL, Hub e LiveKit |
| `docs/` | Guias de nuvem, chamadas, quadro e revisões de segurança |

Funções Python seguem nomes em inglês, conforme as convenções das bibliotecas. Comentários e mensagens explicam as decisões em português. Não foram importados dados clínicos do projeto de referência.

## Iniciar com Docker

Instale Docker com Docker Compose. Na raiz do projeto, copie [`.env.example`](.env.example) para `.env`. Escolha uma senha longa para `POSTGRES_PASSWORD`, usando letras, números, hífen e sublinhado para evitar caracteres especiais na URL. Gere um segredo com o comando abaixo e coloque o resultado em `SECRET_KEY`:

```sh
python -c "import secrets; print(secrets.token_hex(32))"
```

Preencha também `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`: o Compose exige esses valores ao validar a configuração, mesmo quando você não inicia o serviço de voz. Use valores próprios do ambiente local. Para execução sem HTTPS no computador, mantenha `COOKIE_SECURE=false`.

Prepare o banco e crie a primeira conta:

```sh
docker compose up -d database
docker compose build hub
docker compose run --rm hub flask --app backend.app init-db
docker compose run --rm hub flask --app backend.app create-user admin@example.org --name "Administrador" --admin --unit LACAM --unit LabNeuroMusc
docker compose up -d hub
```

A senha será solicitada sem aparecer no terminal nem nos argumentos do processo. Abra **http://127.0.0.1:5000**. Live Server e abrir o HTML diretamente não fornecem a API.

Para visualizar o layout pelo Mobile Preview do VS Code, defina `ALLOW_LOCAL_FRAME_PREVIEW=true` e `PUBLIC_ORIGIN=http://127.0.0.1:5000` no `.env` e recrie o serviço Hub. Isso permite incorporar apenas a página inicial acessada por localhost/loopback em HTTP, com cookies seguros desativados. O padrão é `false`; com domínio público, HTTPS ou cookies seguros, a proteção contra incorporação continua ativa. Arquivos e recuperação de senha mantêm a proteção em todos os modos.

O Compose publica apenas a porta local do hub. PostgreSQL permanece na rede interna. Para acesso externo, configure proxy com HTTPS, `COOKIE_SECURE=true`, `PUBLIC_ORIGIN` com a origem HTTPS exata (por exemplo `https://hub.exemplo.br`), limite de upload e timeout apropriados. A URL interna do banco é montada automaticamente no Compose.

## Iniciar sem Docker

Use **Python 3.13**, conforme `.python-version` e `pyproject.toml`, e PostgreSQL 17 para acompanhar o ambiente do projeto. Crie um usuário e banco dedicados. Copie `.env.example` para `.env` e configure `DATABASE_URL`, `SECRET_KEY` e `STORAGE_DIR`. Não use uma conta de superusuário do banco em produção.

No Windows/PowerShell:

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m flask --app backend.app init-db
.\.venv\Scripts\python.exe -m flask --app backend.app create-user admin@example.org --name "Administrador" --admin
.\.venv\Scripts\python.exe -m backend.app
```

No Linux, use `.venv/bin/python`. O `.env` é carregado automaticamente. O servidor usa Waitress, sem modo debug. Você pode definir `HOST` e `PORT`; por padrão, o acesso é local na porta 5000.

O `requirements.txt` da raiz utiliza `backend/requirements.lock`. Mantenha esse lock e as versões de `pyproject.toml` alinhados ao atualizar as dependências.

## Publicar na Vercel

O ambiente publicado usa **Vercel para o Hub**, **Supabase para PostgreSQL e arquivos privados** e **LiveKit Cloud para as chamadas**. A Vercel não inicia os serviços do Docker Compose nem mantém os uploads em disco persistente.

1. Conecte o repositório no GitHub ao projeto da Vercel. A pasta raiz é a raiz do repositório; o preset é **Flask**. A entrada `app:app` já está declarada em `pyproject.toml`.
2. Configure o PostgreSQL e crie o bucket privado `hub-files` no Supabase. Não habilite acesso público ao bucket.
3. Cadastre as variáveis no painel de ambiente da Vercel, no ambiente que receberá a publicação.
4. Prepare o banco pelo comando `flask --app backend.app init-db`, usando a conexão do ambiente correto, e crie a primeira conta administrativa pelo comando `create-user ... --admin`.
5. Configure o projeto LiveKit Cloud e suas credenciais para habilitar chamadas.
6. Confirme a branch de produção e faça o deploy. Nesta instalação, a branch é `atualizacao-hub-20261028`; novas instalações podem escolher outra.
7. Confira `/api/health`, login, permissões, upload/download e chamadas no domínio publicado.

| Variável | Uso na nuvem |
| --- | --- |
| `DATABASE_URL` | URI PostgreSQL privada do Transaction pooler, com `sslmode=require` |
| `SECRET_KEY` | Segredo exclusivo da aplicação em produção |
| `PUBLIC_ORIGIN` | Origem HTTPS exata; nesta instalação, `https://labmechub.vercel.app` |
| `COOKIE_SECURE` | `true` |
| `ALLOW_LOCAL_FRAME_PREVIEW` | `false` |
| `ALLOW_REGISTRATION` | `true` para permitir cadastro ou `false` para contas criadas pela administração |
| `STORAGE_BACKEND` | `supabase` |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SECRET_KEY` | Chave secreta do backend, nunca enviada ao navegador |
| `SUPABASE_STORAGE_BUCKET` | `hub-files` |
| `MAX_UPLOAD_MB` / `POST_ATTACHMENT_MAX_MB` | `4` na configuração inicial para a Vercel |
| `STORAGE_LIMIT_GB` | `1` na configuração inicial de testes |
| `LIVEKIT_URL` | URL pública do projeto, começando com `wss://` |
| `LIVEKIT_INTERNAL_URL` | Endpoint HTTPS correspondente para a API do LiveKit |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Credenciais do projeto LiveKit |
| `RESET_MAIL_DELIVERY` | `queue` na Vercel; não usa threads de envio após a resposta |
| `RESET_MAIL_WORKER_SECRET` | Segredo exclusivo do processador agendado da recuperação de senha |

As cotas acima são configurações do Hub, não uma garantia sobre os planos dos provedores. Confira os limites disponíveis nos respectivos painéis. O limite de upload inclui o formulário HTTP; arquivos próximos ao teto podem ser recusados.

Para comandos locais que acessam o ambiente de nuvem, use um arquivo privado `.env.cloud` e selecione-o explicitamente no PowerShell:

```powershell
$env:HUB_ENV_FILE = '.env.cloud'
.\.venv\Scripts\python.exe -m flask --app backend.app init-db
Remove-Item Env:HUB_ENV_FILE
```

Selecione a conexão com cuidado antes de executar comandos administrativos. O envio do código não copia automaticamente usuários, publicações ou arquivos locais para a nuvem. Depois de alterar variáveis na Vercel, publique um novo deployment para aplicá-las. Se mudar o domínio, atualize também `PUBLIC_ORIGIN`.

`.env` e `.env.cloud` são privados e ignorados pelo Git. Importe os valores pelo painel da hospedagem; nunca inclua credenciais em `lab-config.js`, commits, prints ou exemplos públicos.

O guia [Configuração de nuvem](docs/nuvem-gratuita.md) detalha armazenamento, pooler e limitações. A recuperação por e-mail na Vercel usa uma fila persistente e um processador agendado. A ativação requer SMTP, segredo e agendamento; veja o [guia de recuperação serverless](docs/recuperacao-serverless.md). Sem um processador ativo, a API informa indisponibilidade em vez de confirmar um envio que não foi agendado.

## Contas e unidades

O cadastro público vem fechado. Crie as contas pelo terminal:

```sh
docker compose run --rm hub flask --app backend.app create-user pesquisador@example.org --name "Pesquisador" --unit LACAM
docker compose run --rm hub flask --app backend.app set-units pesquisador@example.org --unit LACAM --unit LabNeuroMusc
docker compose run --rm hub flask --app backend.app reset-password pesquisador@example.org
```

`set-units` substitui as unidades; sem `--unit`, remove todas. Por padrão, somente a administração inclui integrantes em unidades; integrantes podem sair das unidades atuais pelo perfil. A opção `SELF_SERVICE_UNITS=true` permite escolher unidades existentes no próprio perfil, mas não é recomendada. Somente a administração cria unidades e altera funções administrativas. No primeiro acesso, é obrigatório escolher o vínculo acadêmico ou profissional; a unidade é opcional e pode ser atribuída depois pela administração. Contas com perfil incompleto também recebem essa etapa ao entrar. O vínculo aparece no perfil. A opção "Esqueceu a senha?" envia um código de seis dígitos por e-mail quando o SMTP está configurado; a redefinição administrativa pelo terminal continua disponível. Redefinir a senha invalida as sessões anteriores.

`ALLOW_REGISTRATION=true` habilita o cadastro no formulário. Contas novas não recebem unidades nem privilégios. Senhas exigem pelo menos 12 caracteres; tentativas de login e cadastro têm limitação por IP e email.

## Banco e comunicação

As chamadas de equipe usam salas de voz no navegador, com LiveKit local ou LiveKit Cloud, controles de microfone/áudio e chamada minimizada. Veja [configuração, testes locais e requisitos para publicar](docs/chamadas-voz.md). Para iniciar o serviço de voz local junto do Hub: `docker compose up -d --build hub voice`.

### Minijogos e ranking semanal

O ranking é compartilhado pelo banco PostgreSQL e vinculado ao ID da conta, inclusive quando duas pessoas têm o mesmo nome. A semana vai de segunda a domingo em `America/Sao_Paulo`; a data do servidor determina em qual semana entra a partida concluída. Semanas anteriores continuam guardadas, mas a interface mostra a atual. Pontos antigos do `localStorage` não são importados porque não têm data ou identificação confiável da partida.

Os endpoints autenticados são `POST /api/games/rounds`, `POST /api/games/scores` e `GET /api/games/ranking`. Cada partida recebe um token assinado, vinculado à conta, ao jogo e à versão da sessão, com validade de quatro horas. Reenvios da mesma partida não duplicam pontos, inclusive na virada da semana. A gravação usa travas transacionais; os documentos internos `_game_scores` não podem ser alterados pela API genérica. Não há migração de tabelas: os registros usam a tabela de documentos existente. O ranking omite contas excluídas ou bloqueadas e mostra o nome atual do perfil.

Os jogos executam no navegador e informam a conclusão ao servidor, que valida a partida e os valores de pontuação permitidos para cada jogo; o servidor não simula todas as jogadas. A interface confirma o salvamento e permite tentar novamente se houver falha de conexão. Ao abrir o ranking, ela aguarda os envios pendentes e oferece um botão para atualizar a lista.

### Recuperação de senha pelo Gmail

No `.env` local, defina `PUBLIC_ORIGIN` com o endereço público HTTPS do Hub (sem caminho), `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USERNAME` com o Gmail remetente e `SMTP_PASSWORD` com uma **senha de app** dessa conta. Para gerar a senha de app, ative a verificação em duas etapas e acesse <https://myaccount.google.com/apppasswords>. Não use a senha normal do Google e não publique esses valores. `SMTP_FROM` é opcional e, vazio, usa o próprio remetente. O Compose encaminha essas configurações ao backend. Recrie o serviço após preencher: `docker compose up -d --force-recreate hub`.

Para testar somente no computador, `PUBLIC_ORIGIN=http://127.0.0.1:5000` é aceito, e a tela de recuperação só fica acessível nesse computador. Para outras pessoas, use o domínio HTTPS acessível a elas. Sem SMTP ou origem configurada, o botão explica que a recuperação ainda está em configuração e indica o suporte.

A pessoa recebe um código de seis dígitos por e-mail, digita na tela de recuperação e só então escolhe a nova senha. O código vale dez minutos e permite até cinco tentativas; depois de validado, a autorização para salvar a senha vale cinco minutos. Ambos têm uso único e estado compartilhado no PostgreSQL. O banco guarda nonce e metadados privados, sem código em texto puro; a autorização fica somente na memória da página. Senhas exigem 12 a 256 caracteres. A API exige CSRF/origem válida e limita tentativas. Pedidos de envio têm resposta genérica para não revelar contas cadastradas. Nenhuma senha é enviada por e-mail. Links antigos de recuperação não são mais aceitos.

Na Vercel, configurar somente o Gmail não ativa a recuperação: siga [Recuperação serverless](docs/recuperacao-serverless.md) para configurar a fila e o agendamento. Pedidos pendentes sobrevivem ao encerramento de instâncias; falhas temporárias têm novas tentativas. A confirmação SMTP pode ser ambígua após uma interrupção, então um e-mail pode ser reenviado. O envio não tem garantia de exatamente uma vez.

Contas e metadados de arquivos ficam em tabelas próprias. A tabela `documents` usa JSONB para preservar os formatos atuais de publicações, enquetes, comentários e notas. Registros são separados por coleção e identificador; nos murais privados, cada documento agrupa os itens de uma unidade. Essa é uma camada de compatibilidade com a interface, não um modelo relacional de dados clínicos.

O backend valida autoria, equipes e privilégios. O banco não é exposto ao navegador. A sessão usa cookie HttpOnly; escritas exigem token CSRF. Resumos de conversas são produzidos pelo servidor.

Os painéis consultam `/api/sync` a cada 5 segundos com a página visível. Não são WebSockets. A presença envia heartbeat a cada 30 segundos e expira após 90 segundos. Esta versão não tem paginação dos históricos; acrescente paginação antes de ampliar o volume de dados.

## Busca no header

O botão **Home** do cabeçalho funciona como alternativa ao **Voltar** da tela aberta, quando o cabeçalho está acessível. Usa a mesma ação de retorno de perfis, arquivos, notificações e painéis, preservando o contexto e os rascunhos. Na tela principal, leva ao topo do Hub.

A barra **Pesquisar no hub** reúne resultados em Tudo, Mural, Demandas, Metas, Metas que criei, Pessoas, Arquivos, Notas e Mensagens. O atalho `Ctrl+K` (ou `Cmd+K`) abre o campo. É possível filtrar por criados por mim, atribuídos a mim, concluídos e excluídos. **Metas que criei** considera a autoria da meta, não quem marcou sua conclusão.

A pesquisa ignora diferenças entre maiúsculas e minúsculas e acentos. Todos os termos digitados precisam ser encontrados. Ela procura textos, comentários, nomes de pessoas, nomes de anexos/arquivos, projetos, notas próprias e mensagens das conversas do usuário. Não extrai conteúdo interno de PDFs, imagens ou vídeos. Demandas pessoais também aparecem em Demandas. Demandas excluídas aparecem apenas com o filtro Excluídos; as finalizadas podem ser encontradas no histórico.

O servidor verifica as permissões antes de montar resultados e contagens. Notas de outras pessoas e conversas das quais o usuário não participa não são pesquisáveis, inclusive para administradores. Arquivos seguem as mesmas permissões de download. A interface descarta respostas antigas ao trocar a consulta ou sair da conta.

Cada categoria mostra até 20 resultados e informa quando é preciso refinar a busca. A implementação atual percorre os documentos autorizados no servidor; para históricos muito extensos, substitua essa varredura por um índice de busca com as mesmas regras de autorização.

## Demandas excluídas

Ao clicar em **excluir**, a demanda vai para a seção **Excluídas**, disponível nas visualizações Lista, Quadro e Post-its. Ela deixa de aparecer nos contadores ativos, no resumo e nas listas de trabalho. A seção mostra quando e por quem foi excluída e permite **Restaurar**.

A restauração preserva texto, prioridade, responsável, prazo, situação anterior, histórico e vínculo com o post do mural. Uma demanda que estava finalizada retorna ao histórico de finalizadas; uma demanda em andamento retorna em andamento. A busca por texto e o filtro de prioridade também se aplicam à seção Excluídas.

As ações são validadas no servidor: autor, responsável, pessoa mencionada ou administração podem excluir e restaurar, respeitando as unidades autorizadas. A interface não oferece exclusão definitiva. A API também bloqueia a remoção permanente e a alteração direta dos campos de exclusão. Não é preciso alterar o esquema do banco: os marcadores ficam no documento JSONB da demanda.

## Arquivos e capacidade

### Anexos no mural

A barra de ícones do mural reúne fotos, vídeos, GIFs, PDFs, enquetes e emojis. Cada ícone mostra sua descrição ao passar o cursor ou receber foco pelo teclado. Os botões de arquivo abrem o seletor com o filtro do formato correspondente. São aceitos até 6 arquivos por publicação: JPG, PNG, GIF, WebP, MP4, WebM e PDF. É possível publicar só anexos ou combiná-los com texto e enquete. A seleção mostra prévias e permite remover arquivos antes do envio. Se o envio falhar, o texto e a seleção são preservados para tentar novamente.

Fotos e GIFs aparecem no post; vídeos usam o player do navegador, sem reprodução automática; PDFs têm links para abrir e baixar. A reprodução de vídeo depende dos codecs compatíveis com o navegador. Os downloads e as prévias exigem login. Até a publicação, os uploads ficam privados; depois, seguem o acesso do mural (todos os usuários autenticados ou unidade). O servidor confere extensão e assinatura dos formatos, não apenas o tipo declarado pelo navegador.

`POST_ATTACHMENT_MAX_MB` limita cada anexo do mural (padrão: 250 MB). A cota geral de armazenamento também se aplica. O backend salva metadados confiáveis no post; não aceita anexar arquivos de outros usuários nem reutilizar um arquivo em outra publicação. A migração adiciona campos à tabela `files` sem apagar registros anteriores.

Uploads de tentativas interrompidas continuam na área **Arquivos**, privados. Excluir uma publicação retira o acesso ao anexo pelo mural, mas mantém o arquivo para o proprietário e a administração, que podem excluí-lo pela área Arquivos.

Para atualizar uma instalação existente, execute na raiz do projeto:

```sh
docker compose build hub
docker compose run --rm hub flask --app backend.app init-db
docker compose up -d hub
```

Esses comandos preservam os volumes do banco e dos arquivos. Recarregue a página após a atualização.

### Biblioteca de arquivos

A área **Arquivos** permite informar projeto, enviar, baixar e excluir arquivos. Por padrão, o acesso é privado: proprietário e administração. Ao escolher uma unidade, seus integrantes também podem baixar. Somente proprietário e administração podem excluir.

Arquivos ficam fora das rotas estáticas, com nomes internos aleatórios. Downloads são autenticados e enviados como anexos. A cópia usa blocos; o arquivo não é inteiro carregado na RAM. O parser pode usar o diretório temporário do sistema antes da gravação definitiva.

| Variável | Padrão | Função |
| --- | --- | --- |
| `STORAGE_LIMIT_GB` | 100 | Limite lógico total dos arquivos cadastrados |
| `MAX_UPLOAD_MB` | 2048 | Limite por requisição, incluindo o formulário |
| `STORAGE_DIR` | `./var/files` | Diretório na execução nativa com armazenamento local |
| `STORAGE_BACKEND` | `local` fora da Vercel | Seleciona disco local ou `supabase` |

Aumentar a configuração não cria espaço físico. Reserve disco para temporários, banco e backups. Disco cheio pode interromper um envio antes da cota. Não há upload retomável nesta versão.

Com Docker, os volumes são `postgres_data` e `lab_files`, prefixados pelo nome do projeto. Não execute `docker compose down -v` se quiser preservar os dados. Sem Docker, os arquivos ficam em `STORAGE_DIR`.

Na nuvem com `STORAGE_BACKEND=supabase`, os objetos ficam no bucket privado; o backend mantém a autorização de uploads e downloads. As configurações iniciais da Vercel usam limites menores que os padrões locais da tabela. A capacidade depende também das cotas do provedor. Disco temporário não substitui armazenamento persistente.

## Segurança

As permissões são verificadas no servidor. Sessões usam cookies `HttpOnly`; alterações exigem CSRF e origem válida. O projeto inclui políticas de conteúdo, limitação de tentativas, validação de uploads e controle de acesso por conta e unidade. Notas privadas e conversas não ficam disponíveis para outros integrantes ou administradores apenas pelo privilégio administrativo.

Cadastros públicos, quando habilitados, não concedem administração nem associação automática a unidades. A opção de suporte é gerenciada pela administração. A ocultação de uma conta no diretório e na presença não torna anônimas suas publicações, mensagens ou participação em chamadas.

Consulte a [documentação de segurança](SECURITY.md), o [modelo de ameaças](docs/modelo-de-ameacas.md) e a [revisão STRIDE/DREAD de 28/10/2026](docs/revisao-stride-dread-2026-10-28.md). Os relatórios datados registram o estado e as evidências daquela revisão; não são uma certificação nem garantia de ausência de falhas.

## Backup

Faça backup do banco e dos arquivos no mesmo período, preferencialmente com uploads pausados. Guarde uma cópia em outro disco e teste a restauração. Banco sem arquivos não recupera os anexos; arquivos sem banco perdem metadados e permissões.

```sh
docker compose exec database pg_dump -U labiomec -d labiomec -Fc -f /tmp/labiomec.dump
docker compose cp database:/tmp/labiomec.dump ./labiomec.dump
docker compose exec hub tar -czf /tmp/labiomec-files.tar.gz -C /data files
docker compose cp hub:/tmp/labiomec-files.tar.gz ./labiomec-files.tar.gz
```

Esses exemplos exigem espaço temporário e não substituem uma política de backup. Proteja também o `.env` e as credenciais administrativas.

Os comandos acima cobrem a instalação Docker com arquivos locais. No ambiente Supabase, inclua tanto o banco quanto os objetos do bucket no procedimento de backup e teste a restauração dos dois. Publicar o repositório no GitHub não faz backup dos dados do Hub.

## Testes

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

Execute os comandos a partir da raiz do repositório. Testes HTTP usam um repositório em memória exclusivo dos testes. Cobrem login, CSRF, permissões, privacidade, mensagens, arquivos e cotas. O aplicativo real aceita somente PostgreSQL.

Para testar SQL, defina `TEST_DATABASE_URL` com um banco vazio exclusivo de testes. O teste cria tabelas, usa identificadores próprios e remove os registros criados. Nunca aponte para o banco do laboratório.

Para executar toda a suíte com um banco PostgreSQL temporário separado do banco do aplicativo:

```sh
docker compose run --rm --no-deps hub python -m backend.tests.run_postgres_tests
```

Esse comando exige permissão para criar bancos. Ele cria um banco com nome aleatório, executa os testes e remove apenas esse banco ao terminar. Nenhuma tabela do banco do laboratório é alterada por esse teste.

Os testes JavaScript usam Node.js; as validações recentes foram feitas com Node.js 24. Exemplos sem navegador:

```sh
node backend/tests/test_whiteboard_model.cjs
node backend/tests/test_activity_notifications.cjs
node backend/tests/test_profile_units.cjs
node backend/tests/test_notification_state.cjs
```

O teste do quadro usa `playwright-core` e um navegador Chromium instalado. Exemplo com Edge no Windows, mantendo a dependência de teste fora do repositório:

```powershell
npm install --prefix "$env:TEMP\labmec-browser-tests" --no-audit --no-fund playwright-core
$env:PLAYWRIGHT_MODULE = "$env:TEMP\labmec-browser-tests\node_modules\playwright-core"
$env:EDGE_EXECUTABLE = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
node backend/tests/test_note_drawing_area.cjs
```

Se o navegador estiver em outro local, ajuste `EDGE_EXECUTABLE`. O teste usa desenhos e arquivos fictícios, sem conta de produção. Verifica desenho, seleção, recorte, histórico, atalhos, importação/exportação, preferências, CSP, tela cheia e gestos de toque.

Para conferir o retorno sem travamento durante a tela cheia, execute `node backend/tests/test_fullscreen_return.cjs` com Chrome instalado; `CHROME_EXECUTABLE` permite indicar outro caminho. O teste usa uma página local sem conta, banco ou chamada real: repete entrada e saída nas notas e chamadas, verifica o modo alternativo do editor e o retorno do perfil pelo Home com o Hub em tela cheia. O fechamento usa uma única operação de saída por vez para impedir ciclos de observação de alterações.

A validação mais recente do quadro passou em seis tamanhos emulados: **320×568, 390×844, 768×1024, 1024×768, 1366×1024 e 844×390**. Inclui pinça, movimento com dois dedos e caneta digital com toque simultâneo da mão. A emulação não substitui testes em aparelhos reais, especialmente em navegadores e sistemas diferentes.

Evidências anteriores estão nos relatórios de [segurança](docs/resultado-seguranca-2026-10-28.md) e [adaptação para nuvem](docs/validacao-nuvem-2026-10-28.md). Seus números e pendências correspondem às respectivas datas; não representam uma nova execução completa a cada atualização do README.

## Visualização expandida do mural

O filtro de conteúdo no mural oferece Todos os conteúdos, PDFs, Fotos e imagens, GIFs, Vídeos e Sem anexos. Ele combina com a busca e as unidades. Publicações com anexos mistos podem aparecer em mais de uma categoria. A navegação expandida segue a lista filtrada e prioriza o tipo escolhido ao abrir o card ou mudar de publicação. Teste: `node backend/tests/test_mural_media_filter.cjs`.

Ao abrir uma publicação, as setas verticais percorrem os posts na mesma ordem e com os mesmos filtros do mural. A roda do mouse sobre a imagem ou vídeo também navega; as teclas ↑/↓ fazem o mesmo. As setas horizontais continuam percorrendo os anexos de uma única publicação. Rascunhos de comentários são preservados enquanto o visualizador permanece aberto.

PDFs abrem dentro do visualizador usando o leitor do navegador, com download separado na barra superior. A roda dentro do PDF rola o documento; use as setas verticais para trocar de publicação. A rolagem dos comentários também é independente. O zoom de imagens e vídeos usa os botões ou Ctrl + roda; com zoom aplicado, a roda movimenta a mídia. PDFs só permitem incorporação no mesmo site e mantêm as permissões de acesso dos arquivos.

## Primeira publicação no mural

Depois que a primeira publicação da conta é confirmada pelo servidor, o autor vê confetes leves e uma mensagem de comemoração por alguns segundos. O aviso pode ser fechado e não bloqueia o uso do hub. A preferência de movimento reduzido desativa os confetes e as animações.

O marco é registrado no PostgreSQL, em uma coleção interna sem acesso pelas rotas de dados e sincronização. Publicações públicas e de unidades contam juntas; apagar a publicação ou mudar de navegador não reinicia o marco. Contas que já possuem publicações não recebem a comemoração ao postar novamente. Envios recusados não consomem a primeira publicação.

## Conquistas

Abra **Mais → Minhas conquistas** ou visite um perfil. A própria conta vê os emblemas conquistados e o progresso das próximas metas; outros integrantes veem apenas os emblemas já conquistados. Novas conquistas geram uma comemoração, respeitando movimento reduzido. A primeira publicação mantém sua comemoração específica, sem duplicar avisos.

Os seis emblemas iniciais são Primeira voz (1 publicação), Em movimento (5 publicações), Presença no mural (20 publicações), Puxa conversa (1 comentário ou resposta), Troca de ideias (10 comentários ou respostas) e Espírito de equipe (curtir 5 publicações diferentes). Contam atividades públicas e de unidades. As atividades existentes são consideradas na inicialização, sem gerar avisos retroativos.

Em **Editar perfil → Conquistas no perfil**, cada conta escolhe os emblemas que deseja exibir, pode ocultar todos ou restaurar com Mostrar todas. As escolhas são aplicadas em Salvar perfil, junto com as demais alterações. Conquistas ocultas continuam disponíveis à própria pessoa, com progresso preservado; a API filtra os emblemas para outros integrantes. As preferências ficam fora dos dados públicos do perfil e somente a própria conta pode alterá-las, inclusive em relação à administração. O catálogo de requisitos permanece disponível sem revelar quais emblemas ocultos já foram obtidos.

O servidor verifica as atividades e mantém marcos persistentes em uma coleção interna. Apagar conteúdo não remove conquistas obtidas; descurtir e curtir novamente a mesma publicação não aumenta o contador. Os registros guardam hashes de identificadores de atividades, sem texto ou anexos. O endpoint autenticado `/api/achievements/{uid}` fornece apenas emblemas e, para a própria conta, progresso. Clientes não podem atribuir emblemas pelas rotas genéricas de dados.

## Exclusão de mensagens

Clique com o botão direito em uma mensagem (ou mantenha pressionada no celular) para abrir as opções. **Apagar para mim** oculta a mensagem apenas para a conta que escolheu essa opção. **Apagar** remove a mensagem para os dois participantes e só é permitido ao autor, inclusive quando quem tenta a ação é administrador. O menu também aceita a tecla de menu de contexto ou Shift+F10 ao focar uma mensagem.

A API valida cada ação em `/api/messages/delete`. Mensagens ocultadas são filtradas nas leituras diretas, sincronização, busca e prévia da conversa para a respectiva conta. Textos e áudios seguem a mesma regra. O banco mantém o conteúdo quando a exclusão é apenas pessoal; a exclusão para os dois remove a mensagem do documento compartilhado.

## Notificações

As notificações aparecem na própria página, com dez avisos por página. É possível marcar um aviso como lido ou apagá-lo da lista. Abrir a lista não marca todos como lidos; abrir um aviso marca aquele aviso como lido. Apagar uma notificação não apaga a publicação, mensagem ou outro conteúdo de origem.

Os estados ficam em `notification_states/{uid}` no PostgreSQL, acessíveis somente à própria conta, inclusive em relação a administradores. Chaves estáveis identificam cada aviso; uma mensagem mais recente pode gerar um novo aviso mesmo se o anterior foi apagado. Os marcadores antigos de leitura do navegador continuam sendo considerados. Testes de paginação e estados: `node backend/tests/test_notification_state.cjs`.

## Exclusão de integrantes

No perfil de um integrante, a administração pode usar **Excluir do Hub**. Após confirmação, o perfil deixa de aparecer na lista e na busca, a senha é inutilizada e todas as sessões perdem validade. O mesmo e-mail fica reservado para impedir novo cadastro. Não é possível excluir a própria conta ou outra conta administrativa por essa interface.

Publicações, comentários e arquivos são preservados. O banco mantém uma referência da conta com nome “Conta excluída”, o marcador interno de remoção e o e-mail reservado, para conservar as relações dos arquivos e impedir novo acesso. Não há opção de desfazer pela interface. As antigas etiquetas de dev/equipe técnica e de banido deixaram de aparecer.

## Apoio voluntário ao desenvolvedor

O link “Apoiar o dev” aparece no rodapé da entrada e do hub. A pessoa escolhe o valor, gera um QR Code ou copia o código Pix e confirma o pagamento no aplicativo do banco. A contribuição é destinada ao desenvolvedor; o site não consulta o banco nem confirma recebimentos automaticamente.

Os dados públicos do beneficiário ficam em `lab-config.js`, em `donationPix` (chave aleatória, nome e cidade). Não coloque senhas ou credenciais bancárias nesse arquivo. O nome completo aparece na interface; o campo do código Pix é normalizado e limitado a 25 caracteres pelo formato BR Code.

O QR Code é gerado localmente pela biblioteca MIT Project Nayuki, mantida em `assets/qrcodegen.js` com a licença original. Não há serviço externo de geração de QR Code. Referências: [biblioteca](https://www.nayuki.io/page/qr-code-generator-library) e [manual do Banco Central](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf).

Validação: `node backend/tests/test_donation_pix.cjs` (CRC, estrutura, beneficiário, valores e geração do QR Code). A leitura por um aplicativo bancário e o pagamento precisam ser conferidos no banco; os testes não realizam transferências.

## Editor de notas

Em **Bloco de notas → Expandir**, o editor ocupa a tela inteira. **Voltar** salva e retorna ao bloco compacto, preservando a posição da página. As ferramentas ficam nas abas Texto, Inserir, Revisar e Documento. A aba Texto usa uma barra em uma linha, com fonte, tamanho, cores e alinhamento; o menu **Mais** reúne recuos, entrelinhas e outras opções. Os formatos ativos são destacados, **Ajuda** explica o uso e **Recolher** libera mais espaço para escrever. Há estilos de título com sumário, listas, tabelas editáveis, imagens com legenda, links, referências, notas de rodapé, busca e substituição e modelos de relatório, ata e projeto. As fórmulas são montadas por campos com prévia visual, incluindo frações, potências, raízes, somatórios, integrais e matrizes; clique duas vezes em uma fórmula para editá-la.

A área de escrita tem largura A4 de 21 cm, altura inicial de 29,7 cm e margens de 20 mm. Réguas em centímetros aparecem acima e à esquerda, com marcações menores em milímetros. A folha cresce com textos longos e a régua superior fica visível durante a rolagem. As réguas são guias visuais e não entram no documento salvo ou impresso. A impressão usa papel A4.

As notas continuam privadas e com salvamento automático. Documentos formatados aparecem como prévia no bloco compacto e são editados em Expandir, preservando tabelas e fórmulas. Clique em uma imagem e arraste os cantos para redimensioná-la mantendo a proporção; as setas do teclado nos cantos fazem ajustes de 10 pixels. Arraste a imagem entre os parágrafos para movê-la junto com a legenda, usando a linha de inserção como guia. Listas de tarefas podem ser marcadas pelo quadrado ou Ctrl+Enter dentro do item. O modo de desenho permanece disponível.

A aba Documento permite importar TXT/HTML, baixar HTML/TXT e imprimir ou salvar em PDF pelo navegador. Não há importação ou exportação nativa de DOCX/ODT nem compilação de LaTeX. Imagens locais PNG/JPEG/GIF/WebP têm limite de 512 KB por imagem; documentos HTML importados são higienizados e não carregam scripts ou imagens externas.

## Quadro de desenho

No editor de notas, escolha o modo de desenho. O quadro é salvo nas notas privadas da própria conta, junto com as preferências de ferramentas e aparência.

| Ferramenta | Controles |
| --- | --- |
| Canetas 1 e 2 | Cor, espessura e estilo contínuo, tracejado, pontilhado ou com seta |
| Marca-texto | Paleta com preto, branco, vermelho, azul, verde, laranja e roxo, cor personalizada, espessura e opacidade |
| Laser | Espessura independente, inicialmente 4 px; o efeito desaparece e não entra no desenho salvo |
| Borracha | Pixel para apagar partes do desenho ou Traço para remover o traço inteiro, com espessura ajustável |
| Formas | Linha, retângulo, círculo/elipse, triângulo, cubo, cilindro, pirâmide e esfera; as partes ocultas dos sólidos são tracejadas |
| Seleção | Mover, redimensionar, selecionar com laço, copiar/colar, apagar e recortar uma área |
| Conteúdo | Carimbo da logo do Hub, caixas de texto, imagens e páginas de PDF |
| Saída | Download em PNG ou PDF, incluindo o fundo e sem o efeito do laser |

A engrenagem abre quatro abas: **Fundo**, **Comportamento**, **Ferramentas** e **Atalhos**. O fundo pode ser Branco, Quadriculado, Pontinhos ou Cor, com cores independentes para a base e o padrão. O reconhecimento de formas pode ser ligado ou desligado e configurado para círculo, retângulo, triângulo e linha reta. A pessoa também pode ocultar ferramentas, editar os atalhos permitidos e restaurar os padrões.

### Navegação e tela cheia

- A rodinha aplica zoom por padrão: para cima aproxima; para baixo afasta. Com **Mover** selecionado, esse também é o comportamento da rodinha, salvo quando o scroll foi configurado para ser ignorado.
- **Shift + rodinha** move o quadro para os lados. **Espaço + arrastar**, ou arrastar com Mover selecionado, desloca o quadro.
- As barras de rolagem ficam ocultas. O cursor de desenho é circular e a superfície se adapta ao espaço visível, dentro do limite de 4096 pixels por dimensão.
- A alça de pontinhos reposiciona a barra. Dois cliques ou Home, com a alça focada, restauram a posição inicial.
- Recolher a barra libera espaço sem sair do modo de desenho. O botão de reabrir fica disponível no quadro.
- O botão ao lado de **Voltar**, no topo do editor, alterna a tela cheia. **Esc** permite sair; se o navegador não oferecer a API de tela cheia, o editor usa a janela ampliada.

### Celular e tablet

Os controles de desenho têm alvos de toque de pelo menos 44 px nos layouts de celular e tablet. Ferramentas principais ficam na barra; formas, laser e outras opções ficam no menu **+**, que permanece acessível junto da engrenagem. Os painéis se ajustam ao espaço disponível em telas em pé ou deitadas.

- **Um dedo:** desenha com a ferramenta selecionada.
- **Dois dedos:** movem o quadro sem criar traços.
- **Pinça:** aumenta ou diminui o zoom.
- **Caneta digital:** enquanto o traço está ativo, toques simultâneos no quadro são ignorados.

Imagens e PDFs importados no quadro são processados no navegador, com limite de entrada de 10 MB. Imagens são normalizadas; PDFs com várias páginas permitem escolher a página. O tamanho final da nota e os limites de requisição da hospedagem também se aplicam ao salvamento. Esse fluxo é diferente dos anexos do mural e da importação de imagens no editor de texto.

Detalhes de ferramentas, padrões e testes: [Quadro das notas](docs/quadro-de-notas.md).

## Referências institucionais

Conteúdo baseado em https://sites.google.com/peb.ufrj.br/biomec/home e na página Sobre. LABMUSC/EEFD é uma referência relacionada. Conecta informa atualização em 2017. Instagram e PNIPE foram mantidos como links sem confirmação do conteúdo atual. O símbolo da interface não é um logotipo oficial da UFRJ.

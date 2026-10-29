# LABIOMEC Hub

Hub do Laboratório de Biomecânica do PEB/COPPE/UFRJ com HTML/JavaScript, API Python/Flask, PostgreSQL e arquivos em disco. Não depende do Firebase nem de assinatura de armazenamento. A capacidade depende do disco disponível no servidor.

## Organização do código

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Interface, mural, metas, demandas e arquivos |
| `assets/lab-api.js` | Sessão, chamadas HTTP e atualização dos painéis |
| `assets/global-search.js` | Campo de busca, categorias e resultados no header |
| `lab-config.js` | Endereço público da API e sala de reunião |
| `backend/app.py` | Rotas HTTP e comandos administrativos |
| `backend/database.py` | Consultas SQL parametrizadas e transações |
| `backend/permissions.py` | Regras de leitura e alteração |
| `backend/search.py` | Busca unificada e filtros sobre conteúdo autorizado |
| `backend/schema.sql` | Estrutura do banco |
| `backend/tests/` | Testes de API, permissões e banco |

Funções Python seguem nomes em inglês, conforme as convenções das bibliotecas. Comentários e mensagens explicam as decisões em português. Não foram importados dados clínicos do projeto de referência.

## Iniciar com Docker

Instale Docker com Docker Compose. Na raiz do projeto, copie `.env.example` para `.env`. Escolha uma senha longa para `POSTGRES_PASSWORD`, usando letras, números, hífen e sublinhado para evitar caracteres especiais na URL. Gere um segredo com o comando abaixo e coloque o resultado em `SECRET_KEY`:

```sh
python -c "import secrets; print(secrets.token_hex(32))"
```

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

Instale Python 3.13 ou superior e PostgreSQL 17 ou superior. Crie um usuário e banco dedicados. Configure `DATABASE_URL`, `SECRET_KEY` e `STORAGE_DIR` no `.env`. Não use uma conta de superusuário do banco em produção.

No Windows/PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m flask --app backend.app init-db
.\.venv\Scripts\python.exe -m flask --app backend.app create-user admin@example.org --name "Administrador" --admin
.\.venv\Scripts\python.exe -m backend.app
```

No Linux, use `.venv/bin/python`. O `.env` é carregado automaticamente. O servidor usa Waitress, sem modo debug. Você pode definir `HOST` e `PORT`; por padrão, o acesso é local na porta 5000.

## Contas e unidades

O cadastro público vem fechado. Crie as contas pelo terminal:

```sh
docker compose run --rm hub flask --app backend.app create-user pesquisador@example.org --name "Pesquisador" --unit LACAM
docker compose run --rm hub flask --app backend.app set-units pesquisador@example.org --unit LACAM --unit LabNeuroMusc
docker compose run --rm hub flask --app backend.app reset-password pesquisador@example.org
```

`set-units` substitui as unidades; sem `--unit`, remove todas. Por padrão, somente a administração inclui integrantes em unidades; integrantes podem sair das unidades atuais pelo perfil. A opção `SELF_SERVICE_UNITS=true` permite escolher unidades existentes no próprio perfil, mas não é recomendada. Somente a administração cria unidades e altera funções administrativas. No primeiro acesso, é obrigatório escolher o vínculo acadêmico ou profissional; a unidade é opcional e pode ser atribuída depois pela administração. Contas com perfil incompleto também recebem essa etapa ao entrar. O vínculo aparece no perfil. A opção "Esqueceu a senha?" envia um link temporário por e-mail quando o SMTP está configurado; a redefinição administrativa pelo terminal continua disponível. Redefinir a senha invalida as sessões anteriores.

`ALLOW_REGISTRATION=true` habilita o cadastro no formulário. Contas novas não recebem unidades nem privilégios. Senhas exigem pelo menos 12 caracteres; tentativas de login e cadastro têm limitação por IP e email.

## Banco e comunicação

As chamadas de equipe agora usam salas de voz próprias no navegador, com LiveKit local, controles de microfone/áudio e chamada minimizada. Veja [configuração, testes locais e requisitos para publicar](docs/chamadas-voz.md). Para iniciar o serviço de voz junto do Hub: `docker compose up -d --build hub voice`.

### Minijogos e ranking semanal

O ranking é compartilhado pelo banco PostgreSQL e vinculado ao ID da conta, inclusive quando duas pessoas têm o mesmo nome. A semana vai de segunda a domingo em `America/Sao_Paulo`; a data do servidor determina em qual semana entra a partida concluída. Semanas anteriores continuam guardadas, mas a interface mostra a atual. Pontos antigos do `localStorage` não são importados porque não têm data ou identificação confiável da partida.

Os endpoints autenticados são `POST /api/games/rounds`, `POST /api/games/scores` e `GET /api/games/ranking`. Cada partida recebe um token assinado, vinculado à conta, ao jogo e à versão da sessão, com validade de quatro horas. Reenvios da mesma partida não duplicam pontos, inclusive na virada da semana. A gravação usa travas transacionais; os documentos internos `_game_scores` não podem ser alterados pela API genérica. Não há migração de tabelas: os registros usam a tabela de documentos existente. O ranking omite contas excluídas ou bloqueadas e mostra o nome atual do perfil.

Os jogos executam no navegador e informam a conclusão ao servidor, que valida a partida e os valores de pontuação permitidos para cada jogo; o servidor não simula todas as jogadas. A interface confirma o salvamento e permite tentar novamente se houver falha de conexão. Ao abrir o ranking, ela aguarda os envios pendentes e oferece um botão para atualizar a lista.

### Recuperação de senha pelo Gmail

No `.env` local, defina `PUBLIC_ORIGIN` com o endereço público HTTPS do Hub (sem caminho), `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USERNAME` com o Gmail remetente e `SMTP_PASSWORD` com uma **senha de app** dessa conta. Para gerar a senha de app, ative a verificação em duas etapas e acesse <https://myaccount.google.com/apppasswords>. Não use a senha normal do Google e não publique esses valores. `SMTP_FROM` é opcional e, vazio, usa o próprio remetente. O Compose encaminha essas configurações ao backend. Recrie o serviço após preencher: `docker compose up -d --force-recreate hub`.

Para testar somente no computador, `PUBLIC_ORIGIN=http://127.0.0.1:5000` é aceito, mas o link só funciona nesse computador. Para outras pessoas, use o domínio HTTPS acessível a elas. Sem SMTP ou origem configurada, o botão explica que a recuperação ainda está em configuração e indica o suporte.

O link abre uma página de nova senha, vale 30 minutos e deixa de funcionar após uma redefinição, inclusive pelo terminal. Senhas exigem 12 a 256 caracteres. A API exige CSRF/origem válida, limita tentativas e responde de forma genérica para não informar se um e-mail está cadastrado. Tokens usam assinatura do servidor e a versão da sessão; a gravação é serializada por conta. O segredo do link fica no fragmento da URL, removido ao abrir, sem armazenamento no navegador. Nenhuma senha é enviada por e-mail. Falhas de envio geram um registro sem credenciais ou conteúdo da mensagem; verifique o SMTP se os e-mails não chegarem.

Contas e metadados de arquivos ficam em tabelas próprias. A tabela `documents` usa JSONB para preservar os formatos atuais de publicações, enquetes, comentários e notas. Registros são separados por coleção e identificador; nos murais privados, cada documento agrupa os itens de uma unidade. Essa é uma camada de compatibilidade com a interface, não um modelo relacional de dados clínicos.

O backend valida autoria, equipes e privilégios. O banco não é exposto ao navegador. A sessão usa cookie HttpOnly; escritas exigem token CSRF. Resumos de conversas são produzidos pelo servidor.

Os painéis consultam `/api/sync` a cada 5 segundos com a página visível. Não são WebSockets. A presença envia heartbeat a cada 30 segundos e expira após 90 segundos. Esta versão não tem paginação dos históricos; acrescente paginação antes de ampliar o volume de dados.

## Busca no header

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
| `STORAGE_DIR` | `./var/files` | Diretório na execução nativa |

Aumentar a configuração não cria espaço físico. Reserve disco para temporários, banco e backups. Disco cheio pode interromper um envio antes da cota. Não há upload retomável nesta versão.

Com Docker, os volumes são `postgres_data` e `lab_files`, prefixados pelo nome do projeto. Não execute `docker compose down -v` se quiser preservar os dados. Sem Docker, os arquivos ficam em `STORAGE_DIR`.

## Backup

Faça backup do banco e dos arquivos no mesmo período, preferencialmente com uploads pausados. Guarde uma cópia em outro disco e teste a restauração. Banco sem arquivos não recupera os anexos; arquivos sem banco perdem metadados e permissões.

```sh
docker compose exec database pg_dump -U labiomec -d labiomec -Fc -f /tmp/labiomec.dump
docker compose cp database:/tmp/labiomec.dump ./labiomec.dump
docker compose exec hub tar -czf /tmp/labiomec-files.tar.gz -C /data files
docker compose cp hub:/tmp/labiomec-files.tar.gz ./labiomec-files.tar.gz
```

Esses exemplos exigem espaço temporário e não substituem uma política de backup. Proteja também o `.env` e as credenciais administrativas.

## Testes

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

Testes HTTP usam um repositório em memória exclusivo dos testes. Cobrem login, CSRF, permissões, privacidade, mensagens, arquivos e cotas. O aplicativo real aceita somente PostgreSQL.

Para testar SQL, defina `TEST_DATABASE_URL` com um banco vazio exclusivo de testes. O teste cria tabelas, usa identificadores próprios e remove os registros criados. Nunca aponte para o banco do laboratório.

Para executar toda a suíte com um banco PostgreSQL temporário separado do banco do aplicativo:

```sh
docker compose run --rm --no-deps hub python -m backend.tests.run_postgres_tests
```

Esse comando exige permissão para criar bancos. Ele cria um banco com nome aleatório, executa os testes e remove apenas esse banco ao terminar. Nenhuma tabela do banco do laboratório é alterada por esse teste.

### Validação das correções de segurança

Na validação de 24/10/2026, a suíte Python completa passou: 169 testes executados, com 8 testes que exigem PostgreSQL real pulados porque não havia banco disponível. A execução direcionada às regressões de segurança, autenticação, administração, recuperação de senha, busca e ranking passou com 135 testes. `docker compose config --quiet` e a verificação de sintaxe dos módulos JavaScript ES também passaram.

Os testes `.cjs` não foram confirmados nesta validação: a tentativa de executar `backend/tests/test_activity_notifications.cjs` falhou porque o teste procurou `assets/activity-notifications.js` fora da pasta do projeto. A configuração precisa ser corrigida ou a execução feita na estrutura de diretórios esperada antes de considerar essa parte validada.

Foram executados 39 testes, incluindo busca e seus filtros de privacidade, upload, publicação, download e exclusão/restauração de demandas com PostgreSQL real, além das verificações de sintaxe. A interface não foi validada visualmente em navegador automatizado.

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

## Referências institucionais

Conteúdo baseado em https://sites.google.com/peb.ufrj.br/biomec/home e na página Sobre. LABMUSC/EEFD é uma referência relacionada. Conecta informa atualização em 2017. Instagram e PNIPE foram mantidos como links sem confirmação do conteúdo atual. O símbolo da interface não é um logotipo oficial da UFRJ.

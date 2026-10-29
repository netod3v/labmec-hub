# Chamadas de voz no navegador

A chamada da equipe funciona dentro do Hub, com interface própria: salas na lateral, participantes, destaque em quem fala, controles de microfone e saída de áudio. O botão no cabeçalho abre a interface; a conexão só começa ao clicar em **Entrar na sala** e permitir o microfone. O botão de minimizar preserva a chamada e mostra uma barra flutuante para restaurar, controlar o microfone ou sair. **Sair da chamada** encerra a conexão e libera o microfone.

## Componentes

- Flask autentica o integrante e autoriza cada sala.
- LiveKit Server `v1.13.10` transporta áudio e vídeo via WebRTC. Não há redirecionamento para Google Meet.
- LiveKit Client `2.23.0` é servido em `assets/vendor`, com licença Apache 2.0, e carregado apenas quando uma conexão é iniciada.
- Geral fica disponível aos integrantes autenticados. Salas de equipes seguem os vínculos do perfil; a administração também acessa as equipes padrão.
- O identificador da pessoa é o ID interno da conta. E-mail e credenciais não são enviados na lista de participantes.
- Os tokens de entrada são assinados no backend, duram cinco minutos e só autorizam publicar microfone e câmera e receber mídia naquela sala. Também autorizam compartilhar tela e enviar mensagens para os participantes da mesma sala. Não permitem administrar salas ou gravar chamadas.
- A presença vem das salas reais do LiveKit, sem marcar como conectado alguém que apenas abriu a janela. Contagens são atualizadas periodicamente e após entrar ou sair; os participantes da sala conectada e os indicadores de fala usam eventos do SDK.
- O logout encerra a conexão. A exclusão de uma conta também solicita ao LiveKit sua retirada das salas do Hub. Se o serviço de controle estiver indisponível, o cliente revalida o acesso nas consultas periódicas.

## Teste local com Docker

No `.env`, mantenha chaves próprias e aleatórias:

```dotenv
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_INTERNAL_URL=http://voice:7880
LIVEKIT_API_KEY=CHAVE_ALEATORIA
LIVEKIT_API_SECRET=SEGREDO_ALEATORIO_COM_PELO_MENOS_32_CARACTERES
```

Não coloque a chave secreta em `lab-config.js` ou em arquivos públicos. O Compose passa os valores ao backend e ao serviço de voz.

```sh
docker compose up -d --build hub voice
```

Acesse `http://127.0.0.1:5000`. O arquivo `livekit.yaml` anuncia `127.0.0.1` para mídia e o Compose publica sinalização, TCP e UDP somente no endereço local. Esta configuração serve para navegadores neste computador. Para uma verificação manual entre duas pessoas, use duas contas do Hub em perfis de navegador separados; não abra a mesma conta nas duas sessões da mesma sala, pois a identidade é única no LiveKit.

## Para publicar para a equipe

O modo local não conecta computadores externos. Antes de publicar:

1. Defina domínio HTTPS para o Hub e WSS para o LiveKit, com certificados válidos e proxy compatível com WebSocket.
2. Atualize `PUBLIC_ORIGIN`, `LIVEKIT_URL` e o IP anunciado em `livekit.yaml` para os endereços da implantação. O endereço interno é usado somente pelo backend.
3. Configure as portas TCP/UDP e firewall da hospedagem. Avalie TURN para redes com restrições de conectividade.
4. Mantenha as chaves somente no servidor. Use a configuração de produção apropriada do LiveKit; não exponha a configuração local diretamente.
5. Verifique com microfones reais, fones, navegadores e conexões da equipe. Os testes automatizados validam áudio simulado e pacotes recebidos; não representam uma medição de qualidade de som, latência ou memória de equipamentos reais.

Referências: [implantação LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/), [firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/) e [SDK de navegador](https://docs.livekit.io/reference/client-sdk-js/).

## Controles e limites

Microfone e saída de áudio podem ser selecionados nas configurações. Alguns navegadores controlam a saída apenas pelo sistema; nesse caso, o seletor fica indisponível com uma explicação. Se o navegador bloquear a reprodução automática, aparece **Ativar áudio da chamada**. Se o microfone estiver bloqueado, ausente ou ocupado, a pessoa entra para ouvir e escrever; uma orientação informa que ela está sem microfone.

São solicitados ao navegador cancelamento de eco, supressão de ruído e captura mono, sem ganho automático para evitar amplificar sons de fundo. Por padrão, o microfone passa também pelo RNNoise local antes da transmissão. O AudioWorklet e o modelo WASM são servidos pelo próprio Hub, sem enviar áudio a terceiros. O filtro é aplicado com o microfone silenciado durante a preparação, também ao ativá-lo após entrar apenas para ouvir. A troca de dispositivo reinicia o processador; sair libera os nós e os recursos criados por ele. Nas configurações, **Filtro de voz** permite usar somente a redução do navegador. Falhas de suporte ou carregamento preservam a chamada com o filtro nativo e informam o estado nas configurações.

Se a entrada padrão identificada for Mixagem estéreo, loopback ou saída de cabo virtual, a captura procura um microfone físico disponível. Uma seleção explícita do usuário é preservada. A escolha de dispositivo deve ser conferida quando a música vazar mesmo com fones. RNNoise reduz ruído de fundo, mas não garante retirar música alta ou canto misturado à fala; o efeito depende do equipamento e há um pequeno custo de processamento e latência. Não se deve prometer remoção total nem latência zero.

A publicação usa o preset de voz Opus, sem estéreo, com DTX e RED. Nenhum áudio é gravado ou armazenado pelo Hub nesta integração. O limite configurado nesta primeira instalação é de 30 participantes por sala; capacidade e consumo devem ser medidos no servidor de destino.

Os tokens expiram para novas conexões; uma chamada ativa é mantida pelo LiveKit. Os participantes podem continuar conversando com a janela minimizada enquanto usam o mural. Ao trocar de sala, a conexão anterior é encerrada antes da entrada na próxima.

## Câmera opcional

A câmera inicia desligada. O botão de câmera solicita permissão e mostra o vídeo na sala, com prévia local espelhada. Negar permissão não interrompe a voz. O seletor nas configurações permite trocar de câmera. A captura solicita 640×360 a 24 fps, com qualidade adaptativa das assinaturas e dynacast.

Minimizar preserva voz e câmera enquanto a pessoa navega pelo Hub. A barra flutuante permite ligar/desligar a câmera sem reabrir a sala. Sair da chamada ou da conta encerra também a captura de vídeo. Nenhum vídeo é gravado pelo Hub.

## Conversa e tela compartilhada

O botão Conversa da sala abre mensagens de texto para quem está conectado. Enter envia; Shift+Enter quebra linha. O remetente vem da identidade autenticada no LiveKit, e o conteúdo é exibido como texto. São aceitos até 2.000 caracteres, com no máximo 100 mensagens na memória da sessão. Não há histórico no servidor, entrega retroativa nem garantia de entrega para quem se desconectou. Ao sair ou trocar de sala, a conversa local é limpa. A barra minimizada indica mensagens novas.

Compartilhar tela abre o seletor nativo de janela, aba ou monitor. A captura solicita até 720p/15 fps e não inclui áudio do sistema. A prévia oferece Ampliar tela quando o navegador suporta tela cheia. Cancelar o seletor preserva a chamada. Parar de compartilhar no Hub ou no navegador libera a captura. Minimizar o Hub preserva o compartilhamento. Navegadores sem getDisplayMedia mostram o controle indisponível.

## Transcrição e resumo com IA: ainda não ativados

A integração atual não transcreve nem envia áudio para um provedor de IA. LiveKit Agents admite provedores existentes de reconhecimento de fala e modelos para resumos, incluindo Gemini. A etapa depende de criar a conta do provedor e configurar sua chave privada no servidor. Depois disso, é necessário integrar o agente, indicar a transcrição ativa para os participantes e definir acesso e retenção das transcrições antes de ativar o recurso. Não colocar chaves no frontend ou no chat.

Referências: https://docs.livekit.io/transport/data/packets/ , https://docs.livekit.io/transport/media/screenshare/ , https://docs.livekit.io/agents/ , https://docs.livekit.io/agents/models/stt/gemini/ .

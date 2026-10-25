const topic='hub.call.chat.v1';
export function decodeCallMessage(payload){
  if(!(payload instanceof Uint8Array)||payload.byteLength>9000)return null;
  try{
    const item=JSON.parse(new TextDecoder().decode(payload));
    if(typeof item.id!=='string'||!item.id||item.id.length>80||typeof item.text!=='string'||!item.text.trim()||item.text.length>2000)return null;
    return {id:item.id,text:item.text.trim()};
  }catch{return null;}
}

export function initializeCallCollaboration({stage,dock,message,profile}){
  let room=null,screenBusy=false,sending=false,unread=0;
  const entries=[],screens=new Map();
  const content=stage.querySelector('.voice-content');
  const workspace=document.createElement('div');workspace.className='voice-workspace';content.before(workspace);workspace.append(content);
  const screenHost=document.createElement('div');screenHost.className='voice-screens';content.prepend(screenHost);
  const chat=document.createElement('aside');chat.className='voice-chat';chat.hidden=true;
  chat.innerHTML='<header><strong>Conversa da sala</strong><button type="button" data-chat-close aria-label="Fechar conversa">×</button></header><p class="voice-chat-note">Mensagens ao vivo, visíveis a quem está nesta sala. Não ficam salvas após sair.</p><div class="voice-chat-log" role="log" aria-label="Mensagens da chamada" aria-live="polite"><p data-chat-empty>Nenhuma mensagem ainda. Pode escrever por aqui, mesmo sem microfone.</p></div><form class="voice-chat-form"><label for="call-chat-message">Mensagem para a sala</label><textarea id="call-chat-message" maxlength="2000" rows="2" placeholder="Escreva sua mensagem…"></textarea><button class="btn btn-primary" type="submit">Enviar</button><span data-chat-status role="status"></span></form>';
  workspace.append(chat);
  const chatNote=chat.querySelector('.voice-chat-note');chatNote.title=chatNote.textContent;chatNote.textContent='Só nesta sala · mensagens temporárias';
  const sendButton=chat.querySelector('[type=submit]');sendButton.setAttribute('aria-label','Enviar mensagem para a sala');sendButton.innerHTML='<span>Enviar</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8ZM7 12h14"/></svg>';
  const screenButton=document.createElement('button');screenButton.type='button';screenButton.dataset.screen='';screenButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4M8 10l4-4 4 4M12 6v8"/></svg>';
  const chatButton=document.createElement('button');chatButton.type='button';chatButton.dataset.chatToggle='';chatButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h18v14H8l-5 4zM7 7h10M7 11h7"/></svg><span class="voice-chat-count" hidden></span>';
  const controls=stage.querySelector('.voice-controls');controls.insertBefore(screenButton,controls.querySelector('[data-settings]'));controls.insertBefore(chatButton,screenButton.nextSibling);
  const dockChat=chatButton.cloneNode(true);dockChat.dataset.dockChat='';dock.insertBefore(dockChat,dock.querySelector('[data-dock-leave]'));
  const input=chat.querySelector('textarea'),form=chat.querySelector('form'),log=chat.querySelector('[role=log]'),status=chat.querySelector('[data-chat-status]');
  input.rows=1;
  function showChat(open=true){
    chat.hidden=!open;workspace.classList.toggle('is-chat-open',open);
    if(open){unread=0;log.scrollTop=log.scrollHeight;input.focus({preventScroll:true});}else if(chat.contains(document.activeElement))chatButton.focus({preventScroll:true});update();
  }
  function detachScreen(uid){const item=screens.get(uid);if(!item)return;item.track.detach(item.video);item.video.pause();item.video.srcObject=null;item.card.remove();screens.delete(uid);}
  function renderScreens(){
    const people=room?[room.localParticipant,...room.remoteParticipants.values()]:[];
    const wanted=new Set();
    for(const person of people){
      const track=person.isScreenShareEnabled&&person.getTrackPublication(window.LivekitClient.Track.Source.ScreenShare)?.track;
      if(!track)continue;const uid=person.identity;wanted.add(uid);
      if(screens.get(uid)?.track===track)continue;detachScreen(uid);
      const card=document.createElement('section');card.className='voice-screen';
      const title=document.createElement('strong');title.textContent=(profile(uid)?.name||person.name||'Integrante')+' está compartilhando a tela';
      const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.setAttribute('aria-label',title.textContent);track.attach(video);
      const expand=document.createElement('button');expand.type='button';expand.textContent='Ampliar tela';expand.hidden=!card.requestFullscreen;expand.onclick=()=>card.requestFullscreen?.().catch(()=>message('Não foi possível ampliar a tela.'));
      card.append(title,video,expand);screenHost.append(card);screens.set(uid,{track,video,card});
    }
    for(const uid of screens.keys())if(!wanted.has(uid))detachScreen(uid);
  }
  function update(){
    const active=!!room;
    input.disabled=!active;form.querySelector('button').disabled=!active||sending||!input.value.trim();
    screenButton.disabled=!active||screenBusy||!navigator.mediaDevices?.getDisplayMedia;
    const sharing=!!room?.localParticipant.isScreenShareEnabled;
    screenButton.setAttribute('aria-pressed',String(sharing));screenButton.setAttribute('aria-label',sharing?'Parar de compartilhar tela':'Compartilhar tela');
    screenButton.title=navigator.mediaDevices?.getDisplayMedia?screenButton.getAttribute('aria-label'):'Compartilhamento de tela indisponível neste navegador';
    screenButton.classList.toggle('is-active',sharing);
    for(const button of [chatButton,dockChat]){
      button.setAttribute('aria-label',unread?`Conversa da sala: ${unread} novas mensagens`:'Conversa da sala');button.title=button.getAttribute('aria-label');button.setAttribute('aria-expanded',String(!chat.hidden));
      const count=button.querySelector('span');count.hidden=!unread;count.textContent=unread>99?'99+':String(unread);
    }
    renderScreens();
  }
  function append(item,person,local=false){
    const key=person.identity+'/'+item.id;if(entries.some(entry=>entry.key===key))return;
    const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<70;
    const row=document.createElement('article');row.className='voice-chat-entry';
    row.classList.toggle('is-local',local);
    const author=document.createElement('strong');author.textContent=(profile(person.identity)?.name||person.name||'Integrante')+(local?' (você)':'');
    const text=document.createElement('p');text.textContent=item.text;
    const time=document.createElement('time');time.textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const head=document.createElement('div');head.className='voice-chat-entry-head';head.append(author,time);
    row.append(head,text);log.querySelector('[data-chat-empty]')?.remove();log.append(row);entries.push({key,row});
    if(entries.length>100)entries.shift().row.remove();
    if(!local&&(chat.hidden||modalHidden()))unread++;
    if(nearBottom||local)log.scrollTop=log.scrollHeight;update();
  }
  const modalHidden=()=>stage.closest('.modal-overlay')?.classList.contains('hidden')||stage.closest('.modal-overlay')?.classList.contains('modal-closing');
  async function send(event){
    event.preventDefault();if(!room||sending)return;
    const text=input.value.trim();if(!text||text.length>2000)return;
    const current=room;const item={id:crypto.randomUUID(),text};sending=true;status.textContent='Enviando…';update();
    try{
      await current.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(item)),{reliable:true,topic});
      if(room!==current)return;append(item,current.localParticipant,true);if(input.value.trim()===text)input.value='';resizeInput();status.textContent='';
    }catch{if(room===current)status.textContent='Não foi possível enviar. Tente novamente.';}
    finally{if(room===current){sending=false;update();}}
  }
  screenButton.onclick=async()=>{
    if(!room||screenBusy)return;const current=room;screenBusy=true;update();
    try{
      await current.localParticipant.setScreenShareEnabled(!current.localParticipant.isScreenShareEnabled,{audio:false,resolution:{width:1280,height:720,frameRate:15}});
      if(room!==current)current.localParticipant.getTrackPublication(window.LivekitClient.Track.Source.ScreenShare)?.track?.stop();
    }catch(error){if(room===current)message(error.name==='NotAllowedError'?'Compartilhamento cancelado ou não autorizado. A chamada continua ativa.':'Não foi possível compartilhar a tela neste navegador.');}
    finally{if(room===current){screenBusy=false;update();}}
  };
  chatButton.onclick=()=>showChat(chat.hidden);chat.querySelector('[data-chat-close]').onclick=()=>showChat(false);
  dockChat.onclick=()=>{dock.querySelector('[data-restore]').click();showChat();};
  form.onsubmit=send;input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}};
  function resizeInput(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,112)+'px';}
  input.addEventListener('input',()=>{resizeInput();sendButton.disabled=!room||sending||!input.value.trim();});
  function receive(payload,person,kind,receivedTopic){if(!room||!person||receivedTopic!==topic)return;const item=decodeCallMessage(payload);if(item)append(item,person);}
  function release(){
    const previous=room;room=null;previous?.off(window.LivekitClient.RoomEvent.DataReceived,receive);
    for(const uid of screens.keys())detachScreen(uid);entries.length=0;unread=0;sending=false;screenBusy=false;input.value='';status.textContent='';
    log.replaceChildren();const empty=document.createElement('p');empty.dataset.chatEmpty='';empty.textContent='Nenhuma mensagem ainda. Pode escrever por aqui, mesmo sem microfone.';log.append(empty);update();
  }
  update();
  return {update,release,attach(candidate){release();room=candidate;candidate.on(window.LivekitClient.RoomEvent.DataReceived,receive);update();}};
}

import { initializeCallCollaboration } from './call-collaboration.js';
import { initializeCallMobileLayout } from './call-mobile-layout.js';
import { preferredPhysicalMicrophone,setVoiceNoiseFilter,releaseVoiceNoiseFilter } from './voice-noise-filter.js';
let sdkPromise;
function loadVoiceSDK(){
  if(window.LivekitClient)return Promise.resolve(window.LivekitClient);
  if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/assets/vendor/livekit-client.umd.min.js';
    script.onload=()=>resolve(window.LivekitClient);script.onerror=()=>{script.remove();sdkPromise=null;reject(new Error('Não foi possível carregar o áudio. Atualize a página.'));};document.head.append(script);
  });
  return sdkPromise;
}
const icons={camera:'<path d="M3 6h12v12H3zM15 10l6-4v12l-6-4"/>',mic:'<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',headphones:'<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H3zM17 13h4v8h-4z"/>',leave:'<path d="M9 5H4v14h5M13 7l5 5-5 5M8 12h13"/>',minimize:'<path d="M5 12h14"/>',speaker:'<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 3 2 2-1 4 3 2 3-1 2 3 3-2 3 1 2-3-1-3 2-3-3-2-1-3z"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;

export function initializeTeamVoice({request,getUid,profile,modal,openModal,closeModal,onPresence}){
  let rooms=[],available=false,selected='hub-geral',activeId=null,room=null,capture=null;
  let connected=false,joining=false,deafened=false,operation=0,refreshVersion=0,cameraBusy=false;
  const videoAttachments=new Map();
  const stage=modal.querySelector('#call-stage');
  stage.innerHTML=`<aside class="voice-sidebar"><div class="voice-brand"><span class="voice-brand-symbol">L</span><div><strong>LABIOMEC</strong><small>Espaço da equipe</small></div></div><h3>SALAS DE VOZ</h3><nav class="voice-rooms" aria-label="Salas de voz"></nav><p class="voice-sidebar-note">Um lugar para conversar,<br>trocar ideias e pesquisar juntos.</p></aside><section class="voice-main"><div class="voice-heading"><div><span class="voice-eyebrow">CONVERSA EM EQUIPE</span><h2 data-room-title>Geral</h2></div><span class="voice-connection" data-connection>Escolha uma sala</span></div><div class="voice-content"><div class="voice-people"></div><div class="voice-empty"><div class="voice-empty-icon">${icon('headphones')}</div><h3>Sua equipe, mais perto</h3><p>Entre na sala para conversar por voz, sem sair do Hub.</p></div><p class="voice-message" role="status" aria-live="polite"></p><button class="btn voice-play-audio" hidden type="button">${icon('speaker')}Ativar áudio da chamada</button></div><footer class="voice-footer"><div class="voice-self"><span class="voice-self-avatar"></span><div><strong data-self-name></strong><small data-self-status>Pronto para conversar</small></div></div><div class="voice-controls"><button type="button" data-mic aria-label="Desligar microfone" title="Microfone">${icon('mic')}</button><button type="button" data-camera aria-label="Ligar câmera" title="Câmera">${icon('camera')}</button><button type="button" data-deafen aria-label="Silenciar áudio da chamada" title="Áudio da chamada">${icon('headphones')}</button><button type="button" data-settings aria-label="Configurações da chamada" title="Configurações da chamada" aria-expanded="false">${icon('settings')}</button><button type="button" data-leave class="voice-leave" aria-label="Sair da chamada" title="Sair da chamada">${icon('leave')}</button><button type="button" data-join class="btn btn-primary">Entrar na sala</button></div></footer><div class="voice-settings" hidden><label>Microfone<select data-input><option value="default">Padrão do sistema</option></select></label><label>Câmera<select data-camera-input><option value="default">Padrão do sistema</option></select></label><label>Saída de áudio<select data-output><option value="default">Padrão do sistema</option></select></label><p>Redução de ruído, cancelamento de eco e ajuste de volume do microfone são solicitados ao navegador.</p></div></section>`;
  const $=selector=>stage.querySelector(selector);
  const elements={list:$('.voice-rooms'),people:$('.voice-people'),empty:$('.voice-empty'),message:$('.voice-message'),title:$('[data-room-title]'),connection:$('[data-connection]'),mic:$('[data-mic]'),camera:$('[data-camera]'),cameraInput:$('[data-camera-input]'),deafen:$('[data-deafen]'),leave:$('[data-leave]'),join:$('[data-join]'),settings:$('.voice-settings'),input:$('[data-input]'),output:$('[data-output]'),play:$('.voice-play-audio')};
  const audioHost=document.createElement('div');audioHost.className='voice-audio-host';document.body.append(audioHost);
  const dock=document.createElement('div');dock.className='voice-dock';dock.hidden=true;
  dock.innerHTML=`<button type="button" data-restore><span class="voice-dock-dot"></span><span><strong>Chamada em equipe</strong><small></small></span></button><button type="button" data-dock-mic aria-label="Microfone">${icon('mic')}</button><button type="button" data-dock-camera aria-label="Ligar câmera">${icon('camera')}</button><button type="button" data-dock-leave aria-label="Sair da chamada">${icon('leave')}</button>`;document.body.append(dock);
  const message=(text='')=>{elements.message.textContent=text;};
  const collaboration=initializeCallCollaboration({stage,dock,message,profile});
  const mobileLayout=initializeCallMobileLayout({stage,modal,onSelectRoom:id=>{selected=id;message();update();}});
  const filterLabel=document.createElement('label');filterLabel.textContent='Filtro de voz';
  const filterMode=document.createElement('select');filterMode.setAttribute('aria-label','Filtro de voz');filterMode.append(new Option('Reforçado · reduzir sons de fundo','voice'),new Option('Somente redução do navegador','browser'));filterLabel.append(filterMode);
  elements.settings.prepend(filterLabel);
  elements.settings.querySelector('p').textContent='O filtro reforçado prioriza a voz. Para evitar transmitir música, selecione seu microfone em vez de Mixagem estéreo ou entradas de áudio do sistema.';
  const filterStatus=document.createElement('p');filterStatus.setAttribute('role','status');filterStatus.textContent='O filtro reforçado será aplicado ao microfone ao entrar.';elements.settings.append(filterStatus);
  function microphoneOptions(){return {echoCancellation:true,noiseSuppression:true,autoGainControl:false,channelCount:1,sampleRate:48000,...(elements.input.value!=='default'?{deviceId:elements.input.value}:{})};}
  async function createMicrophone(sdk,options){
    const track=await sdk.createLocalAudioTrack(options);
    try{
      if(elements.input.value==='default'&&navigator.mediaDevices?.enumerateDevices){
        const device=preferredPhysicalMicrophone(await navigator.mediaDevices.enumerateDevices(),track.mediaStreamTrack?.getSettings().deviceId);
        if(device){await track.restartTrack({...options,deviceId:device.deviceId});if(![...elements.input.options].some(option=>option.value===device.deviceId))elements.input.append(new Option(device.label,device.deviceId));elements.input.value=device.deviceId;}
      }
      return track;
    }catch(error){track.stop();throw error;}
  }
  async function applyVoiceFilter(track){
    filterMode.disabled=true;filterStatus.textContent='Preparando filtro de voz…';
    try{const active=await setVoiceNoiseFilter(track,filterMode.value==='voice');filterStatus.textContent=active?'Filtro de voz reforçado ativo neste microfone.':'Redução de ruído do navegador ativa.';}
    catch{filterStatus.textContent='O filtro reforçado não está disponível. A chamada usa a redução de ruído do navegador.';}
    finally{filterMode.disabled=false;}
  }
  filterMode.onchange=()=>{const track=room?.localParticipant.getTrackPublication(window.LivekitClient.Track.Source.Microphone)?.track;if(track)applyVoiceFilter(track);else filterStatus.textContent=filterMode.value==='voice'?'O filtro reforçado será aplicado ao microfone ao entrar.':'Será usada a redução de ruído do navegador.';};
  const nameFor=uid=>profile(uid)?.name||'Integrante';
  const initials=name=>name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').toUpperCase();
  function avatar(node,uid,name){
    node.replaceChildren();const photo=profile(uid)?.photo;
    if(photo){const img=document.createElement('img');img.src=photo;img.alt='';node.append(img);}else node.textContent=initials(name);
  }
  function detachVideo(uid){
    const attached=videoAttachments.get(uid);if(!attached)return;
    attached.track.detach(attached.video);attached.video.pause();attached.video.srcObject=null;attached.video.remove();videoAttachments.delete(uid);
  }
  function renderPeople(){
    const members=connected&&activeId===selected&&room?[room.localParticipant,...room.remoteParticipants.values()]:[];
    elements.empty.hidden=members.length>0;
    const wanted=new Set(members.map(person=>person.identity));
    for(const [uid,attached] of videoAttachments){
      if(!wanted.has(uid)){detachVideo(uid);}
    }
    for(const card of elements.people.children){if(!wanted.has(card.dataset.voiceUid))card.remove();}
    for(const person of members){
      const uid=person.identity,name=profile(uid)?.name||person.name||'Integrante';
      let card=[...elements.people.children].find(item=>item.dataset.voiceUid===uid);
      if(!card){
        card=document.createElement('article');card.className='voice-person';card.dataset.voiceUid=uid;
        const picture=document.createElement('div');picture.className='voice-avatar';
        const title=document.createElement('strong');
        const state=document.createElement('span');state.className='voice-person-state';
        card.append(picture,title,state);elements.people.append(card);
      }
      card.classList.toggle('is-speaking',person.isSpeaking&&!deafened);
      avatar(card.querySelector('.voice-avatar'),uid,name);
      card.querySelector('strong').textContent=name+(person.isLocal?' (voc\u00ea)':'');
      card.querySelector('.voice-person-state').textContent=person.isMicrophoneEnabled?'Microfone ligado':'Microfone desligado';
      const publication=person.getTrackPublication(window.LivekitClient.Track.Source.Camera);
      const track=person.isCameraEnabled&&publication?.track;
      const attached=videoAttachments.get(uid);
      if(attached?.track!==track)detachVideo(uid);
      if(track&&!videoAttachments.has(uid)){
        const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;
        video.className='voice-video';video.classList.toggle('is-local',person.isLocal);
        video.setAttribute('aria-label','C\u00e2mera de '+name);
        track.attach(video);card.prepend(video);videoAttachments.set(uid,{track,video});
      }
      card.classList.toggle('has-video',!!track);
    }
    if(!members.length){
      const preview=rooms.find(item=>item.id===selected)?.participants||[];
      $('.voice-empty h3').textContent=preview.length?`${preview.length} ${preview.length===1?'pessoa nesta sala':'pessoas nesta sala'}`:'Sua equipe, mais perto';
      $('.voice-empty p').textContent=preview.length?preview.map(person=>person.name).join(', '):'Entre na sala para conversar por voz, sem sair do Hub.';
    }
  }
  function update(){
    mobileLayout.syncRooms(rooms,selected);
    elements.list.replaceChildren();
    for(const item of rooms){
      const button=document.createElement('button');button.type='button';button.className='voice-room';button.setAttribute('aria-pressed',String(item.id===selected));
      const symbol=document.createElement('span');symbol.className='voice-room-symbol';symbol.innerHTML=icon('speaker');
      const name=document.createElement('span');name.textContent=item.label;
      const count=document.createElement('small');count.textContent=String(item.count||0);
      button.append(symbol,name,count);button.onclick=()=>{selected=item.id;message();update();};elements.list.append(button);
    }
    const current=rooms.find(item=>item.id===selected);
    elements.title.textContent=current?.label||'Geral';
    elements.connection.textContent=joining?'Conectando…':connected?(activeId===selected?'Voz conectada':'Você está em '+(rooms.find(item=>item.id===activeId)?.label||'outra sala')):'Sala de voz';
    elements.connection.classList.toggle('is-connected',connected);
    const muted=!room?.localParticipant.isMicrophoneEnabled;
    elements.mic.disabled=!connected||joining;elements.deafen.disabled=!connected||joining;elements.leave.hidden=!connected&&!joining;
    elements.mic.setAttribute('aria-pressed',String(muted));elements.mic.setAttribute('aria-label',muted?'Ligar microfone':'Desligar microfone');elements.mic.classList.toggle('is-off',muted);
    elements.deafen.setAttribute('aria-pressed',String(deafened));elements.deafen.classList.toggle('is-off',deafened);
    elements.join.hidden=connected&&activeId===selected;
    elements.join.disabled=joining||!available||!current;
    elements.join.textContent=joining?'Conectando…':connected?'Trocar para esta sala':'Entrar na sala';
    const myName=nameFor(getUid());$('[data-self-name]').textContent=myName;avatar($('.voice-self-avatar'),getUid(),myName);
    $('[data-self-status]').textContent=joining?'Preparando áudio…':connected?(muted?'Microfone desligado':'Microfone ligado'):'Pronto para conversar';
    dock.querySelector('small').textContent=rooms.find(item=>item.id===activeId)?.label||'Conectando…';
    dock.classList.toggle('is-connecting',joining);
    dock.querySelector('[data-restore]').setAttribute('aria-label',`${joining?'Conectando à chamada':'Voltar à chamada'} · ${dock.querySelector('small').textContent}`);
    dock.querySelector('[data-dock-mic]').classList.toggle('is-off',muted);dock.querySelector('[data-dock-mic]').setAttribute('aria-label',muted?'Ligar microfone':'Desligar microfone');
    dock.querySelector('[data-dock-mic]').setAttribute('aria-pressed',String(!muted));
    const cameraOn=!!room?.localParticipant.isCameraEnabled;
    for(const button of [elements.camera,dock.querySelector('[data-dock-camera]')]){
      button.disabled=!connected||joining||cameraBusy;
      button.classList.toggle('is-off',!cameraOn);
      button.setAttribute('aria-pressed',String(cameraOn));
      button.setAttribute('aria-label',cameraBusy?'Preparando c\u00e2mera':cameraOn?'Desligar c\u00e2mera':'Ligar c\u00e2mera');
      button.title=button.getAttribute('aria-label');
    }
    renderPeople();collaboration.update();
  }
  function release(){
    const previous=room;room=null;connected=false;activeId=null;collaboration.release();
    cameraBusy=false;for(const uid of videoAttachments.keys())detachVideo(uid);
    releaseVoiceNoiseFilter(capture);capture?.stop();capture=null;
    if(previous){previous.localParticipant.trackPublications.forEach(publication=>publication.track?.stop());Promise.resolve(previous.disconnect()).catch(()=>{});}
    audioHost.querySelectorAll('audio').forEach(audio=>{audio.pause();audio.srcObject=null;audio.remove();});
    deafened=false;dock.hidden=true;elements.play.hidden=true;
  }
  function leave(){operation++;joining=false;release();update();refresh();}
  async function refresh(){
    const uid=getUid(),version=++refreshVersion;if(!uid)return;
    try{
      const result=await request('/calls/rooms');
      if(uid!==getUid()||version!==refreshVersion)return;
      rooms=result.rooms||[];available=result.available;
      if(!rooms.some(item=>item.id===selected))selected=rooms[0]?.id||'hub-geral';
      if(connected&&!rooms.some(item=>item.id===activeId)){leave();message('Seu acesso às salas foi atualizado. Escolha uma sala disponível.');}
      else if(!available)message(result.message||'O serviço de voz está indisponível.');
      const members=new Map();rooms.forEach(item=>(item.participants||[]).forEach(person=>members.set(person.uid,person)));
      onPresence([...members.values()]);update();
    }catch(error){if(uid===getUid()&&version===refreshVersion){message(error.message);}}
  }
  function removeAudio(predicate){
    audioHost.querySelectorAll('audio').forEach(audio=>{if(predicate(audio)){audio.pause();audio.srcObject=null;audio.remove();}});
  }
  function attachAudio(track,participant){
    if([...audioHost.querySelectorAll('audio')].some(audio=>audio.dataset.voiceTrack===track.sid))return;
    const audio=track.attach();audio.autoplay=true;audio.muted=deafened;audio.dataset.voiceTrack=track.sid||'';
    audio.dataset.voiceParticipant=participant.identity;
    if(elements.output.value!=='default'&&audio.setSinkId)audio.setSinkId(elements.output.value).catch(()=>{});
    audioHost.append(audio);
    renderPeople();
  }
  async function join(){
    if(joining||!getUid())return;
    const uid=getUid(),target=selected,run=++operation;joining=true;release();update();message('Preparando o microfone…');
    let candidate,track,microphoneWarning='';
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('O microfone exige HTTPS ou acesso por localhost neste computador.');
      const authorization=await request('/calls/join',{method:'POST',body:JSON.stringify({room:target})});
      const sdk=await loadVoiceSDK();
      if(run!==operation||uid!==getUid())return;
      const audioOptions=microphoneOptions();
      try{track=await createMicrophone(sdk,audioOptions);}
      catch(error){
        if(!['NotAllowedError','NotFoundError','NotReadableError','SecurityError'].includes(error.name))throw error;
        microphoneWarning='Voc\u00ea entrou sem microfone. Pode ouvir a chamada e usar a conversa da sala. Para falar, ative o microfone.';
      }
      if(run!==operation||uid!==getUid()){track?.stop();return;}
      if(track)await track.mute();
      if(run!==operation||uid!==getUid()){track?.stop();return;}
      candidate=new sdk.Room({adaptiveStream:true,dynacast:true,videoCaptureDefaults:{resolution:{width:640,height:360,frameRate:24}},audioCaptureDefaults:audioOptions,publishDefaults:{audioPreset:sdk.AudioPresets.speech,dtx:true,red:true,forceStereo:false}});
      room=candidate;capture=track;activeId=target;
      const redraw=()=>{if(room===candidate)update();};
      for(const event of [sdk.RoomEvent.ParticipantConnected,sdk.RoomEvent.TrackMuted,sdk.RoomEvent.TrackUnmuted,sdk.RoomEvent.LocalTrackPublished,sdk.RoomEvent.LocalTrackUnpublished])candidate.on(event,redraw);
      candidate.on(sdk.RoomEvent.ParticipantDisconnected,person=>{if(room===candidate){removeAudio(audio=>audio.dataset.voiceParticipant===person.identity);redraw();}});
      candidate.on(sdk.RoomEvent.ActiveSpeakersChanged,speakers=>{
        if(room!==candidate)return;
        const active=new Set(speakers.map(person=>person.identity));
        elements.people.querySelectorAll('[data-voice-uid]').forEach(card=>card.classList.toggle('is-speaking',active.has(card.dataset.voiceUid)));
      });
      candidate.on(sdk.RoomEvent.TrackSubscribed,(remote,publication,person)=>{if(room!==candidate)return;if(remote.kind===sdk.Track.Kind.Audio)attachAudio(remote,person);else redraw();});
      candidate.on(sdk.RoomEvent.TrackUnsubscribed,(remote,publication)=>{if(room===candidate)removeAudio(audio=>audio.dataset.voiceTrack===(remote.sid||publication.trackSid));remote.detach().forEach(element=>element.remove());if(room===candidate)redraw();});
      candidate.on(sdk.RoomEvent.AudioPlaybackStatusChanged,()=>{if(room===candidate)elements.play.hidden=candidate.canPlaybackAudio;});
      candidate.on(sdk.RoomEvent.Reconnecting,()=>{if(room===candidate){message('Reconectando à sala…');elements.connection.textContent='Reconectando…';}});
      candidate.on(sdk.RoomEvent.Reconnected,()=>{if(room===candidate){message();update();refresh();}});
      candidate.on(sdk.RoomEvent.Disconnected,()=>{if(room===candidate&&connected){operation++;joining=false;release();update();message('A chamada foi encerrada. Você pode entrar novamente.');refresh();}});
      await candidate.connect(authorization.url,authorization.token);
      if(run!==operation||uid!==getUid()){releaseVoiceNoiseFilter(track);track?.stop();await candidate.disconnect();return;}
      if(track){
        await candidate.localParticipant.publishTrack(track,{source:sdk.Track.Source.Microphone});
        await applyVoiceFilter(track);
        if(run===operation&&uid===getUid())await track.unmute();
      }
      if(run!==operation||uid!==getUid()){releaseVoiceNoiseFilter(track);track?.stop();await candidate.disconnect();return;}
      connected=true;joining=false;collaboration.attach(candidate);message(microphoneWarning);update();devices();refresh();
      if(modal.classList.contains('hidden'))dock.hidden=false;
      await candidate.startAudio().catch(()=>{elements.play.hidden=false;});
    }catch(error){
      releaseVoiceNoiseFilter(track);track?.stop();if(candidate)Promise.resolve(candidate.disconnect()).catch(()=>{});
      if(run!==operation||uid!==getUid())return;
      joining=false;release();update();
      const reason=error.name==='NotAllowedError'?'Permita o acesso ao microfone para entrar na sala.':error.name==='NotFoundError'?'Nenhum microfone foi encontrado. Conecte um dispositivo e tente novamente.':error.name==='NotReadableError'?'O microfone está sendo usado por outro aplicativo. Verifique e tente novamente.':'Não foi possível entrar na sala. '+(error.message||'Tente novamente.');
      message(reason);
    }
  }
  async function mute(){
    if(!connected||!room)return;
    const current=room;
    let fresh;
    try{
      const sdk=await loadVoiceSDK();
      if(!current.localParticipant.getTrackPublication(sdk.Track.Source.Microphone)?.track){
        fresh=await createMicrophone(sdk,microphoneOptions());await fresh.mute();
        if(room!==current){fresh.stop();return;}
        capture=fresh;await current.localParticipant.publishTrack(fresh,{source:sdk.Track.Source.Microphone});await applyVoiceFilter(fresh);
        if(room!==current){releaseVoiceNoiseFilter(fresh);fresh.stop();return;}
        await fresh.unmute();
      }else await current.localParticipant.setMicrophoneEnabled(!current.localParticipant.isMicrophoneEnabled);
      if(room===current)update();
    }
    catch{if(fresh){releaseVoiceNoiseFilter(fresh);fresh.stop();if(capture===fresh)capture=null;}message('Não foi possível alterar o microfone. Verifique as permissões do navegador.');}
  }
  async function toggleCamera(){
    if(!connected||!room||cameraBusy)return;
    const current=room,run=operation;cameraBusy=true;update();message();
    try{
      await current.localParticipant.setCameraEnabled(!current.localParticipant.isCameraEnabled,
        elements.cameraInput.value==='default'?{}:{deviceId:elements.cameraInput.value});
      if(room!==current||operation!==run){
        current.localParticipant.videoTrackPublications.forEach(publication=>publication.track?.stop());return;
      }
      devices();
    }catch(error){
      if(room===current&&operation===run)message(error.name==='NotAllowedError'?'Permita o acesso \u00e0 c\u00e2mera no navegador. Sua chamada de voz continua ativa.':error.name==='NotFoundError'?'Nenhuma c\u00e2mera encontrada. Conecte uma c\u00e2mera e tente novamente.':'N\u00e3o foi poss\u00edvel ligar a c\u00e2mera. Verifique se outro aplicativo est\u00e1 usando o dispositivo.');
    }finally{if(room===current&&operation===run){cameraBusy=false;update();}}
  }
  async function devices(){
    if(!navigator.mediaDevices?.enumerateDevices)return;
    try{
      const list=await navigator.mediaDevices.enumerateDevices();
      for(const [select,kind,label] of [[elements.cameraInput,'videoinput','C\u00e2mera'],[elements.input,'audioinput','Microfone'],[elements.output,'audiooutput','Saída']]){
        const selected=select.value;select.replaceChildren(new Option('Padrão do sistema','default'));
        list.filter(item=>item.kind===kind&&item.deviceId!=='default').forEach((item,index)=>select.append(new Option(item.label||label+' '+(index+1),item.deviceId)));
        if([...select.options].some(option=>option.value===selected))select.value=selected;
      }
      elements.output.disabled=!('setSinkId' in HTMLMediaElement.prototype);
      elements.output.title=elements.output.disabled?'A saída de áudio é controlada pelo sistema neste navegador.':'';
    }catch{message('Não foi possível listar os dispositivos de áudio.');}
  }
  elements.join.onclick=join;elements.leave.onclick=leave;elements.mic.onclick=mute;elements.camera.onclick=toggleCamera;
  elements.deafen.onclick=()=>{deafened=!deafened;audioHost.querySelectorAll('audio').forEach(audio=>{audio.muted=deafened;});update();};
  elements.play.onclick=()=>room?.startAudio().then(()=>{elements.play.hidden=true;}).catch(()=>message('O navegador não conseguiu reproduzir o áudio. Verifique a saída selecionada.'));
  $('[data-settings]').onclick=()=>{elements.settings.hidden=!elements.settings.hidden;$('[data-settings]').setAttribute('aria-expanded',String(!elements.settings.hidden));if(!elements.settings.hidden)devices();};
  elements.input.onchange=async()=>{try{await room?.switchActiveDevice('audioinput',elements.input.value);}catch{message('Não foi possível selecionar esse microfone.');}};
  elements.cameraInput.onchange=async()=>{const current=room;try{if(current?.localParticipant.isCameraEnabled)await current.switchActiveDevice('videoinput',elements.cameraInput.value);}catch{message('N\u00e3o foi poss\u00edvel selecionar essa c\u00e2mera.');}};
  elements.output.onchange=async()=>{try{await Promise.all([...audioHost.querySelectorAll('audio')].map(audio=>audio.setSinkId(elements.output.value)));}catch{message('Não foi possível selecionar essa saída de áudio.');}};
  dock.querySelector('[data-restore]').onclick=()=>open();dock.querySelector('[data-dock-mic]').onclick=mute;dock.querySelector('[data-dock-camera]').onclick=toggleCamera;dock.querySelector('[data-dock-leave]').onclick=leave;
  function open(){if(!getUid())return;dock.hidden=true;openModal(modal);update();devices();refresh();modal.querySelector('#call-modal-close')?.focus({preventScroll:true});}
  function minimize(){mobileLayout.close();closeModal(modal);dock.hidden=!connected&&!joining;}
  modal.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(element=>!element.disabled&&!element.closest('[inert]')&&element.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  const timer=setInterval(()=>{if(getUid()&&(!document.hidden||connected))refresh();},15000);
  window.addEventListener('pagehide',()=>{operation++;joining=false;release();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&getUid())refresh();});
  return {open,minimize,refresh,leave,clear(){operation++;refreshVersion++;joining=false;release();rooms=[];available=false;closeModal(modal);onPresence([]);},get connected(){return connected;}};
}

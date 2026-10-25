const KEY='labiomec_preferences_v1';
const defaults={autoplay:false,loop:false,reduceMotion:false};
let values={...defaults};
try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}');for(const key of Object.keys(defaults))if(typeof saved[key]==='boolean')values[key]=saved[key];}catch{}
export const getPreferences=()=>({...values});
export const prefersReducedMotion=()=>values.reduceMotion||matchMedia('(prefers-reduced-motion:reduce)').matches;
export function setPreference(key,value){
 if(!(key in defaults)||typeof value!=='boolean')return;
 values={...values,[key]:value};
 try{localStorage.setItem(KEY,JSON.stringify(values));}catch{}
 document.documentElement.classList.toggle('hub-reduce-motion',values.reduceMotion);
 if(values.reduceMotion)document.getAnimations().forEach(animation=>{try{animation.finish();}catch{animation.cancel();}});
 window.dispatchEvent(new CustomEvent('hub:preferences-change',{detail:getPreferences()}));
}
document.documentElement.classList.toggle('hub-reduce-motion',values.reduceMotion);

export function initializeMediaPreferences(){
 const states=new Map();let scheduled=false,discoveryScheduled=false,current=null,lastAutoplay=values.autoplay;
 const selector='video[data-post-video],video.media-viewer-video';
 function pause(video,state){if(!video.paused){state.internalPause=true;video.pause();}if(current===video)current=null;state.automatic=false;}
 function eligible(video,state){
  const viewer=video.closest('dialog');
  return values.autoplay&&!document.hidden&&!video.hidden&&state.visible&&!state.manualPause&&
   (!document.documentElement.classList.contains('mobile-more-open')||viewer?.open)&&
   (!viewer||viewer.open)&&(!document.querySelector('dialog[open],.modal-overlay:not(.hidden):not(.modal-closing)')||viewer?.open)&&video.getClientRects().length;
 }
 function sync(){
  scheduled=false;
  for(const [video,state] of states){
   if(!video.isConnected){pause(video,state);observer.unobserve(video);state.abort.abort();states.delete(video);continue;}
   const source=video.currentSrc||video.src||video.querySelector('source')?.src||'';
   if(state.source!==source){state.source=source;state.manualPause=false;}
   if(state.loopPreference!==values.loop){video.loop=values.loop;state.loopPreference=values.loop;}
   const loopButton=video.closest('dialog')?.querySelector('[data-loop]');
   if(loopButton){loopButton.setAttribute('aria-pressed',String(video.loop));loopButton.title=video.loop?'Desativar loop':'Ativar loop';const label=loopButton.querySelector('span'),text=video.loop?'Loop ativo':'Loop';if(label&&label.textContent!==text)label.textContent=text;}
   if(!eligible(video,state)){if(state.automatic)pause(video,state);continue;}
   if(current&&current!==video&&!current.paused)continue;
   if(video.paused&&!state.pending){
    video.muted=true;video.playsInline=true;state.automatic=true;state.pending=true;current=video;
    Promise.resolve(video.play()).then(()=>{if(!eligible(video,state))pause(video,state);},()=>{state.automatic=false;state.manualPause=true;if(current===video)current=null;}).finally(()=>state.pending=false);
   }
  }
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(sync);}}
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){const state=states.get(entry.target);if(state)state.visible=entry.isIntersecting&&entry.intersectionRatio>=.6;}schedule();},{threshold:[0,.6,1]});
 function discover(){
  for(const video of document.querySelectorAll(selector))if(!states.has(video)){
   const state={visible:false,automatic:false,manualPause:false,internalPause:false,abort:new AbortController()};states.set(video,state);
   video.addEventListener('pause',()=>{if(state.internalPause)state.internalPause=false;else if(!video.ended){state.manualPause=true;state.automatic=false;}},{signal:state.abort.signal});
   video.addEventListener('play',()=>{if(!state.automatic){state.manualPause=false;for(const [other,s] of states)if(other!==video&&s.automatic)pause(other,s);current=video;}},{signal:state.abort.signal});
   observer.observe(video);
  }
  schedule();
 }
 new MutationObserver(records=>{
  const relevant=records.some(record=>record.type==='childList'||record.attributeName!=='class'||record.target===document.body||record.target.matches('.modal-overlay,#header-more-menu,#wrap-app'));
  if(relevant&&!discoveryScheduled){discoveryScheduled=true;requestAnimationFrame(()=>{discoveryScheduled=false;discover();});}
 }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden','src','class']});
 window.addEventListener('hub:preferences-change',()=>{if(values.autoplay&&!lastAutoplay)for(const state of states.values())state.manualPause=false;lastAutoplay=values.autoplay;schedule();});
 document.addEventListener('visibilitychange',schedule);discover();
}

export function initializeSettings({button,open,close,applyTheme,getTheme}){
 const modal=document.createElement('div');modal.id='settings-modal';modal.className='modal-overlay hidden';
 modal.innerHTML=`<section class="modal-box settings-box" role="dialog" aria-modal="true" aria-labelledby="settings-title">
 <div class="modal-head"><button class="modal-close settings-back" type="button" aria-label="Voltar à tela anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Voltar</span></button><div><strong id="settings-title">Configurações</strong><span>Deixe o Hub do seu jeito</span></div></div>
 <div class="settings-content"><h3>Reprodução</h3>
 <label class="settings-row"><span><strong>Reprodução automática</strong><small>Iniciar vídeos visíveis no mural e na visualização expandida, sem som. GIFs continuam animados.</small></span><input type="checkbox" role="switch" data-preference="autoplay"></label>
 <label class="settings-row"><span><strong>Repetir vídeos</strong><small>Recomeçar o vídeo quando chegar ao fim.</small></span><input type="checkbox" role="switch" data-preference="loop"></label>
 <h3>Aparência e acessibilidade</h3>
 <label class="settings-row"><span><strong>Tema</strong><small>Escolha as cores da interface.</small></span><select aria-label="Tema do Hub"><option value="light">Claro</option><option value="dark">Escuro</option><option value="black">Preto</option></select></label>
 <label class="settings-row"><span><strong>Reduzir animações</strong><small>Usar transições mais discretas. A preferência de acessibilidade do dispositivo também é respeitada.</small></span><input type="checkbox" role="switch" data-preference="reduceMotion"></label>
 <p class="settings-note">Preferências salvas automaticamente neste navegador. Os controles de reprodução não alteram chamadas.</p>
 <p class="settings-saved" role="status" aria-live="polite"></p></div></section>`;
 document.body.append(modal);
 const theme=modal.querySelector('select'),back=modal.querySelector('.modal-close');
 let restoreTimer;
 function goBack(){close(modal);clearTimeout(restoreTimer);restoreTimer=setTimeout(()=>{if(modal.classList.contains('hidden')&&(document.activeElement===document.body||modal.contains(document.activeElement))&&button.getClientRects().length&&!button.closest('[inert]'))button.focus({preventScroll:true});},260);}
 function sync(){theme.value=getTheme();modal.querySelectorAll('[data-preference]').forEach(input=>input.checked=values[input.dataset.preference]);}
 button.addEventListener('click',()=>{clearTimeout(restoreTimer);sync();modal.querySelector('.settings-saved').textContent='';open(modal);back.focus({preventScroll:true});});
 back.onclick=goBack;modal.addEventListener('click',event=>{if(event.target===modal)goBack();});
 modal.addEventListener('change',event=>{const input=event.target;if(input===theme)applyTheme(theme.value);else if(input.dataset.preference)setPreference(input.dataset.preference,input.checked);modal.querySelector('.settings-saved').textContent='Preferência salva.';});
 modal.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();goBack();}
  if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button,input,select')];const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
 });
 return {reset(){clearTimeout(restoreTimer);close(modal);}};
}

export function initializeNoteFullscreen({modal,button}){
  let busy=false;
  const active=()=>document.fullscreenElement===modal||modal.classList.contains('note-fullscreen');
  function sync(){const on=active();button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'Sair da tela cheia':'Entrar em tela cheia');button.title=button.getAttribute('aria-label');button.classList.toggle('is-fullscreen',on);button.disabled=busy;}
  async function exit(){modal.classList.remove('note-fullscreen');if(document.fullscreenElement===modal)await document.exitFullscreen();sync();}
  button.addEventListener('click',async()=>{
    if(busy)return;busy=true;sync();
    try{
      if(active())await exit();
      else if(document.fullscreenEnabled&&modal.requestFullscreen){try{await modal.requestFullscreen();}catch{modal.classList.add('note-fullscreen');}}
      else modal.classList.add('note-fullscreen');
    }finally{busy=false;sync();}
  });
  document.addEventListener('fullscreenchange',sync);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!active()||modal.querySelector('dialog[open]'))return;
    if(modal.classList.contains('note-fullscreen')){event.preventDefault();event.stopImmediatePropagation();exit();}
  },true);
  new MutationObserver(()=>{if(modal.matches('.hidden,.modal-closing')&&active())exit().catch(()=>{});}).observe(modal,{attributes:true,attributeFilter:['class']});
  sync();return {exit};
}

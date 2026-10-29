export function initializeNoteFullscreen({modal,button}){
  let busy=false,exitPromise=null;
  const ownsFullscreen=()=>!!document.fullscreenElement&&(document.fullscreenElement===modal||modal.contains(document.fullscreenElement));
  const active=()=>ownsFullscreen()||modal.classList.contains('note-fullscreen');
  function sync(){const on=active();button.setAttribute('aria-pressed',String(on));button.setAttribute('aria-label',on?'Sair da tela cheia':'Entrar em tela cheia');button.title=button.getAttribute('aria-label');button.classList.toggle('is-fullscreen',on);button.disabled=busy;}
  function exit(){
    if(exitPromise)return exitPromise;
    // Even removing an absent class can notify MutationObserver. Do not create
    // another mutation while the browser is still completing exitFullscreen.
    if(modal.classList.contains('note-fullscreen'))modal.classList.remove('note-fullscreen');
    if(!ownsFullscreen()){sync();return Promise.resolve();}
    exitPromise=Promise.resolve().then(()=>document.exitFullscreen()).catch(()=>{}).finally(()=>{exitPromise=null;sync();});
    return exitPromise;
  }
  function cleanup(){if(modal.matches('.hidden,.modal-closing')&&active())exit();}
  button.addEventListener('click',async()=>{
    if(busy)return;busy=true;sync();
    try{
      if(active())await exit();
      else if(document.fullscreenEnabled&&modal.requestFullscreen){try{await modal.requestFullscreen();}catch{if(!modal.matches('.hidden,.modal-closing'))modal.classList.add('note-fullscreen');}}
      else modal.classList.add('note-fullscreen');
    }finally{busy=false;cleanup();sync();}
  });
  document.addEventListener('fullscreenchange',()=>{sync();cleanup();});
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!active()||modal.querySelector('dialog[open]'))return;
    if(modal.classList.contains('note-fullscreen')){event.preventDefault();event.stopImmediatePropagation();exit();}
  },true);
  new MutationObserver(cleanup).observe(modal,{attributes:true,attributeFilter:['class']});
  sync();return {exit};
}

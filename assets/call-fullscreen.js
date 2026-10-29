export function initializeCallFullscreen({modal,button,onError=()=>{}}){
  let busy=false,exitPromise=null,wasFullscreen=!!document.fullscreenElement,lastExit=-Infinity;
  const supported=!!document.fullscreenEnabled&&typeof modal.requestFullscreen==='function';
  function exit(){
    if(exitPromise)return exitPromise;
    if(!document.fullscreenElement)return Promise.resolve();
    exitPromise=Promise.resolve().then(()=>document.exitFullscreen()).catch(()=>{}).finally(()=>{exitPromise=null;sync();});
    return exitPromise;
  }
  function cleanup(){
    const active=document.fullscreenElement;
    if(!active||!(active===modal||modal.contains(active))||!modal.matches('.hidden,.modal-closing')||exitPromise)return;
    exit();
  }
  function sync(){
    const active=!!document.fullscreenElement;
    if(wasFullscreen&&!active)lastExit=performance.now();
    wasFullscreen=active;
    button.classList.toggle('is-fullscreen',active);
    button.setAttribute('aria-pressed',String(active));
    button.setAttribute('aria-label',active?'Sair da tela cheia':'Entrar em tela cheia');
    button.title=supported?button.getAttribute('aria-label'):'Tela cheia indisponível neste navegador';
    button.disabled=!supported||busy;
  }
  button.addEventListener('click',async()=>{
    if(!supported||busy)return;
    busy=true;sync();
    try{
      if(document.fullscreenElement)await exit();
      else await modal.requestFullscreen();
    }catch{onError('Não foi possível ativar a tela cheia. Você pode continuar usando a chamada normalmente.');}
    finally{busy=false;cleanup();sync();}
  });
  document.addEventListener('fullscreenchange',()=>{sync();cleanup();});
  new MutationObserver(cleanup).observe(modal,{attributes:true,attributeFilter:['class']});
  sync();
  return {keepOpenOnEscape(){return !!document.fullscreenElement||performance.now()-lastExit<250;}};
}

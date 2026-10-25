export function initializeMobileComposer({getUid,profile,canOpen,isBusy}){
  const mobile=matchMedia('(max-width:720px)');
  const input=document.getElementById('msg-input'),composer=input.closest('.composer'),post=document.getElementById('post-btn');
  const anchor=document.createComment('mural-composer');composer.before(anchor);
  const postAnchor=document.createComment('mural-post-button');post.before(postAnchor);
  const originalLabel=post.textContent;
  const fab=document.createElement('button');fab.type='button';fab.className='mural-compose-fab';fab.id='mural-compose-fab';fab.setAttribute('aria-label','Criar publicação no mural');fab.setAttribute('aria-haspopup','dialog');fab.setAttribute('aria-expanded','false');fab.setAttribute('aria-controls','mobile-compose-page');fab.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const page=document.createElement('section');page.id='mobile-compose-page';page.className='mobile-compose-page';page.hidden=true;page.inert=true;page.setAttribute('role','dialog');page.setAttribute('aria-modal','true');page.setAttribute('aria-labelledby','mobile-compose-title');
  page.innerHTML='<div class="mobile-compose-heading"><button type="button" class="mobile-compose-back" aria-label="Voltar sem apagar o rascunho"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>Voltar</button><h2 id="mobile-compose-title">Nova publicação</h2></div><div class="mobile-compose-body"><div class="mobile-compose-author"><span class="mobile-compose-avatar"></span><div><strong></strong><small>Compartilhe com a equipe</small></div></div><div class="mobile-compose-host"></div></div>';
  document.body.append(fab,page);
  const back=page.querySelector('.mobile-compose-back'),heading=page.querySelector('.mobile-compose-heading');
  let opened=false,returnScroll=0,returnFocus=null;
  function syncViewport(){
    if(!opened)return;
    const viewport=window.visualViewport;
    page.style.height=(viewport?.height||window.innerHeight)+'px';
    page.style.top=(viewport?.offsetTop||0)+'px';page.style.bottom='auto';
  }
  function close(force=false){
    if(!opened||(!force&&isBusy()))return;
    opened=false;input.blur();postAnchor.after(post);anchor.after(composer);post.textContent=originalLabel;page.hidden=true;page.inert=true;
    document.documentElement.classList.remove('mobile-compose-open');document.body.classList.remove('mobile-compose-open','composer-focused');fab.setAttribute('aria-expanded','false');
    window.scrollTo({top:returnScroll,behavior:'instant'});
    if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});
  }
  function open(){
    if(opened||!mobile.matches||!getUid()||!canOpen())return;
    returnScroll=window.scrollY;returnFocus=document.activeElement;
    const user=profile()||{},name=user.name||'Você',avatar=page.querySelector('.mobile-compose-avatar');avatar.replaceChildren();
    if(user.photo){const img=document.createElement('img');img.src=user.photo;img.alt='';avatar.append(img);}else avatar.textContent=name.trim().slice(0,1).toUpperCase();
    page.querySelector('.mobile-compose-author strong').textContent=name;
    page.querySelector('.mobile-compose-host').append(composer);heading.append(post);post.textContent='Publicar';
    opened=true;page.hidden=false;page.inert=false;page.querySelector('.mobile-compose-body').scrollTop=0;
    document.documentElement.classList.add('mobile-compose-open');document.body.classList.add('mobile-compose-open');fab.setAttribute('aria-expanded','true');
    syncViewport();input.focus({preventScroll:true});input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  fab.onclick=open;back.onclick=()=>close();
  document.addEventListener('keydown',event=>{
    if(!opened)return;
    if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='Tab'){
      const controls=[...page.querySelectorAll('button,input,textarea,select,a[href]')].filter(node=>!node.disabled&&node.type!=='file'&&node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  new MutationObserver(()=>{back.disabled=opened&&isBusy();page.setAttribute('aria-busy',String(opened&&isBusy()));}).observe(post,{attributes:true,attributeFilter:['disabled']});
  document.addEventListener('hub:mural-posted',()=>close(true));
  mobile.addEventListener('change',()=>{if(!mobile.matches)close(true);});
  window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});
  return {open,close:()=>close(true)};
}

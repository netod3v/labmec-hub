export function initializeMoreNavigation(button,menu){
  const mobile=matchMedia('(max-width:720px)');
  const anchor=document.createComment('header-more-menu');menu.before(anchor);
  const navigationOptions=[['call-btn','Call'],['my-space-btn','Meu espaço']].map(([id,title])=>{
    const option=document.getElementById(id);if(!option)return null;
    const label=document.createElement('span');label.className='header-menu-label';label.textContent=title;label.hidden=true;option.append(label);
    const description=document.createElement('span');description.className='more-option-description';description.textContent=id==='call-btn'?'Converse com a equipe por voz e vídeo':'Acesse seu espaço no Hub';option.append(description);
    return {option,label};
  }).filter(Boolean);
  const descriptions={
    'admin-btn':'Contas, atividade e histórico do Hub',
    'settings-btn':'Reprodução, aparência e acessibilidade',
    'theme-btn':'Escolha o visual do seu Hub',
    'fullscreen-btn':'Use todo o espaço da tela',
    'games-btn':'Faça uma pausa com os minijogos',
    'achievements-btn':'Veja suas conquistas e próximos desafios',
    'support-btn':'Fale com o suporte do sistema',
    'donation-btn':'Conheça e apoie o desenvolvimento',
    'logout-btn':'Encerrar o acesso a esta conta'
  };
  const heading=document.createElement('div');heading.className='more-page-heading';
  heading.innerHTML='<button type="button" class="more-page-back" aria-label="Voltar ao Hub"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>Voltar</button><h2 id="more-page-title">Mais</h2><p>Preferências, conquistas e ajuda em um só lugar.</p>';
  menu.prepend(heading);
  const shortcuts=document.createElement('h3');shortcuts.className='more-page-group';shortcuts.textContent='Seu Hub';shortcuts.hidden=true;heading.after(shortcuts);
  for(const [id,text] of Object.entries(descriptions)){
    const option=menu.querySelector('#'+id);if(!option)continue;
    const description=document.createElement('span');description.className='more-option-description';description.textContent=text;option.append(description);
  }
  for(const [id,text] of [['settings-btn','Preferências'],['games-btn','Explorar'],['support-btn','Ajuda e apoio'],['logout-btn','Conta']]){
    const option=menu.querySelector('#'+id);if(!option)continue;
    const title=document.createElement('h3');title.className='more-page-group';title.textContent=text;option.before(title);
  }
  const headerActions=button.closest('.header-actions'),headerMore=button.closest('.header-more');
  const settingsOption=document.getElementById('settings-btn'),settingsAnchor=document.createComment('more-settings-position');
  settingsOption?.before(settingsAnchor);
  settingsOption?.setAttribute('title','Configurações');
  let opened=false,returnContext=null,returnObserver=null;
  const destinations=new Set(['admin-btn','settings-btn','call-btn','my-space-btn','games-btn','achievements-btn','support-btn','donation-btn']);
  const surfaces='.modal-overlay:not(.hidden):not(.modal-closing),dialog[open],#global-search-panel:not([hidden])';
  const pageFlags=['profile-page-open','files-page-open','demand-expanded'];
  const returnControls=new Map();
  function updateReturnControls(surface){
    if(!mobile.matches)return;
    for(const control of surface.querySelectorAll('#call-modal-close,#my-space-close,#games-close,#support-modal-close,#settings-modal .modal-close,.donation-close')){
      if(returnControls.has(control))continue;
      returnControls.set(control,{children:[...control.childNodes],label:control.getAttribute('aria-label')});
      control.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Voltar</span>';
      control.classList.add('more-return-control');
      control.setAttribute('aria-label',control.id==='call-modal-close'?'Voltar para Mais e minimizar chamada':'Voltar para Mais');
    }
  }
  function syncReturnControls(){
    if(mobile.matches){returnContext?.marked.forEach(updateReturnControls);return;}
    for(const [control,saved] of returnControls){
      control.replaceChildren(...saved.children);control.classList.remove('more-return-control');
      if(saved.label===null)control.removeAttribute('aria-label');else control.setAttribute('aria-label',saved.label);
    }
    returnControls.clear();
  }
  function clearReturn(){
    returnObserver?.disconnect();returnObserver=null;
    returnContext?.marked.forEach(element=>element.classList.remove('more-child-surface'));
    returnContext=null;document.body.classList.remove('more-child-open');
  }
  function hasChildPage(){
    const active=[...document.querySelectorAll(surfaces)].filter(element=>!returnContext.background.has(element));
    if(document.body.classList.contains('files-page-open')&&!returnContext.flags.has('files-page-open')){const files=document.getElementById('lab-files');if(files)active.push(files);}
    for(const element of active){if(!element.classList.contains('more-child-surface'))element.classList.add('more-child-surface');returnContext.marked.add(element);updateReturnControls(element);}
    return active.length>0||pageFlags.some(flag=>document.body.classList.contains(flag)&&!returnContext.flags.has(flag));
  }
  function checkReturn(){
    if(!returnContext)return;
    if(document.getElementById('wrap-app')?.classList.contains('hidden')){clearReturn();close();return;}
    if(hasChildPage())return;
    const saved=returnContext;clearReturn();open(saved.scroll,saved.option);
  }
  menu.addEventListener('click',event=>{
    const option=event.target.closest('.icon-btn');
    if(!opened||!option||!destinations.has(option.id))return;
    clearReturn();returnContext={option,scroll:menu.scrollTop,background:new Set(document.querySelectorAll(surfaces)),flags:new Set(pageFlags.filter(flag=>document.body.classList.contains(flag))),marked:new Set()};
    document.body.classList.add('more-child-open');
    const targets={'admin-btn':'#admin-modal','settings-btn':'#settings-modal','call-btn':'#call-modal','my-space-btn':'#my-space-modal','games-btn':'#games-modal','achievements-btn':'#view-profile-modal','support-btn':'#support-modal','donation-btn':'.donation-dialog'};
    returnContext.background.delete(document.querySelector(targets[option.id]));
    if(option.id==='achievements-btn')returnContext.flags.delete('profile-page-open');
    returnObserver=new MutationObserver(checkReturn);
    returnObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','open'],childList:true});
    queueMicrotask(checkReturn);
  },true);
  function close(restore=false){
    if(returnContext){
      opened=false;menu.inert=true;menu.setAttribute('aria-hidden','true');menu.setAttribute('aria-modal','false');
      return;
    }
    opened=false;menu.classList.remove('open');menu.inert=true;menu.setAttribute('aria-hidden','true');button.setAttribute('aria-expanded','false');document.documentElement.classList.remove('mobile-more-open');
    if(restore&&button.getClientRects().length)button.focus({preventScroll:true});
  }
  function sync(){
    syncReturnControls();
    if(!returnContext&&!opened)close(menu.contains(document.activeElement));
    shortcuts.hidden=!mobile.matches;
    let previous=shortcuts;
    for(const {option,label} of navigationOptions){
      if(option.id==='call-btn'&&!mobile.matches&&headerActions){
        headerActions.insertBefore(option,headerMore);label.hidden=true;option.removeAttribute('role');continue;
      }
      label.hidden=false;
      previous.after(option);previous=option;
    }
    if(settingsOption){
      if(mobile.matches)settingsAnchor.after(settingsOption);
      else if(headerActions){headerActions.insertBefore(settingsOption,headerMore);settingsOption.removeAttribute('role');}
    }
    if(mobile.matches){document.body.append(menu);menu.classList.add('more-mobile-page');menu.setAttribute('role','dialog');menu.setAttribute('aria-modal',String(!returnContext));menu.setAttribute('aria-labelledby','more-page-title');}
    else{anchor.after(menu);menu.classList.remove('more-mobile-page');menu.setAttribute('role','menu');menu.removeAttribute('aria-modal');menu.removeAttribute('aria-labelledby');}
    button.setAttribute('aria-haspopup',mobile.matches?'dialog':'menu');
    document.documentElement.classList.toggle('mobile-more-open',mobile.matches&&menu.classList.contains('open'));
    menu.querySelectorAll('.icon-btn').forEach(option=>{if(mobile.matches)option.removeAttribute('role');else option.setAttribute('role','menuitem');});
  }
  function open(scroll=0,focus=null){
    opened=true;menu.inert=false;menu.classList.add('open');menu.removeAttribute('aria-hidden');menu.scrollTop=scroll;button.setAttribute('aria-expanded','true');
    if(mobile.matches){menu.setAttribute('aria-modal','true');document.documentElement.classList.add('mobile-more-open');(focus||heading.querySelector('button')).focus({preventScroll:true});}
    else if(focus)focus.focus({preventScroll:true});
  }
  button.addEventListener('click',event=>{event.stopPropagation();if(opened)close(true);else open();});
  heading.querySelector('button').onclick=()=>close(true);
  menu.addEventListener('click',event=>{const option=event.target.closest('.icon-btn');if(option&&!['theme-btn','fullscreen-btn'].includes(option.id))close();});
  document.addEventListener('click',event=>{if(opened&&!menu.contains(event.target)&&!button.contains(event.target))close();});
  document.addEventListener('keydown',event=>{
    if(!opened)return;
    if(event.key==='Escape'){event.preventDefault();close(true);}
    else if(event.key==='Tab'&&mobile.matches){
      const controls=[...menu.querySelectorAll('button,a[href]')].filter(node=>!node.disabled&&node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  mobile.addEventListener('change',sync);sync();
  return {close,open,reset(){clearReturn();close();}};
}

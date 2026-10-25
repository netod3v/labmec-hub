export function initializeMessageMenu(container, {getIdentity, onDelete}) {
  const menu = document.createElement('div');
  menu.className = 'dm-context-menu'; menu.hidden = true;
  menu.setAttribute('role','menu'); menu.setAttribute('aria-label','Opções da mensagem');
  document.body.append(menu);
  let selected = null, timer = null, start = null, animation = null, selectedBubble = null;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const close = (smooth = false) => {
    selectedBubble?.classList.remove('dm-menu-target'); selectedBubble = null;
    selected = null; clearTimeout(timer); animation?.cancel(); animation = null;
    if(smooth === true && !menu.hidden && !reducedMotion()){
      menu.style.pointerEvents = 'none';
      const closing = menu.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(4px) scale(.97)'}],{duration:110,easing:'ease-in',fill:'forwards'});
      animation = closing;
      closing.finished.then(()=>{if(animation===closing){menu.hidden=true;closing.cancel();animation=null;}},()=>{});
    }else menu.hidden = true;
  };
  const open = (bubble, x, y) => {
    close();
    const identity = getIdentity();
    if (!identity.account || !identity.otherUid) return;
    selected = {...identity, id:bubble.dataset.dmMessageId, mine:bubble.dataset.dmFrom === identity.account};
    selectedBubble = bubble; bubble.classList.add('dm-menu-target');
    menu.innerHTML = '<button type="button" role="menuitem" data-scope="me">Apagar para mim<span>A outra pessoa continua vendo</span></button>' + (selected.mine?'<button type="button" role="menuitem" data-scope="everyone">Apagar<span>Remove para os dois participantes</span></button>':'');
    menu.hidden = false;
    menu.style.pointerEvents = '';
    const width = menu.offsetWidth, height = menu.offsetHeight;
    menu.style.left = Math.max(8,Math.min(x,window.innerWidth-width-8))+'px';
    menu.style.top = Math.max(8,Math.min(y,window.innerHeight-height-8))+'px';
    if(!reducedMotion()) animation=menu.animate([{opacity:0,transform:'translateY(6px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
    menu.querySelector('button').focus({preventScroll:true});
  };
  container.addEventListener('contextmenu', event => {
    const bubble = event.target.closest('[data-dm-message-id]');
    if(!bubble) return;
    event.preventDefault(); open(bubble,event.clientX,event.clientY);
  });
  container.addEventListener('keydown', event => {
    if(event.key!=='ContextMenu' && !(event.shiftKey && event.key==='F10')) return;
    const bubble=event.target.closest('[data-dm-message-id]'); if(!bubble) return;
    event.preventDefault(); const rect=bubble.getBoundingClientRect(); open(bubble,rect.left+12,rect.top+12);
  });
  container.addEventListener('pointerdown', event => {
    if(event.pointerType!=='touch') return;
    const bubble=event.target.closest('[data-dm-message-id]'); if(!bubble) return;
    start={x:event.clientX,y:event.clientY};
    timer=setTimeout(()=>open(bubble,event.clientX,event.clientY),550);
  });
  container.addEventListener('pointermove',event=>{if(start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>12)clearTimeout(timer);});
  for(const name of ['pointerup','pointercancel'])container.addEventListener(name,()=>{clearTimeout(timer);start=null;});
  menu.addEventListener('click', async event => {
    const button=event.target.closest('[data-scope]'); if(!button || !selected) return;
    event.stopPropagation(); const target=selected, scope=button.dataset.scope; close(true);
    await onDelete(target,scope);
  });
  document.addEventListener('pointerdown', event=>{if(!menu.hidden && !menu.contains(event.target))close();});
  document.addEventListener('keydown',event=>{
    if(menu.hidden) return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
  },true);
  window.addEventListener('scroll',close,true);window.addEventListener('resize',close);
  return {close};
}

export async function animateMessageRemoval(container, id, mine) {
  const bubble = [...container.querySelectorAll('[data-dm-message-id]')].find(element=>element.dataset.dmMessageId===id);
  if(!bubble) return;
  bubble.querySelectorAll('audio').forEach(player=>player.pause());
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  bubble.style.overflow = 'hidden';
  const animation = bubble.animate([
    {opacity:1,transform:'translateX(0) scale(1)',height:bubble.getBoundingClientRect().height+'px'},
    {opacity:0,transform:`translateX(${mine?12:-12}px) scale(.97)`,height:'0px',minHeight:'0px',paddingTop:'0px',paddingBottom:'0px',marginTop:'0px',marginBottom:'0px'}
  ],{duration:200,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});
  await animation.finished.catch(()=>{});
}

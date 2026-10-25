export function initializeHeaderTooltips(root=document.querySelector('.header-actions')){
  if(!root)return;
  const tip=document.createElement('div');tip.id='header-function-tooltip';tip.className='header-function-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.append(tip);
  let current=null,timer=null;
  function hide(){clearTimeout(timer);tip.hidden=true;if(current){const ids=(current.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==tip.id);if(ids.length)current.setAttribute('aria-describedby',ids.join(' '));else current.removeAttribute('aria-describedby');}current=null;}
  function show(button){
    if(current===button)return;hide();if(!button||button.disabled)return;
    const label=button.getAttribute('aria-label')||button.title;if(!label)return;
    // Suppress the browser's duplicate title bubble while using this tooltip.
    if(button.title){if(!button.hasAttribute('aria-label'))button.setAttribute('aria-label',button.title);button.removeAttribute('title');}
    current=button;
    timer=setTimeout(()=>{
      if(current!==button||!button.isConnected||button.getBoundingClientRect().width===0){hide();return;}
      tip.textContent=button.getAttribute('aria-label')||label;tip.hidden=false;
      const r=button.getBoundingClientRect(),t=tip.getBoundingClientRect();
      tip.style.left=Math.max(8,Math.min(innerWidth-t.width-8,r.left+r.width/2-t.width/2))+'px';
      tip.style.top=(r.bottom+t.height+8<innerHeight?r.bottom+7:Math.max(8,r.top-t.height-7))+'px';
      button.setAttribute('aria-describedby',[(button.getAttribute('aria-describedby')||''),tip.id].filter(Boolean).join(' '));
    },140);
  }
  const target=event=>event.target.closest?.('.icon-btn');
  root.addEventListener('pointerover',event=>{if(event.pointerType!=='touch')show(target(event));});
  root.addEventListener('pointerout',event=>{if(current&&!current.contains(event.relatedTarget))hide();});
  root.addEventListener('focusin',event=>show(target(event)));
  root.addEventListener('focusout',hide);root.addEventListener('click',hide);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  document.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('blur',hide);
}

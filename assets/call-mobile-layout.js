export function initializeCallMobileLayout({stage,modal,onSelectRoom}){
  const mobile=matchMedia('(max-width:720px)');
  const picker=document.createElement('div');picker.className='voice-room-picker';
  const selector=document.createElement('button');selector.type='button';selector.className='voice-room-select';selector.setAttribute('aria-haspopup','listbox');selector.setAttribute('aria-expanded','false');selector.setAttribute('aria-controls','voice-room-options');
  const speaker='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/></svg>';
  selector.innerHTML='<span class="voice-room-picker-icon">'+speaker+'</span><span class="voice-room-picker-copy"><small>Sala de voz</small><strong>Carregando salas…</strong></span><span class="voice-room-picker-count"></span><svg class="voice-room-picker-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const roomList=document.createElement('div');roomList.id='voice-room-options';roomList.className='voice-room-options';roomList.hidden=true;roomList.setAttribute('role','listbox');roomList.setAttribute('aria-label','Salas de voz disponíveis');
  picker.append(selector,roomList);stage.querySelector('.voice-sidebar').prepend(picker);
  let refreshingRooms=false;
  function closeRooms(restore=false){roomList.hidden=true;selector.setAttribute('aria-expanded','false');if(restore)selector.focus({preventScroll:true});}
  function openRooms(last=false){
    if(selector.disabled)return;
    close();roomList.hidden=false;selector.setAttribute('aria-expanded','true');
    const choices=[...roomList.querySelectorAll('[role=option]')];
    (last?choices.at(-1):roomList.querySelector('[aria-selected="true"]')||choices[0])?.focus({preventScroll:true});
  }
  selector.onclick=()=>roomList.hidden?openRooms():closeRooms();
  selector.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();openRooms(event.key==='ArrowUp');}});
  roomList.addEventListener('click',event=>{const choice=event.target.closest('[data-room-choice]');if(choice){closeRooms(true);onSelectRoom(choice.dataset.roomChoice);}});
  picker.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!roomList.hidden){event.preventDefault();event.stopPropagation();closeRooms(true);}
    else if(!roomList.hidden&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&roomList.contains(event.target)){
      event.preventDefault();const choices=[...roomList.querySelectorAll('[role=option]')],index=choices.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(event.key==='ArrowUp'?-1:1)+choices.length)%choices.length;
      choices[next]?.focus({preventScroll:true});
    }
  });
  picker.addEventListener('focusout',event=>{if(!refreshingRooms&&!picker.contains(event.relatedTarget))closeRooms();});
  const controls=stage.querySelector('.voice-controls');
  const extra=document.createElement('div');extra.className='voice-extra-controls';
  extra.innerHTML='<button type="button" data-extra-toggle aria-label="Mais controles da chamada" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button><div class="voice-extra-menu" hidden></div>';
  controls.querySelector('[data-leave]').before(extra);
  const toggle=extra.querySelector('button'),menu=extra.querySelector('div');
  const options=['[data-deafen]','[data-screen]','[data-settings]'].map(query=>{
    const button=controls.querySelector(query),anchor=document.createComment('voice-control');button.before(anchor);
    const label=document.createElement('span');label.className='voice-extra-label';button.append(label);
    const sync=()=>{label.textContent=button.getAttribute('aria-label');};sync();
    new MutationObserver(sync).observe(button,{attributes:true,attributeFilter:['aria-label']});
    return {button,anchor};
  });
  function close(restore=false){menu.hidden=true;toggle.setAttribute('aria-expanded','false');if(restore)toggle.focus({preventScroll:true});}
  function place(){close();closeRooms();for(const {button,anchor} of options){if(mobile.matches)menu.append(button);else anchor.after(button);}}
  mobile.addEventListener('change',place);place();
  toggle.onclick=()=>{const open=menu.hidden;menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});};
  menu.addEventListener('click',event=>{if(event.target.closest('button'))close();});
  document.addEventListener('click',event=>{if(!extra.contains(event.target))close();if(!picker.contains(event.target))closeRooms();});
  extra.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();event.stopPropagation();close(true);}});
  extra.addEventListener('focusout',event=>{if(!extra.contains(event.relatedTarget))close();});
  function viewport(){modal.style.setProperty('--voice-viewport-height',(window.visualViewport?.height||innerHeight)+'px');modal.style.setProperty('--voice-viewport-top',(window.visualViewport?.offsetTop||0)+'px');}
  window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);viewport();
  return {close(){close();closeRooms();},syncRooms(rooms,selected){
    const signature=JSON.stringify(rooms.map(room=>[room.id,room.label,room.count]));
    if(selector.dataset.rooms!==signature){
      const focused=roomList.contains(document.activeElement)?document.activeElement.dataset.roomChoice:null;
      refreshingRooms=true;
      try{
      roomList.replaceChildren(...rooms.map(room=>{
        const choice=document.createElement('button');choice.type='button';choice.tabIndex=-1;choice.dataset.roomChoice=room.id;choice.setAttribute('role','option');
        choice.innerHTML='<span class="voice-room-option-icon">'+speaker+'</span><span class="voice-room-option-name"></span><span class="voice-room-option-count"></span><svg class="voice-room-option-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
        choice.querySelector('.voice-room-option-name').textContent=room.label;choice.querySelector('.voice-room-option-count').textContent=String(room.count||0);
        choice.setAttribute('aria-selected',String(room.id===selected));choice.setAttribute('aria-label',`${room.label}, ${room.count||0} ${room.count===1?'participante':'participantes'}`);return choice;
      }));selector.dataset.rooms=signature;
      if(focused&&!roomList.hidden)[...roomList.children].find(choice=>choice.dataset.roomChoice===focused)?.focus({preventScroll:true});
      }finally{refreshingRooms=false;}
    }
    const current=rooms.find(room=>room.id===selected);selector.disabled=!rooms.length;
    selector.querySelector('strong').textContent=current?.label||'Nenhuma sala disponível';
    selector.querySelector('.voice-room-picker-count').textContent=String(current?.count||0);
    selector.setAttribute('aria-label',current?`Trocar sala: ${current.label}, ${current.count||0} ${current.count===1?'participante':'participantes'}`:'Nenhuma sala disponível');
    for(const choice of roomList.children)choice.setAttribute('aria-selected',String(choice.dataset.roomChoice===selected));
  }};
}

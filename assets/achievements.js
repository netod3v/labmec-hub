const symbols={star:'m12 3 2.5 5.5 6 .7-4.4 4 1.2 5.8-5.3-3-5.3 3 1.2-5.8-4.4-4 6-.7Z',spark:'m13 2-9 12h7l-1 8 10-13h-7Z',crown:'m3 6 4 5 5-8 5 8 4-5-2 13H5ZM6 22h12',chat:'M4 4h16v12H9l-5 4ZM8 8h8M8 12h5',heart:'M20 5c-2-2-5-2-8 1-3-3-6-3-8-1-4 4 1 10 8 15 7-5 12-11 8-15Z'};
export function initializeAchievements({request,getUid,celebrate}){
  const cache=new Map(),mounted=new Map(),versions=new WeakMap(),expandedUsers=new Set();
  async function load(section,uid){
    const actor=getUid(),version=(versions.get(section)||0)+1;versions.set(section,version);section.setAttribute('aria-busy','true');
    try{
      let entry=cache.get(uid);if(!entry||Date.now()-entry.at>30000){entry={at:Date.now(),promise:request('/achievements/'+encodeURIComponent(uid))};cache.set(uid,entry);}
      const result=await entry.promise;if(!section.isConnected||getUid()!==actor||versions.get(section)!==version)return;
      const known=new Map(result.achievements.map(item=>[item.id,item]));
      const all=(result.catalog||result.achievements).map(item=>({...item,...known.get(item.id)}));
      const expanded=expandedUsers.has(uid),earned=all.filter(item=>item.earnedAt);
      section.replaceChildren();section.classList.toggle('is-summary',!expanded);
      const heading=document.createElement('div');heading.className='hub-achievements-heading';const title=document.createElement('h3');title.textContent='Conquistas';const count=document.createElement('span');count.textContent=earned.length+' de '+all.length;heading.append(title,count);section.append(heading);
      const intro=document.createElement('p');intro.className='hub-achievements-intro';intro.textContent=result.own?'Você vê todas as suas conquistas, inclusive as ocultas. Escolha o que mostrar em Editar perfil.':expanded?'Veja os emblemas exibidos neste perfil e os requisitos de cada conquista.':'Emblemas exibidos por este integrante. Clique para conhecer todas as conquistas.';section.append(intro);
      const toggle=document.createElement('button');toggle.type='button';toggle.className='btn hub-achievements-view-all';toggle.textContent=expanded?'Mostrar conquistadas':'Ver todas as conquistas';toggle.setAttribute('aria-expanded',String(expanded));
      toggle.onclick=async()=>{if(expanded)expandedUsers.delete(uid);else expandedUsers.add(uid);await load(section,uid);if(section.isConnected&&getUid()===actor)section.querySelector('.hub-achievements-view-all')?.focus({preventScroll:true});};section.append(toggle);
      const items=expanded?all:earned;
      if(!items.length){const empty=document.createElement('p');empty.className='profile-empty';empty.textContent=result.own?'Seu primeiro emblema está esperando. Veja as conquistas e escolha por onde começar.':'Nenhum emblema disponível para exibição neste perfil. Você pode consultar as conquistas disponíveis e seus requisitos.';section.append(empty);return;}
      const grid=document.createElement('div');grid.className='hub-achievements-grid';
      for(const item of [...items].sort((a,b)=>Number(!!b.earnedAt)-Number(!!a.earnedAt))){
        const card=document.createElement(expanded?'article':'button');card.className='hub-achievement'+(item.earnedAt?' is-earned':' is-locked');card.dataset.achievement=item.id;
        if(!expanded){card.type='button';card.setAttribute('aria-label',item.title+'. Ver como desbloquear as conquistas');card.onclick=async()=>{expandedUsers.add(uid);await load(section,uid);if(!section.isConnected||getUid()!==actor)return;const selected=section.querySelector('[data-achievement="'+item.id+'"]');if(selected){selected.tabIndex=-1;selected.focus({preventScroll:true});selected.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}};}
        const badge=document.createElement('span');badge.className='hub-achievement-badge';badge.setAttribute('aria-hidden','true');badge.innerHTML='<svg viewBox="0 0 24 24"><path d="'+(symbols[item.icon]||symbols.star)+'"/></svg>';
        const name=document.createElement('strong');name.textContent=item.title;const description=document.createElement('p');description.textContent=(expanded?'Como desbloquear: ':'')+item.description;const state=document.createElement('small');state.textContent=item.earnedAt?'✓ Conquistada'+(expanded?' · '+new Date(item.earnedAt).toLocaleDateString('pt-BR'):'')+(result.own&&item.visible===false?' · Oculta no perfil':''):result.own?item.progress+' de '+item.target:'Não exibida neste perfil';
        card.append(badge,name,description,state);
        if(!item.earnedAt&&result.own){const progress=document.createElement('progress');progress.max=item.target;progress.value=item.progress;progress.setAttribute('aria-label',item.title+': '+item.progress+' de '+item.target);card.append(progress);}
        if(item.earnedAt)card.title='Conquistada em '+new Date(item.earnedAt).toLocaleDateString('pt-BR');grid.append(card);
      }
      section.append(grid);
    }catch{cache.delete(uid);if(section.isConnected&&getUid()===actor&&versions.get(section)===version){section.replaceChildren();const message=document.createElement('p');message.textContent='Não foi possível carregar as conquistas.';const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Tentar novamente';retry.onclick=()=>load(section,uid);section.append(message,retry);}}
    finally{if(versions.get(section)===version)section.removeAttribute('aria-busy');}
  }
  document.addEventListener('hub:achievements-updated',event=>{
    if(event.detail.uid!==getUid())return;cache.delete(event.detail.uid);
    for(const [section,uid] of mounted){if(!section.isConnected)mounted.delete(section);else if(uid===event.detail.uid)load(section,uid);}
    if(event.detail.achievements.length)celebrate(event.detail.achievements[0]);
  });
  return {mount(root,uid){for(const section of mounted.keys())if(!section.isConnected)mounted.delete(section);const section=document.createElement('section');section.className='hub-achievements';section.textContent='Carregando conquistas…';root.append(section);mounted.set(section,uid);load(section,uid);},expand(uid){expandedUsers.add(uid);for(const [section,profile] of mounted)if(profile===uid&&section.isConnected)load(section,uid);},clear(){cache.clear();mounted.clear();expandedUsers.clear();}};
}

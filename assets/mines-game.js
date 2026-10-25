export function initializeMines({arena, heading, score, replay}) {
  const size=8,total=64,mineCount=10,bombs=new Set(),opened=new Set(),flags=new Set();
  let initialized=false,ended=false,mode='open',press=null,suppressClick=-1;
  arena.innerHTML=heading('💣','Campo minado','10 minas')+`
    <div class="mine-controls" role="group" aria-label="Ação ao tocar nas casas">
      <button type="button" data-mine-mode="open" aria-pressed="true">👆 Abrir</button>
      <button type="button" data-mine-mode="flag" aria-pressed="false">🚩 Bandeira</button>
    </div>
    <p class="mine-help">Toque para abrir. Segure uma casa para marcar uma bandeira ou use o botão Bandeira. O primeiro toque é seguro.</p>
    <div class="mine-grid" aria-label="Campo com oito linhas e oito colunas">${Array.from({length:total},(_,i)=>`<button type="button" class="mine-cell" data-mine="${i}" aria-label="Casa fechada, linha ${Math.floor(i/size)+1}, coluna ${i%size+1}"></button>`).join('')}</div>
    <div class="mine-progress" role="status" aria-live="polite"></div>
    <div class="game-result" id="mine-result" role="status"></div>
    <button type="button" class="mine-restart">↻ Nova partida</button>`;
  const cells=[...arena.querySelectorAll('[data-mine]')],grid=arena.querySelector('.mine-grid');
  const result=arena.querySelector('#mine-result'),progress=arena.querySelector('.mine-progress');
  const neighbors=index=>{
    const row=Math.floor(index/size),column=index%size,out=[];
    for(let y=Math.max(0,row-1);y<=Math.min(size-1,row+1);y++)for(let x=Math.max(0,column-1);x<=Math.min(size-1,column+1);x++)if(y*size+x!==index)out.push(y*size+x);
    return out;
  };
  const count=index=>neighbors(index).filter(i=>bombs.has(i)).length;
  function update(){
    arena.querySelector('.game-score').textContent=`🚩 ${mineCount-flags.size}`;
    progress.textContent=`${opened.size}/${total-mineCount} casas seguras · ${flags.size} de ${mineCount} bandeiras`;
  }
  function flag(index){
    if(ended||opened.has(index))return;
    if(flags.has(index))flags.delete(index);
    else if(flags.size<mineCount)flags.add(index);
    else {result.textContent='Você já usou as 10 bandeiras. Remova uma para marcar outra casa.';return;}
    result.textContent='';
    cells[index].classList.toggle('flagged',flags.has(index));
    cells[index].textContent=flags.has(index)?'🚩':'';
    cells[index].setAttribute('aria-label',`${flags.has(index)?'Bandeira':'Casa fechada'}, linha ${Math.floor(index/size)+1}, coluna ${index%size+1}`);
    update();
  }
  function finish(won,index){
    ended=true;cancelPress();
    if(won){bombs.forEach(i=>flags.add(i));update();}
    bombs.forEach(i=>{cells[i].textContent=won?'🚩':'💣';cells[i].classList.add(won?'flagged':'revealed');cells[i].setAttribute('aria-label',won?'Mina sinalizada':'Mina revelada');});
    if(!won){cells[index].classList.add('bomb');flags.forEach(i=>{if(!bombs.has(i)){cells[i].textContent='✕';cells[i].setAttribute('aria-label','Bandeira incorreta');}});}
    result.textContent=won?'Campo limpo! +80 pontos 🎉':'Você encontrou uma mina. Vamos tentar novamente?';
    arena.querySelectorAll('[data-mine-mode]').forEach(b=>b.disabled=true);
    if(won)score('Campo minado',80);
    replay('mines');
    arena.querySelector('.mine-restart').hidden=true;
  }
  function open(index){
    if(ended||flags.has(index))return;
    if(!initialized){
      const safe=new Set([index,...neighbors(index)]),available=Array.from({length:total},(_,i)=>i).filter(i=>!safe.has(i));
      for(let n=0;n<mineCount;n++)bombs.add(available.splice(Math.floor(Math.random()*available.length),1)[0]);
      initialized=true;
    }
    let pending=[index];
    // Tocar em um número abre seus vizinhos quando todas as bandeiras correspondem.
    if(opened.has(index)){
      if(!count(index)||neighbors(index).filter(i=>flags.has(i)).length!==count(index))return;
      pending=neighbors(index).filter(i=>!flags.has(i)&&!opened.has(i));
    }
    while(pending.length){
      const current=pending.pop();
      if(opened.has(current)||flags.has(current))continue;
      if(bombs.has(current)){finish(false,current);return;}
      opened.add(current);
      const n=count(current),cell=cells[current];
      cell.textContent=n||'';cell.dataset.count=String(n);cell.classList.add('open');
      cell.setAttribute('aria-label',`${n?`${n} minas vizinhas`:'Casa vazia'}, linha ${Math.floor(current/size)+1}, coluna ${current%size+1}`);
      if(!n)pending.push(...neighbors(current).filter(i=>!opened.has(i)&&!bombs.has(i)));
    }
    update();if(opened.size===total-mineCount)finish(true);
  }
  function cancelPress(){if(press)clearTimeout(press.timer);press=null;}
  grid.addEventListener('pointerdown',event=>{
    const cell=event.target.closest('[data-mine]');
    if(!cell||event.pointerType==='mouse'||ended)return;
    cancelPress();suppressClick=-1;
    const index=Number(cell.dataset.mine);
    press={x:event.clientX,y:event.clientY,id:event.pointerId,timer:setTimeout(()=>{if(arena.contains(cell)){suppressClick=index;flag(index);}cancelPress();},450)};
  });
  grid.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>10){suppressClick=Number(event.target.closest('[data-mine]')?.dataset.mine??-1);cancelPress();}});
  for(const name of ['pointerup','pointercancel','pointerleave'])grid.addEventListener(name,cancelPress);
  grid.addEventListener('contextmenu',event=>{
    const cell=event.target.closest('[data-mine]');if(!cell)return;
    event.preventDefault();if(event.pointerType==='touch'||press||suppressClick===Number(cell.dataset.mine))return;
    flag(Number(cell.dataset.mine));
  });
  arena.onclick=event=>{
    const choice=event.target.closest('[data-mine-mode]');
    if(choice){mode=choice.dataset.mineMode;arena.querySelectorAll('[data-mine-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===choice)));grid.classList.toggle('flag-mode',mode==='flag');return;}
    if(event.target.closest('.mine-restart')){cancelPress();initializeMines({arena,heading,score,replay});return;}
    const cell=event.target.closest('[data-mine]');if(!cell)return;
    const index=Number(cell.dataset.mine);
    if(suppressClick===index){suppressClick=-1;return;}
    suppressClick=-1;if(mode==='flag')flag(index);else open(index);
  };
  update();
}

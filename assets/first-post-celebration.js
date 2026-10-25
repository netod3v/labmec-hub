export function initializeFirstPostCelebration(){
  let active=null,timer=null;
  function clear(){clearTimeout(timer);active?.remove();active=null;}
  function show(achievement=null){
    clear();const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const host=document.createElement('div');host.className='first-post-celebration';
    const card=document.createElement('div');card.className='first-post-celebration-card';
    card.innerHTML='<span class="first-post-celebration-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 3 2.5 5.5 6 .7-4.4 4 1.2 5.8-5.3-3-5.3 3 1.2-5.8-4.4-4 6-.7Z"/></svg></span><div role="status" aria-live="polite" aria-atomic="true"><strong>Sua primeira publicação!</strong><p>Obrigado por compartilhar com o laboratório.</p></div><button type="button" aria-label="Fechar comemoração">×</button>';
    if(achievement){card.querySelector('strong').textContent='Conquista desbloqueada!';card.querySelector('p').textContent=achievement.title;}
    host.append(card);document.body.append(host);active=host;
    if(!reduced){
      const colors=['#62b7ec','#165c88','#f1bb57','#6bc6d3','#b3d9f2'];
      for(let i=0;i<36;i++){
        const piece=document.createElement('i');piece.className='first-post-confetti';piece.setAttribute('aria-hidden','true');
        piece.style.cssText='--dx:'+((Math.random()-.5)*85)+'vw;--dy:'+(-15-Math.random()*40)+'vh;--end:'+ (10+Math.random()*35)+'vh;--turn:'+((Math.random()-.5)*1000)+'deg;--duration:'+(1200+Math.random()*600)+'ms;background:'+colors[i%colors.length];host.append(piece);
      }
      setTimeout(()=>host.querySelectorAll('.first-post-confetti').forEach(piece=>piece.remove()),2000);
    }
    function close(){
      clearTimeout(timer);const finish=()=>{host.remove();if(active===host)active=null;};
      if(reduced||!card.animate){finish();return;}
      card.querySelector('button').disabled=true;
      card.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(14px)'}],{duration:160,fill:'forwards',easing:'ease-in'}).finished.then(finish).catch(finish);
    }
    card.querySelector('button').onclick=close;timer=setTimeout(close,5500);
  }
  return {show,clear};
}

export function initializeMobileScrollControls({getUid}){
  const mobile=matchMedia('(max-width:720px)');
  const workNav=document.getElementById('work-nav'),workSections=document.getElementById('sections-container');
  let previous=window.scrollY,direction=0,distance=0,frame=0;
  function show(){document.body.classList.remove('mobile-controls-hidden');}
  function syncWorkNav(){
    const reached=mobile.matches&&workNav&&workSections&&workSections.getBoundingClientRect().top<=parseFloat(getComputedStyle(workNav).top);
    document.body.classList[reached?'add':'remove']('mobile-work-nav-reached');
  }
  function reset(){show();syncWorkNav();previous=window.scrollY;direction=0;distance=0;}
  function update(){
    frame=0;
    syncWorkNav();
    const maximum=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
    const current=Math.max(0,Math.min(window.scrollY,maximum));
    const delta=current-previous;previous=current;
    if(!mobile.matches||!getUid()||current<=24){show();direction=0;distance=0;return;}
    if(document.documentElement.classList.contains('mobile-more-open')||document.body.matches('.mobile-compose-open,.mobile-modal-open,.note-mobile-open')){direction=0;distance=0;return;}
    if(!delta)return;
    const next=delta>0?1:-1;
    if(next!==direction){direction=next;distance=0;}
    distance+=Math.abs(delta);
    if(direction===1&&distance>=32)document.body.classList.add('mobile-controls-hidden');
    if(direction===-1&&distance>=10)show();
  }
  window.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(update);},{passive:true});
  window.addEventListener('resize',reset,{passive:true});
  mobile.addEventListener('change',reset);
  document.addEventListener('focusin',event=>{if(event.target.closest('.header-actions,#note-card,.mural-compose-fab,#work-nav'))reset();});
  reset();
  return {reset};
}

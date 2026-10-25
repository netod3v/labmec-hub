// Editing controls live outside the document so they never enter saved HTML.
export function initializeNoteImages({editor,modal,save}) {
  let image=null,resizing=null,dragged=null,destination=null;
  const controls=document.createElement('div');controls.className='note-image-controls';controls.hidden=true;controls.setAttribute('aria-label','Ajustar imagem');
  const hint=document.createElement('span');hint.className='note-image-hint';hint.textContent='Arraste a imagem para mover · use os cantos para ajustar';controls.append(hint);
  const marker=document.createElement('div');marker.className='note-image-drop-marker';marker.hidden=true;
  document.body.append(controls,marker);
  function paint(){
    if(!image?.isConnected||!editor.contains(image)||modal.classList.contains('hidden')||modal.classList.contains('modal-closing')||editor.closest('[data-mode="draw"]')){controls.hidden=true;return;}
    const r=image.getBoundingClientRect(),e=(editor.closest('.note-page-stage')||editor).getBoundingClientRect();
    controls.hidden=!(r.width&&r.height&&r.bottom>e.top&&r.top<e.bottom);
    Object.assign(controls.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
  }
  for(const corner of ['nw','ne','sw','se']){
    const handle=document.createElement('button');handle.type='button';handle.className='note-image-handle '+corner;handle.setAttribute('aria-label','Redimensionar imagem');handle.title='Arraste para ajustar. Use as setas para ajuste fino.';
    handle.onpointerdown=event=>{if(event.button!==0||!image)return;event.preventDefault();const r=image.getBoundingClientRect();resizing={x:event.clientX,width:r.width,corner,original:image.style.width,document:image};handle.setPointerCapture(event.pointerId);};
    handle.onpointermove=event=>{if(!resizing)return;const padding=getComputedStyle(editor);const max=editor.clientWidth-parseFloat(padding.paddingLeft)-parseFloat(padding.paddingRight);const delta=(event.clientX-resizing.x)*(corner.endsWith('w')?-1:1);image.style.width=Math.round(Math.max(32,Math.min(max,resizing.width+delta)))+'px';image.style.height='auto';paint();};
    const finish=()=>{if(!resizing)return;const valid=resizing.document===image&&editor.contains(image);resizing=null;if(valid)save();paint();};
    handle.onpointerup=finish;handle.onpointercancel=finish;handle.onlostpointercapture=finish;
    handle.onkeydown=event=>{if(!image||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const width=image.getBoundingClientRect().width;image.style.width=Math.max(32,width+(event.key==='ArrowRight'?10:-10))+'px';image.style.height='auto';save();paint();};controls.append(handle);
  }
  editor.addEventListener('click',event=>{image=event.target.closest('img');paint();});
  function block(node){if(node?.nodeType===Node.TEXT_NODE)node=node.parentElement;while(node&&node.parentElement!==editor)node=node.parentElement;return node?.parentElement===editor?node:null;}
  function resetDrag(){dragged=null;destination=null;marker.hidden=true;editor.classList.remove('note-image-dragging');}
  editor.addEventListener('dragstart',event=>{const target=event.target.closest('img');if(!target)return;image=target;dragged=target.closest('figure')||target;event.dataTransfer.setData('application/x-note-image','move');event.dataTransfer.effectAllowed='move';editor.classList.add('note-image-dragging');controls.hidden=true;});
  editor.addEventListener('dragover',event=>{
    if(!dragged)return;event.preventDefault();event.dataTransfer.dropEffect='move';
    const target=block(event.target);if(target===dragged||dragged.contains(target)){destination=null;marker.hidden=true;return;}
    const rect=(target||editor).getBoundingClientRect(),after=target?event.clientY>rect.top+rect.height/2:true;
    destination={target,after};const e=editor.getBoundingClientRect();Object.assign(marker.style,{left:e.left+12+'px',width:e.width-24+'px',top:(target?(after?rect.bottom:rect.top):rect.bottom-12)+'px'});marker.hidden=false;
  });
  editor.addEventListener('drop',event=>{
    if(!dragged)return;event.preventDefault();event.stopImmediatePropagation();
    if(destination&&editor.contains(dragged)){const {target,after}=destination;const reference=target?(after?target.nextSibling:target):null;if(reference!==dragged){editor.insertBefore(dragged,reference);save();}}
    resetDrag();paint();
  },true);
  editor.addEventListener('dragend',()=>{resetDrag();paint();});
  editor.addEventListener('dragleave',event=>{if(!editor.contains(event.relatedTarget))marker.hidden=true;});
  document.addEventListener('pointerdown',event=>{if(!controls.contains(event.target)&&!editor.contains(event.target)){image=null;paint();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){image=null;resetDrag();paint();}});
  document.addEventListener('scroll',paint,true);window.addEventListener('resize',paint);
  new ResizeObserver(paint).observe(editor);
  new MutationObserver(()=>{if(image&&!editor.contains(image)){image=null;resizing=null;resetDrag();}paint();}).observe(editor,{childList:true,subtree:true});
  new MutationObserver(paint).observe(modal,{attributes:true,subtree:true,attributeFilter:['class','data-mode']});
}

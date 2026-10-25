// Rulers belong to the editor interface, never to the saved document.
export function initializeNotePageLayout(editor){
  const stage=document.createElement('div');stage.className='note-page-stage';stage.setAttribute('aria-label','Área da folha A4');
  const canvas=document.createElement('div');canvas.className='note-page-canvas';
  const horizontal=document.createElement('div');horizontal.className='note-page-ruler horizontal';horizontal.setAttribute('aria-hidden','true');horizontal.title='Régua em centímetros · largura A4: 21 cm';
  const vertical=document.createElement('div');vertical.className='note-page-ruler vertical';vertical.setAttribute('aria-hidden','true');vertical.title='Régua em centímetros · altura A4: 29,7 cm';
  function number(parent,value){const label=document.createElement('span');label.textContent=value;label.style.setProperty('--ruler-position',value+'cm');parent.append(label);}
  for(let cm=0;cm<=21;cm++)number(horizontal,cm);
  editor.before(stage);stage.append(canvas);canvas.append(horizontal,vertical,editor);
  let lastCount=-1;
  new ResizeObserver(()=>{
    const height=editor.getBoundingClientRect().height;
    vertical.style.height=height+'px';
    const count=Math.floor(height/(96/2.54));
    if(count!==lastCount){lastCount=count;vertical.replaceChildren();for(let cm=0;cm<=count;cm++)number(vertical,cm);}
  }).observe(editor);
}

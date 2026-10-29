const icons = {
  pencil:'M4 20l4-1L20 7l-3-3L5 16l-1 4ZM13 8l3 3',
  marker:'m5 16 9-11 5 5-9 10H5v-4ZM4 21h8',
  line:'M4 12h16',rect:'M4 5h16v14H4Z',ellipse:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  select:'M5 3l13 9-6 1 3 6-2 1-3-6-5 4V3Z',
  area:'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 4h1m3 0h1M4 11v2m16-2v2M11 20h2',
  crop:'M6 3v15h15M3 6h15v15',
};

export function initializeDrawingToolbar(options) {
  const {toolbar,areaTools,pen,eraser,pan,select,color,size,ink,eraserMode,shape,undo,redo,clear,zoomIn,zoomOut,zoomLabel,getState,setTool,stamp,close}=options;
  const panel=toolbar.parentElement;
  toolbar.classList.add('note-reference-toolbar');toolbar.setAttribute('aria-label','Ferramentas de desenho');
  const strip=document.createElement('div');strip.className='note-toolbar-strip';
  const popup=document.createElement('div');popup.className='note-pen-popover';popup.hidden=true;
  const palette=document.createElement('div');palette.className='note-color-palette';palette.setAttribute('aria-label','Cores do desenho');
  const swatches=[];
  for(const value of ['#111827','#ffffff','#ef4444','#2563eb','#16a34a','#f59e0b','#a855f7']){
    const button=document.createElement('button');button.type='button';button.className='note-color-swatch';button.style.setProperty('--swatch',value);button.setAttribute('aria-label','Cor '+value);
    button.onclick=()=>{color.value=value;color.dispatchEvent(new Event('input',{bubbles:true}));refresh();};palette.append(button);swatches.push([button,value]);
  }
  color.title='Escolher outra cor';palette.append(color);popup.append(palette);
  const weight=document.createElement('label');weight.className='note-weight-control';
  const range=document.createElement('input');range.type='range';range.min='1';range.max='20';range.value=size.value;range.setAttribute('aria-label','Espessura do traço');
  const output=document.createElement('output');weight.append('Espessura',range,output);popup.append(weight);
  range.oninput=()=>{
    if(![...size.options].some(option=>option.value===range.value))size.add(new Option(range.value+' px',range.value));
    size.value=range.value;size.dispatchEvent(new Event('change',{bubbles:true}));refresh();
  };
  const styles=document.createElement('div');styles.className='note-line-options';styles.setAttribute('aria-label','Estilo do traço');
  const styleButtons=[];
  for(const [value,label,content] of [['solid','Traço contínuo','<path d="M3 12h26"/>'],['dashed','Traço tracejado','<path d="M3 12h26" stroke-dasharray="4 3"/>'],['arrow','Traço com seta','<path d="M3 12h26m-5-5 5 5-5 5"/>']]){
    const button=document.createElement('button');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.innerHTML='<svg viewBox="0 0 32 24" aria-hidden="true">'+content+'</svg>';
    button.onclick=()=>{options.setLineStyle(value);refresh();};styles.append(button);styleButtons.push([button,value]);
  }
  popup.append(styles);
  const eraserLabel=document.createElement('label');eraserLabel.className='note-eraser-setting';eraserLabel.append('Borracha',eraserMode);popup.append(eraserLabel);
  function group(){const element=document.createElement('div');element.className='note-tool-group';strip.append(element);return element;}
  function button(parent,label,icon,action){const item=document.createElement('button');item.type='button';item.className='whiteboard-tool';item.title=label;item.setAttribute('aria-label',label);item.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+icon+'"/></svg>';item.onclick=action;parent.append(item);return item;}
  function togglePopup(){popup.hidden=!popup.hidden;pen.setAttribute('aria-expanded',String(!popup.hidden));refresh();}
  const drawing=group();drawing.append(pen);pen.setAttribute('aria-expanded','false');pen.title='Caneta · cores e espessura';pen.addEventListener('click',()=>{ink.value='pen';ink.dispatchEvent(new Event('change'));togglePopup();});
  const pencil=button(drawing,'Lápis',icons.pencil,()=>{ink.value='pencil';ink.dispatchEvent(new Event('change'));popup.hidden=true;refresh();});
  const marker=button(drawing,'Marca-texto',icons.marker,()=>{ink.value='highlighter';ink.dispatchEvent(new Event('change'));popup.hidden=true;refresh();});
  drawing.append(eraser);eraser.title='Borracha · clique para configurar';eraser.addEventListener('click',()=>{popup.hidden=false;refresh();});
  // Keep the native controls as the source of truth for the drawing engine.
  const native=document.createElement('div');native.hidden=true;native.append(size,ink,shape);
  const shapes=group(),shapeButtons=[];
  for(const [value,label] of [['line','Linha'],['rect','Retângulo'],['ellipse','Elipse']]){
    const item=button(shapes,label,icons[value],()=>{shape.value=value;shape.dispatchEvent(new Event('change'));popup.hidden=true;refresh();});shapeButtons.push([item,value]);
  }
  const branding=group();
  const stampButton=document.createElement('button');stampButton.type='button';stampButton.className='whiteboard-tool note-logo-stamp';stampButton.title='Carimbo com a logo do Hub';stampButton.setAttribute('aria-label',stampButton.title);
  stampButton.innerHTML='<img src="assets/labiomec-logo-transparent.png" alt="" draggable="false">';branding.append(stampButton);
  stampButton.onclick=async()=>{stampButton.disabled=true;popup.hidden=true;try{await stamp();}finally{stampButton.disabled=false;refresh();}};
  const selection=group();selection.append(select);
  const areaButton=button(selection,'Selecionar área',icons.area,()=>{setTool('area');popup.hidden=true;refresh();});
  const cropButton=button(selection,'Recortar bordas',icons.crop,()=>{setTool('crop');popup.hidden=true;refresh();});selection.append(pan);
  const zoom=group();zoom.append(zoomIn,zoomLabel,zoomOut);
  const history=group();history.append(undo,redo,clear);
  const finish=group();button(finish,'Voltar ao texto','M6 6l12 12M18 6 6 18',close);
  toolbar.replaceChildren(popup,strip,native);
  function refresh(){
    const state=getState();
    pen.classList.toggle('active',state.tool==='pen'&&shape.value==='none'&&ink.value==='pen');
    pencil.classList.toggle('active',state.tool==='pen'&&shape.value==='none'&&ink.value==='pencil');
    marker.classList.toggle('active',state.tool==='pen'&&shape.value==='none'&&ink.value==='highlighter');
    stampButton.classList.toggle('active',state.tool==='stamp');
    areaButton.classList.toggle('active',state.tool==='area');cropButton.classList.toggle('active',state.tool==='crop');
    for(const [item,value] of shapeButtons)item.classList.toggle('active',state.tool==='pen'&&shape.value===value);
    for(const [item,value] of swatches)item.setAttribute('aria-pressed',String(color.value.toLowerCase()===value));
    for(const [item,value] of styleButtons)item.setAttribute('aria-pressed',String(state.lineStyle===value));
    range.value=size.value;output.value=size.value+' px';
    pen.style.setProperty('--pen-color',color.value);marker.style.setProperty('--pen-color',color.value);
    areaTools.dataset.visible=String(state.tool==='area'||state.tool==='crop'||state.hasArea);
    for(const item of strip.querySelectorAll('.whiteboard-tool'))item.setAttribute('aria-pressed',String(item.classList.contains('active')));
  }
  panel.addEventListener('pointerdown',event=>{if(!toolbar.contains(event.target)){popup.hidden=true;pen.setAttribute('aria-expanded','false');}});
  toolbar.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popup.hidden){event.stopPropagation();popup.hidden=true;pen.setAttribute('aria-expanded','false');pen.focus();}});
  color.addEventListener('input',refresh);size.addEventListener('change',refresh);
  refresh();return {refresh};
}

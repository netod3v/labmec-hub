const icons = {
  pencil:'M4 20l4-1L20 7l-3-3L5 16l-1 4ZM13 8l3 3',
  marker:'m5 16 9-11 5 5-9 10H5v-4ZM4 21h8',
  line:'M4 12h16',rect:'M4 5h16v14H4Z',ellipse:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  select:'M5 3l13 9-6 1 3 6-2 1-3-6-5 4V3Z',
  area:'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M8 4h1m3 0h1M4 11v2m16-2v2M11 20h2',
  crop:'M6 3v15h15M3 6h15v15',
  triangle:'m12 4 9 16H3L12 4Z',cube:'m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10 9-5M12 13 3 8m9 5v9',
  cylinder:'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3ZM4 6v12c0 2 4 3 8 3s8-1 8-3V6',
  pyramid:'m12 3 9 15-9 4-9-4L12 3Zm0 0v19M3 18l9-5 9 5',sphere:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12c4 4 14 4 18 0m-9-9c-5 5-5 13 0 18 5-5 5-13 0-18Z',
  laser:'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  lasso:'M7 17c-8-5-2-14 6-13 11 1 12 12 1 14H7c-4 0-5 4-1 4 3 0 5-5 2-7',
  text:'M4 5h16M12 5v15M8 20h8',image:'M4 4h16v16H4V4Zm1 13 5-6 4 4 2-2 4 5M9 8h.01',
  file:'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3 1 3-1 2 4-2 2v3l1 2-3 3-3-1-3 2H9l-1-3-3-1-2-3 2-3V8l3-1 2-4Z',
};

export function initializeDrawingToolbar(options) {
  const {toolbar,areaTools,pen,eraser,pan,select,color,size,ink,eraserMode,shape,undo,redo,clear,zoomIn,zoomOut,zoomLabel,getState,setTool,stamp,close}=options;
  const panel=toolbar.parentElement;
  toolbar.classList.add('note-reference-toolbar');toolbar.setAttribute('aria-label','Ferramentas de desenho');
  const strip=document.createElement('div');strip.className='note-toolbar-strip';
  const popup=document.createElement('div');popup.className='note-pen-popover';popup.hidden=true;
  const palette=document.createElement('div');palette.className='note-color-palette';palette.setAttribute('aria-label','Cores do desenho');
  const swatches=[];
  let editingSwatch=null;
  for(const value of ['#111827','#ffffff','#ef4444','#2563eb','#16a34a','#f59e0b','#a855f7']){
    const button=document.createElement('button');button.type='button';button.className='note-color-swatch';button.style.setProperty('--swatch',value);button.setAttribute('aria-label','Cor '+value);
    const entry=[button,value];
    button.onclick=()=>{if(color.value.toLowerCase()===entry[1]){editingSwatch=entry;color.click();return;}color.value=entry[1];color.dispatchEvent(new Event('input',{bubbles:true}));refresh();};palette.append(button);swatches.push(entry);
  }
  color.title='Escolher outra cor';palette.append(color);popup.append(palette);
  const weight=document.createElement('label');weight.className='note-weight-control';
  const range=document.createElement('input');range.type='range';range.min='1';range.max='30';range.value=size.value;range.setAttribute('aria-label','Espessura do traço');
  const output=document.createElement('output');weight.append('Espessura',range,output);popup.append(weight);
  range.oninput=()=>{
    if(![...size.options].some(option=>option.value===range.value))size.add(new Option(range.value+' px',range.value));
    size.value=range.value;size.dispatchEvent(new Event('change',{bubbles:true}));refresh();
  };
  const styles=document.createElement('div');styles.className='note-line-options';styles.setAttribute('aria-label','Estilo do traço');
  const styleButtons=[];
  for(const [value,label,content] of [['solid','Traço contínuo','<path d="M3 12h26"/>'],['dashed','Traço tracejado','<path d="M3 12h26" stroke-dasharray="4 3"/>'],['dotted','Traço pontilhado','<path d="M3 12h26" stroke-dasharray="1 4" stroke-linecap="round"/>'],['arrow','Traço com seta','<path d="M3 12h26m-5-5 5 5-5 5"/>']]){
    const button=document.createElement('button');button.type='button';button.title=label;button.setAttribute('aria-label',label);button.innerHTML='<svg viewBox="0 0 32 24" aria-hidden="true">'+content+'</svg>';
    button.onclick=()=>{options.setLineStyle(value);refresh();};styles.append(button);styleButtons.push([button,value]);
  }
  popup.append(styles);
  const eraserLabel=document.createElement('label');eraserLabel.className='note-eraser-setting';eraserLabel.append('Borracha',eraserMode);popup.append(eraserLabel);
  function group(){const element=document.createElement('div');element.className='note-tool-group';strip.append(element);return element;}
  function track(element,id){element.dataset.boardTool=id;return element;}
  function button(parent,label,icon,action){const item=document.createElement('button');item.type='button';item.className='whiteboard-tool';item.title=label;item.setAttribute('aria-label',label);item.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+icon+'"/></svg>';item.onclick=action;parent.append(item);return item;}
  function togglePopup(){popup.hidden=!popup.hidden;pen.setAttribute('aria-expanded',String(!popup.hidden));refresh();}
  function selectPen(id){if(options.selectPen)options.selectPen(id);else {ink.value=id==='secondary'?'pencil':id==='highlighter'?'highlighter':'pen';ink.dispatchEvent(new Event('change'));}}
  const drawing=group();drawing.append(track(pen,'pen'));pen.setAttribute('aria-expanded','false');pen.title='Caneta 1 · cores e espessura';pen.addEventListener('click',()=>{const same=ink.value==='pen';selectPen('pen');if(same)togglePopup();else {popup.hidden=false;pen.setAttribute('aria-expanded','true');refresh();}});
  const pencil=track(button(drawing,'Caneta 2',icons.pencil,()=>{selectPen('secondary');popup.hidden=false;refresh();}),'secondary');
  const marker=track(button(drawing,'Marca-texto',icons.marker,()=>{selectPen('highlighter');popup.hidden=false;refresh();}),'highlighter');
  const laser=track(button(drawing,'Caneta laser · apresentação',icons.laser,()=>{setTool('laser');popup.hidden=true;refresh();}),'laser');
  drawing.append(track(eraser,'eraser'));eraser.title='Borracha · clique para configurar';eraser.addEventListener('click',()=>{popup.hidden=false;refresh();});
  // Keep the native controls as the source of truth for the drawing engine.
  const native=document.createElement('div');native.hidden=true;native.append(size,ink,shape);
  const shapes=group(),shapeButtons=[];
  for(const [value,label] of [['line','Linha'],['rect','Retângulo'],['ellipse','Círculo'],['triangle','Triângulo'],['cube','Cubo'],['cylinder','Cilindro'],['pyramid','Pirâmide'],['sphere','Esfera']]){
    if(![...shape.options].some(option=>option.value===value))shape.add(new Option(label,value));
    const item=track(button(shapes,label,icons[value],()=>{shape.value=value;shape.dispatchEvent(new Event('change'));popup.hidden=true;refresh();}),value);shapeButtons.push([item,value]);
  }
  const branding=group();
  const stampButton=document.createElement('button');stampButton.type='button';stampButton.className='whiteboard-tool note-logo-stamp';stampButton.title='Carimbo com a logo do Hub';stampButton.setAttribute('aria-label',stampButton.title);
  stampButton.innerHTML='<img src="assets/labiomec-logo-transparent.png" alt="" draggable="false">';branding.append(track(stampButton,'stamp'));
  stampButton.onclick=async()=>{stampButton.disabled=true;popup.hidden=true;try{await stamp();}finally{stampButton.disabled=false;refresh();}};
  const selection=group();selection.append(track(select,'select'));select.title='Selecionar, mover e redimensionar';
  const lasso=track(button(selection,'Laço · selecionar traços',icons.lasso,()=>{setTool('lasso');popup.hidden=true;refresh();}),'lasso');
  const areaButton=track(button(selection,'Selecionar área',icons.area,()=>{setTool('area');popup.hidden=true;refresh();}),'area');
  const cropButton=track(button(selection,'Recortar bordas',icons.crop,()=>{setTool('crop');popup.hidden=true;refresh();}),'crop');selection.append(track(pan,'pan'));pan.title='Mover quadro · Espaço + arrastar';
  const zoom=track(group(),'zoom');zoom.append(zoomIn,zoomLabel,zoomOut);
  const history=group();history.append(track(undo,'undo'),track(redo,'redo'),track(clear,'clear'));
  const files=group();
  track(button(files,'Salvar como PDF',icons.file,()=>options.exportFile?.('pdf')),'pdf');
  track(button(files,'Baixar imagem PNG',icons.download,()=>options.exportFile?.('png')),'download');
  track(button(files,'Nova caixa de texto',icons.text,()=>options.text?.()),'text');
  for(const [id,label,accept,icon] of [['image','Adicionar imagem','image/png,image/jpeg,image/webp','image'],['importPdf','Adicionar PDF','application/pdf','file']]){
    const input=document.createElement('input');input.type='file';input.accept=accept;input.hidden=true;input.dataset.boardImport=id;native.append(input);
    const item=track(button(files,label,icons[icon],()=>input.click()),id);
    input.onchange=async()=>{const file=input.files?.[0];if(!file)return;item.disabled=true;try{await options.importFile?.(file);}finally{input.value='';item.disabled=false;}};
  }
  const finish=group();button(finish,'Configurações do quadro',icons.settings,()=>options.settings?.());
  const reopen=document.createElement('button');reopen.type='button';reopen.className='note-toolbar-reopen';reopen.textContent='Ferramentas de desenho';reopen.hidden=true;reopen.onclick=()=>{toolbar.hidden=false;areaTools.hidden=false;reopen.hidden=true;refresh();};panel.append(reopen);
  button(finish,'Recolher ferramentas','M6 6l12 12M18 6 6 18',()=>{popup.hidden=true;toolbar.hidden=true;areaTools.hidden=true;reopen.hidden=false;close?.();});
  toolbar.replaceChildren(popup,strip,native);
  function refresh(){
    const state=getState();
    const hidden=new Set(state.preferences?.hiddenTools||[]);
    for(const item of strip.querySelectorAll('[data-board-tool]'))item.hidden=hidden.has(item.dataset.boardTool);
    for(const group of strip.children){if(!group.dataset.boardTool)group.hidden=[...group.children].every(child=>child.hidden);}
    pen.classList.toggle('active',state.tool==='pen'&&shape.value==='none'&&ink.value==='pen');
    pencil.classList.toggle('active',state.tool==='pen'&&shape.value==='none'&&ink.value==='pencil');
    marker.classList.toggle('active',state.tool==='pen'&&shape.value==='none'&&ink.value==='highlighter');
    stampButton.classList.toggle('active',state.tool==='stamp');
    laser.classList.toggle('active',state.tool==='laser');lasso.classList.toggle('active',state.tool==='lasso');
    areaButton.classList.toggle('active',state.tool==='area');cropButton.classList.toggle('active',state.tool==='crop');
    for(const [item,value] of shapeButtons)item.classList.toggle('active',state.tool==='pen'&&shape.value===value);
    for(let i=0;i<swatches.length;i++){const entry=swatches[i],item=entry[0],value=state.preferences?.palette?.[i]||entry[1];entry[1]=value;item.style.setProperty('--swatch',value);item.setAttribute('aria-label','Cor '+value);item.setAttribute('aria-pressed',String(color.value.toLowerCase()===value));}
    for(const [item,value] of styleButtons)item.setAttribute('aria-pressed',String(state.lineStyle===value));
    range.value=size.value;output.value=size.value+' px';
    pen.style.setProperty('--pen-color',state.preferences?.pens?.pen?.color||color.value);pencil.style.setProperty('--pen-color',state.preferences?.pens?.secondary?.color||color.value);marker.style.setProperty('--pen-color',state.preferences?.pens?.highlighter?.color||color.value);
    areaTools.dataset.visible=String(state.tool==='area'||state.tool==='crop'||state.hasArea);
    for(const item of strip.querySelectorAll('.whiteboard-tool'))item.setAttribute('aria-pressed',String(item.classList.contains('active')));
  }
  panel.addEventListener('pointerdown',event=>{if(!toolbar.contains(event.target)){popup.hidden=true;pen.setAttribute('aria-expanded','false');}});
  toolbar.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popup.hidden){event.stopPropagation();popup.hidden=true;pen.setAttribute('aria-expanded','false');pen.focus();}});
  color.addEventListener('input',()=>{if(editingSwatch){editingSwatch[1]=color.value;editingSwatch[0].style.setProperty('--swatch',color.value);options.setPalette?.(swatches.map(entry=>entry[1]));editingSwatch=null;}refresh();});size.addEventListener('change',refresh);
  refresh();return {refresh};
}

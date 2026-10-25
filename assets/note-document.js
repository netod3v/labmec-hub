import { initializeNoteImages } from './note-images.js';
import { initializeNotePageLayout } from './note-page-layout.js';
const MATH_NS = 'http://www.w3.org/1998/Math/MathML';
const htmlTags = new Set('p div span br b strong i em u s strike sub sup h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code hr table thead tbody tfoot tr td th caption colgroup col img a figure figcaption section aside font'.split(' '));
const mathTags = new Set('math mrow mi mn mo mtext mfrac msqrt mroot msup msub msubsup munder mover munderover mtable mtr mtd mfenced'.split(' '));
const skipTags = new Set(['script','style','iframe','object','embed','svg','form','input','button','textarea','select','link','meta']);
const noteClasses = new Set(['note-equation','note-page-break','note-task-list','note-task','note-reference','note-caption','note-footnotes','note-footnote-ref']);
const safeStyles = new Set(['text-align','color','background-color','font-weight','font-style','text-decoration','font-size','font-family','line-height','margin-left','padding-left','width','max-width','height','vertical-align','border-collapse']);
const imageData = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i;
const escapeText = value => String(value || '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function safeLink(value) {
  try { const url=new URL(value,location.href); return ['http:','https:','mailto:'].includes(url.protocol)?url.href:null; } catch {return null;}
}

export function sanitizeNoteHtml(html) {
  const source=new DOMParser().parseFromString(String(html || ''),'text/html');
  const target=document.createElement('div');
  function copy(node,parent){
    if(node.nodeType===Node.TEXT_NODE){parent.append(document.createTextNode(node.textContent));return;}
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    const tag=node.localName.toLowerCase();if(skipTags.has(tag))return;
    if(!htmlTags.has(tag)&&!mathTags.has(tag)){node.childNodes.forEach(child=>copy(child,parent));return;}
    if(tag==='img' && (!imageData.test(node.getAttribute('src') || '') || node.getAttribute('src').length>1500000))return;
    const clean=mathTags.has(tag)?document.createElementNS(MATH_NS,tag):document.createElement(tag);
    const classes=[...node.classList].filter(name=>noteClasses.has(name)); if(classes.length)clean.setAttribute('class',classes.join(' '));
    for(const property of safeStyles){const value=node.style.getPropertyValue(property);if(value&&!/url\s*\(|expression|@import|[<>]/i.test(value))clean.style.setProperty(property,value);}
    if(tag==='a'){
      const raw=node.getAttribute('href') || '';
      const href=/^#note-[\w-]+$/.test(raw)?raw:safeLink(raw);
      if(href){clean.setAttribute('href',href);clean.setAttribute('target','_blank');clean.setAttribute('rel','noopener noreferrer');}
    }
    if(tag==='img'){clean.setAttribute('src',node.getAttribute('src'));clean.setAttribute('alt',(node.getAttribute('alt') || '').slice(0,200));clean.style.maxWidth='100%';}
    if(['td','th'].includes(tag))for(const key of ['rowspan','colspan']){const n=Number(node.getAttribute(key));if(Number.isInteger(n)&&n>=1&&n<=20)clean.setAttribute(key,String(n));}
    if(tag==='font'){
      if(/^[1-7]$/.test(node.getAttribute('size') || ''))clean.setAttribute('size',node.getAttribute('size'));
      if(node.getAttribute('face'))clean.setAttribute('face',node.getAttribute('face').slice(0,100));
      if(node.getAttribute('color') && CSS.supports('color',node.getAttribute('color')))clean.setAttribute('color',node.getAttribute('color'));
    }
    if(mathTags.has(tag))for(const key of ['display','mathvariant','displaystyle','stretchy','open','close','separators']){const value=node.getAttribute(key);if(value&&value.length<=32)clean.setAttribute(key,value);}
    if(/^note-[\w-]{1,100}$/.test(node.id))clean.id=node.id;
    if(classes.includes('note-equation')){
      clean.setAttribute('contenteditable','false');
      try{const data=JSON.parse(node.getAttribute('data-equation') || 'null');if(data&&JSON.stringify(data).length<15000)clean.setAttribute('data-equation',JSON.stringify(data));}catch{}
    }
    if(classes.includes('note-page-break'))clean.setAttribute('contenteditable','false');
    if(classes.includes('note-task')){
      clean.setAttribute('role','checkbox');clean.setAttribute('aria-checked',String(node.getAttribute('aria-checked')==='true'));clean.tabIndex=0;
    }
    node.childNodes.forEach(child=>copy(child,clean));parent.append(clean);
  }
  source.body.childNodes.forEach(node=>copy(node,target));return target.innerHTML;
}

function mathNode(tag,text){const node=document.createElementNS(MATH_NS,tag);if(text!==undefined)node.textContent=text;return node;}
function expression(value){
  const row=mathNode('mrow');
  const tokens=String(value || '□').slice(0,1000).match(/\d+(?:[.,]\d+)?|[\p{L}]+|\S/gu) || ['□'];
  for(const token of tokens)row.append(mathNode(/^\d/.test(token)?'mn':/^\p{L}/u.test(token)?'mi':'mo',token));return row;
}
export function buildNoteEquation(data) {
  const wrapper=document.createElement('span');wrapper.className='note-equation';wrapper.contentEditable='false';
  wrapper.dataset.equation=JSON.stringify(data);wrapper.title='Clique duas vezes para editar a fórmula';
  const math=mathNode('math');math.setAttribute('display','inline');let node;
  const values=Array.isArray(data.values)?data.values:[];
  switch(data.type){
    case 'fraction':node=mathNode('mfrac');node.append(expression(values[0]),expression(values[1]));break;
    case 'power':node=mathNode('msup');node.append(expression(values[0]),expression(values[1]));break;
    case 'subscript':node=mathNode('msub');node.append(expression(values[0]),expression(values[1]));break;
    case 'root':node=mathNode('msqrt');node.append(expression(values[0]));break;
    case 'sum':case 'integral':{
      node=mathNode('mrow');const operator=mathNode('munderover');operator.append(mathNode('mo',data.type==='sum'?'∑':'∫'),expression(values[0]),expression(values[1]));node.append(operator,expression(values[2]));break;
    }
    case 'matrix':{
      const size=Math.min(4,Math.max(2,Number(data.size)||2));node=mathNode('mrow');const table=mathNode('mtable');
      for(let r=0;r<size;r++){const row=mathNode('mtr');for(let c=0;c<size;c++){const cell=mathNode('mtd');cell.append(expression(values[r*size+c]));row.append(cell);}table.append(row);}
      node.append(mathNode('mo','('),table,mathNode('mo',')'));break;
    }
    default:node=expression(values[0]);
  }
  math.append(node);wrapper.append(math);return wrapper;
}

export function initializeNoteDocumentTools({editor,toolbar,modal,getTitle,getDocumentId=()=>null,save,command}) {
  let savedRange=null, activeDialog=null;
  const workspace=document.createElement('div');workspace.className='note-document-workspace';
  const outline=document.createElement('aside');outline.className='note-document-outline';outline.setAttribute('aria-label','Sumário do documento');
  const outlineHeading=document.createElement('strong');outlineHeading.textContent='Neste documento';const outlineList=document.createElement('div');outline.append(outlineHeading,outlineList);
  editor.before(workspace);workspace.append(outline,editor);
  initializeNotePageLayout(editor);
  const ribbon=document.createElement('div');ribbon.className='note-document-ribbon';
  const tabs=document.createElement('div');tabs.className='note-document-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Ferramentas do documento');
  toolbar.before(ribbon);ribbon.append(tabs,toolbar);toolbar.dataset.notePanel='text';toolbar.id='note-format-bar';toolbar.setAttribute('role','tabpanel');
  const panels={text:toolbar};
  for(const [id,title] of [['text','Texto'],['insert','Inserir'],['review','Revisar'],['document','Documento']]){
    const tab=document.createElement('button');tab.type='button';tab.textContent=title;tab.setAttribute('role','tab');tab.id='note-doc-tab-'+id;
    tab.setAttribute('aria-controls',id==='text'?toolbar.id:'note-doc-panel-'+id);tabs.append(tab);
    if(id!=='text'){const panel=document.createElement('div');panel.id='note-doc-panel-'+id;panel.className='note-document-panel';panel.dataset.notePanel=id;panel.setAttribute('role','tabpanel');ribbon.append(panel);panels[id]=panel;}
    panels[id].setAttribute('aria-labelledby',tab.id);
    tab.onclick=()=>{for(const [key,panel] of Object.entries(panels))panel.hidden=key!==id;for(const button of tabs.children){const selected=button===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}};
  }
  tabs.firstElementChild.click();
  tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const buttons=[...tabs.children],index=buttons.indexOf(document.activeElement);const next=buttons[(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length];next.click();next.focus();});
  function remember(){const selection=getSelection();if(selection.rangeCount&&editor.contains(selection.anchorNode))savedRange=selection.getRangeAt(0).cloneRange();}
  function restore(){editor.focus({preventScroll:true});const selection=getSelection();if(savedRange&&editor.contains(savedRange.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(savedRange);}else{const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}}
  document.addEventListener('selectionchange',remember);
  ribbon.addEventListener('mousedown',event=>{if(event.target.closest('button')){remember();event.preventDefault();}});
  const run=(name,value)=>{restore();command(name,value);remember();refresh();};
  function insert(html){if(activeDialog?.open)activeDialog.close();restore();document.execCommand('insertHTML',false,sanitizeNoteHtml(html));save();remember();refresh();}
  function button(panel,label,action,title=label){const node=document.createElement('button');node.type='button';node.className='note-doc-button';node.textContent=label;node.title=title;node.setAttribute('aria-label',title);node.onclick=action;panel.append(node);return node;}
  function select(panel,label,values,action){const wrap=document.createElement('label');wrap.className='note-doc-select';const name=document.createElement('span');name.textContent=label;const field=document.createElement('select');field.setAttribute('aria-label',label);for(const [value,text] of values){const option=document.createElement('option');option.value=value;option.textContent=text;field.append(option);}field.onchange=()=>action(field.value);wrap.append(name,field);panel.append(wrap);return field;}
  select(toolbar,'Estilo',[['p','Texto normal'],['h1','Título principal'],['h2','Título de seção'],['h3','Subtítulo'],['blockquote','Citação']],value=>run('formatBlock',value));
  for(const [label,cmd] of [['↶ Desfazer','undo'],['↷ Refazer','redo'],['Tachado','strikeThrough'],['x²','superscript'],['x₂','subscript'],['1. Lista','insertOrderedList'],['À direita','justifyRight'],['Justificar','justifyFull'],['Recuar','indent'],['Reduzir recuo','outdent'],['Limpar formato','removeFormat']]){const control=button(toolbar,label,()=>run(cmd));control.dataset.noteTool=cmd;}
  const highlight=document.createElement('label');highlight.className='note-color-wrap';highlight.append(document.createTextNode('Marca-texto '));const color=document.createElement('input');color.type='color';color.value='#fff2a8';color.setAttribute('aria-label','Cor do marca-texto');color.oninput=()=>run('hiliteColor',color.value);highlight.append(color);toolbar.append(highlight);
  select(toolbar,'Entrelinhas',[['1.65','Normal'],['1','Simples'],['1.5','1,5'],['2','Duplo']],value=>{
    restore();const selection=getSelection();const nodes=[...editor.querySelectorAll('p,div,h1,h2,h3,li,blockquote')].filter(node=>selection.rangeCount&&selection.getRangeAt(0).intersectsNode(node));
    if(nodes.length)nodes.forEach(node=>node.style.lineHeight=value);else {document.execCommand('formatBlock',false,'p');const node=getSelection()?.anchorNode;const block=(node?.nodeType===Node.TEXT_NODE?node.parentElement:node)?.closest('p,div');if(block&&block!==editor)block.style.lineHeight=value;}save();
  });
  // Keep the existing controls and their listeners, arranging them in named groups.
  function group(title){const section=document.createElement('section');section.className='note-ribbon-group';section.setAttribute('aria-label',title);const body=document.createElement('div');body.className='note-ribbon-group-tools';const caption=document.createElement('span');caption.className='note-ribbon-group-title';caption.textContent=title;section.append(body,caption);toolbar.append(section);return body;}
  const history=group('Histórico'),styles=group('Estilos'),font=group('Fonte e cor'),paragraph=group('Parágrafo');
  const findControl=cmd=>toolbar.querySelector('[data-note-command="'+cmd+'"],[data-note-tool="'+cmd+'"]');
  for(const cmd of ['undo','redo'])history.append(findControl(cmd));
  const selects=[...toolbar.querySelectorAll('.note-doc-select')];styles.append(selects[0]);
  function labelControl(id,label){const control=toolbar.querySelector('#'+id);if(!control)return;const wrap=document.createElement('label');wrap.className='note-doc-select';const name=document.createElement('span');name.textContent=label;control.setAttribute('aria-label',label);wrap.append(name,control);font.append(wrap);}
  labelControl('note-font-family','Fonte');labelControl('note-font-size','Tamanho');
  const fontLabels={bold:'Negrito',italic:'Itálico',underline:'Sublinhado',strikeThrough:'Tachado',superscript:'Sobrescrito (ex.: x²)',subscript:'Subscrito (ex.: H₂O)',removeFormat:'Limpar formatação do texto selecionado'};
  for(const [cmd,label] of Object.entries(fontLabels)){const control=findControl(cmd);if(control){control.title=label;control.setAttribute('aria-label',label);font.append(control);}}
  const textColor=toolbar.querySelector('#note-text-color');if(textColor){textColor.setAttribute('aria-label','Cor do texto');textColor.parentElement.firstChild.textContent='Cor do texto ';font.append(textColor.parentElement);}
  font.append(highlight);
  const alignLabels={justifyLeft:'À esquerda',justifyCenter:'Centralizar',justifyRight:'À direita',justifyFull:'Justificar'};
  for(const [cmd,label] of Object.entries(alignLabels)){const control=findControl(cmd);if(!control)continue;control.textContent=label;control.title='Alinhamento: '+label.toLowerCase();control.setAttribute('aria-label',control.title);paragraph.append(control);}
  for(const [cmd,label] of [['insertUnorderedList','• Marcadores'],['insertOrderedList','1. Numerada'],['indent','Aumentar recuo'],['outdent','Diminuir recuo']]){const control=findControl(cmd);if(control){control.textContent=label;control.title=label;paragraph.append(control);}}
  paragraph.append(selects[1]);
  const more=document.createElement('div');more.className='note-more-popover';more.id='note-more-formatting';more.popover='auto';more.setAttribute('aria-label','Mais opções de formatação');toolbar.append(more);
  for(const cmd of ['strikeThrough','superscript','subscript','removeFormat','indent','outdent']){const control=findControl(cmd);if(control)more.append(control);}
  more.append(selects[1]);
  const moreButton=button(toolbar,'Mais ⋯',()=>{},'Mais opções: recuo, entrelinhas e formatação');moreButton.popoverTargetElement=more;moreButton.setAttribute('aria-controls',more.id);
  more.addEventListener('beforetoggle',event=>{if(event.newState==='open'){const r=moreButton.getBoundingClientRect();more.style.left=Math.max(8,Math.min(r.left,innerWidth-340))+'px';more.style.top=r.bottom+6+'px';}});
  toolbar.addEventListener('click',event=>{if(event.target.closest('[data-note-panel]')&&!more.contains(event.target)&&event.target!==moreButton&&more.matches(':popover-open'))more.hidePopover();});
  const compactLabels={undo:'↶',redo:'↷',insertUnorderedList:'• ≡',insertOrderedList:'1. ≡'};
  for(const [cmd,label] of Object.entries(compactLabels)){const control=findControl(cmd);if(control){control.textContent=label;control.classList.add('note-compact-tool');}}
  for(const cmd of Object.keys(alignLabels)){
    const control=findControl(cmd);if(!control)continue;control.classList.add('note-compact-tool');
    const lines={justifyLeft:[[3,18],[3,13],[3,18],[3,13]],justifyCenter:[[3,18],[6,12],[3,18],[6,12]],justifyRight:[[3,18],[8,13],[3,18],[8,13]],justifyFull:[[3,18],[3,18],[3,18],[3,18]]}[cmd];
    control.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+lines.map(([x,width],i)=>'<path d="M'+x+' '+(5+i*4)+'h'+width+'"/>').join('')+'</svg>';
  }
  const guidance=document.createElement('p');guidance.className='note-format-guidance';guidance.textContent='Selecione o texto para mudar a fonte ou a cor. Para alinhar, clique no parágrafo e escolha a posição.';ribbon.append(guidance);
  guidance.hidden=true;
  const tabRow=document.createElement('div');tabRow.className='note-document-tab-row';tabs.before(tabRow);tabRow.append(tabs);
  const ribbonActions=document.createElement('div');ribbonActions.className='note-ribbon-actions';tabRow.append(ribbonActions);
  const help=button(ribbonActions,'Ajuda',()=>{setRibbonCollapsed(false);guidance.hidden=!guidance.hidden;help.setAttribute('aria-expanded',String(!guidance.hidden));},'Mostrar orientações de formatação');help.setAttribute('aria-expanded','false');
  const collapse=button(ribbonActions,'Recolher',()=>setRibbonCollapsed(!ribbon.classList.contains('note-tools-collapsed')),'Recolher ou mostrar as ferramentas para dar mais espaço à escrita');
  function setRibbonCollapsed(value){if(value&&more.matches(':popover-open'))more.hidePopover();ribbon.classList.toggle('note-tools-collapsed',value);collapse.textContent=value?'Mostrar ferramentas':'Recolher';collapse.setAttribute('aria-expanded',String(!value));}
  setRibbonCollapsed(false);
  tabs.addEventListener('click',event=>{if(event.target.closest('[role=tab]')){setRibbonCollapsed(false);if(more.matches(':popover-open'))more.hidePopover();}});
  modal.addEventListener('click',event=>{if(event.target.closest('#note-mode-draw,#note-studio-close')&&more.matches(':popover-open'))more.hidePopover();});
  const head=modal.querySelector('.modal-head'),back=modal.querySelector('#note-studio-close');if(head&&back){head.firstElementChild.classList.add('note-document-heading');head.prepend(back);}
  const statusSource=document.getElementById('note-save-status');if(head&&statusSource){const status=document.createElement('span');status.className='note-header-save';status.setAttribute('role','status');const sync=()=>status.textContent=statusSource.textContent;sync();new MutationObserver(sync).observe(statusSource,{childList:true,subtree:true,characterData:true});head.append(status);}
  const stateCommands=['bold','italic','underline','strikeThrough','superscript','subscript','justifyLeft','justifyCenter','justifyRight','justifyFull','insertUnorderedList','insertOrderedList'];
  function updateFormattingState(){const selection=getSelection();if(!selection.rangeCount||!editor.contains(selection.anchorNode))return;for(const cmd of stateCommands){const control=findControl(cmd);if(control){try{control.setAttribute('aria-pressed',String(document.queryCommandState(cmd)));}catch{}}}}
  document.addEventListener('selectionchange',updateFormattingState);editor.addEventListener('input',updateFormattingState);toolbar.addEventListener('click',()=>queueMicrotask(updateFormattingState));
  function dialog(title,description,contents,onSubmit,submitLabel='Inserir'){
    remember();if(activeDialog?.open)activeDialog.close();const box=document.createElement('dialog');box.className='note-tool-dialog';
    box.innerHTML='<form><div class="note-tool-heading"><h2></h2><p></p></div><div class="note-tool-fields"></div><p class="note-tool-error" role="status"></p><div class="note-tool-actions"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn btn-primary"></button></div></form>';
    box.querySelector('h2').textContent=title;box.querySelector('.note-tool-heading p').textContent=description;box.querySelector('[type=submit]').textContent=submitLabel;
    const fields=box.querySelector('.note-tool-fields');fields.append(contents);
    box.querySelector('[data-cancel]').onclick=()=>box.close();
    box.querySelector('form').onsubmit=event=>{event.preventDefault();try{onSubmit(box);box.close();}catch(error){box.querySelector('[role=status]').textContent=error.message;}};
    box.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
    box.addEventListener('close',()=>{box.remove();if(activeDialog===box)activeDialog=null;editor.focus({preventScroll:true});},{once:true});
    document.body.append(box);activeDialog=box;box.showModal();return box;
  }
  function inputField(parent,label,{value='',type='text',min,max,required=false}={}){
    const wrap=document.createElement('label');wrap.className='note-tool-label';const caption=document.createElement('span');caption.textContent=label;const field=document.createElement('input');field.type=type;field.value=value;field.required=required;if(min!==undefined)field.min=min;if(max!==undefined)field.max=max;field.maxLength=1000;wrap.append(caption,field);parent.append(wrap);return field;
  }
  function numberField(parent,label,value,max=10){return inputField(parent,label,{value,type:'number',min:1,max,required:true});}
  button(panels.insert,'Tabela',()=>{
    const fields=document.createElement('div');fields.className='note-tool-grid';const rows=numberField(fields,'Linhas',3),cols=numberField(fields,'Colunas',3);
    dialog('Inserir tabela','Escolha o tamanho. Depois, clique nas células para preencher.',fields,()=>{
      const r=Number(rows.value),c=Number(cols.value);if(!Number.isInteger(r)||!Number.isInteger(c)||r<1||r>10||c<1||c>10)throw Error('Escolha de 1 a 10 linhas e colunas.');
      let html='<table><tbody>';for(let y=0;y<r;y++){html+='<tr>';for(let x=0;x<c;x++)html+=(y===0?'<th>':'<td>')+'<br>'+(y===0?'</th>':'</td>');html+='</tr>';}insert(html+'</tbody></table><p><br></p>');
    });
  });
  function equationDialog(existing=null){
    let initial={type:'fraction',values:['a + b','c']};try{if(existing)initial=JSON.parse(existing.dataset.equation);}catch{}
    const fields=document.createElement('div'),type=document.createElement('select');type.className='field';type.setAttribute('aria-label','Tipo de fórmula');
    for(const [id,label] of [['fraction','Fração'],['power','Potência'],['subscript','Índice'],['root','Raiz quadrada'],['sum','Somatório'],['integral','Integral'],['matrix','Matriz'],['expression','Expressão livre']]){const option=document.createElement('option');option.value=id;option.textContent=label;type.append(option);}type.value=initial.type;
    const inputs=document.createElement('div');inputs.className='note-equation-inputs';const preview=document.createElement('div');preview.className='note-equation-preview';preview.setAttribute('aria-label','Prévia da fórmula');const symbols=document.createElement('div');symbols.className='note-symbols';
    fields.append(type,inputs,symbols,preview);let values=[],matrixSize=initial.size||2,activeField=null;
    const data=()=>({type:type.value,values:values.map(field=>field.value),size:matrixSize});
    const paint=()=>preview.replaceChildren(buildNoteEquation(data()));
    const rebuild=(preset=[])=>{
      inputs.replaceChildren();values=[];
      if(type.value==='matrix'){
        const size=document.createElement('select');size.setAttribute('aria-label','Tamanho da matriz');for(const n of [2,3,4]){const option=document.createElement('option');option.value=n;option.textContent=n+' × '+n;size.append(option);}size.value=matrixSize;size.onchange=()=>{matrixSize=Number(size.value);rebuild();};inputs.append(size);
      }
      const labels={fraction:['Numerador (parte de cima)','Denominador (parte de baixo)'],power:['Base','Expoente'],subscript:['Símbolo','Índice'],root:['Expressão dentro da raiz'],sum:['Limite inferior','Limite superior','Expressão'],integral:['Limite inferior','Limite superior','Função e diferencial'],expression:['Expressão']};
      const names=type.value==='matrix'?Array.from({length:matrixSize*matrixSize},(_,i)=>'Linha '+(Math.floor(i/matrixSize)+1)+', coluna '+(i%matrixSize+1)):labels[type.value];
      for(const [i,label] of names.entries()){
        const field=inputField(inputs,label,{value:preset[i] || ''});field.oninput=paint;field.onfocus=()=>activeField=field;values.push(field);
      }
      activeField=values[0];paint();
    };
    for(const symbol of ['α','β','γ','θ','λ','μ','σ','ω','Δ','π','∞','±','×','÷','≈','≠','≤','≥','∂','∇','→'])button(symbols,symbol,()=>{const field=activeField||values[0];field.setRangeText(symbol,field.selectionStart,field.selectionEnd,'end');field.focus();paint();},'Inserir '+symbol);
    type.onchange=()=>rebuild();rebuild(initial.values);
    dialog(existing?'Editar fórmula':'Inserir fórmula','Escolha a estrutura e preencha os campos. A prévia é atualizada enquanto você escreve.',fields,()=>{
      const node=buildNoteEquation(data());if(existing?.isConnected){existing.replaceWith(node);save();refresh();}else insert(node.outerHTML+'&nbsp;');
    },existing?'Atualizar fórmula':'Inserir fórmula');
  }
  button(panels.insert,'Equação',()=>equationDialog());
  editor.addEventListener('dblclick',event=>{const node=event.target.closest('.note-equation');if(node)equationDialog(node);});
  function addImage(file){
    const documentId=getDocumentId();
    if(!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type))return Promise.reject(Error('Escolha uma imagem PNG, JPEG, GIF ou WebP.'));
    if(file.size>512*1024)return Promise.reject(Error('Use uma imagem de até 512 KB para manter suas notas leves.'));
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Não foi possível ler a imagem.'));reader.onload=()=>{if(getDocumentId()!==documentId){reject(Error('A nota mudou. Escolha a imagem novamente na nota desejada.'));return;}if(editor.innerHTML.length+String(reader.result).length>3500000){reject(Error('Esta nota está grande. Use imagens menores ou outra aba.'));return;}insert('<figure><img src="'+reader.result+'" alt="'+escapeText(file.name)+'" style="width:75%;height:auto"><figcaption class="note-caption">Escreva uma legenda…</figcaption></figure><p><br></p>');resolve();};reader.readAsDataURL(file);});
  }
  const imagePicker=document.createElement('input');imagePicker.type='file';imagePicker.accept='image/png,image/jpeg,image/gif,image/webp';imagePicker.hidden=true;ribbon.append(imagePicker);
  const notify=document.createElement('span');notify.className='note-document-notice';notify.setAttribute('role','status');ribbon.append(notify);
  imagePicker.onchange=()=>{const file=imagePicker.files[0];if(file)addImage(file).catch(error=>notify.textContent=error.message);imagePicker.value='';};
  button(panels.insert,'Imagem',()=>{remember();notify.textContent='';imagePicker.click();});
  initializeNoteImages({editor,modal,save});
  button(panels.insert,'Link',()=>{
    const fields=document.createElement('div');const label=inputField(fields,'Texto do link',{value:getSelection()?.toString() || ''}),url=inputField(fields,'Endereço (https://…)',{required:true});
    dialog('Inserir link','Informe um endereço de site ou e-mail.',fields,()=>{const href=safeLink(url.value.trim());if(!href||!url.value.trim())throw Error('Use um endereço https://, http:// ou mailto:.');insert('<a href="'+escapeText(href)+'">'+escapeText(label.value||url.value)+'</a>');});
  });
  button(panels.insert,'Remover link',()=>run('unlink'));
  button(panels.insert,'Lista de tarefas',()=>insert('<ul class="note-task-list"><li class="note-task" role="checkbox" aria-checked="false" tabindex="0">Nova tarefa</li></ul><p><br></p>'));
  const toggleTask=task=>{task.setAttribute('aria-checked',String(task.getAttribute('aria-checked')!=='true'));save();};
  editor.addEventListener('click',event=>{const task=event.target.closest('.note-task');if(task&&event.clientX<task.getBoundingClientRect().left+24){event.preventDefault();toggleTask(task);}});
  editor.addEventListener('keydown',event=>{const node=getSelection()?.anchorNode;const task=(node?.nodeType===Node.TEXT_NODE?node.parentElement:node)?.closest?.('.note-task');if(task&&event.ctrlKey&&event.key==='Enter'){event.preventDefault();toggleTask(task);}});
  button(panels.insert,'Separador',()=>insert('<hr><p><br></p>'));
  button(panels.insert,'Quebra de página',()=>insert('<div class="note-page-break" contenteditable="false"><span>Quebra de página</span></div><p><br></p>'));
  button(panels.insert,'Nota de rodapé',()=>{
    const fields=document.createElement('div'),text=inputField(fields,'Texto da nota',{required:true});
    dialog('Nota de rodapé','Insere uma chamada no texto e a explicação ao final do documento.',fields,()=>{
      const id='note-foot-'+crypto.randomUUID(),number=editor.querySelectorAll('.note-footnote-ref').length+1;
      insert('<sup><a class="note-footnote-ref" href="#'+id+'">['+number+']</a></sup>');
      let section=editor.querySelector('.note-footnotes');if(!section){section=document.createElement('section');section.className='note-footnotes';section.innerHTML='<h3>Notas de rodapé</h3><ol></ol>';editor.append(section);}
      const item=document.createElement('li');item.id=id;item.textContent=text.value;section.querySelector('ol').append(item);save();refresh();
    });
  });
  button(panels.insert,'Referência',()=>{
    const fields=document.createElement('div'),author=inputField(fields,'Autor(es)',{required:true}),year=inputField(fields,'Ano'),title=inputField(fields,'Título',{required:true}),url=inputField(fields,'Link da fonte (opcional)');
    dialog('Inserir referência','Preencha os dados da fonte para registrar a referência no documento.',fields,()=>{
      const href=url.value?safeLink(url.value):null;if(url.value&&!href)throw Error('Informe um link válido para a fonte.');
      insert('<p class="note-reference">'+escapeText(author.value)+(year.value?' ('+escapeText(year.value)+')':'')+'. <i>'+escapeText(title.value)+'</i>.'+(href?' <a href="'+escapeText(href)+'">Acessar fonte</a>':'')+'</p>');
    });
  });
  const tableTools=document.createElement('div');tableTools.className='note-table-tools';tableTools.hidden=true;tableTools.setAttribute('aria-label','Editar tabela');panels.insert.append(tableTools);
  function currentCell(){let node=getSelection()?.anchorNode;if(node?.nodeType===Node.TEXT_NODE)node=node.parentElement;return node?.closest?.('td,th');}
  function tableAction(action){
    restore();const cell=currentCell(),table=cell?.closest('table');if(!cell||!editor.contains(table)){notify.textContent='Clique em uma célula da tabela primeiro.';return;}
    const row=cell.parentElement,index=cell.cellIndex;
    if(action==='row'){const next=table.insertRow(row.rowIndex+1);for(let i=0;i<row.cells.length;i++)next.insertCell().append(document.createElement('br'));}
    if(action==='column')for(const r of table.rows)r.insertCell(Math.min(index+1,r.cells.length)).append(document.createElement('br'));
    if(action==='delete-row'){if(table.rows.length>1)row.remove();else table.remove();}
    if(action==='delete-column'){if(row.cells.length>1)for(const r of [...table.rows])r.cells[index]?.remove();else table.remove();}
    if(action==='delete-table')table.remove();save();refresh();
  }
  for(const [label,action] of [['+ Linha','row'],['+ Coluna','column'],['− Linha','delete-row'],['− Coluna','delete-column'],['Remover tabela','delete-table']])button(tableTools,label,()=>tableAction(action));
  editor.addEventListener('keyup',()=>{tableTools.hidden=!currentCell();});editor.addEventListener('click',()=>{tableTools.hidden=!currentCell();});
  editor.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;const cell=currentCell();if(!cell||!editor.contains(cell))return;
    const cells=[...cell.closest('table').querySelectorAll('td,th')],index=cells.indexOf(cell),next=cells[index+(event.shiftKey?-1:1)];
    if(next){event.preventDefault();const range=document.createRange();range.selectNodeContents(next);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);remember();}
  });
  function findDialog(){
    const fields=document.createElement('div'),search=inputField(fields,'Localizar',{required:true}),replacement=inputField(fields,'Substituir por');
    const matches=()=>{
      if(!search.value)return [];
      const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement.closest('[contenteditable="false"]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
      const nodes=[];let text='',node;while((node=walker.nextNode())){nodes.push({node,start:text.length});text+=node.textContent;}
      const result=[];let position=0;
      while((position=text.toLocaleLowerCase('pt-BR').indexOf(search.value.toLocaleLowerCase('pt-BR'),position))>=0){
        const end=position+search.value.length,first=nodes.find(item=>item.start+item.node.length>position),last=[...nodes].reverse().find(item=>item.start<end);
        if(first&&last){const range=document.createRange();range.setStart(first.node,position-first.start);range.setEnd(last.node,end-last.start);result.push(range);}position=end;if(result.length>=1000)break;
      }
      return result;
    };
    const preview=document.createElement('p');fields.append(preview);let lastIndex=-1;
    button(fields,'Localizar próxima',()=>{const ranges=matches();if(!ranges.length){preview.textContent='Nenhuma ocorrência encontrada.';return;}lastIndex=(lastIndex+1)%ranges.length;const range=ranges[lastIndex];const selection=getSelection();selection.removeAllRanges();selection.addRange(range);range.startContainer.parentElement.scrollIntoView({block:'center',behavior:'smooth'});preview.textContent=(lastIndex+1)+' de '+ranges.length+' ocorrências.';});
    dialog('Buscar e substituir','A busca considera o texto, preservando as fórmulas.',fields,()=>{const ranges=matches();if(!ranges.length)throw Error('Nenhuma ocorrência encontrada.');for(const range of ranges.reverse()){range.deleteContents();range.insertNode(document.createTextNode(replacement.value));}save();refresh();},'Substituir todas');
  }
  button(panels.review,'Buscar e substituir',findDialog);
  button(panels.review,'Corretor ortográfico',()=>{editor.spellcheck=!editor.spellcheck;notify.textContent=editor.spellcheck?'Corretor do navegador ativado.':'Corretor do navegador desativado.';});
  button(panels.review,'Mostrar / ocultar sumário',()=>workspace.classList.toggle(matchMedia('(max-width:720px)').matches?'show-outline':'hide-outline'));
  const counter=document.createElement('div');counter.className='note-document-counter';counter.setAttribute('aria-label','Estatísticas do documento');workspace.after(counter);
  function refresh(){
    const text=editor.innerText || '';counter.textContent=(text.trim()?text.trim().split(/\s+/u).length:0)+' palavras · '+text.length+' caracteres';
    outlineList.replaceChildren();const headings=[...editor.querySelectorAll('h1,h2,h3')];
    if(!headings.length){const hint=document.createElement('p');hint.textContent='Use os estilos de título para organizar suas seções aqui.';outlineList.append(hint);}
    headings.forEach(heading=>{const item=document.createElement('button');item.type='button';item.textContent=heading.textContent || 'Título sem texto';item.dataset.level=heading.tagName;item.onclick=()=>{heading.scrollIntoView({block:'start',behavior:'smooth'});const range=document.createRange();range.selectNodeContents(heading);range.collapse(true);editor.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(range);};outlineList.append(item);});
  }
  const observer=new MutationObserver(()=>{clearTimeout(refresh.timer);refresh.timer=setTimeout(refresh,150);});observer.observe(editor,{childList:true,subtree:true,characterData:true});
  const printStyles='@page{size:A4;margin:20mm}body{font:12pt/1.6 Georgia,serif;color:#111;background:white;margin:0}h1,h2,h3{break-after:avoid}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}td,th{border:1px solid #888;padding:8px}th{background:#eef2f6}math{font-size:1.2em}.note-equation{display:inline-block;margin:0 4px}.note-caption{font-size:10pt;color:#555}.note-page-break{break-after:page;page-break-after:always;height:0}.note-page-break span{display:none}.note-task-list{list-style:none}.note-task::before{content:"☐ ";}.note-task[aria-checked=true]::before{content:"☑ ";}a{color:#185b85}';
  function documentHtml(){return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:; style-src &#39;unsafe-inline&#39;"><title>'+escapeText(getTitle())+'</title><style>'+printStyles+'</style></head><body>'+sanitizeNoteHtml(editor.innerHTML)+'</body></html>';}
  function download(content,type,extension){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=(getTitle() || 'Documento').replace(/[<>:"/\\|?*]/g,'-')+'.'+extension;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  button(panels.document,'Imprimir / Salvar PDF',()=>{
    save();const frame=document.createElement('iframe');frame.className='note-print-frame';frame.title='Impressão da nota';frame.onload=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});frame.contentWindow.focus();frame.contentWindow.print();};frame.srcdoc=documentHtml();document.body.append(frame);setTimeout(()=>frame.remove(),120000);
  });
  button(panels.document,'Baixar documento (.html)',()=>download(documentHtml(),'text/html;charset=utf-8','html'));
  button(panels.document,'Baixar texto (.txt)',()=>download(editor.innerText,'text/plain;charset=utf-8','txt'));
  const importPicker=document.createElement('input');importPicker.type='file';importPicker.accept='.txt,.html,.htm,text/plain,text/html';importPicker.hidden=true;ribbon.append(importPicker);
  button(panels.document,'Importar texto / HTML',()=>{remember();importPicker.click();});
  importPicker.onchange=async()=>{const file=importPicker.files[0],documentId=getDocumentId();if(!file)return;try{if(file.size>1500000)throw Error('Importe um documento de até 1,5 MB.');const text=await file.text();if(getDocumentId()!==documentId)return;insert(/\.html?$/i.test(file.name)||file.type==='text/html'?text:escapeText(text).replace(/\n/g,'<br>'));notify.textContent='Conteúdo importado na posição do cursor.';}catch(error){notify.textContent=error.message;}importPicker.value='';};
  button(panels.document,'Modelos prontos',()=>{
    const fields=document.createElement('div');fields.className='note-template-list';
    const templates={
      'Relatório de experimento':'<h1>Relatório de experimento</h1><p>Data: '+new Date().toLocaleDateString('pt-BR')+'</p><h2>Objetivo</h2><p>Descreva a pergunta do experimento.</p><h2>Materiais e métodos</h2><p>Registre equipamentos, amostra e procedimentos.</p><h2>Resultados</h2><table><tr><th>Medida</th><th>Valor</th><th>Unidade</th></tr><tr><td><br></td><td><br></td><td><br></td></tr></table><h2>Discussão</h2><p>Interprete os resultados e as limitações.</p><h2>Conclusão</h2><p>Registre os principais achados.</p><h2>Referências</h2><p><br></p>',
      'Ata de reunião':'<h1>Ata de reunião</h1><p>Data: '+new Date().toLocaleDateString('pt-BR')+'</p><h2>Participantes</h2><p><br></p><h2>Pauta</h2><ol><li>Primeiro assunto</li></ol><h2>Decisões</h2><p><br></p><h2>Próximos passos</h2><table><tr><th>Atividade</th><th>Responsável</th><th>Prazo</th></tr><tr><td><br></td><td><br></td><td><br></td></tr></table>',
      'Projeto de pesquisa':'<h1>Título do projeto</h1><h2>Resumo</h2><p><br></p><h2>Introdução e justificativa</h2><p><br></p><h2>Objetivos</h2><ul><li>Objetivo principal</li></ul><h2>Metodologia</h2><p><br></p><h2>Cronograma</h2><table><tr><th>Etapa</th><th>Início</th><th>Fim</th></tr><tr><td><br></td><td><br></td><td><br></td></tr></table><h2>Referências</h2><p><br></p>'
    };
    let chosen=Object.keys(templates)[0];for(const name of Object.keys(templates)){const item=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='note-template';radio.value=name;radio.checked=name===chosen;radio.onchange=()=>chosen=name;item.append(radio,document.createTextNode(name));fields.append(item);}
    dialog('Começar com um modelo','O modelo é inserido na posição do cursor, sem apagar seu texto.',fields,()=>insert(templates[chosen]));
  });
  editor.addEventListener('paste',event=>{event.preventDefault();const html=event.clipboardData.getData('text/html');insert(html || escapeText(event.clipboardData.getData('text/plain')).replace(/\n/g,'<br>'));});
  editor.addEventListener('drop',event=>{if(event.dataTransfer.files.length){event.preventDefault();const file=event.dataTransfer.files[0];addImage(file).catch(error=>notify.textContent=error.message);}else if(event.dataTransfer.getData('text/html')){event.preventDefault();insert(event.dataTransfer.getData('text/html'));}});
  modal.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&modal.contains(document.activeElement)){event.preventDefault();findDialog();}});
  editor.setAttribute('lang','pt-BR');editor.setAttribute('aria-label','Conteúdo do documento');editor.spellcheck=true;refresh();
  return {refresh,closeDialog:()=>{activeDialog?.close();if(more.matches(':popover-open'))more.hidePopover();}};
}

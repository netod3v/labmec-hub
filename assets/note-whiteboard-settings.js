import {WHITEBOARD_TOOLS,WHITEBOARD_SHORTCUTS,defaultWhiteboardSettings,normalizeWhiteboardSettings,whiteboardKey} from './note-whiteboard-model.js';

export function openWhiteboardSettings({host,getSettings,setSettings}) {
  let draft=normalizeWhiteboardSettings(getSettings()),editing=null,modifier=null;
  const dialog=document.createElement('dialog');dialog.className='note-board-dialog note-board-settings';
  const form=document.createElement('form');form.method='dialog';
  const heading=document.createElement('div');heading.className='note-board-settings-heading';heading.innerHTML='<div><h2>Configurações do quadro</h2><p>Seu fundo, suas ferramentas e seus atalhos.</p></div><button type="button" aria-label="Fechar configurações">×</button>';heading.querySelector('button').onclick=()=>dialog.close();
  const tabs=document.createElement('div');tabs.className='note-board-settings-tabs';tabs.setAttribute('role','tablist');
  const content=document.createElement('div');content.className='note-board-settings-content';
  const message=document.createElement('p');message.className='note-board-settings-message';message.setAttribute('role','status');
  const footer=document.createElement('div');footer.className='note-board-settings-footer';footer.innerHTML='<button type="button" data-reset>Restaurar padrões</button><span></span><button type="button" data-cancel>Cancelar</button><button type="submit" value="save" class="btn-primary">Salvar preferências</button>';
  footer.querySelector('[data-cancel]').onclick=()=>dialog.close();
  footer.querySelector('[data-reset]').onclick=()=>{draft=defaultWhiteboardSettings();render(active);message.textContent='Padrões restaurados. Salve para aplicar.';};
  form.append(heading,tabs,content,message,footer);dialog.append(form);
  let active='board';
  const tabButtons=[];
  for(const [id,title] of [['board','Fundo'],['behavior','Comportamento'],['tools','Ferramentas'],['keys','Atalhos']]){const button=document.createElement('button');button.type='button';button.textContent=title;button.setAttribute('role','tab');button.onclick=()=>render(id);tabs.append(button);tabButtons.push([button,id]);}
  function section(title){const section=document.createElement('section');const heading=document.createElement('h3');heading.textContent=title;section.append(heading);content.append(section);return section;}
  function checkbox(parent,text,checked,change){const label=document.createElement('label');label.className='note-board-check';const input=document.createElement('input');input.type='checkbox';input.checked=checked;input.onchange=()=>change(input.checked);label.append(input,document.createTextNode(text));parent.append(label);return input;}
  function render(id){active=id;editing=null;content.replaceChildren();message.textContent='';for(const [button,key] of tabButtons)button.setAttribute('aria-selected',String(id===key));
    if(id==='board'){
      const background=section('Tipo de fundo');
      const choices=document.createElement('div');choices.className='note-background-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label','Tipo de fundo');
      for(const [value,label] of [['white','Branco'],['grid','Quadriculado'],['dots','Pontinhos'],['color','Cor']]){
        const button=document.createElement('button');button.type='button';button.className='note-background-choice';button.setAttribute('aria-pressed',String(draft.background===value));
        const preview=document.createElement('span');preview.className='note-background-preview';preview.dataset.background=value;
        preview.style.setProperty('--background-color',value==='white'?'#ffffff':draft.color);preview.style.setProperty('--pattern-color',value==='grid'?draft.gridColor:draft.dotsColor);
        button.append(preview,document.createTextNode(label));button.onclick=()=>{draft.background=value;render('board');};choices.append(button);
      }
      background.append(choices);
      const colors=document.createElement('div');colors.className='note-background-colors';background.append(colors);
      function colorField(title,key){const label=document.createElement('label');label.append(document.createTextNode(title));const input=document.createElement('input');input.type='color';input.value=draft[key];input.setAttribute('aria-label',title);input.oninput=()=>{draft[key]=input.value;for(const preview of choices.querySelectorAll('.note-background-preview')){preview.style.setProperty('--background-color',preview.dataset.background==='white'?'#ffffff':draft.color);preview.style.setProperty('--pattern-color',preview.dataset.background==='grid'?draft.gridColor:draft.dotsColor);}};label.append(input);colors.append(label);}
      if(draft.background!=='white')colorField('Cor do fundo','color');
      if(draft.background==='grid')colorField('Cor das linhas','gridColor');
      if(draft.background==='dots')colorField('Cor dos pontinhos','dotsColor');
    }else if(id==='behavior'){
      const recognition=section('Reconhecimento de formas · Ink to Shape');checkbox(recognition,'Reconhecer formas ao segurar o traço parado por meio segundo',draft.recognize,value=>draft.recognize=value);
      for(const [key,label] of [['ellipse','Círculo'],['rect','Retângulo'],['triangle','Triângulo'],['line','Linha reta']])checkbox(recognition,label,draft.recognizeTypes.includes(key),value=>{draft.recognizeTypes=draft.recognizeTypes.filter(x=>x!==key);if(value)draft.recognizeTypes.push(key);});
      const explanation=document.createElement('p');explanation.textContent='Linhas quase retas também são alinhadas ao soltar a caneta. Segure o atalho de linha reta para desenhar uma linha manualmente.';recognition.append(explanation);
      const scroll=section('Rolagem do mouse');for(const [value,label] of [['none','Ignorar o scroll dentro do quadro'],['pan','Mover o quadro para cima e para baixo · '+draft.shortcuts.zoomModifier+' + scroll dá zoom'],['zoom','Aplicar zoom diretamente com o scroll']]){const row=document.createElement('label');row.className='note-board-check';const input=document.createElement('input');input.type='radio';input.name='wheel';input.value=value;input.checked=draft.wheel===value;input.onchange=()=>draft.wheel=value;row.append(input,document.createTextNode(label));scroll.append(row);}
    }else if(id==='tools'){
      const tools=section('Ferramentas visíveis');const info=document.createElement('p');info.textContent='Desmarque as ferramentas que você prefere ocultar. Configurações e o botão de reabrir a barra permanecem acessíveis.';tools.append(info);
      const list=document.createElement('div');list.className='note-board-tool-list';tools.append(list);
      for(const [key,label] of WHITEBOARD_TOOLS)checkbox(list,label,!draft.hiddenTools.includes(key),value=>{draft.hiddenTools=draft.hiddenTools.filter(x=>x!==key);if(!value)draft.hiddenTools.push(key);});
    }else{
      const keys=section('Atalhos de teclado');
      for(const [id,label] of WHITEBOARD_SHORTCUTS){const row=document.createElement('div');row.className='note-board-shortcut';const title=document.createElement('span');title.textContent=label;const value=document.createElement('kbd');value.textContent=draft.shortcuts[id];const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.setAttribute('aria-label','Editar atalho: '+label);edit.onclick=()=>{editing=id;modifier=null;message.textContent='Pressione o novo atalho para '+label.toLowerCase()+'. Esc cancela.';edit.focus();};row.append(title,value,edit);keys.append(row);}
      for(const [label,value] of [['Copiar seleção','Ctrl+C · fixo'],['Colar seleção','Ctrl+V · fixo'],['Cancelar seleção','Esc · fixo']]){const row=document.createElement('div');row.className='note-board-shortcut';const title=document.createElement('span');title.textContent=label;const key=document.createElement('kbd');key.textContent=value;row.append(title,key);keys.append(row);}
    }
  }
  function capture(key){
    const shared=['zoomModifier','straight'];
    if(['Ctrl+c','Ctrl+v','Escape'].includes(key)||Object.entries(draft.shortcuts).some(([id,value])=>id!==editing&&value===key&&!(shared.includes(id)&&shared.includes(editing)&&['Control','Shift','Alt'].includes(key)))){
      message.textContent='Esse atalho já está em uso. Escolha outra combinação.';return;
    }
    if(!/^(?:(?:Ctrl|Alt|Shift)\+)*(?:[a-z0-9]|Space|Control|Shift|Alt|Delete|Backspace|F[1-9]|F1[0-2])$/.test(key)){message.textContent='Use uma letra, tecla especial ou combinação com Ctrl, Shift ou Alt.';return;}
    if(['Control','Alt','Shift'].includes(key)&&!['pan','straight','zoomModifier'].includes(editing)){message.textContent='Combine o modificador com outra tecla.';return;}
    draft.shortcuts[editing]=key;render('keys');message.textContent='Atalho atualizado. Salve para aplicar.';
  }
  dialog.addEventListener('keydown',event=>{
    if(!editing)return;event.preventDefault();event.stopImmediatePropagation();
    if(event.key==='Escape'){editing=null;message.textContent='Edição cancelada.';return;}
    if(['Control','Shift','Alt','Meta'].includes(event.key)){modifier=whiteboardKey(event);return;}
    modifier=null;capture(whiteboardKey(event));
  },true);
  dialog.addEventListener('keyup',event=>{if(editing&&modifier&&['pan','straight','zoomModifier'].includes(editing)){event.preventDefault();event.stopImmediatePropagation();capture(modifier);modifier=null;}},true);
  form.onsubmit=event=>{event.preventDefault();setSettings(normalizeWhiteboardSettings(draft));dialog.close();};
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});host.append(dialog);render(active);dialog.showModal();return dialog;
}

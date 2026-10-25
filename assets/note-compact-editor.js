export function initializeCompactNoteEditor({textarea,getTab,save,sanitize}){
  const editor=document.createElement('div');editor.className='field note-compact-editor';editor.contentEditable='true';editor.hidden=true;editor.setAttribute('role','textbox');editor.setAttribute('aria-multiline','true');editor.setAttribute('aria-label','Suas notas privadas');editor.setAttribute('lang','pt-BR');editor.spellcheck=true;textarea.after(editor);
  function persist(){
    const tab=getTab();if(!tab||editor.hidden)return;
    tab.richContent=editor.innerHTML;tab.content=editor.innerText;tab.documentMode=true;
    textarea.value=tab.content;save();
  }
  editor.addEventListener('input',persist);
  editor.addEventListener('paste',event=>{
    event.preventDefault();const html=event.clipboardData.getData('text/html'),text=event.clipboardData.getData('text/plain');
    if(html)document.execCommand('insertHTML',false,sanitize(html));else document.execCommand('insertText',false,text);
    persist();
  });
  editor.addEventListener('drop',event=>{
    if(event.dataTransfer.files.length){event.preventDefault();return;}
    const html=event.dataTransfer.getData('text/html');if(html){event.preventDefault();document.execCommand('insertHTML',false,sanitize(html));persist();}
  });
  return {editor,
    render(){const tab=getTab(),rich=!!(tab?.documentMode||/<(?!br\b)[a-z][^>]*>/i.test(tab?.richContent||''));const plain=document.createElement('div');plain.textContent=tab?.content||'';textarea.readOnly=false;textarea.hidden=rich;editor.hidden=!rich;editor.innerHTML=rich?sanitize(tab.richContent||plain.innerHTML.replace(/\n/g,'<br>')):'';},
    focus(options={preventScroll:true}){(editor.hidden?textarea:editor).focus(options);},
    clear(){editor.innerHTML='';editor.hidden=true;textarea.hidden=false;textarea.readOnly=false;}
  };
}

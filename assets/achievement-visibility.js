export function initializeAchievementVisibility({container,request,getUid}){
  let owner=null,pending=null,dirty=false,generation=0;
  async function open(){
    const uid=getUid(),version=++generation;owner=uid;pending=null;dirty=false;
    container.replaceChildren();const title=document.createElement('h3');title.textContent='Conquistas no perfil';const hint=document.createElement('p');hint.className='profile-editor-hint';hint.textContent='Escolha o que os outros integrantes podem ver. Você continuará vendo todas as suas conquistas e seu progresso.';const body=document.createElement('div');body.textContent='Carregando suas preferências…';container.append(title,hint,body);
    try{
      const result=await request('/achievements/'+encodeURIComponent(uid));if(version!==generation||getUid()!==uid)return;
      pending={hideAll:!!result.visibility?.hideAll,hidden:[...(result.visibility?.hidden||[])]};body.replaceChildren();
      const allLabel=document.createElement('label');allLabel.className='achievement-visibility-all';const all=document.createElement('input');all.type='checkbox';all.checked=pending.hideAll;allLabel.append(all,document.createTextNode('Ocultar todas as conquistas dos outros integrantes'));body.append(allLabel);
      const list=document.createElement('div');list.className='achievement-visibility-list';const checks=[];
      for(const item of result.catalog){
        const label=document.createElement('label');label.className='achievement-visibility-option';const input=document.createElement('input');input.type='checkbox';input.checked=!pending.hidden.includes(item.id);input.setAttribute('aria-label','Mostrar '+item.title+' no perfil');const text=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('small');name.textContent=item.title;description.textContent=item.description;text.append(name,description);label.append(input,text);list.append(label);checks.push({input,id:item.id});
        input.onchange=()=>{pending.hidden=checks.filter(c=>!c.input.checked).map(c=>c.id);dirty=true;};
      }
      body.append(list);const sync=()=>{checks.forEach(c=>c.input.disabled=all.checked);list.classList.toggle('all-hidden',all.checked);};
      all.onchange=()=>{pending.hideAll=all.checked;dirty=true;sync();};sync();
      const showAll=document.createElement('button');showAll.type='button';showAll.className='btn btn-ghost';showAll.textContent='Mostrar todas';showAll.onclick=()=>{pending={hideAll:false,hidden:[]};dirty=true;all.checked=false;checks.forEach(c=>c.input.checked=true);sync();};body.append(showAll);
      const note=document.createElement('p');note.className='profile-editor-hint';note.textContent='Com “Ocultar todas” desligado, as marcadas ficam visíveis quando conquistadas. Suas escolhas só serão aplicadas ao salvar o perfil.';body.append(note);
    }catch{if(version!==generation||getUid()!==uid)return;body.textContent='Não foi possível carregar as preferências. Elas serão mantidas como estão.';const retry=document.createElement('button');retry.type='button';retry.className='btn';retry.textContent='Tentar novamente';retry.onclick=open;body.append(retry);}
  }
  return {open,changes(){return dirty&&pending&&owner===getUid()?{achievementVisibility:{hideAll:pending.hideAll,hidden:[...pending.hidden]}}:{};},clear(){generation++;owner=null;pending=null;dirty=false;container.replaceChildren();}};
}

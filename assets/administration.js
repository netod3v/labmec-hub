const roles={member:'Usuário',support:'Suporte',admin:'Administrador'};
const statuses={active:'Ativa',blocked:'Bloqueada',removed:'Excluída'};
const affiliations={undergraduate:'Graduação',scientific_initiation:'Iniciação científica',masters:'Mestrado',doctorate:'Doutorado',postdoc:'Pós-doutorado',researcher:'Pesquisador',professor:'Professor',technician:'Técnico',collaborator:'Colaborador',other:'Outro'};
const actions={'user.permissions':'Alterou permissões','user.units':'Alterou as unidades','user.updated':'Atualizou um perfil','user.removed':'Excluiu uma conta do Hub','content.deleted':'Excluiu conteúdo','file.deleted':'Excluiu um arquivo'};
const date=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Não registrado';
function node(tag,text,className){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;}
function action(text,handler,className='admin-action'){const element=node('button',text,className);element.type='button';element.onclick=handler;return element;}

export function initializeAdministration({button,request,getUid,getProfile,openModal,closeModal}){
 const modal=node('div',undefined,'modal-overlay hidden');modal.id='admin-modal';
 modal.innerHTML=`<section class="modal-box admin-page" role="dialog" aria-modal="true" aria-labelledby="admin-title">
 <div class="modal-head"><button type="button" class="modal-close admin-back" aria-label="Voltar à tela anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg><span>Voltar</span></button><div><strong id="admin-title">Administração</strong><span>Gestão do LABIOMEC Hub</span></div><button type="button" class="admin-refresh" aria-label="Atualizar dados" title="Atualizar dados"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11.5-1L20 9M4 15l2.5 3A7 7 0 0 0 18 17"/></svg><span>Atualizar</span></button></div>
 <div class="admin-shell"><nav class="admin-tabs" role="tablist" aria-label="Áreas administrativas"><button type="button" role="tab" id="admin-tab-overview" data-tab="overview" aria-controls="admin-content">Visão geral</button><button type="button" role="tab" id="admin-tab-users" data-tab="users" aria-controls="admin-content">Usuários</button><button type="button" role="tab" id="admin-tab-audit" data-tab="audit" aria-controls="admin-content">Histórico</button></nav>
 <div class="admin-caption"></div><p class="admin-status" role="status" aria-live="polite"></p><div id="admin-content" role="tabpanel"></div></div></section>`;
 document.body.append(modal);
 const content=modal.querySelector('#admin-content'),status=modal.querySelector('.admin-status'),refresh=modal.querySelector('.admin-refresh'),back=modal.querySelector('.admin-back');
 let opened=false,tab='overview',page=1,query='',filter='all',role='all',controller,version=0,debounce,focusTimer,rows=[],knownUnits=[],selected=null,canManage=false,mutating=false;
 const allowed=()=>{const p=getProfile();return p?.isAdmin===true||p?.isSupport===true;};
 function clear(){controller?.abort();version++;clearTimeout(debounce);clearTimeout(focusTimer);content.replaceChildren();rows=[];selected=null;status.textContent='';}
 function close(restore=true){opened=false;clear();closeModal(modal);if(restore)focusTimer=setTimeout(()=>{if((document.activeElement===document.body||modal.contains(document.activeElement))&&button.getClientRects().length&&!button.closest('[inert]'))button.focus({preventScroll:true});},260);}
 function syncAccess(){const access=!!getUid()&&allowed();button.hidden=!access;button.classList.toggle('hidden',!access);if(!access&&opened)close(false);}
 function pager(result){
  const bar=node('div',undefined,'admin-pagination');
  const previous=action('← Anterior',()=>{page=result.page-1;load();}),next=action('Próxima →',()=>{page=result.page+1;load();});
  previous.disabled=result.page<=1;next.disabled=result.page>=result.pages;
  bar.append(previous,node('span',`Página ${result.page} de ${result.pages} · ${result.total} registros`),next);return bar;
 }
 function overview(result){
  content.replaceChildren();const cards=node('div',undefined,'admin-metrics');
  for(const [key,label] of [['active','Contas ativas'],['online','Online agora'],['newWeek','Cadastros nos últimos 7 dias'],['blocked','Contas bloqueadas']]){
   const card=node('div',undefined,'admin-metric');card.append(node('span',label),node('strong',String(result.counts[key]??0)));cards.append(card);
  }
  const activity=node('section',undefined,'admin-summary');activity.append(node('h2','Atividade do laboratório'));
  for(const [key,label] of [['total','Contas cadastradas'],['posts','Publicações no mural'],['metas','Metas abertas'],['demandas','Demandas abertas']]){const row=node('div');row.append(node('span',label),node('strong',String(result.counts[key]??0)));activity.append(row);}
  const note=node('p',`Atualizado em ${date(result.updatedAt)}. Use Atualizar para consultar os dados mais recentes.`,'admin-note');
  content.append(cards,activity,note);
 }
 function usersShell(){
  content.innerHTML=`<form class="admin-filters" role="search"><label>Buscar usuário<input type="search" maxlength="120" name="query" placeholder="Nome, e-mail ou identificador" autocomplete="off"></label><label>Situação<select name="status"><option value="all">Todas as contas</option><option value="active">Ativas</option><option value="online">Online agora</option><option value="blocked">Bloqueadas</option></select></label><label>Acesso<select name="role"><option value="all">Todos os acessos</option><option value="member">Usuário</option><option value="support">Suporte</option><option value="admin">Administrador</option></select></label></form><div class="admin-users-result"></div><section class="admin-detail" hidden aria-label="Detalhes da conta"></section>`;
  const form=content.querySelector('form');form.elements.query.value=query;form.elements.status.value=filter;form.elements.role.value=role;
  form.onsubmit=event=>{event.preventDefault();clearTimeout(debounce);query=form.elements.query.value;page=1;load();};
  form.elements.query.oninput=()=>{clearTimeout(debounce);debounce=setTimeout(()=>{query=form.elements.query.value;page=1;load();},300);};
  for(const name of ['status','role'])form.elements[name].onchange=()=>{clearTimeout(debounce);query=form.elements.query.value;filter=form.elements.status.value;role=form.elements.role.value;page=1;load();};
 }
 function details(user,focus=false){
  const panel=content.querySelector('.admin-detail');panel.replaceChildren();panel.hidden=!user;if(!user)return;
  selected=user.id;const head=node('div',undefined,'admin-detail-heading');head.append(node('h2',user.name),action('Fechar detalhes',()=>{selected=null;panel.hidden=true;content.querySelector(`[data-user="${CSS.escape(user.id)}"]`)?.focus();}));panel.append(head);
  const list=node('dl');
  for(const [label,value] of [['E-mail',user.email],['Identificador',user.id],['Unidades',user.units.join(' · ')||'Não informado'],['Vínculo',affiliations[user.affiliation]||'Não informado'],['Cadastro',date(user.createdAt)],['Último acesso registrado',date(user.lastSeen)],['Situação',statuses[user.status]],['Acesso',roles[user.role]]]){list.append(node('dt',label),node('dd',value));}panel.append(list);
  if(canManage&&user.status!=='removed'){
   const editor=node('fieldset',undefined,'admin-unit-editor');editor.append(node('legend','Unidades do laboratório'));
   const choices=[...new Set([...knownUnits,...user.units])].sort();
   for(const unit of choices){const label=node('label',undefined,'admin-unit-option'),input=node('input');input.type='checkbox';input.value=unit;input.checked=user.units.includes(unit);label.append(input,node('span',unit));editor.append(label);}
   editor.append(action('Salvar unidades',()=>{const units=[...editor.querySelectorAll('input:checked')].map(input=>input.value);if(!units.length){status.textContent='Selecione pelo menos uma unidade.';return;}changeUser(user,'units',units);}));panel.append(editor);
  }
  if(canManage&&user.status!=='removed'&&user.id!==getUid()){
   const row=node('div',undefined,'admin-role-editor'),label=node('label','Nível de acesso'),select=node('select');select.setAttribute('aria-label','Nível de acesso de '+user.name);
   for(const [value,text] of Object.entries(roles)){const option=node('option',text);option.value=value;select.append(option);}select.value=user.role;
   const save=action('Salvar acesso',()=>changeUser(user,'role',select.value));label.append(select);row.append(label,save);panel.append(row);
   if(user.role!=='admin'){
    const remove=action('Excluir do Hub',()=>{
     const confirmation=node('div',undefined,'admin-confirm');confirmation.setAttribute('role','alert');
     confirmation.append(node('p',`Excluir ${user.name} (${user.email})? A pessoa perderá o acesso; publicações e contribuições antigas permanecerão.`),action('Confirmar exclusão',()=>changeUser(user,'remove'), 'admin-action admin-danger'),action('Cancelar',()=>confirmation.remove()));remove.disabled=true;panel.append(confirmation);confirmation.querySelector('button').focus();
     confirmation.querySelector('button:last-child').addEventListener('click',()=>{remove.disabled=false;remove.focus();});
    },'admin-action admin-danger');panel.append(remove);
   }
  }else if(user.id===getUid())panel.append(node('p','Seu nível de acesso só pode ser alterado por outro administrador.','admin-note'));
  if(focus){panel.tabIndex=-1;panel.focus({preventScroll:true});panel.scrollIntoView({block:'nearest',behavior:'instant'});}
 }
 function users(result){
  rows=result.items;knownUnits=result.knownUnits||[];canManage=result.canManageUsers;const area=content.querySelector('.admin-users-result');area.replaceChildren();
  const table=node('table',undefined,'admin-user-table'),thead=node('thead'),tr=node('tr');
  for(const text of ['Usuário','E-mail','Acesso','Situação','Último acesso','']){const th=node('th',text);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);const tbody=node('tbody');
  for(const user of rows){
   const row=node('tr');const name=node('td');name.dataset.label='Usuário';name.append(node('strong',user.name),node('small',user.units.join(' · ')||'Unidade não informada'));
   row.append(name);for(const [label,value] of [['E-mail',user.email],['Acesso',roles[user.role]],['Situação',user.online?'Online':statuses[user.status]],['Último acesso',date(user.lastSeen)]]){const cell=node('td',value);cell.dataset.label=label;row.append(cell);}
   const controls=node('td'),view=action('Detalhes',()=>details(user,true));view.dataset.user=user.id;view.setAttribute('aria-label','Ver detalhes de '+user.name);controls.append(view);row.append(controls);tbody.append(row);
  }
  table.append(tbody);area.append(table);if(!rows.length)area.append(node('p','Nenhuma conta encontrada com esses filtros.','admin-empty'));area.append(pager(result));
  details(rows.find(user=>user.id===selected)||null);
 }
 function history(result){
  content.replaceChildren();content.append(node('h2','Histórico administrativo'),node('p','Ações registradas a partir da implantação deste painel. Mensagens privadas e notas pessoais não são exibidas.','admin-note'));
  const list=node('div',undefined,'admin-history');
  for(const item of result.items){const card=node('article');card.append(node('strong',actions[item.action]||'Ação administrativa'),node('p',`${item.actorName} → ${item.targetName||item.targetId}`),node('time',date(item.ts)));if(item.details?.fields?.length)card.append(node('small','Campos alterados: '+item.details.fields.join(', ')));if(item.action==='user.permissions'){const flags=item.details.after||{};card.append(node('small','Acesso definido: '+roles[flags.isAdmin?'admin':flags.isSupport?'support':'member']));}if(item.action==='user.units')card.append(node('small','Unidades definidas: '+(item.details.after||[]).join(' · ')));list.append(card);}
  if(!result.items.length)list.append(node('p','Nenhuma ação administrativa registrada por enquanto.','admin-empty'));
  content.append(list,pager(result));
 }
 async function load(){
  if(!opened||!allowed())return;
  controller?.abort();controller=new AbortController();const run=++version;status.textContent='Carregando dados…';refresh.disabled=true;content.setAttribute('aria-busy','true');
  const endpoint=tab==='users'?'/admin/users?'+new URLSearchParams({q:query,status:filter,role,page:String(page)}):tab==='audit'?'/admin/audit?page='+page:'/admin/overview';
  try{const result=await request(endpoint,{signal:controller.signal});if(run!==version||!opened)return;
   modal.querySelector('.admin-caption').textContent=getProfile()?.isAdmin===true?'Administrador · gestão de contas e consulta':'Suporte · acesso de consulta';
   if(tab==='users')users(result);else if(tab==='audit')history(result);else overview(result);status.textContent='';
  }catch(error){if(run===version&&error.name!=='AbortError'){status.textContent=error.message||'Não foi possível carregar os dados. Tente Atualizar.';}}
  finally{if(run===version){refresh.disabled=false;content.removeAttribute('aria-busy');}}
 }
 async function changeUser(user,type,value){
  if(mutating||!canManage)return;mutating=true;const account=getUid();const panel=content.querySelector('.admin-detail');panel?.querySelectorAll('button,select,input').forEach(element=>element.disabled=true);
  try{
   const editing=type==='role'||type==='units';
   await request(editing?'/admin/users/'+encodeURIComponent(user.id)+'/'+type:'/users/'+encodeURIComponent(user.id),editing?{method:'PATCH',body:JSON.stringify({[type]:value})}:{method:'DELETE'});
   if(opened&&getUid()===account){await load();status.textContent=type==='role'?'Permissão atualizada e registrada no histórico.':type==='units'?'Unidades atualizadas e registradas no histórico.':'Conta excluída do Hub. As contribuições foram preservadas.';}
  }catch(error){if(opened&&getUid()===account){details(user);status.textContent=error.message;}}
  finally{mutating=false;}
 }
 function selectTab(next){clear();tab=next;page=1;modal.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===tab));b.tabIndex=b.dataset.tab===tab?0:-1;});content.setAttribute('aria-labelledby','admin-tab-'+tab);if(tab==='users')usersShell();load();}
 button.addEventListener('click',()=>{if(!allowed())return;opened=true;clearTimeout(focusTimer);openModal(modal);selectTab('overview');back.focus({preventScroll:true});});
 back.onclick=()=>close();refresh.onclick=()=>{clearTimeout(debounce);if(tab==='users')query=content.querySelector('[name=query]').value;load();};
 modal.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>selectTab(b.dataset.tab));
 modal.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
  const tabs=[...modal.querySelectorAll('[data-tab]')];
  if(tabs.includes(event.target)&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=tabs.indexOf(event.target),next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length];next.click();next.focus();}
  if(event.key==='Tab'){const controls=[...modal.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.tabIndex!==-1&&el.getClientRects().length);if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}}
 });
 syncAccess();return {syncAccess,reset(){opened=false;clear();query='';filter='all';role='all';page=1;canManage=false;closeModal(modal);button.hidden=true;button.classList.add('hidden');}};
}

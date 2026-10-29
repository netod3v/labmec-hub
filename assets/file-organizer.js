import { initializeFileDropZone } from './file-drop-zone.js';
import { initializeFileLibraryPage } from './file-library-page.js';

/** Biblioteca independente dos anexos do mural. */
export function initializeFileOrganizer({ request, get, onAuthStateChanged, apiBase }) {
  const panel = document.getElementById('lab-files');
  const page = initializeFileLibraryPage(panel);
  const form = document.getElementById('lab-file-form');
  const list = document.getElementById('lab-file-list');
  const status = document.getElementById('lab-file-status');
  const search = document.getElementById('lab-file-search');
  const tabs = [...panel.querySelectorAll('[data-file-filter]')];
  const summary = document.getElementById('lab-file-summary');
  const folders = document.getElementById('lab-file-projects');
  const viewButtons = [...panel.querySelectorAll('[data-file-view]')];
  let selectedProject = null;
  let user = null, profile = {}, records = [], filter = 'all', generation = 0;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const size = bytes => bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  const sentDateFormat = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const fileUrl = id => apiBase + '/files/' + encodeURIComponent(id);
  const editable = file => file.owner_id === user?.uid || profile.isAdmin;
  function accessOptions(select, value = '') {
    select.replaceChildren(new Option('Privado · eu e administração', ''));
    const allowed = new Set(Object.entries(profile.sectors || {}).filter(([, enabled]) => enabled).map(([unit]) => unit));
    if (profile.isAdmin) records.forEach(file => { if (file.unit) allowed.add(file.unit); });
    allowed.forEach(unit => select.add(new Option(`Compartilhado · ${unit}`, unit)));
    select.value = value;
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  }
  function render() {
    list.replaceChildren();
    folders.replaceChildren();
    const ownPrivate = records.filter(file => !file.unit && file.owner_id === user?.uid).length;
    const shared = records.filter(file => file.unit).length;
    summary.textContent = `${records.length} arquivo${records.length === 1 ? '' : 's'} · ${ownPrivate} privado${ownPrivate === 1 ? '' : 's'} seu${ownPrivate === 1 ? '' : 's'} · ${shared} compartilhado${shared === 1 ? '' : 's'}`;
    tabs.forEach(tab => { tab.setAttribute('aria-pressed', String(tab.dataset.fileFilter === filter)); });
    const term = search.value.trim().toLocaleLowerCase('pt-BR');
    const visible = records.filter(file => (filter !== 'private' || (!file.unit && file.owner_id === user?.uid)) &&
      (filter !== 'shared' || file.unit) && `${file.name} ${file.project || ''} ${file.unit || ''}`.toLocaleLowerCase('pt-BR').includes(term));
    if (!visible.length) {
      const empty = node('div', 'file-empty');
      empty.append(node('strong', '', records.length ? 'Nenhum arquivo neste filtro' : 'Seu laboratório, organizado'),
        node('p', '', records.length ? 'Tente outro nome, projeto ou filtro.' : 'Adicione protocolos, planilhas, artigos e outros materiais. Você escolhe quem pode acessar.'));
      list.append(empty); return;
    }
    const groups = new Map();
    visible.forEach(file => {
      const project = file.project || 'Sem projeto';
      if (!groups.has(project)) groups.set(project, []);
      groups.get(project).push(file);
    });
    if (selectedProject && !groups.has(selectedProject)) selectedProject = null;
    const all = node('button', 'file-folder-all', 'Todos os projetos');
    all.type = 'button'; all.setAttribute('aria-pressed', String(selectedProject === null));
    all.onclick = () => { selectedProject = null; render(); };
    folders.append(all);
    groups.forEach((files, project) => {
      const folder = node('button', 'file-folder'); folder.type = 'button';
      folder.setAttribute('aria-pressed', String(selectedProject === project));
      const icon = node('span', 'file-folder-icon');
      icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>';
      folder.append(icon, node('strong', '', project), node('small', '', `${files.length} arquivo${files.length === 1 ? '' : 's'}`));
      folder.onclick = () => { selectedProject = selectedProject === project ? null : project; render(); };
      folders.append(folder);
    });
    groups.forEach((files, project) => {
      if (selectedProject !== null && selectedProject !== project) return;
      const group = node('section', 'file-project');
      group.append(node('h3', '', `${project} · ${files.length}`));
      files.forEach(file => {
        const card = node('article', 'organizer-file');
        const extension = file.name.includes('.') ? file.name.split('.').pop().slice(0, 5).toUpperCase() : 'ARQ';
        const badge = node('span', 'file-type', extension); badge.setAttribute('aria-hidden', 'true');
        const info = node('div', 'file-info');
        const link = node('a', 'file-name', file.name); link.href = fileUrl(file.id);
        const access = node('span', `file-access ${file.unit ? 'is-shared' : ''}`, file.unit ? `Compartilhado · ${file.unit}` : 'Privado · eu e administração');
        if (!file.unit && file.owner_id !== user?.uid) access.textContent = 'Privado · acesso da administração';
        info.append(link, node('small', 'file-size', size(file.size)), access);
        const sentDate = file.created_at ? new Date(file.created_at) : null;
        const dateLabel = node('time', 'file-sent-date');
        if (sentDate && !Number.isNaN(sentDate.getTime())) {
          dateLabel.dateTime = sentDate.toISOString();
          dateLabel.textContent = `Enviado em ${sentDateFormat.format(sentDate)}`;
          dateLabel.title = 'Data e hora do envio · horário de Brasília';
        } else {
          dateLabel.textContent = 'Data de envio indisponível';
        }
        info.append(dateLabel);
        const actions = node('div', 'file-actions');
        const download = node('a', 'btn file-download'); download.href = fileUrl(file.id); download.setAttribute('download', '');
        download.title = `Baixar arquivo · ${size(file.size)}`;
        download.setAttribute('aria-label', `Baixar ${file.name}`);
        download.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>';
        actions.append(download);
        card.append(badge, info, actions);
        if (editable(file)) {
          const details = node('details', 'file-edit');
          details.append(node('summary', '', 'Organizar'));
          const editor = node('form', 'file-edit-form');
          const projectLabel = node('label', '', 'Projeto');
          const projectInput = node('input', 'field'); projectInput.value = file.project || ''; projectInput.maxLength = 120;
          projectLabel.append(projectInput);
          const accessLabel = node('label', '', 'Quem pode acessar');
          const select = node('select', 'field'); accessOptions(select, file.unit || ''); accessLabel.append(select);
          const save = node('button', 'btn btn-primary', 'Salvar organização'); save.type = 'submit';
          const remove = node('button', 'btn file-delete', 'Excluir arquivo'); remove.type = 'button';
          editor.append(projectLabel, accessLabel, save, remove);
          editor.onsubmit = async event => {
            event.preventDefault(); save.disabled = true;
            try {
              await request('/files/' + file.id, { method: 'PATCH', body: JSON.stringify({ project: projectInput.value, unit: select.value || null }) });
              status.textContent = 'Projeto e acesso atualizados na biblioteca.';
              await refresh();
            } catch (error) { status.textContent = error.message; } finally { save.disabled = false; }
          };
          remove.onclick = async () => {
            if (!confirm(`Excluir ${file.name} da biblioteca? Arquivos enviados separadamente no mural continuam disponíveis. Links diretos para este arquivo deixarão de funcionar.`)) return;
            remove.disabled = true;
            try { await request('/files/' + file.id, { method: 'DELETE' }); status.textContent = 'Arquivo excluído.'; await refresh(); }
            catch (error) { status.textContent = error.message; remove.disabled = false; }
          };
          details.append(editor); card.append(details);
        }
        group.append(card);
      });
      list.append(group);
    });
  }
  async function refresh() {
    if (!user) return;
    const version = ++generation, uid = user.uid;
    const refreshButton = document.getElementById('lab-files-refresh'); refreshButton.disabled = true;
    try {
      const [result, snapshot] = await Promise.all([request('/files'), get('users/' + uid)]);
      if (version !== generation || user?.uid !== uid) return;
      records = result.files; profile = snapshot.val() || {};
      const previous = form.elements.unit.value; accessOptions(form.elements.unit, previous); render();
    } catch (error) { if (version === generation) status.textContent = error.message; }
    finally { if (version === generation) refreshButton.disabled = false; }
  }
  tabs.forEach(tab => tab.onclick = () => { filter = tab.dataset.fileFilter; render(); });
  viewButtons.forEach(button => button.onclick = () => {
    list.classList.toggle('is-grid', button.dataset.fileView === 'grid');
    viewButtons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  });
  search.oninput = render;
  document.getElementById('lab-files-refresh').onclick = refresh;
  const fileInput = form.elements.file;
  initializeFileDropZone({ panel, input: fileInput, status });
  fileInput.onchange = () => { document.getElementById('lab-file-picked').textContent = fileInput.files[0] ? `${fileInput.files[0].name} · ${size(fileInput.files[0].size)}` : 'Escolher arquivo'; };
  onAuthStateChanged(null, next => {
    if (next?.uid === user?.uid) return;
    user = next; generation++; records = []; profile = {}; filter = 'all'; selectedProject = null; form.reset(); search.value = ''; status.textContent = '';
    document.getElementById('lab-file-picked').textContent = 'Escolher arquivo';
    page.close(); panel.hidden = true; render(); if (user) refresh();
  });
  form.onsubmit = async event => {
    event.preventDefault();
    const body = new FormData(form);
    const button = form.querySelector('[type="submit"]'); button.disabled = true;
    fileInput.disabled = true;
    const owner = user?.uid;
    status.textContent = 'Enviando arquivo… mantenha esta página aberta.';
    try {
      await request('/files', { method: 'POST', body });
      if (user?.uid !== owner) return;
      form.reset(); document.getElementById('lab-file-picked').textContent = 'Escolher arquivo';
      status.textContent = 'Arquivo guardado. Use Organizar para mudar o projeto ou o acesso.';
      await refresh();
    } catch (error) { if (user?.uid === owner) status.textContent = error.message; }
    finally { button.disabled = false; fileInput.disabled = false; }
  };
}

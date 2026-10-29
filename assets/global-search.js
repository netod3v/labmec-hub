/** Busca do header: respostas autorizadas pela API, sem indexar dados no navegador. */
import { request, onAuthStateChanged } from './lab-api.js';

const categories = [
  ['all', 'Tudo'], ['mural', 'Mural'], ['demandas', 'Demandas'], ['metas', 'Metas'],
  ['minhas_metas', 'Metas que criei'], ['pessoas', 'Pessoas'], ['arquivos', 'Arquivos'],
  ['notas', 'Notas'], ['mensagens', 'Mensagens'],
];

function searchIcon(category = 'all') {
  const paths = {
    all: 'M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    mural: 'M4 4h16v12H9l-5 4V4M8 8h8M8 12h5',
    demandas: 'M9 5h11M9 12h11M9 19h11M3 5l1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2',
    metas: 'M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5M12 12l9-9M17 3h4v4',
    pessoas: 'M16 21v-2a5 5 0 0 0-10 0v2M11 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19 8a3 3 0 0 1 0 6M22 21v-2a4 4 0 0 0-3-4',
    arquivos: 'M14 3H6v18h12V7l-4-4M14 3v5h5M9 13h6M9 17h4',
    notas: 'M4 3h16v18H4V3M8 8h8M8 12h8M8 16h5',
    mensagens: 'M3 4h18v13H8l-5 4V4M7 8h10M7 12h7',
  };
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[category === 'minhas_metas' ? 'metas' : category] || paths.all);
  icon.append(path);
  return icon;
}

export function initializeGlobalSearch(onSelect) {
  const form = document.getElementById('global-search-form');
  const input = document.getElementById('global-search-input');
  const panel = document.getElementById('global-search-panel');
  const tabs = document.getElementById('global-search-tabs');
  const scope = document.getElementById('global-search-scope');
  const results = document.getElementById('global-search-results');
  const status = document.getElementById('global-search-status');
  const container = document.getElementById('sections-container');
  const headerForm = document.createElement('form');
  headerForm.className = 'header-search';
  headerForm.setAttribute('role', 'search');
  const trigger = document.createElement('input');
  trigger.type = 'search';
  trigger.maxLength = 120;
  trigger.autocomplete = 'off';
  trigger.placeholder = 'Pesquisar no hub';
  trigger.style.paddingRight = '14px';
  trigger.setAttribute('aria-label', 'Pesquisar em todo o hub');
  trigger.setAttribute('aria-controls', panel.id);
  trigger.setAttribute('aria-expanded', 'false');
  headerForm.append(searchIcon(), trigger);
  form.replaceWith(headerForm);
  const headerAnchor=document.createComment('global-search-header');headerForm.before(headerAnchor);
  const mobile=matchMedia('(max-width:720px)');
  const mobileButton=document.createElement('button');mobileButton.type='button';mobileButton.id='mobile-search-btn';mobileButton.className='icon-btn';mobileButton.setAttribute('aria-label','Pesquisar no Hub');mobileButton.setAttribute('aria-controls',panel.id);mobileButton.setAttribute('aria-expanded','false');mobileButton.append(searchIcon());
  document.querySelector('.header-actions').prepend(mobileButton);
  const closeButton=document.getElementById('global-search-close');
  function syncPageState(){
    const active=mobile.matches&&!panel.hidden;
    container.classList.toggle('search-active',!mobile.matches&&!panel.hidden);
    document.documentElement.classList.toggle('mobile-search-open',active);
    document.body.classList.toggle('mobile-search-open',active);
    panel.setAttribute('role',mobile.matches?'dialog':'region');
    if(mobile.matches)panel.setAttribute('aria-modal','true');else panel.removeAttribute('aria-modal');
    closeButton.textContent=mobile.matches?'‹ Voltar':'×';
    closeButton.setAttribute('aria-label',mobile.matches?'Voltar ao Hub':'Fechar pesquisa');
    if(active){panel.style.height=(window.visualViewport?.height||window.innerHeight)+'px';panel.style.top=(window.visualViewport?.offsetTop||0)+'px';}
    else{panel.style.removeProperty('height');panel.style.removeProperty('top');}
  }
  function placeSearch(){
    if(mobile.matches){document.body.append(panel);panel.querySelector('.global-search-heading').after(headerForm);headerForm.classList.add('search-panel-form');}
    else{container.prepend(panel);headerAnchor.after(headerForm);headerForm.classList.remove('search-panel-form');}
    syncPageState();
  }
  mobile.addEventListener('change',placeSearch);placeSearch();
  window.visualViewport?.addEventListener('resize',syncPageState);
  window.visualViewport?.addEventListener('scroll',syncPageState);
  // O campo original fica fora do DOM; a única barra visível é a do header.
  input.removeAttribute('role');
  input.removeAttribute('aria-haspopup');
  input.removeAttribute('aria-autocomplete');
  input.removeAttribute('aria-controls');
  input.removeAttribute('aria-expanded');
  input.placeholder = 'O que você procura no laboratório?';
  let selectedCategory = 'all';
  let timer, controller, version = 0, accountId;

  let mobileReturnScroll=0;
  let pageAnimation=null,closingPage=false;
  const reduceMotion=matchMedia('(prefers-reduced-motion:reduce)');
  function open() {
    const wasHidden=panel.hidden;
    if(closingPage){pageAnimation?.cancel();closingPage=false;}
    if(wasHidden)mobileReturnScroll=window.scrollY;
    if(!mobile.matches){
      document.dispatchEvent(new CustomEvent('hub:leave-profile'));
      document.dispatchEvent(new CustomEvent('hub:leave-files'));
    }
    panel.hidden = false;
    container.classList.toggle('search-active',!mobile.matches);
    syncPageState();
    trigger.setAttribute('aria-expanded', 'true');
    mobileButton.setAttribute('aria-expanded','true');
    if(wasHidden&&mobile.matches&&!reduceMotion.matches){
      pageAnimation=panel.animate([{opacity:0,transform:'translateY(16px)'},{opacity:1,transform:'translateY(0)'}],{duration:200,easing:'ease'});
    }
  }
  async function close(animate=false) {
    if(closingPage&&animate)return;
    pageAnimation?.cancel();closingPage=false;
    const wasOpen=!panel.hidden;
    clearTimeout(timer); controller?.abort(); version++;
    if(animate&&wasOpen&&mobile.matches&&!reduceMotion.matches){
      closingPage=true;
      pageAnimation=panel.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(16px)'}],{duration:200,easing:'ease'});
      try{await pageAnimation.finished;}catch{return;}
      closingPage=false;
    }
    panel.hidden = true;
    syncPageState();
    container.classList.remove('search-active');
    trigger.setAttribute('aria-expanded', 'false');
    mobileButton.setAttribute('aria-expanded','false');
    panel.setAttribute('aria-busy', 'false');
    if(wasOpen&&mobile.matches)window.scrollTo({top:mobileReturnScroll,behavior:'instant'});
  }
  document.addEventListener('hub:close-search',()=>close());

  const tabButtons = categories.map(([key, label]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.setAttribute('role', 'tab'); button.dataset.category = key;
    button.id = 'global-search-tab-' + key;
    button.setAttribute('aria-controls', 'global-search-results');
    button.onclick = () => {
      input.placeholder = key === 'all' ? 'O que você procura no laboratório?' : 'Pesquisar em ' + label.toLocaleLowerCase();
      selectedCategory = key; renderTabs(); schedule(true);
    };
    tabs.append(button);
    return { key, label, button };
  });

  function renderTabs(counts) {
    for (const tab of tabButtons) {
      const selected = tab.key === selectedCategory;
      tab.button.textContent = tab.label + (counts && tab.key !== 'all' ? ` (${counts[tab.key] || 0})` : '');
      tab.button.setAttribute('aria-selected', String(selected));
      tab.button.tabIndex = selected ? 0 : -1;
    }
    results.setAttribute('aria-labelledby', 'global-search-tab-' + selectedCategory);
  }
  renderTabs();

  function recentQueries() {
    try {
      const saved = JSON.parse(sessionStorage.getItem('lab-search-' + accountId) || '[]');
      return Array.isArray(saved) ? saved.filter(value => typeof value === 'string' && value.length >= 2 && value.length <= 120).slice(0, 6) : [];
    } catch { return []; }
  }
  function rememberQuery() {
    const query = input.value.trim();
    if (!accountId || query.length < 2) return;
    try { sessionStorage.setItem('lab-search-' + accountId, JSON.stringify([query, ...recentQueries().filter(value => value.toLocaleLowerCase() !== query.toLocaleLowerCase())].slice(0, 6))); } catch { /* A busca funciona mesmo sem armazenamento local. */ }
  }
  function showSuggestions() {
    results.replaceChildren();
    const recent = recentQueries();
    const heading = document.createElement('h3');
    heading.textContent = 'Recentes';
    if (recent.length) {
      const clear = document.createElement('button');
      clear.type = 'button'; clear.className = 'search-clear-history'; clear.textContent = 'Limpar';
      clear.onclick = () => {
        try { sessionStorage.removeItem('lab-search-' + accountId); } catch { /* Armazenamento indisponível. */ }
        showSuggestions();
      };
      heading.append(clear);
    }
    results.append(heading);
    for (const query of recent) {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'search-suggestion';
      const clock = document.createElement('span'); clock.textContent = '↶'; clock.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span'); label.textContent = query;
      row.append(clock, label);
      row.onclick = () => { input.value = query; trigger.value = query; rememberQuery(); schedule(true); trigger.focus({ preventScroll: true }); };
      results.append(row);
    }
    if (!recent.length) {
      const hint = document.createElement('p'); hint.className = 'global-search-empty';
      hint.textContent = 'Suas buscas nesta sessão aparecerão aqui.'; results.append(hint);
    }
    const title = document.createElement('h3'); title.textContent = 'Explore o laboratório'; results.append(title);
    for (const [key, label] of categories.filter(([key]) => key !== 'all')) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'search-suggestion';
      const text = document.createElement('span'); text.textContent = label;
      row.append(searchIcon(key), text);
      row.onclick = () => {
        selectedCategory = key; renderTabs();
        input.placeholder = 'Pesquisar em ' + label.toLocaleLowerCase();
        schedule(true); trigger.focus({ preventScroll: true });
      };
      results.append(row);
    }
  }

  function showEmpty(title, description, loading = false) {
    results.replaceChildren();
    const state = document.createElement('div');
    state.className = 'search-empty-state' + (loading ? ' is-loading' : '');
    const icon = document.createElement('span');
    icon.className = 'search-empty-icon'; icon.append(searchIcon());
    const heading = document.createElement('h4'); heading.textContent = title;
    const text = document.createElement('p'); text.textContent = description;
    state.append(icon, heading, text);
    results.append(state);
  }

  function showResults(response) {
    results.replaceChildren();
    renderTabs(response.counts);
    status.textContent = `${response.total} ${response.total === 1 ? 'resultado' : 'resultados'}`;
    if (!response.groups.length) {
      showEmpty('Não encontramos por aqui', 'Tente outras palavras ou selecione um filtro diferente.');
    }
    for (const group of response.groups) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      const label = document.createElement('span'); label.textContent = group.label;
      const count = document.createElement('span'); count.className = 'search-group-count'; count.textContent = group.total;
      heading.append(label, count);
      section.append(heading);
      for (const result of group.items) {
        const row = document.createElement(result.target.kind === 'arquivos' ? 'a' : 'button');
        row.className = 'global-search-result';
        if (result.target.kind === 'arquivos') {
          row.href = (window.LABIOMEC_CONFIG?.apiBase || '/api') + '/files/' + encodeURIComponent(result.target.id);
          row.target = '_blank'; row.rel = 'noopener noreferrer';
          row.addEventListener('click', () => { rememberQuery(); close(); });
        } else {
          row.type = 'button';
          row.onclick = () => { rememberQuery(); close(); onSelect(result); };
        }
        const title = document.createElement('strong');
        title.textContent = result.title;
        const excerpt = document.createElement('span');
        excerpt.textContent = result.excerpt;
        const detail = document.createElement('small');
        detail.textContent = [result.author,
          result.deleted ? 'Excluída' : result.completed ? 'Concluída' : '',
          result.target.archived ? 'Histórico' : '',
          result.target.sector ? 'Unidade: ' + result.target.sector : '',
        ].filter(Boolean).join(' · ');
        const icon = document.createElement('span');
        icon.className = 'search-result-icon'; icon.append(searchIcon(group.category));
        const copy = document.createElement('span'); copy.className = 'search-result-copy';
        copy.append(title, excerpt, detail);
        const arrow = document.createElement('span');
        arrow.className = 'search-result-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
        row.append(icon, copy, arrow);
        section.append(row);
      }
      if (group.total > group.items.length) {
        const hint = document.createElement('p');
        hint.className = 'global-search-empty';
        hint.textContent = `Mostrando ${group.items.length} de ${group.total}. Refine a busca para encontrar outros resultados.`;
        section.append(hint);
      }
      results.append(section);
    }
  }

  async function search(sequence) {
    const query = input.value.trim();
    if (query.length < 2) {
      panel.setAttribute('aria-busy', 'false');
      status.textContent = 'A partir de 2 caracteres';
      showSuggestions();
      renderTabs(); return;
    }
    controller = new AbortController();
    showEmpty('Buscando no laboratório…', 'Reunindo os resultados que você pode acessar.', true);
    status.textContent = 'Buscando…';
    panel.setAttribute('aria-busy', 'true');
    try {
      const parameters = new URLSearchParams({ q: query, category: selectedCategory, scope: scope.value });
      const response = await request('/search?' + parameters, { signal: controller.signal });
      if (sequence === version) showResults(response);
    } catch (error) {
      if (sequence === version && error.name !== 'AbortError') status.textContent = error.message;
    } finally {
      if (sequence === version) panel.setAttribute('aria-busy', 'false');
    }
  }

  function schedule(immediate = false) {
    clearTimeout(timer); controller?.abort(); version++;
    open();
    const sequence = version;
    timer = setTimeout(() => search(sequence), immediate ? 0 : 280);
  }
  form.onsubmit = event => { event.preventDefault(); rememberQuery(); schedule(true); };
  function focusSearch() {
    schedule(true);
    if(!mobile.matches)panel.scrollIntoView({ block: 'start', behavior: 'auto' });
    trigger.focus({ preventScroll: true });
  }
  mobileButton.onclick=focusSearch;
  headerForm.onsubmit = event => {
    event.preventDefault();
    input.value = trigger.value;
    rememberQuery();
    focusSearch();
  };
  // Atualiza a prévia sem tirar o foco de quem está digitando no header.
  trigger.addEventListener('input', () => {
    input.value = trigger.value;
    schedule();
  });
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' && !panel.hidden) {
      event.preventDefault();
      (results.querySelector('.global-search-result, .search-suggestion') || trigger).focus();
    }
  });
  scope.addEventListener('change', () => schedule(true));
  const returnFocus=()=>{(mobile.matches?mobileButton:trigger).focus({preventScroll:true});};
  document.getElementById('global-search-close').onclick = async () => { await close(true); if(panel.hidden)returnFocus(); };
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabButtons.findIndex(tab => tab.key === selectedCategory);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabButtons.length - 1 :
      (index + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
    tabButtons[next].button.click(); tabButtons[next].button.focus();
  });
  document.addEventListener('keydown', event => {
    if(event.key==='Tab'&&mobile.matches&&!panel.hidden){
      const controls=[...panel.querySelectorAll('button,input,select,a[href]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    if (event.key === 'Escape' && !panel.hidden) { close(true).then(()=>{if(panel.hidden)returnFocus();}); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.getElementById('wrap-app').classList.contains('hidden')) {
      event.preventDefault(); if(mobile.matches)focusSearch();else trigger.focus(); trigger.select();
    }
  });
  onAuthStateChanged(null, user => {
    if (accountId !== user?.uid) {
      clearTimeout(timer); controller?.abort(); version++; close(); input.value = ''; trigger.value = '';
      results.replaceChildren(); status.textContent = ''; selectedCategory = 'all'; scope.value = 'all'; renderTabs();
      input.placeholder = 'O que você procura no laboratório?';
    }
    accountId = user?.uid;
  });
}

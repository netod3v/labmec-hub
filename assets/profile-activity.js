export function renderProfileActivity(root, entries, today = new Date()) {
  today = new Date(today); today.setHours(0, 0, 0, 0);
  const key = date => [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
  const counts = new Map();
  const years = new Set([today.getFullYear()]);
  let latestDate = null;
  for (const { item } of entries) {
    if (!item.ts) continue;
    const date = new Date(Number(item.ts));
    if (!Number.isFinite(date.getTime()) || date > today && key(date) !== key(today)) continue;
    counts.set(key(date), (counts.get(key(date)) || 0) + 1);
    years.add(date.getFullYear());
    if (!latestDate || date > latestDate) latestDate = date;
  }
  const section = document.createElement('section'); section.className = 'profile-activity';
  const header = document.createElement('div'); header.className = 'profile-activity-heading';
  const title = document.createElement('h3'); title.textContent = 'Atividade no laboratório';
  const label = document.createElement('label'); label.textContent = 'Ano ';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Ano da atividade no laboratório');
  for (const year of [...years].sort((a, b) => b - a)) {
    const option = document.createElement('option'); option.value = String(year); option.textContent = String(year); select.append(option);
  }
  select.value = String(latestDate?.getFullYear() ?? today.getFullYear()); label.append(select); header.append(title, label);
  const scroll = document.createElement('div'); scroll.className = 'profile-activity-scroll';
  const calendar = document.createElement('div'); calendar.className = 'profile-activity-calendar'; scroll.append(calendar);
  const detail = document.createElement('p'); detail.className = 'profile-activity-detail'; detail.setAttribute('aria-live', 'polite');
  const note = document.createElement('p');
  const legend = document.createElement('div'); legend.className = 'profile-legend'; legend.append(document.createTextNode('Menos'));
  for (let level = 0; level < 4; level++) {
    const cell = document.createElement('span'); cell.className = 'profile-day'; cell.dataset.level = String(level); cell.setAttribute('aria-hidden', 'true'); legend.append(cell);
  }
  legend.append(document.createTextNode('Mais'));
  function render() {
    calendar.replaceChildren();
    const year = Number(select.value);
    const months = document.createElement('div'); months.className = 'profile-activity-months';
    const weekdays = document.createElement('div'); weekdays.className = 'profile-activity-weekdays'; weekdays.setAttribute('aria-hidden', 'true');
    for (const text of ['', 'Seg', '', 'Qua', '', 'Sex', '']) { const day = document.createElement('span'); day.textContent = text; weekdays.append(day); }
    const grid = document.createElement('div'); grid.className = 'profile-activity-grid';
    const start = new Date(year, 0, 1); start.setDate(start.getDate() - start.getDay());
    const end = new Date(year, 11, 31);
    let total = 0, offset = 0, latestCell = null, lastDayCell = null;
    for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1), offset++) {
      if (day.getFullYear() === year && day.getDate() === 1) {
        const month = document.createElement('span'); month.textContent = day.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        month.style.gridColumn = String(Math.floor(offset / 7) + 1); months.append(month);
      }
      if (day.getFullYear() !== year || day > today) {
        const blank = document.createElement('span'); blank.setAttribute('aria-hidden', 'true'); grid.append(blank); continue;
      }
      const count = counts.get(key(day)) || 0; total += count;
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'profile-day'; cell.dataset.level = String(Math.min(count, 3));
      const date = day.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
      const description = `${date}: ${count} ${count === 1 ? 'contribuição' : 'contribuições'}`;
      cell.title = description; cell.setAttribute('aria-label', description);
      lastDayCell = cell;
      if (count) latestCell = cell;
      cell.addEventListener('pointerenter', () => { detail.textContent = description; });
      cell.addEventListener('focus', () => { detail.textContent = description; });
      cell.addEventListener('click', () => { detail.textContent = description; });
      grid.append(cell);
    }
    calendar.append(months, weekdays, grid);
    const anchor = latestCell || lastDayCell;
    requestAnimationFrame(() => {
      if (!section.isConnected || !anchor || !grid.contains(anchor) || !calendar.contains(grid)) return;
      const viewport = scroll.getBoundingClientRect();
      const position = anchor.getBoundingClientRect();
      scroll.scrollLeft += position.left - viewport.left + position.width / 2 - scroll.clientWidth / 2;
    });
    detail.textContent = 'Passe o cursor ou selecione um dia para ver a data e as contribuições.';
    note.textContent = `${total} ${total === 1 ? 'contribuição visível' : 'contribuições visíveis'} em ${year}. Publicações, metas e demandas criadas; apenas conteúdos disponíveis para você.`;
  }
  select.addEventListener('change', render);
  section.append(header, scroll, detail, note, legend); root.append(section); render();
}

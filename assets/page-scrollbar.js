/** Barra externa abaixo do header; a página continua usando sua rolagem normal. */
export function initializePageScrollbar(app) {
  const track = document.createElement('div');
  track.className = 'hub-page-scrollbar'; track.hidden = true; track.tabIndex = 0;
  track.setAttribute('role', 'scrollbar');
  track.setAttribute('aria-label', 'Rolar página');
  track.setAttribute('aria-controls', app.id);
  track.setAttribute('aria-orientation', 'vertical');
  track.setAttribute('aria-valuemin', '0');
  const thumb = document.createElement('span'); thumb.className = 'hub-page-scrollbar-thumb';
  track.append(thumb); document.body.append(track);
  let scheduled = false, drag = null;
  const page = () => document.scrollingElement || document.documentElement;
  const maximum = () => Math.max(0, page().scrollHeight - window.innerHeight);
  function sync() {
    scheduled = false;
    const max = maximum();
    track.hidden = app.classList.contains('hidden') || max <= 0 ||
      document.documentElement.style.overflow === 'hidden' ||
      document.body.classList.contains('demand-expanded') || !!document.querySelector('dialog[open]');
    if (track.hidden) return;
    const height = track.clientHeight;
    const thumbHeight = Math.min(height, Math.max(36, height * window.innerHeight / page().scrollHeight));
    thumb.style.height = thumbHeight + 'px';
    thumb.style.transform = `translateY(${(height - thumbHeight) * Math.max(0, Math.min(1, page().scrollTop / max))}px)`;
    track.setAttribute('aria-valuemax', String(Math.round(max)));
    track.setAttribute('aria-valuenow', String(Math.round(page().scrollTop)));
  }
  function schedule() {
    if (!scheduled) { scheduled = true; requestAnimationFrame(sync); }
  }
  function moveTo(position) { window.scrollTo({ top: Math.max(0, Math.min(maximum(), position)), behavior: 'instant' }); }
  track.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); track.focus({ preventScroll: true });
    const rect = thumb.getBoundingClientRect();
    if (event.target !== thumb) {
      const available = track.clientHeight - rect.height;
      if (available > 0) moveTo((event.clientY - track.getBoundingClientRect().top - rect.height / 2) / available * maximum());
    }
    drag = { id: event.pointerId, y: event.clientY, scroll: page().scrollTop };
    track.setPointerCapture(event.pointerId); track.classList.add('is-dragging');
  });
  track.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const available = track.clientHeight - thumb.getBoundingClientRect().height;
    if (available > 0) moveTo(drag.scroll + (event.clientY - drag.y) / available * maximum());
  });
  track.addEventListener('pointerup', event => { if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId); });
  track.addEventListener('lostpointercapture', () => { drag = null; track.classList.remove('is-dragging'); });
  track.addEventListener('keydown', event => {
    const positions = { ArrowDown: page().scrollTop + 60, ArrowUp: page().scrollTop - 60,
      PageDown: page().scrollTop + window.innerHeight * .8, PageUp: page().scrollTop - window.innerHeight * .8,
      Home: 0, End: maximum() };
    if (event.key in positions) { event.preventDefault(); moveTo(positions[event.key]); }
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  new ResizeObserver(schedule).observe(document.body);
  const changes = new MutationObserver(schedule);
  changes.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  changes.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], childList: true });
  changes.observe(app, { attributes: true, attributeFilter: ['class', 'style'] });
  schedule();
}

// Usa a altura real da navegação, sem somar scroll-padding e scroll-margin.
export function workSectionOffset(nav) {
  if (!nav || !nav.getClientRects().length) return 12;
  const style = getComputedStyle(nav);
  if (!['sticky', 'fixed'].includes(style.position)) return 12;
  return Math.max(0, parseFloat(style.top) || 0) + nav.getBoundingClientRect().height + 12;
}

export function scrollToWorkSection(section, nav) {
  if (!section) return;
  const top = window.scrollY + section.getBoundingClientRect().top - workSectionOffset(nav);
  window.scrollTo({
    top: Math.max(0, top),
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
}

export function revealWorkField(field, nav) {
  if (!field?.matches('input,textarea,select,[contenteditable="true"]') || !nav?.getClientRects().length) return false;
  const section = field.closest('[data-section-id]');
  if (!section || !['mural','metas','demandas'].includes(section.dataset.sectionId) || !nav.parentElement.contains(section)) return false;
  const style = getComputedStyle(nav);
  if (!['sticky','fixed'].includes(style.position)) return false;
  const bar = nav.getBoundingClientRect();
  if (bar.top > (parseFloat(style.top) || 0) + 1) return false;
  const top = Math.max(bar.bottom, window.visualViewport?.offsetTop || 0) + 12;
  const fieldTop = field.getBoundingClientRect().top;
  if (fieldTop >= top) return false;
  window.scrollBy({top:fieldTop-top, behavior:'instant'});
  return true;
}

export function initializeWorkFieldVisibility(nav) {
  if (!nav) return;
  let timer;
  const syncOffset = () => nav.parentElement.style.setProperty('--work-content-offset', workSectionOffset(nav)+'px');
  const reveal = () => {
    clearTimeout(timer);
    timer = setTimeout(() => requestAnimationFrame(() => revealWorkField(document.activeElement,nav)),80);
  };
  nav.parentElement.addEventListener('focusin',reveal);
  window.addEventListener('resize',syncOffset,{passive:true});
  window.visualViewport?.addEventListener('resize',reveal,{passive:true});
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncOffset).observe(nav);
  syncOffset();
}

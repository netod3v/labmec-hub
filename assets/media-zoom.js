export function initializeMediaZoom({ viewport, controls, wheelRequiresModifier = false }) {
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const minus = controls.querySelector('[data-zoom-out]');
  const plus = controls.querySelector('[data-zoom-in]');
  const fit = controls.querySelector('[data-zoom-reset]');
  let media = null, scale = 1, x = 0, y = 0, drag = null;
  function paint() {
    if (media) {
      const limitX = Math.max(0, (media.offsetWidth * scale - viewport.clientWidth) / 2);
      const limitY = Math.max(0, (media.offsetHeight * scale - viewport.clientHeight) / 2);
      x = Math.max(-limitX, Math.min(limitX, x));
      y = Math.max(-limitY, Math.min(limitY, y));
      media.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    }
    viewport.classList.toggle('is-zoomed', !!media && scale > 1);
    minus.disabled = !media || scale <= 1;
    plus.disabled = !media || scale >= 4;
    fit.textContent = `${Math.round(scale * 100)}%`;
    fit.title = 'Voltar ao tamanho inicial';
  }
  function stopDrag() {
    if (drag && viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
    drag = null;
    viewport.classList.remove('is-dragging');
  }
  function zoom(value) {
    if (!media) return;
    scale = Math.max(1, Math.min(4, value));
    if (scale === 1) { x = 0; y = 0; stopDrag(); }
    paint();
  }
  minus.addEventListener('click', () => zoom(scale - .25), options);
  plus.addEventListener('click', () => zoom(scale + .25), options);
  fit.addEventListener('click', () => zoom(1), options);
  viewport.addEventListener('wheel', event => {
    if (!media || !event.deltaY) return;
    if(wheelRequiresModifier && !event.ctrlKey && !event.metaKey)return;
    event.preventDefault();
    zoom(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { ...options, passive: false });
  viewport.addEventListener('pointerdown', event => {
    if (!media || scale <= 1 || event.button !== 0 || !event.isPrimary) return;
    // Preserva os controles nativos na base do vídeo.
    if (media.tagName === 'VIDEO' && event.clientY >= media.getBoundingClientRect().bottom - 54) return;
    event.preventDefault();
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x, y };
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(event.pointerId);
  }, options);
  viewport.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    x = drag.x + event.clientX - drag.startX;
    y = drag.y + event.clientY - drag.startY;
    paint();
  }, options);
  viewport.addEventListener('pointerup', stopDrag, options);
  viewport.addEventListener('pointercancel', stopDrag, options);
  viewport.addEventListener('lostpointercapture', () => { drag = null; viewport.classList.remove('is-dragging'); }, options);
  viewport.addEventListener('dragstart', event => event.preventDefault(), options);
  const observer = new ResizeObserver(paint);
  observer.observe(viewport);
  paint();
  return {
    reset(next) {
      stopDrag();
      if (media) { observer.unobserve(media); media.style.removeProperty('transform'); }
      media = next; scale = 1; x = 0; y = 0;
      if (media) observer.observe(media);
      controls.hidden = !media;
      paint();
    },
    destroy() { stopDrag(); observer.disconnect(); controller.abort(); },
  };
}

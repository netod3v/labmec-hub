// Measure the actual available width so only overflowing notices move.
export function initializeNoticeMarquee(root) {
  if (!root) return;
  let frame = 0;
  const measure = () => {
    frame = 0;
    const viewport = root.querySelector('.today-highlight-title');
    const text = viewport?.firstElementChild;
    if (!text) return;
    const distance = Math.max(0, text.scrollWidth - viewport.clientWidth);
    viewport.classList.toggle('is-scrolling', viewport.clientWidth > 0 && distance > 1);
    viewport.style.setProperty('--notice-distance', `-${distance}px`);
    viewport.style.setProperty('--notice-duration', `${Math.max(8, distance / 30 + 3)}s`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  new MutationObserver(schedule).observe(root, {childList:true, subtree:true, characterData:true});
  new ResizeObserver(schedule).observe(root);
  document.fonts?.ready.then(schedule);
  schedule();
}

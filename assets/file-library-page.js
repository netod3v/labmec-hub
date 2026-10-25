export function initializeFileLibraryPage(panel) {
  const container = document.getElementById('sections-container');
  const back = document.getElementById('lab-files-back');
  const shortcut = document.getElementById('sidebar-files-link');
  let returnScroll = 0, returnFocus = null, returnSection = 'mural', animation = null;
  container.append(panel);
  panel.hidden = true;
  function close(restore = false) {
    if (panel.hidden) return;
    animation?.cancel();
    panel.hidden = true;
    shortcut.removeAttribute('aria-current');
    container.classList.remove('files-page-active');
    document.body.classList.remove('files-page-open');
    if (restore) {
      window.scrollTo({ top: returnScroll, behavior: 'instant' });
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      document.querySelectorAll('[data-work-section]').forEach(button => button.classList.toggle('active', button.dataset.workSection === returnSection));
    }
    document.querySelector('[data-work-section="arquivos"]')?.classList.remove('active');
  }
  function open() {
    if (panel.hidden) {
      returnScroll = window.scrollY; returnFocus = document.activeElement;
      returnSection = document.querySelector('[data-work-section].active')?.dataset.workSection || 'mural';
    }
    document.dispatchEvent(new CustomEvent('hub:leave-profile'));
    document.dispatchEvent(new CustomEvent('hub:close-search'));
    panel.hidden = false;
    shortcut.setAttribute('aria-current', 'page');
    container.classList.add('files-page-active');
    document.body.classList.add('files-page-open');
    document.querySelectorAll('[data-work-section]').forEach(button => button.classList.toggle('active', button.dataset.workSection === 'arquivos'));
    window.scrollTo({ top: 0, behavior: 'instant' });
    back.focus({ preventScroll: true });
    animation?.cancel();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation = panel.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 250, easing: 'ease-out' });
    }
  }
  document.addEventListener('hub:open-files', open);
  shortcut.onclick = open;
  document.addEventListener('hub:leave-files', () => close());
  document.addEventListener('hub:leave-profile', () => close());
  back.onclick = () => close(true);
  document.getElementById('lab-files-add').onclick = () => {
    const upload = panel.querySelector('.file-upload'); upload.open = true;
    upload.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel.querySelector('input[type="file"]').focus({ preventScroll: true });
  };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden && !document.querySelector('dialog[open],.modal-overlay:not(.hidden)')) {
      event.preventDefault(); close(true);
    }
  });
  return { close };
}

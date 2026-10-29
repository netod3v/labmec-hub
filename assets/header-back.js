// Reuse each screen's own return action, including scroll, focus and drafts.
const surfaces = [
  '.modal-overlay:not(.hidden):not(.modal-closing)', 'dialog[open]',
  '#global-search-panel:not([hidden])', '#lab-files', '#view-profile-modal',
  '#mention-notification-modal', '#header-more-menu.open', '#mobile-compose-page',
].join(',');
const controls = [
  '#view-profile-back', '#lab-files-back', '#mention-notification-close',
  '#global-search-close', '#photo-viewer-back', '#dm-thread-back',
  '#note-studio-close', '.more-page-back', '.mobile-compose-back',
  '.modal-head .modal-close', '.donation-close', '[data-policy-close]',
  '.media-viewer-toolbar [data-close]',
].join(',');

function visible(element) {
  return !element.disabled && !element.closest('[inert],[hidden],.hidden,.modal-closing')
    && element.getClientRects().length > 0;
}

export function returnFromCurrentScreen(root = document) {
  // For equal stacking levels the later DOM sibling is painted above the earlier.
  const candidates = [...root.querySelectorAll(surfaces)].filter(visible).map((surface, order) => ({
    surface, order,
    layer: surface.matches('dialog[open]') ? Infinity : Number.parseInt(getComputedStyle(surface).zIndex, 10) || 0,
  })).sort((a, b) => b.layer - a.layer || b.order - a.order);
  for (const {surface} of candidates) {
    const back = surface.id === 'header-more-menu'
      ? surface.querySelector('.more-page-back')
      : [...surface.querySelectorAll(controls)].find(visible);
    if (back && !back.disabled) {
      back.click();
      return true;
    }
  }
  return false;
}

export function initializeHeaderBack(button, fallback) {
  button.addEventListener('click', () => {
    if (!returnFromCurrentScreen()) fallback();
  });
}

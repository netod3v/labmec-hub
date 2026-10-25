export function initializeNotificationsPage(panel, shortcut) {
  document.addEventListener('click',event=>{
    const active=event.target.closest?.('.notification-entry-menu');
    panel.querySelectorAll('.notification-entry-menu[open]').forEach(menu=>{if(menu!==active)menu.open=false;});
  });
  const container = document.getElementById('sections-container');
  let returnScroll = 0, returnFocus = null, animation = null;
  panel.classList.remove('modal-overlay', 'modal-visible', 'modal-closing');
  panel.classList.add('notifications-page');
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'notifications-page-title');
  container.append(panel);
  function close(restore = false) {
    if (panel.classList.contains('hidden')) return;
    animation?.cancel();
    panel.querySelectorAll('.notification-entry-menu[open]').forEach(menu=>menu.open=false);
    panel.classList.add('hidden');
    container.classList.remove('notifications-page-active');
    document.body.classList.remove('notifications-page-open');
    shortcut.removeAttribute('aria-current');
    if (restore) {
      window.scrollTo({top:returnScroll, behavior:'instant'});
      if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    }
  }
  function open() {
    if (!panel.classList.contains('hidden')) { window.scrollTo({top:0, behavior:'instant'}); return; }
    returnScroll = window.scrollY; returnFocus = document.activeElement;
    document.dispatchEvent(new CustomEvent('hub:leave-profile'));
    document.dispatchEvent(new CustomEvent('hub:leave-files'));
    document.dispatchEvent(new CustomEvent('hub:close-search'));
    panel.classList.remove('hidden');
    container.classList.add('notifications-page-active');
    document.body.classList.add('notifications-page-open');
    shortcut.setAttribute('aria-current', 'page');
    window.scrollTo({top:0, behavior:'instant'});
    panel.querySelector('#mention-notification-close').focus({preventScroll:true});
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      animation = panel.animate([{opacity:0, transform:'translateY(10px)'},{opacity:1, transform:'translateY(0)'}], {duration:240, easing:'ease-out'});
    }
  }
  document.addEventListener('hub:leave-files', () => close());
  document.addEventListener('hub:leave-profile', () => close());
  document.addEventListener('keydown', event => {
    if(event.key==='Escape'){
      const menu=panel.querySelector('.notification-entry-menu[open]');
      if(menu){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary').focus();return;}
    }
    if (event.key === 'Escape' && !panel.classList.contains('hidden') && !document.querySelector('dialog[open],.modal-overlay:not(.hidden)')) {
      event.preventDefault(); close(true);
    }
  });
  return {open, close};
}

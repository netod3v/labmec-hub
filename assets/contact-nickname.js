export function editContactNickname({name, nickname = '', onSave}) {
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'contact-nickname-dialog';
  dialog.setAttribute('aria-labelledby', 'contact-nickname-title');
  dialog.innerHTML = '<div class="nickname-heading"><span class="nickname-icon" aria-hidden="true">✎</span><button type="button" class="nickname-close" aria-label="Fechar">×</button><h2 id="contact-nickname-title">Um apelido para essa pessoa</h2><p>Deixe a conversa com a sua cara. Só você vê esse apelido.</p></div><form class="nickname-form"><div class="nickname-original"><span>Nome original</span><strong></strong></div><label for="contact-nickname-input">Como você quer chamar essa pessoa?</label><input id="contact-nickname-input" maxlength="40" autocomplete="off" aria-describedby="contact-nickname-count contact-nickname-error"><span id="contact-nickname-count"></span><p id="contact-nickname-error" role="status" aria-live="polite"></p><button type="button" class="nickname-reset">↶ Voltar ao nome original</button><div class="nickname-actions"><button type="button" class="btn" data-cancel>Cancelar</button><button type="submit" class="btn btn-primary">Salvar apelido</button></div></form>';
  const input = dialog.querySelector('input'), error = dialog.querySelector('[role=status]'), form = dialog.querySelector('form'), reset = dialog.querySelector('.nickname-reset');
  dialog.querySelector('.nickname-original strong').textContent = name;
  input.placeholder = name; input.value = nickname;
  let saving = false;
  const count = () => { dialog.querySelector('#contact-nickname-count').textContent = input.value.length + '/40'; };
  input.addEventListener('input', count); count();
  reset.disabled = !nickname;
  const close = () => { if (!saving) dialog.close(); };
  dialog.querySelector('.nickname-close').onclick = close;
  dialog.querySelector('[data-cancel]').onclick = close;
  dialog.addEventListener('cancel', event => { if(saving) event.preventDefault(); });
  dialog.addEventListener('keydown', event => { if(event.key === 'Escape') event.stopPropagation(); });
  const save = async value => {
    if(saving) return;
    saving = true; error.textContent = '';
    dialog.querySelectorAll('button,input').forEach(element=>element.disabled=true);
    try { await onSave(value); dialog.close(); }
    catch(reason) {
      error.textContent = reason.message || 'Não foi possível salvar. Tente novamente.';
      dialog.querySelectorAll('button,input').forEach(element=>element.disabled=false);
      reset.disabled = !nickname;
      input.focus();
    } finally { saving = false; }
  };
  form.onsubmit = event => { event.preventDefault(); save(input.value.trim()); };
  reset.onclick = () => save('');
  dialog.addEventListener('close', () => { dialog.remove(); if(opener?.isConnected) opener.focus({preventScroll:true}); }, {once:true});
  document.body.append(dialog); dialog.showModal(); input.focus(); input.select();
  return dialog;
}

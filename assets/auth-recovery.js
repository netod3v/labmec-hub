import { request } from './lab-api.js';

export function initializeAuthRecovery({ onClose, onSuccess, api = request }) {
  const el = id => document.getElementById(id);
  const panel = el('auth-recovery');
  const codeForm = el('recovery-code-form');
  const passwordForm = el('recovery-password-form');
  const code = el('recovery-code');
  const password = el('recovery-password');
  const confirmation = el('recovery-confirmation');
  const status = el('recovery-status');
  const title = el('recovery-title');
  const description = el('recovery-description');
  const progress = el('recovery-progress');
  const resend = el('recovery-resend');
  const verify = el('recovery-verify');
  const save = el('recovery-save');
  let email = '', token = '', generation = 0, busy = false;
  const message = (text, error = false) => {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  };
  const pending = value => {
    busy = value;
    resend.disabled = verify.disabled = save.disabled = value;
  };
  const clear = () => {
    generation++;
    email = token = '';
    codeForm.reset(); passwordForm.reset();
    password.type = confirmation.type = 'password';
    confirmation.setCustomValidity('');
    message(''); pending(false);
  };
  const close = () => {
    clear(); panel.hidden = true;
    el('login-screen').classList.remove('recovering');
    el('login-form').classList.remove('hidden');
    el('login-toggle').classList.remove('hidden');
    onClose();
  };
  el('recovery-back').addEventListener('click', () => {
    close(); el('login-email').focus();
  });
  codeForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !email || !codeForm.reportValidity()) return;
    const current = generation;
    pending(true); message('Verificando código…');
    try {
      const result = await api('/auth/verify-reset-code', {
        method:'POST', body:JSON.stringify({email, code:code.value}),
      });
      if (current !== generation) return;
      token = result.token; code.value = '';
      codeForm.hidden = true; passwordForm.hidden = false;
      title.textContent = 'Escolha sua nova senha';
      description.textContent = 'Código validado. Defina sua senha em até 5 minutos.';
      progress.textContent = 'Etapa 2 de 2 · Nova senha';
      message(''); password.focus();
    } catch (error) {
      if (current === generation) message(error.message, true);
    } finally {
      if (current === generation) pending(false);
    }
  });
  resend.addEventListener('click', async () => {
    if (busy || !email) return;
    const current = generation;
    pending(true); message('Solicitando código…');
    try {
      const result = await api('/auth/forgot-password', {
        method:'POST', body:JSON.stringify({email}),
      });
      if (current !== generation) return;
      code.value = ''; message(result.message + ' O envio pode levar até dois minutos.'); code.focus();
    } catch (error) {
      if (current === generation) message(error.message, true);
    } finally {
      if (current === generation) pending(false);
    }
  });
  el('recovery-show-password').addEventListener('change', event => {
    password.type = confirmation.type = event.target.checked ? 'text' : 'password';
  });
  for (const field of [password, confirmation]) field.addEventListener('input', () => confirmation.setCustomValidity(''));
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !token) return;
    confirmation.setCustomValidity(password.value === confirmation.value ? '' : 'As senhas precisam ser iguais.');
    if (!passwordForm.reportValidity()) return;
    const current = generation;
    pending(true); message('Salvando sua nova senha…');
    try {
      const result = await api('/auth/reset-password', {
        method:'POST', body:JSON.stringify({token, password:password.value}),
      });
      if (current !== generation) return;
      close(); el('login-password').value = '';
      onSuccess(result.message); el('login-password').focus();
    } catch (error) {
      if (current === generation) message(error.message, true);
    } finally {
      if (current === generation) pending(false);
    }
  });
  return {
    start(address) {
      clear(); email = address.trim();
      el('login-screen').classList.add('recovering');
      el('login-password').value = '';
      el('login-form').classList.add('hidden');
      el('login-toggle').classList.add('hidden');
      el('recent-accounts').style.display = 'none';
      el('switch-accounts-btn').style.display = 'none';
      el('login-subtitle').textContent = 'Recupere seu acesso com segurança.';
      panel.hidden = false; codeForm.hidden = false; passwordForm.hidden = true;
      title.textContent = 'Verifique seu e-mail';
      description.textContent = 'Digite o código recebido. Ele vale por 10 minutos. Confira também o spam.';
      progress.textContent = 'Etapa 1 de 2 · Verificação';
      code.focus();
    },
  };
}

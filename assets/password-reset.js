import { request } from './lab-api.js';

let token = '';
// O segredo fica somente na memória desta página, sem URL, localStorage ou analytics.
history.replaceState(null, '', location.pathname + location.search);
const form = document.getElementById('reset-form');
const password = document.getElementById('new-password');
const confirmation = document.getElementById('confirm-password');
const status = document.getElementById('reset-status');
const submit = document.getElementById('reset-submit');
const codeForm = document.getElementById('code-form');
const email = document.getElementById('reset-email');
const code = document.getElementById('reset-code');
const verify = document.getElementById('code-submit');
const resend = document.getElementById('resend-code');
const heading = document.getElementById('reset-heading');
const description = document.getElementById('reset-description');
const showStatus = (message, error = false) => {
  status.textContent = message;
  status.classList.toggle('is-error', error);
};
try {
  email.value = sessionStorage.getItem('hub-reset-email') || '';
  sessionStorage.removeItem('hub-reset-email');
} catch { /* Digitar o e-mail continua funcionando sem sessionStorage. */ }

codeForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (verify.disabled || !codeForm.reportValidity()) return;
  verify.disabled = resend.disabled = true;
  showStatus('Verificando código…');
  try {
    const result = await request('/auth/verify-reset-code', {
      method: 'POST', body: JSON.stringify({ email: email.value.trim(), code: code.value }),
    });
    token = result.token;
    codeForm.reset(); codeForm.hidden = true; form.hidden = false;
    heading.textContent = 'Escolha sua nova senha';
    description.textContent = 'Código validado. Crie uma senha com pelo menos 12 caracteres em até 5 minutos.';
    showStatus(''); password.focus();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    verify.disabled = resend.disabled = false;
  }
});
resend.addEventListener('click', async () => {
  if (resend.disabled || !email.reportValidity()) return;
  verify.disabled = resend.disabled = true;
  showStatus('Solicitando código…');
  try {
    const result = await request('/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email: email.value.trim() }),
    });
    code.value = '';
    showStatus(result.message + ' O envio pode levar até dois minutos.');
    code.focus();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    verify.disabled = resend.disabled = false;
  }
});
document.getElementById('show-password').addEventListener('change', event => {
  password.type = confirmation.type = event.target.checked ? 'text' : 'password';
});
confirmation.addEventListener('input', () => confirmation.setCustomValidity(''));
password.addEventListener('input', () => confirmation.setCustomValidity(''));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled || !token) return;
  confirmation.setCustomValidity(password.value === confirmation.value ? '' : 'As senhas precisam ser iguais.');
  if (!form.reportValidity()) return;
  submit.disabled = true;
  showStatus('Salvando sua nova senha…');
  try {
    const result = await request('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token, password: password.value }),
    });
    token = ''; form.reset(); form.hidden = true;
    heading.textContent = 'Senha atualizada';
    description.textContent = 'Entre novamente no Hub com sua nova senha.';
    showStatus(result.message);
    document.querySelector('.back').focus();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

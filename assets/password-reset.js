import { request } from './lab-api.js';

let token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
// O segredo fica somente na memória desta página, sem URL, localStorage ou analytics.
history.replaceState(null, '', location.pathname + location.search);
const form = document.getElementById('reset-form');
const password = document.getElementById('new-password');
const confirmation = document.getElementById('confirm-password');
const status = document.getElementById('reset-status');
const submit = document.getElementById('reset-submit');
const showStatus = (message, error = false) => {
  status.textContent = message;
  status.classList.toggle('is-error', error);
};
if (!token) {
  form.hidden = true;
  showStatus('Abra o link recebido por e-mail. Se ele expirou, solicite outro em “Esqueceu a senha?” na tela de entrada.', true);
}
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
    showStatus(result.message);
    document.querySelector('.back').focus();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

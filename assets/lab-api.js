import { initializeFileOrganizer } from './file-organizer.js';
/** Conexão entre o hub e a API Python. Nenhuma senha é salva no navegador. */
const apiBase = window.LABIOMEC_CONFIG?.apiBase || '/api';
let csrfToken = '';
let currentUser = null;
let sessionRequest;
const authListeners = new Set();
const subscriptions = new Set();

export async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.method && options.method !== 'GET') {
    if (!csrfToken) await loadSession();
    headers.set('X-CSRF-Token', csrfToken);
  }
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(apiBase + path, { ...options, headers, credentials: 'same-origin' });
  const contentType = response.headers.get('Content-Type') || '';
  const result = contentType.includes('application/json') ? await response.json() : {
    error: response.status === 413 ? 'O arquivo excede o limite de envio do servidor.' : 'O servidor não retornou uma resposta válida.',
  };
  if (!response.ok) {
    const error = new Error(result.error || 'Não foi possível completar a operação.');
    error.code = result.code;
    if (response.status === 401 && currentUser) notifyAuth(null);
    throw error;
  }
  if (result.csrf) csrfToken = result.csrf;
  return result;
}

function notifyAuth(user) {
  const changed = currentUser?.uid !== user?.uid;
  currentUser = user;
  if (changed) {
    for (const item of subscriptions) item.lastValue = undefined;
  }
  for (const listener of authListeners) listener(user);
}

function loadSession() {
  if (!sessionRequest) {
    sessionRequest = request('/session').then(result => {
      csrfToken = result.csrf;
      currentUser = result.user;
      return result;
    }).catch(error => {
      sessionRequest = null;
      throw error;
    });
  }
  return sessionRequest;
}

export function onAuthStateChanged(_auth, callback) {
  authListeners.add(callback);
  loadSession().then(() => callback(currentUser)).catch(() => {
    callback(null);
    const error = document.getElementById('login-error');
    error.textContent = 'O servidor está indisponível. Inicie o backend Python e abra o hub pelo endereço dele.';
    error.classList.add('show');
  });
  return () => authListeners.delete(callback);
}

async function authenticate(action, email, password) {
  const result = await request('/auth/' + action, {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  notifyAuth(result.user);
  refreshSubscriptions();
  return result;
}
export const signInWithEmailAndPassword = (_auth, email, password) => authenticate('login', email, password);
export const createUserWithEmailAndPassword = (_auth, email, password) => authenticate('register', email, password);
export async function signOut() {
  await request('/auth/logout', { method: 'POST' });
  csrfToken = '';
  sessionRequest = null;
  notifyAuth(null);
}
export async function sendPasswordResetEmail(_auth, email) {
  return request('/auth/forgot-password', {method:'POST', body:JSON.stringify({email})});
}

// Estes nomes mantêm as chamadas já existentes no hub; os dados vão ao PostgreSQL.
export const ref = (_database, path) => String(path);
export const serverTimestamp = () => Date.now();
const dataUrl = path => '/data/' + path.split('/').map(encodeURIComponent).join('/');
const snapshot = data => ({ val: () => data, exists: () => data !== null && data !== undefined });
export async function get(path) {
  const result = await request(dataUrl(path));
  return snapshot(result.data);
}
async function write(path, method, data) {
  const actor=currentUser?.uid;
  const result = await request(dataUrl(path), { method, body: data === undefined ? undefined : JSON.stringify(data) });
  await refreshSubscriptions();
  if(actor&&currentUser?.uid===actor&&/^posts(?:_private)?\//.test(path))document.dispatchEvent(new CustomEvent('hub:achievements-updated',{detail:{uid:actor,achievements:(result.achievements||[]).filter(item=>!(result.firstPost&&item.id==='first-post'))}}));
  return result;
}
export const set = (path, data) => write(path, 'PUT', data);
export const update = (path, data) => write(path, 'PATCH', data);
export const remove = path => write(path, 'DELETE');

export async function changeDemandLifecycle(path, action) {
  await request('/demands/' + action, { method: 'POST', body: JSON.stringify({ path }) });
  await refreshSubscriptions();
}

let refreshing = false;
let refreshAgain = false;
async function refreshSubscriptions() {
  if (refreshing) { refreshAgain = true; return; }
  const active = [...subscriptions].filter(item => currentUser || item.path === '.info/connected');
  if (!active.length) return;
  refreshing = true;
  try {
    const paths = [...new Set(active.map(item => item.path).filter(path => path !== '.info/connected'))];
    const result = paths.length ? await request('/sync', { method: 'POST', body: JSON.stringify({ paths }) }) : { data: {} };
    for (const item of active) {
      if (!subscriptions.has(item)) continue;
      const value = item.path === '.info/connected' ? true : result.data[item.path];
      const serialized = JSON.stringify(value);
      if (serialized !== item.lastValue) {
        item.lastValue = serialized;
        item.callback(snapshot(value));
      }
    }
  } catch (error) {
    for (const item of active) if (subscriptions.has(item)) item.onError?.(error);
  } finally {
    refreshing = false;
    if (refreshAgain) { refreshAgain = false; queueMicrotask(refreshSubscriptions); }
  }
}
export function onValue(path, callback, onError) {
  const item = { path, callback, onError };
  subscriptions.add(item);
  queueMicrotask(refreshSubscriptions);
  return () => subscriptions.delete(item);
}
// A presença expira no servidor se não houver heartbeat durante 90 segundos.
// Não dependemos de uma requisição enviada durante o fechamento da aba.
export const onDisconnect = () => ({ set: async () => {}, remove: async () => {} });
setInterval(() => { if (!document.hidden) refreshSubscriptions(); }, 5000);
setInterval(() => {
  if (currentUser) request(dataUrl('presence/' + currentUser.uid), {
    method: 'PUT', body: JSON.stringify({ online: true, lastSeen: Date.now() }),
  }).catch(() => {});
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSubscriptions(); });

/** Painel de arquivos: conteúdo privado por padrão, compartilhável por unidade. */
export function initializeFilesPanel() {
  initializeFileOrganizer({ request, get, onAuthStateChanged, apiBase });
}

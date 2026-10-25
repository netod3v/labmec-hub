/** Anexos do mural: uploads em disco; o post recebe apenas os identificadores. */
import { request, onAuthStateChanged } from './lab-api.js';

const MAX_FILES = 6;
const allowedExtensions = /\.(jpe?g|png|gif|webp|mp4|webm|pdf)$/i;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const fileUrl = (id, inline = false) => (window.LABIOMEC_CONFIG?.apiBase || '/api') +
  '/files/' + encodeURIComponent(id) + (inline ? '?inline=1' : '');
const sizeLabel = bytes => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function createAttachmentComposer() {
  const input = document.getElementById('post-attachment-input');
  const buttons = [...document.querySelectorAll('[data-attachment-accept]')];
  const previews = document.getElementById('post-attachment-previews');
  const status = document.getElementById('post-attachment-status');
  let pending = [];
  let busy = false;
  let accountId;
  let draftId = null;

  function renderPreviews() {
    previews.replaceChildren();
    previews.dataset.count = String(pending.length);
    buttons.forEach(button => { button.disabled = busy || pending.length >= MAX_FILES; });
    input.disabled = busy;
    for (const item of pending) {
      const card = document.createElement('div');
      card.className = 'attachment-preview';
      const media = document.createElement('div'); media.className = 'attachment-preview-media';
      const isImage = /\.(jpe?g|png|gif|webp)$/i.test(item.file.name);
      card.classList.toggle('is-image', isImage);
      let preview;
      if (isImage) {
        preview = document.createElement('img');
        preview.src = item.url; preview.alt = item.file.name;
      } else if (/\.(mp4|webm)$/i.test(item.file.name)) {
        preview = document.createElement('video');
        preview.src = item.url; preview.controls = true; preview.preload = 'metadata';
        preview.playsInline = true;
      } else {
        preview = document.createElement('span');
        preview.className = 'attachment-pdf-icon'; preview.textContent = 'PDF';
      }
      const name = document.createElement('span');
      name.className = 'attachment-preview-name';
      name.textContent = isImage ? (/\.gif$/i.test(item.file.name) ? 'GIF' : 'Foto') : item.file.name;
      name.title = item.file.name;
      const size = document.createElement('small');
      size.textContent = sizeLabel(item.file.size);
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'attachment-preview-remove';
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
      remove.title = 'Remover anexo';
      remove.setAttribute('aria-label', 'Remover ' + item.file.name);
      remove.disabled = busy;
      remove.onclick = () => {
        pending = pending.filter(candidate => candidate !== item);
        URL.revokeObjectURL(item.url);
        if (item.uploaded) request('/files/' + item.uploaded.id, { method: 'DELETE' }).catch(() => {
          status.textContent = 'Não foi possível excluir o anexo do servidor. Ele foi removido desta publicação.';
        });
        renderPreviews();
      };
      media.append(preview, remove);
      const information = document.createElement('div'); information.className = 'attachment-preview-info';
      information.append(name, size);
      card.append(media, information);
      previews.append(card);
    }
  }

  input.addEventListener('change', () => {
    status.textContent = '';
    for (const file of input.files) {
      if (!allowedExtensions.test(file.name)) {
        status.textContent = 'Use JPG, PNG, GIF, WebP, MP4, WebM ou PDF.';
        continue;
      }
      if (pending.length >= MAX_FILES) {
        status.textContent = 'Você pode anexar até 6 arquivos por publicação.';
        break;
      }
      pending.push({ file, url: URL.createObjectURL(file), uploaded: null });
    }
    input.value = '';
    renderPreviews();
  });
  buttons.forEach(button => {
    button.onclick = () => {
      input.accept = button.dataset.attachmentAccept;
      input.click();
    };
  });

  function clear() {
    pending.forEach(item => URL.revokeObjectURL(item.url));
    pending = []; draftId = null; status.textContent = ''; renderPreviews();
  }
  onAuthStateChanged(null, user => {
    if (accountId !== user?.uid) clear();
    accountId = user?.uid;
  });

  return {
    hasFiles: () => pending.length > 0,
    draftId: makeId => draftId || (draftId = makeId()),
    setBusy(value) { busy = value; renderPreviews(); },
    async upload() {
      const owner = accountId;
      const selected = [...pending];
      for (let index = 0; index < selected.length; index++) {
        const item = selected[index];
        if (!item.uploaded) {
          status.textContent = `Enviando anexo ${index + 1} de ${selected.length}…`;
          const body = new FormData();
          body.append('file', item.file); body.append('purpose', 'post');
          const result = await request('/files', { method: 'POST', body });
          item.uploaded = result.file;
        }
        if (owner !== accountId) throw new Error('A conta mudou durante o envio. Entre novamente.');
      }
      status.textContent = 'Publicando…';
      return selected.map(item => ({ id: item.uploaded.id }));
    },
    clear,
  };
}

export function renderPostAttachments(post) {
  if (!Array.isArray(post.attachments) || !post.attachments.length) return '';
  const cards = post.attachments.filter(file => /^[a-f0-9]{32}$/.test(file.id)).map(file => {
    const name = escapeHtml(file.name || 'Anexo');
    const inline = escapeHtml(fileUrl(file.id, true));
    const download = escapeHtml(fileUrl(file.id));
    const photo = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mime_type);
    let content;
    if (photo) {
      content = `<a href="${inline}" data-post-media-file="${file.id}" data-post-media-post="${escapeHtml(post.id || '')}" target="_blank" rel="noopener noreferrer" aria-label="Ampliar foto: ${name}"><img src="${inline}" alt="${name}" loading="lazy"></a>`;
    } else if (['video/mp4', 'video/webm'].includes(file.mime_type)) {
      content = `<video data-post-video="${file.id}" controls playsinline preload="metadata" aria-label="${name}"><source src="${inline}" type="${file.mime_type}">Seu navegador não reproduz este vídeo. Use o link para baixar.</video><a class="post-video-expand" href="${inline}" data-post-media-file="${file.id}" data-post-media-post="${escapeHtml(post.id || '')}" target="_blank" rel="noopener noreferrer" aria-label="Ampliar vídeo: ${name}">Ampliar</a>`;
    } else {
      content = `<a class="post-pdf-link" href="${inline}" data-post-media-file="${file.id}" data-post-media-post="${escapeHtml(post.id || '')}" target="_blank" rel="noopener noreferrer"><span class="attachment-pdf-icon">PDF</span><span>Abrir PDF</span></a>`;
    }
    const size = sizeLabel(file.size || 0);
    return `<figure class="post-attachment${photo ? ' is-photo' : ''}">${content}<a class="post-download-action" href="${download}" download title="Baixar arquivo · ${size}" aria-label="Baixar ${name} (${size})"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg><span>${size}</span></a></figure>`;
  });
  return `<div class="post-attachments">${cards.join('')}</div>`;
}

/** Mantém os players existentes quando o mural atualiza curtidas e comentários. */
export function preservePostVideos(root) {
  const videos = new Map([...root.querySelectorAll('video[data-post-video]')].map(video => [
    video.dataset.postVideo, { element: video, playing: !video.paused },
  ]));
  return () => {
    for (const replacement of root.querySelectorAll('video[data-post-video]')) {
      const previous = videos.get(replacement.dataset.postVideo);
      if (!previous) continue;
      replacement.replaceWith(previous.element);
      if (previous.playing) previous.element.play().catch(() => {});
    }
  };
}

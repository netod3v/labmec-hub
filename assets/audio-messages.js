const MAX_SECONDS = 30;
const MAX_BYTES = 500 * 1024;

export function normalizeAudioDataUrl(value) {
  const match = /^data:(audio\/(?:webm|ogg|mp4|mpeg|wav|x-m4a))(?:;codecs=(?:[\w.,-]+|"[\w., -]+"))?;base64,([a-z0-9+/=\r\n]+)$/i.exec(String(value || ''));
  return match ? `data:${match[1].toLowerCase()};base64,${match[2]}` : '';
}

export function preserveMessageAudio(root) {
  const playing = new Map([...root.querySelectorAll('audio[data-message-audio]')].map(player => [
    player.dataset.messageAudio, { player, active: !player.paused, source: player.getAttribute('src') },
  ]));
  return () => {
    root.querySelectorAll('audio[data-message-audio]').forEach(replacement => {
      const previous = playing.get(replacement.dataset.messageAudio);
      if (!previous || previous.source !== replacement.getAttribute('src')) return;
      replacement.replaceWith(previous.player);
      if (previous.active) previous.player.play().catch(() => {});
    });
  };
}

export function createMessageAudioRecorder({ button, status, preview, onStateChange = () => {} }) {
  let recorder = null, stream = null, pending = null, timer = null;
  let phase = 'idle', version = 0, locked = false;
  const originalHtml = button.innerHTML;
  const tracksOff = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };
  const stopTimer = () => { clearInterval(timer); timer = null; };
  function paint() {
    button.disabled = locked || phase === 'requesting' || phase === 'processing';
    button.classList.toggle('is-recording', phase === 'recording');
    button.innerHTML = phase === 'recording' ? '■ Parar' : originalHtml;
    button.title = phase === 'recording' ? 'Parar gravação' : 'Gravar áudio';
    button.setAttribute('aria-label', button.title);
    preview.querySelector('button')?.toggleAttribute('disabled', locked);
    onStateChange(phase !== 'idle');
  }
  function drawPreview() {
    preview.querySelector('audio')?.pause();
    preview.replaceChildren();
    preview.classList.toggle('hidden', !pending);
    if (!pending) return;
    const player = document.createElement('audio');
    player.controls = true; player.preload = 'metadata'; player.src = pending.data;
    player.setAttribute('aria-label', 'Ouvir áudio antes de enviar');
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'btn btn-ghost audio-preview-remove'; remove.textContent = '×';
    remove.setAttribute('aria-label', 'Descartar áudio'); remove.title = 'Descartar áudio'; remove.disabled = locked;
    remove.onclick = clear;
    preview.append(player, remove);
  }
  function clear() {
    version++;
    if (recorder?.state === 'recording') recorder.stop();
    recorder = null; stopTimer(); tracksOff(); phase = 'idle'; pending = null;
    status.textContent = ''; drawPreview(); paint();
  }
  function stop() {
    if (recorder?.state !== 'recording') return;
    phase = 'processing'; status.textContent = 'Preparando áudio…'; paint(); recorder.stop();
  }
  async function start() {
    if (locked || phase !== 'idle') return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      status.textContent = 'Gravação indisponível. Use um navegador compatível em HTTPS ou localhost.'; return;
    }
    const current = ++version;
    phase = 'requesting'; status.textContent = 'Aguardando acesso ao microfone…'; paint();
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== version) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find(type => window.MediaRecorder.isTypeSupported(type));
      const capture = new window.MediaRecorder(stream, { audioBitsPerSecond: 24000, ...(mime ? { mimeType: mime } : {}) });
      recorder = capture;
      const chunks = [], startedAt = Date.now();
      capture.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      capture.addEventListener('error', () => {
        if (current !== version) return;
        clear(); status.textContent = 'A gravação falhou. Tente gravar novamente.';
      });
      capture.addEventListener('stop', () => {
        if (current !== version) return;
        stopTimer(); tracksOff(); phase = 'processing'; paint();
        const duration = Math.max(1, Math.min(MAX_SECONDS, Math.round((Date.now() - startedAt) / 1000)));
        const type = (capture.mimeType || mime || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type });
        if (!blob.size || blob.size > MAX_BYTES) {
          phase = 'idle'; status.textContent = blob.size ? 'O áudio passou de 500 KB. Grave novamente.' : 'Nenhum som foi gravado. Tente novamente.'; paint(); return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (current !== version) return;
          const data = normalizeAudioDataUrl(reader.result);
          phase = 'idle';
          if (!data) { status.textContent = 'Formato de áudio não suportado. Tente outro navegador.'; paint(); return; }
          pending = { data, mime: type, duration, size: blob.size };
          status.textContent = `Áudio pronto · ${duration}s. Ouça antes de enviar.`;
          drawPreview(); paint();
        };
        reader.onerror = () => { if (current === version) { phase = 'idle'; status.textContent = 'Não foi possível preparar o áudio. Grave novamente.'; paint(); } };
        reader.readAsDataURL(blob);
      });
      pending = null; drawPreview(); capture.start(250); phase = 'recording';
      const tick = () => {
        const seconds = Math.min(MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000));
        status.textContent = `Gravando 00:${String(seconds).padStart(2, '0')} / 00:30`;
        if (seconds >= MAX_SECONDS) stop();
      };
      tick(); timer = setInterval(tick, 500); paint();
    } catch (error) {
      if (current !== version) return;
      stopTimer(); tracksOff(); phase = 'idle';
      status.textContent = error?.name === 'NotAllowedError' ? 'Permita o acesso ao microfone para gravar.' : 'Não foi possível acessar o microfone. Confira se ele está conectado e disponível.';
      paint();
    }
  }
  button.addEventListener('click', () => phase === 'recording' ? stop() : start());
  paint();
  return { start, stop, clear, getPending: () => pending, isBusy: () => phase !== 'idle', setLocked(value) { locked = value; paint(); } };
}

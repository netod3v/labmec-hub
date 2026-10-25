import './qrcodegen.js';

const field = (id, value) => id + String(value.length).padStart(2, '0') + value;
const ascii = (value, limit) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, limit);

export function crc16(text) {
  let crc = 0xFFFF;
  for (const char of text) {
    crc ^= char.charCodeAt(0) << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function createPixPayload(config, amount) {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(String(amount).trim())) throw new Error('Informe um valor com até duas casas decimais.');
  const cents = Math.round(Number(String(amount).replace(',', '.')) * 100);
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > 99999999999) throw new Error('Informe um valor válido a partir de R$ 0,01.');
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(config.key)) throw new Error('A chave Pix precisa ser configurada.');
  const name = ascii(config.name, 25), city = ascii(config.city, 15);
  if (!name || !city) throw new Error('Os dados do beneficiário precisam ser configurados.');
  const data = field('00', '01') + field('26', field('00', 'br.gov.bcb.pix') + field('01', config.key)) + field('52', '0000') + field('53', '986') + field('54', (cents / 100).toFixed(2)) + field('58', 'BR') + field('59', name) + field('60', city) + field('62', field('05', '***')) + '6304';
  return data + crc16(data);
}

export function initializeDonationPix() {
  const config = window.LABIOMEC_CONFIG?.donationPix;
  if (!config) return;
  const dialog = document.createElement('dialog');
  dialog.className = 'donation-dialog';
  dialog.setAttribute('aria-labelledby', 'donation-title');
  dialog.innerHTML = `<div class="donation-heading"><span class="donation-symbol" aria-hidden="true">♡</span><button type="button" class="donation-close" aria-label="Fechar">×</button><h2 id="donation-title">Apoiar o desenvolvedor</h2><p>Gostou do hub? Contribua com qualquer valor para apoiar meu trabalho.</p></div><div class="donation-content"><p class="donation-voluntary">Contribuição voluntária para o desenvolvedor. O uso do hub continua igual.</p><form><label for="donation-amount">Quanto você quer contribuir?</label><div class="donation-presets">${[5,10,20,50].map(value => `<button type="button" data-amount="${value}">R$ ${value}</button>`).join('')}</div><div class="donation-amount"><span>R$</span><input id="donation-amount" inputmode="decimal" autocomplete="off" placeholder="Outro valor" required aria-describedby="donation-status"></div><button class="btn btn-primary donation-generate" type="submit">Gerar Pix</button></form><p id="donation-status" role="status" aria-live="polite"></p><section class="donation-result" hidden><strong class="donation-total"></strong><canvas aria-label="QR Code para pagar com Pix" role="img"></canvas><p>Escaneie no app do banco ou use o Pix Copia e Cola.</p><label for="donation-code">Pix Copia e Cola</label><textarea id="donation-code" readonly rows="3" spellcheck="false"></textarea><button type="button" class="btn btn-primary donation-copy">Copiar código Pix</button><div class="donation-beneficiary"><span>Beneficiário</span><strong></strong><span>Brasília · DF</span></div><p>Confira o nome e o valor no banco antes de confirmar. O site não confirma o recebimento do Pix automaticamente.</p></section></div>`;
  document.body.append(dialog);
  dialog.querySelector('.donation-beneficiary strong').textContent = config.name;
  const input = dialog.querySelector('input'), result = dialog.querySelector('.donation-result'), status = dialog.querySelector('[role=status]'), code = dialog.querySelector('textarea');
  let opener;
  let motion = null, closing = false;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finishClose = () => {dialog.close();opener?.focus({preventScroll:true});};
  const open = trigger => {
    opener = trigger; closing = false; motion?.cancel();
    dialog.classList.remove('is-closing');
    if(!dialog.open) dialog.showModal();
    if(!reducedMotion()) motion = dialog.animate([
      {opacity:0,transform:'translateY(16px) scale(.96)'},
      {opacity:1,transform:'translateY(0) scale(1)'}
    ],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
  };
  const close = () => {
    if(!dialog.open || closing) return;
    closing = true;
    const from = {opacity:getComputedStyle(dialog).opacity,transform:getComputedStyle(dialog).transform};
    motion?.cancel();
    if(reducedMotion()){finishClose();return;}
    dialog.classList.add('is-closing');
    const exit = dialog.animate([from,{opacity:0,transform:'translateY(10px) scale(.97)'}],{duration:160,easing:'ease-in',fill:'forwards'});
    motion = exit;
    exit.finished.then(()=>{if(motion===exit && closing)finishClose();},()=>{});
  };
  document.querySelectorAll('[data-donation-open]').forEach(button => {
    button.addEventListener('click', () => open(button));
  });
  document.querySelectorAll('.legal-links').forEach(nav => {
    const link = document.createElement('a');
    link.href = '#apoiar'; link.textContent = '♡ Apoiar o dev';
    link.addEventListener('click', event => { event.preventDefault(); open(link); });
    nav.append(link);
  });
  dialog.querySelector('.donation-close').onclick = close;
  dialog.addEventListener('cancel', event => {event.preventDefault();close();});
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  dialog.addEventListener('close', () => {if(dialog.open)return;motion?.cancel();motion=null;closing=false;dialog.classList.remove('is-closing');opener?.focus({preventScroll:true});});
  const invalidate = () => { result.hidden = true; code.value = ''; status.textContent = ''; dialog.querySelector('.donation-copy').textContent = 'Copiar código Pix'; };
  input.addEventListener('input', invalidate);
  dialog.querySelectorAll('[data-amount]').forEach(button => button.onclick = () => { input.value = button.dataset.amount; invalidate(); input.focus(); });
  dialog.querySelector('form').onsubmit = event => {
    event.preventDefault(); invalidate();
    try {
      const payload = createPixPayload(config, input.value);
      const qr = window.labiomecQr.QrCode.encodeText(payload, window.labiomecQr.QrCode.Ecc.MEDIUM);
      const canvas = dialog.querySelector('canvas'), scale = 5, border = 4;
      canvas.width = canvas.height = (qr.size + border * 2) * scale;
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#000';
      for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) context.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
      code.value = payload;
      dialog.querySelector('.donation-total').textContent = Number(input.value.replace(',', '.')).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
      result.hidden = false;
      status.textContent = 'Pix pronto. Finalize o pagamento no aplicativo do seu banco.';
    } catch (error) { status.textContent = error.message; }
  };
  dialog.querySelector('.donation-copy').onclick = async () => {
    const payload = code.value;
    if (!payload) return;
    try { await navigator.clipboard.writeText(payload); if (code.value === payload) status.textContent = 'Código copiado! Abra o Pix Copia e Cola no seu banco.'; }
    catch { code.focus(); code.select(); status.textContent = 'Selecione e copie o código acima para usar no seu banco.'; }
  };
}

/** Editor local: nenhuma foto é enviada antes de salvar o perfil. */
export async function editProfilePhoto(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('Escolha uma foto de até 20 MB.');
  const url = URL.createObjectURL(file);
  const photo = new Image();
  try {
    photo.src = url;
    await photo.decode();
    return await openEditor(photo);
  } catch (error) {
    if (error.name === 'EncodingError') throw new Error('Não foi possível abrir essa foto. Use JPG, PNG ou WebP.');
    throw error;
  } finally { URL.revokeObjectURL(url); }
}

function openEditor(photo) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'photo-editor-dialog';
    dialog.setAttribute('aria-labelledby', 'photo-editor-title');
    dialog.innerHTML = `
      <div class="photo-editor-heading"><h2 id="photo-editor-title">Ajustar foto</h2><p>Arraste a imagem ou use os controles para escolher o enquadramento.</p></div>
      <div class="photo-editor-content">
        <div class="photo-editor-stage"><canvas width="320" height="320" aria-label="Prévia do recorte da foto"></canvas><span>A prévia circular mostra como a foto aparece no perfil.</span></div>
        <div class="photo-editor-controls">
          <label>Zoom<input name="zoom" type="range" min="100" max="300" value="100"></label>
          <label>Posição horizontal<input name="horizontal" type="range" min="0" max="100" value="50"></label>
          <label>Posição vertical<input name="vertical" type="range" min="0" max="100" value="50"></label>
          <label>Filtro<select name="filter"><option value="none">Original</option><option value="grayscale(1)">Preto e branco</option><option value="sepia(.45) saturate(1.2)">Quente</option><option value="saturate(.8) hue-rotate(15deg)">Frio</option><option value="sepia(1)">Sépia</option><option value="contrast(1.25) saturate(1.15)">Destaque</option></select></label>
          <label>Brilho<input name="brightness" type="range" min="70" max="130" value="100"></label>
          <button type="button" class="btn" data-reset>Redefinir ajustes</button>
        </div>
      </div>
      <p class="photo-editor-error" role="status"></p>
      <div class="photo-editor-footer"><button type="button" class="btn" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-apply>Usar foto</button></div>`;
    const canvas = dialog.querySelector('canvas');
    const controls = Object.fromEntries([...dialog.querySelectorAll('[name]')].map(node => [node.name, node]));
    const context = canvas.getContext('2d');
    function dimensions(size) {
      const scale = Math.max(size / photo.naturalWidth, size / photo.naturalHeight) * Number(controls.zoom.value) / 100;
      const width = photo.naturalWidth * scale, height = photo.naturalHeight * scale;
      return { width, height, x: (size - width) * Number(controls.horizontal.value) / 100, y: (size - height) * Number(controls.vertical.value) / 100 };
    }
    function draw(target, size) {
      const ctx = target.getContext('2d');
      const { width, height, x, y } = dimensions(size);
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
      ctx.filter = `${controls.filter.value === 'none' ? '' : controls.filter.value} brightness(${Number(controls.brightness.value) / 100})`.trim();
      ctx.drawImage(photo, x, y, width, height);
      ctx.filter = 'none';
    }
    const redraw = () => draw(canvas, canvas.width);
    for (const control of Object.values(controls)) control.addEventListener('input', redraw);
    let pointer;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const { width, height } = dimensions(canvas.width);
      for (const [key, delta, overflow] of [
        ['horizontal', (event.clientX - pointer.x) * ratio, width - canvas.width],
        ['vertical', (event.clientY - pointer.y) * ratio, height - canvas.height],
      ]) {
        if (overflow > 0) controls[key].value = String(Math.max(0, Math.min(100, Number(controls[key].value) - delta / overflow * 100)));
      }
      pointer.x = event.clientX; pointer.y = event.clientY; redraw();
    });
    canvas.addEventListener('lostpointercapture', () => { pointer = null; });
    canvas.addEventListener('pointerup', event => { canvas.releasePointerCapture(event.pointerId); });
    dialog.querySelector('[data-reset]').onclick = () => {
      for (const [key, value] of Object.entries({ zoom: 100, horizontal: 50, vertical: 50, filter: 'none', brightness: 100 })) controls[key].value = value;
      redraw();
    };
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    let output = null;
    dialog.querySelector('[data-apply]').onclick = () => {
      try {
        const result = document.createElement('canvas'); result.width = result.height = 256;
        draw(result, 256); output = result.toDataURL('image/jpeg', .88); dialog.close();
      } catch { dialog.querySelector('.photo-editor-error').textContent = 'Não foi possível aplicar os ajustes. Tente outra foto.'; }
    };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(output); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    if (!context) { dialog.close(); return; }
    redraw();
  });
}

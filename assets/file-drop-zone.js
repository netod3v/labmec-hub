/** Seleciona um arquivo local; o envio continua dependendo de Guardar arquivo. */
export function initializeFileDropZone({ panel, input, status }) {
  const picker = panel.querySelector('.file-picker');
  const upload = panel.querySelector('.file-upload');
  let depth = 0;
  const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
  const reset = () => { depth = 0; picker.classList.remove('is-dragging'); };
  panel.addEventListener('dragenter', event => {
    if (!hasFiles(event) || input.disabled) return;
    event.preventDefault();
    depth++;
    upload.open = true;
    picker.classList.add('is-dragging');
  });
  panel.addEventListener('dragover', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = input.disabled ? 'none' : 'copy';
  });
  panel.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) reset();
  });
  panel.addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    reset();
    if (input.disabled) return;
    const files = event.dataTransfer.files;
    if (!files.length) return;
    if (files.length !== 1) {
      status.textContent = 'Arraste um arquivo por vez. O arquivo selecionado anteriormente foi mantido.';
      return;
    }
    input.files = files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    status.textContent = 'Arquivo selecionado. Confira o projeto e o acesso e clique em Guardar arquivo.';
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      picker.animate?.([{ transform: 'scale(.985)' }, { transform: 'scale(1.015)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' });
    }
  });
  document.addEventListener('drop', reset);
  document.addEventListener('dragend', reset);
  document.addEventListener('dragover', event => { if (!panel.contains(event.target)) reset(); });
  window.addEventListener('blur', reset);
}

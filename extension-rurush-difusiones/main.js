// Corre en la página de WhatsApp Web (mundo MAIN). Cuando la extensión va a subir un estado, deja
// el archivo listo aquí; si WhatsApp abre su selector de archivos (input.click / showPicker), en vez
// de abrir la ventana de Windows se le entrega ese archivo. Sin archivo pendiente no cambia nada.
(() => {
  let pendiente = null;   // { file, hasta }
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.rurush !== 'archivoEstado') return;
    const bytes = Uint8Array.from(atob(d.b64), (c) => c.charCodeAt(0));
    pendiente = { file: new File([bytes], d.nombre || 'estado.jpg', { type: d.mime || 'image/jpeg' }), hasta: Date.now() + 30000 };
  });
  const entregar = (input) => {
    if (!pendiente || pendiente.hasta < Date.now() || input.type !== 'file') return false;
    const dt = new DataTransfer();
    dt.items.add(pendiente.file);
    pendiente = null;
    input.files = dt.files;
    setTimeout(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      window.postMessage({ rurush: 'archivoEntregado' }, '*');
    }, 50);
    return true;
  };
  const click = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () { if (!entregar(this)) return click.apply(this, arguments); };
  const picker = HTMLInputElement.prototype.showPicker;
  if (picker) HTMLInputElement.prototype.showPicker = function () { if (!entregar(this)) return picker.apply(this, arguments); };
})();

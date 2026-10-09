// Plataforma: extensión de Chrome (habla con el Apps Script por su URL /exec).
// La app del celular tiene su propia versión dentro del Apps Script.
const PLAT = {
  movil: false,
  config: leerConfig,
  faltaConfig: c => !c.url || !c.llave,
  async api(metodo, datos) {
    const { url, llave } = await leerConfig();
    let r;
    if (metodo === 'GET') r = await fetch(`${url}?a=${datos.a}&k=${encodeURIComponent(llave)}`);
    else r = await fetch(url, { method: 'POST', body: JSON.stringify({ ...datos, k: llave }) });
    const j = await r.json().catch(() => { throw new Error('Respuesta inválida del Apps Script (¿la URL es la de /exec?)'); });
    if (!j.ok) throw new Error(j.error || 'Error desconocido');
    return j;
  },
  async leerLocal(k) { return (await chrome.storage.local.get(k))[k]; },
  guardarLocal(k, v) { chrome.storage.local.set({ [k]: v }); },
  borrarLocal(k) { chrome.storage.local.remove(k); },
  opciones() { chrome.runtime.openOptionsPage(); },
  alCambiarConfig(cb) { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync') cb(); }); }
};

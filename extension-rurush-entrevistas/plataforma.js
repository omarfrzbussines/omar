// Plataforma: extensión de Chrome (habla con el Apps Script por su URL /exec).
// La app del celular tiene su propia versión dentro de App.html (ver construir.sh).
async function post(url, datos) {
  const r = await fetch(url, { method: 'POST', body: JSON.stringify(datos) });
  const j = await r.json().catch(() => { throw new Error('Respuesta inválida del Apps Script (¿la URL es la de /exec?)'); });
  if (!j.ok) throw new Error(j.error || 'Error desconocido');
  return j;
}

const PLAT = {
  movil: false,
  config: leerConfig,
  faltaConfig: () => false,
  async preparar() {
    const { url } = await leerConfig();
    if (url && await leerClave()) return true;
    PLAT.sinAcceso();
    return false;
  },
  sinAcceso() {
    chrome.storage.local.remove('clave');
    document.getElementById('equipoBtn').hidden = true;
    document.getElementById('app').innerHTML = `<div class="bloqueo"><div class="grande">🔒</div>
      <h2>Esta PC no está autorizada</h2>
      <p>Pide una invitación al administrador (👥 Equipo en su celular), pégala en Opciones y toca “Activar”.</p>
      <button data-accion="opciones">Abrir opciones</button></div>`;
  },
  async api(metodo, datos) {
    const { url } = await leerConfig();
    const clave = await leerClave();
    return post(url, { ...datos, t: clave && clave.t });
  },
  async leerLocal(k) { return (await chrome.storage.local.get(k))[k]; },
  guardarLocal(k, v) { chrome.storage.local.set({ [k]: v }); },
  borrarLocal(k) { chrome.storage.local.remove(k); },
  opciones() { chrome.runtime.openOptionsPage(); },
  alCambiarConfig(cb) {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' || ch.clave) PLAT.preparar().then(ok => ok && cb());
    });
  }
};

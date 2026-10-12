// Configuración compartida por el panel y las opciones.
const DEFAULTS = {
  url: '',
  firma: 'Rurush Fitness Club',
  umbralAvanzar: 7.5,
  umbralEvaluar: 6.5
};

async function leerConfig() {
  const c = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...c };
}

// La clave de este equipo NO se sincroniza con otras PCs: vive solo en esta (storage.local).
async function leerClave() {
  const { clave } = await chrome.storage.local.get('clave');
  return clave || null;   // { t, nombre, rol }
}

/** Saca el código de 64 caracteres de un link de invitación (o del código pegado solo). */
function codigoDeInvitacion(txt) {
  const m = String(txt || '').match(/[a-f0-9]{64}/);
  return m ? m[0] : '';
}

// Configuración compartida por el panel y las opciones.
const DEFAULTS = {
  url: '',
  llave: '',
  firma: 'Rurush Fitness Club',
  umbralAvanzar: 7.5,
  umbralEvaluar: 6.5
};

async function leerConfig() {
  const c = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...c };
}

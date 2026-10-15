const ids = Object.keys(DEFAULTS);
const ok = document.getElementById('ok');
const $acceso = document.getElementById('acceso');

async function pintarAcceso() {
  const c = await leerClave();
  $acceso.innerHTML = c
    ? `<span class="ok">✔ Activada como <b>${c.nombre.replace(/[<>&]/g, '')}</b>${c.rol === 'admin' ? ' (administrador)' : ''}</span>`
    : '<span class="mal">🔒 Esta PC no tiene acceso todavía</span>';
}

(async () => {
  const c = await leerConfig();
  ids.forEach(id => { document.getElementById(id).value = c[id]; });
  pintarAcceso();
})();

function leerFormulario() {
  const c = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    c[id] = el.type === 'number' ? Number(el.value) : el.value.trim();
  });
  return c;
}

function urlValida(u) { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u); }

document.getElementById('guardar').onclick = async () => {
  const c = leerFormulario();
  if (c.url && !urlValida(c.url)) { ok.className = 'mal'; ok.textContent = 'La URL debe terminar en /exec'; return; }
  await chrome.storage.sync.set(c);
  ok.className = 'ok'; ok.textContent = '✔ Guardado';
};

document.getElementById('activar').onclick = async () => {
  const c = leerFormulario();
  const codigo = codigoDeInvitacion(document.getElementById('invitacion').value);
  if (!urlValida(c.url)) { $acceso.innerHTML = '<span class="mal">Primero pega la URL del Apps Script (termina en /exec)</span>'; return; }
  if (!codigo) { $acceso.innerHTML = '<span class="mal">Esa invitación no es válida: pega el link completo</span>'; return; }
  $acceso.textContent = 'Activando…';
  try {
    const j = await post(c.url, { a: 'activar', codigo });
    await chrome.storage.sync.set({ url: c.url });
    await chrome.storage.local.set({ clave: { t: j.t, nombre: j.nombre, rol: j.rol } });
    document.getElementById('invitacion').value = '';
    pintarAcceso();
  } catch (e) {
    $acceso.innerHTML = `<span class="mal">✖ ${e.message.replace(/[<>&]/g, '')}</span>`;
  }
};

document.getElementById('salir').onclick = async () => {
  if (!confirm('¿Quitar el acceso de esta PC? Para volver a entrar necesitarás una invitación nueva.')) return;
  await chrome.storage.local.remove(['clave', 'cache']);
  pintarAcceso();
};

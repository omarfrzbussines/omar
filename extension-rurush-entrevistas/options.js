const ids = Object.keys(DEFAULTS);
const ok = document.getElementById('ok');

(async () => {
  const c = await leerConfig();
  ids.forEach(id => { document.getElementById(id).value = c[id]; });
})();

function leerFormulario() {
  const c = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    c[id] = el.type === 'number' ? Number(el.value) : el.value.trim();
  });
  return c;
}

document.getElementById('guardar').onclick = async () => {
  const c = leerFormulario();
  if (c.url && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(c.url)) {
    ok.style.color = '#a1281c'; ok.textContent = 'La URL debe terminar en /exec';
    return;
  }
  await chrome.storage.sync.set(c);
  ok.style.color = '#1e6b35'; ok.textContent = '✔ Guardado';
};

document.getElementById('probar').onclick = async () => {
  const c = leerFormulario();
  ok.style.color = '#666'; ok.textContent = 'Probando…';
  try {
    const r = await fetch(c.url + '?a=lista&k=' + encodeURIComponent(c.llave));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    ok.style.color = '#1e6b35'; ok.textContent = `✔ Conecta: ${j.cands.length} postulantes`;
  } catch (e) {
    ok.style.color = '#a1281c'; ok.textContent = '✖ ' + e.message;
  }
};

const DEFAULTS = {
  enabled: true, pipedriveToken: '', expectedNumber: '51926918075',
  modos: {}, mananaHora: 9, mananaDesdeHora: 13, maxEnviosCorrida: 15,
  blocklist: ['51942853538', '51953876647'],
  fbAdsModo: 'sim', fbAdsEtiqueta: 'FB ADS',
  startHour: 8, endHour: 20, intervalMin: 30, sendWindowH: 4,
};
const $ = (id) => document.getElementById(id);
let MODS = {};
const rango = (v, min, max, def) => {
  const n = Number(v);
  return v === '' || Number.isNaN(n) ? def : Math.min(max, Math.max(min, Math.round(n)));
};

$('save').disabled = true;
async function cargar() {
  const { config = {} } = await chrome.storage.local.get('config');
  const c = { ...DEFAULTS, ...config };
  $('enabled').checked = c.enabled;
  MODS = await chrome.runtime.sendMessage({ type: 'modulos' });
  const tabla = $('mods');
  tabla.innerHTML = '';
  for (const [k, nombre] of Object.entries(MODS)) {
    const modo = c.modos[k] || (k === 'm1' ? (c.dryRun === false ? 'real' : 'sim') : 'sim');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td style="text-align:right"><select data-k="${k}">
      <option value="sim">🧪 Simulación</option><option value="real">📤 Envío real</option><option value="off">Apagado</option></select></td>`;
    tr.firstChild.textContent = nombre;
    tr.querySelector('select').value = modo;
    tabla.appendChild(tr);
  }
  for (const k of ['mananaHora', 'mananaDesdeHora', 'maxEnviosCorrida']) $(k).value = c[k];
  $('fbAdsModo').value = c.fbAdsModo;
  $('fbAdsEtiqueta').value = c.fbAdsEtiqueta;
  $('pipedriveToken').value = c.pipedriveToken;
  $('expectedNumber').value = c.expectedNumber;
  $('blocklist').value = c.blocklist.join('\n');
  for (const k of ['startHour', 'endHour', 'intervalMin', 'sendWindowH']) $(k).value = c[k];
  $('save').disabled = false;
}

$('save').onclick = async () => {
  const { config = {} } = await chrome.storage.local.get('config');
  const nuevo = {
    ...DEFAULTS, ...config,
    enabled: $('enabled').checked,
    modos: Object.fromEntries([...document.querySelectorAll('#mods select')].map((x) => [x.dataset.k, x.value])),
    mananaHora: rango($('mananaHora').value, 6, 12, DEFAULTS.mananaHora),
    mananaDesdeHora: rango($('mananaDesdeHora').value, 6, 22, DEFAULTS.mananaDesdeHora),
    maxEnviosCorrida: rango($('maxEnviosCorrida').value, 1, 40, DEFAULTS.maxEnviosCorrida),
    fbAdsModo: $('fbAdsModo').value,
    fbAdsEtiqueta: $('fbAdsEtiqueta').value.trim() || DEFAULTS.fbAdsEtiqueta,
    pipedriveToken: $('pipedriveToken').value.trim(),
    expectedNumber: $('expectedNumber').value.replace(/\D/g, ''),
    blocklist: $('blocklist').value.split(/[\n,;]+/).map((x) => x.replace(/\D/g, '')).filter((x) => x.length >= 9),
    startHour: rango($('startHour').value, 0, 23, DEFAULTS.startHour),
    endHour: rango($('endHour').value, 0, 23, DEFAULTS.endHour),
    intervalMin: rango($('intervalMin').value, 15, 120, DEFAULTS.intervalMin),
    sendWindowH: rango($('sendWindowH').value, 1, 8, DEFAULTS.sendWindowH),
  };
  await chrome.storage.local.set({ config: nuevo });
  await chrome.runtime.sendMessage({ type: 'reschedule' });
  $('ok').textContent = '✓ Guardado';
  setTimeout(() => ($('ok').textContent = ''), 2000);
};

async function pintarImg() {
  const { gpsImage } = await chrome.storage.local.get('gpsImage');
  $('imgPrev').src = gpsImage || '';
  $('imgPrev').style.display = gpsImage ? 'block' : 'none';
  $('imgDel').style.display = gpsImage ? 'inline-block' : 'none';
}
$('img').onchange = () => {
  const f = $('img').files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => { await chrome.storage.local.set({ gpsImage: r.result }); pintarImg(); };
  r.readAsDataURL(f);
};
$('imgDel').onclick = async () => { await chrome.storage.local.remove('gpsImage'); $('img').value = ''; pintarImg(); };

async function pintarVideos() {
  const { videosAnuncio = {} } = await chrome.storage.local.get('videosAnuncio');
  const box = $('videos');
  box.innerHTML = '';
  const lista = Object.entries(videosAnuncio).sort((a, b) => a[1].label.localeCompare(b[1].label));
  if (!lista.length) box.textContent = 'Todavía ninguno: se aprenden en WhatsApp Web al abrir un chat de anuncio.';
  for (const [hash, v] of lista) {
    const fila = document.createElement('div');
    fila.style.cssText = 'display:flex;gap:10px;align-items:center;margin:6px 0;color:#1c1c1c';
    fila.innerHTML = '<img style="width:48px;height:48px;object-fit:cover;border-radius:6px;background:#eee"><span style="flex:1"></span><button type="button" style="margin:0;background:#eee;color:#1c1c1c">Borrar</button>';
    fila.querySelector('img').src = v.thumb || '';
    fila.querySelector('span').textContent = v.label;
    fila.querySelector('button').onclick = async () => {
      const { videosAnuncio: actual = {} } = await chrome.storage.local.get('videosAnuncio');
      delete actual[hash];
      await chrome.storage.local.set({ videosAnuncio: actual });
      pintarVideos();
    };
    box.appendChild(fila);
  }
}

cargar();
pintarImg();
pintarVideos();

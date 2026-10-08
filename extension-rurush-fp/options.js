const DEFAULTS = {
  enabled: true, dryRun: true, pipedriveToken: '', expectedNumber: '51926918075',
  blocklist: ['51942853538', '51953876647'],
  startHour: 8, endHour: 20, intervalMin: 30, sendWindowH: 4,
};
const $ = (id) => document.getElementById(id);
const rango = (v, min, max, def) => {
  const n = Number(v);
  return v === '' || Number.isNaN(n) ? def : Math.min(max, Math.max(min, Math.round(n)));
};

async function cargar() {
  const { config = {} } = await chrome.storage.local.get('config');
  const c = { ...DEFAULTS, ...config };
  $('enabled').checked = c.enabled;
  $('dryRun').checked = c.dryRun;
  $('pipedriveToken').value = c.pipedriveToken;
  $('expectedNumber').value = c.expectedNumber;
  $('blocklist').value = c.blocklist.join('\n');
  for (const k of ['startHour', 'endHour', 'intervalMin', 'sendWindowH']) $(k).value = c[k];
}

$('save').onclick = async () => {
  const { config = {} } = await chrome.storage.local.get('config');
  const nuevo = {
    ...DEFAULTS, ...config,
    enabled: $('enabled').checked,
    dryRun: $('dryRun').checked,
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

cargar();
pintarImg();

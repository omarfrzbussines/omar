const DEFAULTS = {
  enabled: true, dryRun: true, pipedriveToken: '', expectedNumber: '51926918075',
  blocklist: ['51942853538', '51953876647'],
  startHour: 8, endHour: 20, intervalMin: 30, sendWindowH: 4,
};
const $ = (id) => document.getElementById(id);

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
    blocklist: $('blocklist').value.split(/\s+/).map((x) => x.replace(/\D/g, '')).filter(Boolean),
    startHour: Number($('startHour').value),
    endHour: Number($('endHour').value),
    intervalMin: Math.max(15, Number($('intervalMin').value)),
    sendWindowH: Number($('sendWindowH').value),
  };
  await chrome.storage.local.set({ config: nuevo });
  await chrome.runtime.sendMessage({ type: 'reschedule' });
  $('ok').textContent = '✓ Guardado';
  setTimeout(() => ($('ok').textContent = ''), 2000);
};

cargar();

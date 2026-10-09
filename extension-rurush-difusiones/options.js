const DEFAULTS = {
  apiUrl: '', apiKey: '', dryRun: true, pausaMinS: 45, pausaMaxS: 90, topeDiario: 40,
  diasAntiDup: 30, horaInicio: 8, horaFin: 20, blocklist: ['51942853538', '51953876647'],
};
const NUM = ['pausaMinS', 'pausaMaxS', 'topeDiario', 'diasAntiDup', 'horaInicio', 'horaFin'];
const $ = (id) => document.getElementById(id);

async function cargar() {
  const { config } = await chrome.storage.local.get('config');
  const c = { ...DEFAULTS, ...(config || {}) };
  $('apiUrl').value = c.apiUrl;
  $('apiKey').value = c.apiKey;
  $('dryRun').checked = c.dryRun;
  for (const k of NUM) $(k).value = c[k];
  $('blocklist').value = c.blocklist.join('\n');
}

$('guardar').addEventListener('click', async () => {
  const c = {
    apiUrl: $('apiUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    dryRun: $('dryRun').checked,
    blocklist: $('blocklist').value.split(/[\s,;]+/).map((s) => s.replace(/\D/g, '')).filter(Boolean),
  };
  for (const k of NUM) c[k] = Number($(k).value) || DEFAULTS[k];
  if (c.pausaMaxS < c.pausaMinS) c.pausaMaxS = c.pausaMinS;
  await chrome.storage.local.set({ config: c });
  $('ok').textContent = 'Guardado ✓';
  setTimeout(() => { $('ok').textContent = ''; }, 2500);
});

cargar();

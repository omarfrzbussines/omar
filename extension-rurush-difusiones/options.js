const DEFAULTS = {
  apiUrl: '', apiKey: '', dryRun: true, pausaMinS: 45, pausaMaxS: 90, topeDiario: 30,
  diasAntiDup: 30, horaInicio: 8, horaFin: 20, blocklist: ['51942853538', '51953876647'],
  autoActivo: false, autoHora: 8, autoDias: [1, 2, 3, 4, 5], autoPestanas: ['📨 TANDA 8 EX ALUMNOS'],
};
const NUM = ['pausaMinS', 'pausaMaxS', 'topeDiario', 'diasAntiDup', 'horaInicio', 'horaFin', 'autoHora'];
const dias = () => [...document.querySelectorAll('#autoDias input')];
const $ = (id) => document.getElementById(id);

async function cargar() {
  const { config } = await chrome.storage.local.get('config');
  const c = { ...DEFAULTS, ...(config || {}) };
  $('apiUrl').value = c.apiUrl;
  $('apiKey').value = c.apiKey;
  $('dryRun').checked = c.dryRun;
  for (const k of NUM) $(k).value = c[k];
  $('blocklist').value = c.blocklist.join('\n');
  $('autoActivo').checked = c.autoActivo;
  for (const d of dias()) d.checked = c.autoDias.includes(Number(d.value));
  $('autoPestanas').value = c.autoPestanas.join('\n');
}

$('guardar').addEventListener('click', async () => {
  const c = {
    apiUrl: $('apiUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    dryRun: $('dryRun').checked,
    blocklist: $('blocklist').value.split(/[\s,;]+/).map((s) => s.replace(/\D/g, '')).filter(Boolean),
    autoActivo: $('autoActivo').checked,
    autoDias: dias().filter((d) => d.checked).map((d) => Number(d.value)),
    autoPestanas: $('autoPestanas').value.split('\n').map((s) => s.trim()).filter(Boolean),
  };
  for (const k of NUM) c[k] = Number($(k).value) || DEFAULTS[k];
  if (c.pausaMaxS < c.pausaMinS) c.pausaMaxS = c.pausaMinS;
  await chrome.storage.local.set({ config: c });
  $('ok').textContent = 'Guardado ✓';
  setTimeout(() => { $('ok').textContent = ''; }, 2500);
});

cargar();

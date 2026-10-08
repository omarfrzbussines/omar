const $ = (id) => document.getElementById(id);

async function pintar() {
  const { config = {}, logs = [] } = await chrome.storage.local.get(['config', 'logs']);
  const enabled = config.enabled !== false;
  const dryRun = config.dryRun !== false;
  $('estado').textContent = enabled ? '● Activa' : '● Pausada';
  $('estado').className = 'badge ' + (enabled ? 'on' : 'off');
  $('modo').textContent = dryRun ? '🧪 Simulación (no envía)' : '📤 Envío real';
  $('modo').className = 'badge ' + (dryRun ? 'test' : 'on');

  const ul = $('logs');
  ul.innerHTML = '';
  for (const l of logs.slice(0, 40)) {
    const li = document.createElement('li');
    const t = new Date(l.at).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' });
    li.innerHTML = `<div class="t">${t}</div><div></div>`;
    li.lastChild.textContent = l.msg;
    if (l.detalle) {
      const d = document.createElement('details');
      d.innerHTML = '<summary>ver detalle</summary>';
      for (const [k, arr] of Object.entries(l.detalle)) {
        for (const x of arr) {
          const div = document.createElement('div');
          div.textContent = `${k}: ${x}`;
          d.appendChild(div);
        }
      }
      li.appendChild(d);
    }
    ul.appendChild(li);
  }
}

$('run').onclick = async () => {
  $('run').disabled = true;
  $('run').textContent = 'Corriendo…';
  await chrome.runtime.sendMessage({ type: 'runNow' });
  $('run').disabled = false;
  $('run').textContent = 'Ejecutar ahora';
  pintar();
};
// clic en la etiqueta de modo = cambiar entre simulación y envío real
$('modo').style.cursor = 'pointer';
$('modo').title = 'Clic para cambiar entre simulación y envío real';
$('modo').onclick = async () => {
  const { config = {} } = await chrome.storage.local.get('config');
  const dryRun = config.dryRun !== false;
  if (dryRun && !confirm('¿Pasar a ENVÍO REAL? Desde ahora los recordatorios se envían de verdad.')) return;
  await chrome.storage.local.set({ config: { ...config, dryRun: !dryRun } });
};
// reporte de texto con todas las corridas de hoy (hora Lima), para revisarlo con Claude
const diaLima = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
$('rep').onclick = async () => {
  const { logs = [], config = {}, sent = {} } = await chrome.storage.local.get(['logs', 'config', 'sent']);
  const hoy = diaLima(new Date().toISOString());
  const deHoy = logs.filter((l) => diaLima(l.at) === hoy).reverse();
  const lineas = [
    `REPORTE RURUSH FP · ${hoy} · v${chrome.runtime.getManifest().version}`,
    `modo: ${config.dryRun === false ? 'ENVÍO REAL' : 'SIMULACIÓN'} · activa: ${config.enabled !== false} · ventana ≤${config.sendWindowH || 4}h · corridas hoy: ${deHoy.length}`,
    `FP marcados como enviados (últimos 3 días): ${Object.keys(sent).length}`,
    '',
  ];
  for (const l of deHoy) {
    const t = new Date(l.at).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' });
    lineas.push(`[${t}] ${l.msg}`);
    for (const [k, arr] of Object.entries(l.detalle || {})) for (const x of arr) lineas.push(`    ${k}: ${x}`);
  }
  await navigator.clipboard.writeText(lineas.join('\n'));
  $('rep').textContent = '✓ Copiado';
  setTimeout(() => ($('rep').textContent = '📋 Copiar reporte de hoy'), 2000);
};
$('opts').onclick = () => chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener(pintar);
pintar();

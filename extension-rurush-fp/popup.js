const $ = (id) => document.getElementById(id);

let MODS = {};
const ETIQ = { real: ['📤 Envío real', 'real'], sim: ['🧪 Simulación', 'sim'], off: ['Apagado', 'apag'] };

async function pintar() {
  const { config = {}, logs = [] } = await chrome.storage.local.get(['config', 'logs']);
  const enabled = config.enabled !== false;
  $('estado').textContent = enabled ? '● Activa' : '● Pausada';
  $('estado').className = 'badge ' + (enabled ? 'on' : 'off');

  const tabla = $('mods');
  tabla.innerHTML = '';
  for (const [k, nombre] of Object.entries(MODS)) {
    const modo = (config.modos && config.modos[k]) || (k === 'm1' ? (config.dryRun === false ? 'real' : 'sim') : 'sim');
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td style="text-align:right"><span class="badge"></span></td>';
    tr.firstChild.textContent = nombre;
    const b = tr.querySelector('.badge');
    b.textContent = ETIQ[modo][0];
    b.className = 'badge ' + ETIQ[modo][1];
    tabla.appendChild(tr);
  }

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
  await chrome.runtime.sendMessage({ type: 'runNow', mod: $('modSel').value });
  $('run').disabled = false;
  $('run').textContent = 'Ejecutar ahora';
  pintar();
};
// reporte de texto con todas las corridas de hoy (hora Lima), para revisarlo con Claude
$('rep').onclick = async () => {
  const { texto } = await chrome.runtime.sendMessage({ type: 'report' });
  await navigator.clipboard.writeText(texto);
  $('rep').textContent = '✓ Copiado';
  setTimeout(() => ($('rep').textContent = '📋 Copiar reporte de hoy'), 2000);
};
$('opts').onclick = () => chrome.runtime.openOptionsPage();
// prueba: pone la etiqueta FREE PASS al chat que esté abierto en WhatsApp Web
$('etq').onclick = async () => {
  $('etq').disabled = true;
  $('etq').textContent = 'Etiquetando…';
  const r = await chrome.runtime.sendMessage({ type: 'probarEtiqueta' });
  let txt = r && r.ok ? (r.ya ? '✓ Ya tenía FREE PASS' : '✓ Etiquetado FREE PASS') : `⚠️ ${(r && r.error) || 'error'}`;
  if (r && r.diag) {
    try { await navigator.clipboard.writeText(`ETIQUETA FREE PASS · ${txt}\n${r.diag}`); txt += ' · 📋 diagnóstico copiado: pégaselo a Claude'; } catch (e) { /* sin portapapeles */ }
  }
  $('etq').textContent = txt;
  setTimeout(() => { $('etq').textContent = '🏷️ Probar etiqueta en el chat abierto'; $('etq').disabled = false; }, 12000);
};
chrome.runtime.sendMessage({ type: 'modulos' }, (m) => {
  MODS = m || {};
  for (const [k, nombre] of Object.entries(MODS)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = nombre;
    $('modSel').appendChild(o);
  }
  pintar();
});
chrome.storage.onChanged.addListener(pintar);

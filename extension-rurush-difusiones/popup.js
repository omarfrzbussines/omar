const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
let info = null;

function error(t) { $('msg').hidden = !t; $('msg').textContent = t || ''; }

const ESTADOS = {
  listo: 'Listo para iniciar', corriendo: '▶️ Enviando…', pausado: '⏸️ Pausado',
  terminado: '✅ Terminó', detenido: '⏹️ Detenido',
};

async function pintar() {
  const { run, logs = [], config = {} } = await chrome.storage.local.get(['run', 'logs', 'config']);
  $('sim').hidden = config.dryRun === false;
  if (run && run.items) {
    $('panel').hidden = false;
    const total = run.items.length;
    $('estado').textContent = `${ESTADOS[run.estado] || run.estado} · ${run.tab} · ${run.asesora}${run.simulacion ? ' (simulación)' : ''}`;
    $('motivo').textContent = run.estado === 'pausado' ? run.motivo : '';
    $('barra').style.width = total ? `${Math.round((run.idx / total) * 100)}%` : '0';
    $('prog').textContent = `${Math.min(run.idx, total)}/${total}`;
    $('cEnv').textContent = `✅ ${run.res.enviados}`;
    $('cSim').textContent = `🧪 ${run.res.simulados}`;
    $('cSal').textContent = `⏭️ ${run.res.saltados}`;
    $('cAle').textContent = `⚠️ ${run.res.alertas}`;
    $('excTit').textContent = `Apartados por el Sheet (${run.excluidos.length})`;
    $('excList').replaceChildren(...run.excluidos.map((x) => {
      const li = document.createElement('li');
      li.textContent = `Fila ${x.fila} · ${x.nombre || '—'}: ${x.motivo}`;
      return li;
    }));
    $('iniciar').disabled = run.estado === 'corriendo' || run.estado === 'terminado' || !total;
    $('iniciar').textContent = run.estado === 'pausado' ? '▶️ Reanudar' : '▶️ Iniciar';
    $('pausar').disabled = run.estado !== 'corriendo';
    $('detener').disabled = !['corriendo', 'pausado', 'listo'].includes(run.estado);
    $('cargar').disabled = run.estado === 'corriendo';
  } else {
    $('panel').hidden = true;
  }
  $('logs').replaceChildren(...logs.slice(0, 25).map((l) => {
    const d = document.createElement('div');
    d.className = l.level;
    const h = new Date(l.at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    d.textContent = `${h} ${l.msg}`;
    return d;
  }));
}

function lineaElegida() {
  const a = $('asesora').value;
  $('linea').textContent = (info && info.lineas[a]) || '—';
}

// Pinta pestañas y asesoras. Conserva lo que la asesora ya eligió.
async function pintarInfo(data) {
  info = data;
  $('dias').textContent = info.dias || '(falta DIAS_HOY)';
  const { run } = await chrome.storage.local.get('run');
  const tabAntes = $('tab').value || (run && run.tab);
  const asesoraAntes = $('asesora').value || (run && run.asesora);
  const tandas = info.pestanas;
  $('tab').replaceChildren(...tandas.map((t) => new Option(t, t)));
  $('tab').value = tandas.includes(tabAntes) ? tabAntes
    : ([...tandas].reverse().find((t) => /TANDA/i.test(t)) || tandas[0] || '');
  // solo asesoras con línea: sin línea (ej. DANNA) no se puede enviar
  const conLinea = Object.entries(info.lineas).filter(([, tel]) => tel).map(([n]) => n);
  $('asesora').replaceChildren(...conLinea.map((n) => new Option(n, n)));
  if (conLinea.includes(asesoraAntes)) $('asesora').value = asesoraAntes;
  lineaElegida();
}

// Muestra al instante lo último guardado y lo refresca desde el Sheet por detrás.
async function cargarInfo() {
  const { infoCache } = await chrome.storage.local.get('infoCache');
  if (infoCache) await pintarInfo(infoCache);
  else $('dias').textContent = 'Conectando con el Sheet…';
  const r = await send({ type: 'info' });
  if (!r || !r.ok) {
    if (!infoCache) error((r && r.error) || 'No responde la API del Sheet. Revisa Opciones.');
    return;
  }
  await chrome.storage.local.set({ infoCache: r.data });
  await pintarInfo(r.data);
}

$('asesora').addEventListener('change', lineaElegida);

$('cargar').addEventListener('click', async () => {
  error('');
  $('cargar').disabled = true;
  $('cargar').textContent = 'Cargando…';
  const r = await send({ type: 'cargar', tab: $('tab').value, asesora: $('asesora').value });
  $('cargar').textContent = 'Cargar pendientes';
  $('cargar').disabled = false;
  if (!r.ok) error(r.error);
  pintar();
});

for (const id of ['iniciar', 'pausar', 'detener']) {
  $(id).addEventListener('click', async () => {
    error('');
    const r = await send({ type: id });
    if (!r.ok) error(r.error);
    pintar();
  });
}

chrome.storage.onChanged.addListener(pintar);
cargarInfo();
pintar();

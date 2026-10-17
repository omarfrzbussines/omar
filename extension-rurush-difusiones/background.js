// Rurush Difusiones — envía una tanda del Sheet DIFUSIONES por WhatsApp Web.
// El Sheet (Apps Script Difusiones_API.gs) entrega los pendientes y recibe las marcas.
// La extensión abre cada chat, revisa que no se haya escrito antes, envía y marca.
//
// Controles anti-duplicado, en orden (basta uno para NO enviar):
//   1. lista de bloqueo de Opciones
//   2. registro local de esta PC (números enviados en los últimos N días)
//   3. el Sheet, consultado justo antes de cada envío (todas las pestañas de tanda)
//   4. el propio chat de WhatsApp: si hay un mensaje nuestro con «Rurush» en los últimos N días
//   5. al marcar, el servidor rechaza una fila que ya estaba enviada (candado)

const LIMA_OFFSET_H = -5;

const DEFAULTS = {
  apiUrl: '',
  apiKey: '',
  dryRun: true,              // simulación: hace todo menos apretar Enviar
  pausaMinS: 45,             // pausa al azar entre envíos reales
  pausaMaxS: 90,
  topeDiario: 30,            // máximo de envíos por línea por día
  diasAntiDup: 30,           // no repetir a quien recibió difusión en los últimos N días
  horaInicio: 8,             // solo envía entre estas horas (Lima)
  horaFin: 20,
  blocklist: ['51942853538', '51953876647'],
  // Modo automático: cada día hábil, a la hora indicada, detecta la línea abierta en
  // WhatsApp Web, busca a su asesora en ⚙️ CONFIG y envía sus pendientes.
  autoActivo: false,
  autoHora: 8,
  autoDias: [1, 2, 3, 4, 5, 6],  // 0 = domingo … 6 = sábado
  autoPestanas: ['📨 TANDA * @8', '🏃 INASISTENCIAS @10'],
  // Revisión de respuestas: 2 h después del último envío del día y cada mañana,
  // sobre lo enviado en los últimos 3 días que sigue «ENVIADO SIN RESPUESTA».
  revisarActivo: true,
  // Esperar si alguien está usando WhatsApp Web en esta PC. Apagado: las asesoras usan la
  // misma línea todo el día, así que la extensión envía igual.
  esperarSiUsan: false,
  revisarHorasDespues: 2,
  revisarDias: 3,
};

// ───────────────────────── utilidades ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getConfig() {
  const { config } = await chrome.storage.local.get('config');
  return { ...DEFAULTS, ...(config || {}) };
}

function limaNow() {
  const d = new Date(Date.now() + LIMA_OFFSET_H * 3600e3);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), min: d.getUTCMinutes(), dow: d.getUTCDay() };
}

function normPhone(raw) {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.length === 9 && p.startsWith('9')) p = '51' + p;
  return /^519\d{8}$/.test(p) ? p : null;
}

// Para comparar el borrador con el mensaje: solo letras y números, sin tildes ni emojis.
function normTexto(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ]/g, '');
}

function diasEntre(isoA, isoB) {
  return Math.abs(Date.parse(isoA) - Date.parse(isoB)) / 86400e3;
}

// ¿El chat ya tiene un mensaje nuestro de Rurush en los últimos `dias` días?
function yaEscritoEnChat(messages, hoy, dias) {
  for (const m of messages || []) {
    if (!m.out || !/rurush/i.test(m.text)) continue;
    const fechas = [m.date, m.dateAlt].filter(Boolean);
    if (!fechas.length) return { si: true, fecha: 'fecha desconocida' };
    for (const f of fechas) {
      if (!Number.isNaN(Date.parse(f)) && diasEntre(f, hoy) <= dias) return { si: true, fecha: f };
    }
  }
  return { si: false };
}

async function log(level, msg) {
  const { logs = [] } = await chrome.storage.local.get('logs');
  logs.unshift({ at: new Date().toISOString(), level, msg });
  await chrome.storage.local.set({ logs: logs.slice(0, 300) });
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title, message });
}

// ───────────────────────── API del Sheet ─────────────────────────
async function api(params) {
  const cfg = await getConfig();
  if (!cfg.apiUrl || !cfg.apiKey) throw new Error('Falta la URL o la clave de la API (Opciones).');
  const url = new URL(cfg.apiUrl);
  url.searchParams.set('key', cfg.apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`API del Sheet → HTTP ${r.status}`);
  let data;
  try { data = await r.json(); } catch { throw new Error('La API del Sheet no respondió JSON (¿la URL es la de la app web?).'); }
  if (!data.ok && !data.dup) throw new Error(data.error || 'Error de la API del Sheet');
  return data;
}

// ───────────────────────── WhatsApp Web ─────────────────────────
async function waTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (tabs.length) return tabs[0];
  return chrome.tabs.create({ url: 'https://web.whatsapp.com/', active: false, pinned: true });
}

// Si la pestaña está congelada o recargando, Chrome puede no contestar nunca: se corta a los 20 s.
async function ask(tabId, msg, ms = 20000) {
  try {
    return await Promise.race([chrome.tabs.sendMessage(tabId, msg), sleep(ms).then(() => null)]);
  } catch { return null; }
}

async function waitFor(tabId, msg, ok, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await ask(tabId, msg);
    if (r && ok(r)) return r;
    await sleep(1500);
  }
  return null;
}

async function openChat(tabId, phone, text) {
  const url = new URL('https://web.whatsapp.com/send');
  url.searchParams.set('phone', phone);
  if (text) url.searchParams.set('text', text);
  await chrome.tabs.update(tabId, { url: url.toString() });
  await sleep(4000);
  return waitFor(tabId, { type: 'chatState' }, (r) => r.invalid || (r.ready && (!text || r.draft.trim())));
}

// ───────────────────────── estado de la corrida ─────────────────────────
// run = { estado: 'listo'|'corriendo'|'pausado'|'terminado'|'detenido', motivo,
//         tab, asesora, linea, items:[{fila,nombre,celular,mensaje}], excluidos, idx,
//         res: {enviados, simulados, saltados, alertas}, simulacion }
async function getRun() {
  const { run } = await chrome.storage.local.get('run');
  return run || null;
}
async function setRun(run) { await chrome.storage.local.set({ run }); }

async function contador(linea, delta = 0) {
  const key = `${limaNow().date}|${linea}`;
  const { contadores = {} } = await chrome.storage.local.get('contadores');
  contadores[key] = (contadores[key] || 0) + delta;
  // conservar solo los últimos 7 días
  for (const k of Object.keys(contadores)) if (diasEntre(k.split('|')[0], limaNow().date) > 7) delete contadores[k];
  await chrome.storage.local.set({ contadores });
  return contadores[key];
}

async function registrarEnvio(phone, linea, tab) {
  const { enviados = {} } = await chrome.storage.local.get('enviados');
  enviados[phone] = { fecha: limaNow().date, linea, tab };
  const limite = 120; // días que se guarda el registro local
  for (const [k, v] of Object.entries(enviados)) if (diasEntre(v.fecha, limaNow().date) > limite) delete enviados[k];
  await chrome.storage.local.set({ enviados });
}

// Marcas que no llegaron al Sheet (sin internet, hoja ocupada…): se reintentan.
async function marcar(params) {
  try {
    await api({ a: 'marcar', ...params });
    return true;
  } catch (e) {
    const { porMarcar = [] } = await chrome.storage.local.get('porMarcar');
    porMarcar.push(params);
    await chrome.storage.local.set({ porMarcar });
    await log('warn', `No se pudo marcar la fila ${params.fila} en el Sheet (${e.message}). Se reintentará.`);
    return false;
  }
}

async function reintentarMarcas() {
  const { porMarcar = [] } = await chrome.storage.local.get('porMarcar');
  if (!porMarcar.length) return;
  const quedan = [];
  for (const p of porMarcar) {
    try { await api({ a: 'marcar', ...p }); } catch { quedan.push(p); }
  }
  await chrome.storage.local.set({ porMarcar: quedan });
  if (quedan.length < porMarcar.length) await log('ok', `Se marcaron ${porMarcar.length - quedan.length} filas pendientes en el Sheet.`);
}

// ───────────────────────── acciones del popup ─────────────────────────
async function cargar(tab, asesora) {
  const cfg = await getConfig();
  const data = await api({ a: 'pendientes', tab, asesora, dias: cfg.diasAntiDup });
  const run = {
    estado: 'listo', motivo: '', tab, asesora, linea: data.linea, dias: data.dias,
    items: data.items, excluidos: data.excluidos, idx: 0, cargadoEl: limaNow().date,
    // días sin repetir: los manda la API (en 🏃 INASISTENCIAS son 4, en las difusiones los de Opciones)
    diasAntiDup: data.diasAntiDup || cfg.diasAntiDup,
    res: { enviados: 0, simulados: 0, saltados: 0, alertas: 0 },
    simulacion: cfg.dryRun,
    conImagen: !!data.imagen,
  };
  // La imagen se baja una vez por carga y se guarda aparte (no viaja en cada guardado de la corrida).
  if (run.conImagen) {
    const img = await api({ a: 'imagen', tab });
    await chrome.storage.local.set({ imagen: { tab, mime: img.mime, nombre: img.nombre, b64: img.b64 } });
  }
  await setRun(run);
  await log('info', `${tab} · ${asesora}: ${data.items.length} para enviar, ${data.excluidos.length} apartados${run.conImagen ? ' · con imagen 🖼' : ''}.`);
  return run;
}

async function iniciar() {
  const run = await getRun();
  if (!run || !run.items) throw new Error('Primero carga los pendientes.');
  run.estado = 'corriendo';
  run.motivo = '';
  run.simulacion = (await getConfig()).dryRun;
  await setRun(run);
  // la asesora acaba de usar WhatsApp para preparar el envío: no esperar por eso
  await chrome.storage.local.set({ waActivity: 0 });
  await log('info', `▶️ Inicio ${run.simulacion ? '(SIMULACIÓN) ' : ''}${run.tab} · ${run.asesora}`);
  procesar();
}

// Turno compartido con Rurush FP (misma pestaña de WhatsApp Web, ver turnoWA en content.js):
// mientras Difusiones envía lo renueva en cada contacto; si FP lo tiene, Difusiones espera.
const QUIEN_TURNO = 'Rurush Difusiones';
async function turno(tabId, accion, ms) {
  return ask(tabId, { type: 'turno', accion, quien: QUIEN_TURNO, ms });
}
async function soltarTurno() {
  try { const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }); for (const t of tabs) await turno(t.id, 'soltar'); } catch (e) {}
}

async function pausar(motivo) {
  await soltarTurno();
  const run = await getRun();
  if (!run) return;
  run.estado = 'pausado';
  run.motivo = motivo || 'Pausado por la asesora';
  await setRun(run);
  await chrome.alarms.clear('next');
  await log('info', `⏸️ ${run.motivo}`);
}

async function detener() {
  const run = await getRun();
  if (!run) return;
  run.estado = 'detenido';
  run.motivo = 'Detenido';
  await setRun(run);
  await chrome.alarms.clear('next');
  await log('info', '⏹️ Detenido');
}

// ───────────────────────── envío ─────────────────────────
let procesando = false;

// Si WhatsApp no deja escribir en 3 chats seguidos (p. ej. limitó las conversaciones nuevas),
// no tiene sentido seguir recorriendo la lista: se pausa la línea hasta el día siguiente.
const FALLAS_PARA_PAUSAR = 3;
// Ventana de WhatsApp: «Iniciaste 300 de 300 chats nuevos este mes … No puedes iniciar más chats
// nuevos hasta el 31 de octubre de 2026». Los chats que ya existen sí se pueden seguir usando.
const LIMITE_RX = /chats? nuevos? (este mes|hasta)|iniciar m[aá]s chats nuevos|new chats (this month|until)/i;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLimite(aviso) {
  const m = /hasta el (\d{1,2}) de ([a-záéíóú]+)(?: de (\d{4}))?/i.exec(aviso || '');
  const mes = m ? MESES.indexOf(m[2].toLowerCase()) : -1;
  if (mes < 0) return null;
  const y = Number(m[3]) || Number(limaNow().date.slice(0, 4));
  return `${y}-${String(mes + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}
async function limiteDeLinea(linea) {
  const { limites = {} } = await chrome.storage.local.get('limites');
  const h = limites[linea];
  return h && h >= limaNow().date ? h : null; // fecha (aaaa-mm-dd) hasta la que no puede abrir chats nuevos
}
// Pestañas a socios (🏃 INASISTENCIAS, 📣 SOCIOS ACTIVOS): son chats que ya existen, así que
// no cuentan para el tope diario y siguen saliendo aunque la línea llegue al límite de chats nuevos.
const esInasist = (tab) => /INASIST|SOCIOS/i.test(tab || '');

// Lista de pestañas del modo automático. Una línea que termina en * toma TODAS las pestañas
// del Sheet que empiezan así, en el orden en que están en el Sheet. Ej.: «📨 TANDA *» incluye
// sola cada tanda nueva que se cree, sin tocar las Opciones.
function expandirCola(lista, pestanas) {
  const out = [];
  for (const e of lista || []) {
    const t = String(e).trim();
    if (!t) continue;
    if (t.endsWith('*')) {
      const pre = t.slice(0, -1).trim().toLowerCase();
      for (const p of pestanas || []) if (p.toLowerCase().startsWith(pre) && !out.includes(p)) out.push(p);
    } else if (!out.includes(t)) out.push(t);
  }
  return out;
}
// «🏃 INASISTENCIAS @10» → esa pestaña arranca a las 10; sin @hora usa la hora de arranque general.
function parseEntrada(e, horaDef) {
  const t = String(e || '').trim();
  const m = /^(.*?)\s*@\s*(\d{1,2})(?::\d{2})?\s*$/.exec(t);
  return m ? { nombre: m[1].trim(), hora: Number(m[2]) } : { nombre: t, hora: horaDef };
}
// Devuelve [{ tab, hora, clave }] en orden; «clave» identifica la línea de Opciones de la que salió.
async function colaAuto(cfg, info) {
  const entradas = (cfg.autoPestanas || []).map((e) => parseEntrada(e, cfg.autoHora)).filter((x) => x.nombre);
  let pestanas = null;
  if (entradas.some((x) => x.nombre.endsWith('*'))) {
    try { pestanas = (info || (await api({ a: 'info' }))).pestanas; } catch { pestanas = []; }
  }
  const out = [];
  for (const x of entradas) {
    const clave = `${x.nombre}@${x.hora}`;
    for (const tab of x.nombre.endsWith('*') ? expandirCola([x.nombre], pestanas) : [x.nombre]) {
      if (!out.some((o) => o.tab === tab)) out.push({ tab, hora: x.hora, clave });
    }
  }
  return out;
}

async function topeDeChatsNuevos(run, tabId, aviso) {
  await ask(tabId, { type: 'cerrarAviso' });
  const hasta = fechaLimite(aviso) || limaNow().date;
  const { limites = {} } = await chrome.storage.local.get('limites');
  limites[run.linea] = hasta;
  await chrome.storage.local.set({ limites });
  run.res.saltados += 1;
  if (esInasist(run.tab)) {
    // a los socios se les sigue escribiendo: los que ya tienen chat sí salen
    await siguiente(run, { level: 'warn', msg: `⏭️ fila ${run.items[run.idx].fila}: sería un chat nuevo y la línea llegó al límite mensual de WhatsApp (hasta ${hasta}). Queda pendiente.` });
    return true;
  }
  const motivo = `WhatsApp: la línea de ${run.asesora} llegó al límite de chats nuevos del mes (no puede abrir más hasta el ${hasta}). `
    + 'Hasta esa fecha esta línea solo escribe a socios (🏃 INASISTENCIAS, 📣 SOCIOS); las tandas quedan pendientes.';
  await pausar(motivo);
  notify('Rurush Difusiones', `⛔ ${motivo}`);
  return false;
}

async function falloDeCarga(run, msg, aviso) {
  run.res.alertas += 1;
  run.fallasSeguidas = (run.fallasSeguidas || 0) + 1;
  await siguiente(run, { level: 'warn', msg: msg + (aviso ? ` WhatsApp dice: «${aviso}»` : '') });
  if (run.fallasSeguidas >= FALLAS_PARA_PAUSAR) {
    run.idx -= FALLAS_PARA_PAUSAR; // esos contactos no se tocaron: quedan para la próxima vez
    if (run.idx < 0) run.idx = 0;
    await setRun(run);
    const motivo = `WhatsApp no deja escribir en ${FALLAS_PARA_PAUSAR} chats seguidos`
      + (aviso ? ` («${aviso.slice(0, 120)}»)` : '') + '. Parece el límite de conversaciones nuevas: pausé esta línea por hoy.';
    await pausar(motivo);
    notify('Rurush Difusiones', `⛔ ${run.asesora}: ${motivo}`);
  }
  return true;
}

async function siguiente(run, nota) {
  run.idx += 1;
  await setRun(run);
  if (nota) await log(nota.level, nota.msg);
}

async function programar(segundos) {
  await chrome.alarms.create('next', { when: Date.now() + segundos * 1000 });
}

async function procesar() {
  if (procesando) return;
  procesando = true;
  try {
    await reintentarMarcas();
    // Hasta 25 contactos por despertar: los saltados no esperan pausa larga;
    // tras un envío real se agenda el siguiente con una pausa al azar.
    // Chrome corta al service worker si un evento dura más de 5 min: se trabaja como mucho 3 min
    // por despertar y se agenda el resto con una alarma.
    let seguir = false;
    const inicio = Date.now();
    for (let vuelta = 0; vuelta < 25 && Date.now() - inicio < 180000; vuelta++) {
      seguir = await unPaso();
      if (!seguir) break;
      await sleep(2000 + Math.random() * 2000);
    }
    // quedan contactos y no se agendó nada: seguir en 30 s
    if (seguir) await programar(30);
  } catch (e) {
    await pausar(`Error: ${e.message || e}`);
    notify('Rurush Difusiones', `Pausado: ${e.message || e}`);
  } finally {
    procesando = false;
  }
}

// Devuelve true si se puede seguir con el próximo contacto sin pausa larga.
async function unPaso() {
  const cfg = await getConfig();
  const run = await getRun();
  if (!run || run.estado !== 'corriendo') return false;
  if (revisando) { await programar(60); return false; } // termina de revisar respuestas y sigue

  if (run.idx >= run.items.length) {
    run.estado = 'terminado';
    await setRun(run);
    await soltarTurno();
    const r = run.res;
    const linea = `✅ ${r.enviados} enviados · 🧪 ${r.simulados} simulados · ⏭️ ${r.saltados} saltados · ⚠️ ${r.alertas} alertas`;
    await log('ok', `Terminó ${run.tab} · ${run.asesora}: ${linea}`);
    notify('Rurush Difusiones — terminó', linea);
    // Modo automático: si queda cupo hoy, sigue con la próxima pestaña de la lista.
    if (run.auto && (await siguientePestanaAuto(run))) return false;
    const tab = await waTab();
    await chrome.tabs.update(tab.id, { url: 'https://web.whatsapp.com/' });
    return false;
  }

  const now = limaNow();
  if (now.hour < cfg.horaInicio || now.hour >= cfg.horaFin) {
    await pausar(`Fuera de horario (${cfg.horaInicio}:00–${cfg.horaFin}:00). Reanuda mañana.`);
    notify('Rurush Difusiones', 'Pausado: fuera de horario de envío.');
    return false;
  }
  if (!run.simulacion && !esInasist(run.tab) && (await contador(run.linea)) >= cfg.topeDiario) {
    await pausar(`Tope diario alcanzado (${cfg.topeDiario} envíos en la línea ${run.linea}). Reanuda mañana.`);
    notify('Rurush Difusiones', 'Pausado: se llegó al tope diario.');
    return false;
  }
  // Los mensajes traen la frase de días ({DIAS}) del día en que se cargaron. Si la corrida
  // sigue otro día (se reanudó al día siguiente), se recargan para no ofrecer días vencidos.
  if (run.cargadoEl !== now.date) {
    const nuevo = await cargar(run.tab, run.asesora);
    Object.assign(nuevo, { estado: 'corriendo', res: run.res, auto: run.auto, dia: now.date, diagHecho: run.diagHecho });
    await setRun(nuevo);
    await log('info', `📅 Nuevo día: recargué los mensajes con la frase de hoy («${nuevo.dias}»).`);
    return true;
  }
  const { waActivity = 0 } = await chrome.storage.local.get('waActivity');
  if (cfg.esperarSiUsan && Date.now() - waActivity < 60e3) {
    await log('info', 'Alguien está usando WhatsApp Web: espero 1 min.');
    await programar(60);
    return false;
  }

  const it = run.items[run.idx];
  const tel = normPhone(it.celular);
  const etiqueta = `${it.nombre || tel} (fila ${it.fila})`;
  const saltar = async (motivo, marca) => {
    run.res.saltados += 1;
    if (marca) await marcar({ tab: run.tab, fila: it.fila, celular: tel, estado: marca, nota: motivo });
    await siguiente(run, { level: 'info', msg: `⏭️ ${etiqueta}: ${motivo}` });
    return true;
  };

  // 1. bloqueados de Opciones
  if (!tel) return saltar('celular inválido');
  if (cfg.blocklist.map((b) => normPhone(b) || String(b).replace(/\D/g, '')).includes(tel)) return saltar('en la lista de bloqueo');

  // 2. registro local de esta PC
  const { enviados = {} } = await chrome.storage.local.get('enviados');
  const previo = enviados[tel];
  const dup = run.diasAntiDup || cfg.diasAntiDup;
  if (previo && diasEntre(previo.fecha, now.date) < dup) {
    return saltar(`esta PC ya le envió el ${previo.fecha} (${previo.tab})`, run.simulacion ? null : 'YA_CONTACTADO');
  }

  // 3. el Sheet, ahora mismo (por si otra PC envió mientras tanto)
  const g = await api({ a: 'yaEnviado', celular: tel, dias: dup, tab: run.tab });
  if (g.bloqueado) return saltar('NO CONTACTAR en el Sheet');
  if (g.enviado) return saltar(`ya recibió difusión el ${g.fecha} (${g.pestana})`, run.simulacion ? null : 'YA_CONTACTADO');

  // WhatsApp Web listo y en la línea correcta
  const tab = await waTab();
  const status = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn, 90000);
  if (!status) throw new Error('WhatsApp Web no cargó o no tiene sesión iniciada.');
  if (!status.wid || status.wid !== run.linea) {
    throw new Error(`WhatsApp Web está en ${status.wid || 'un número desconocido'} y esta tanda es de ${run.asesora} (${run.linea}). Cambia de sesión y reanuda.`);
  }
  const t = await turno(tab.id, 'tomar', ((cfg.pausaMaxS || 90) + 180) * 1000);
  if (t && t.ok === false) {
    await log('info', `⏳ WhatsApp Web ocupado: ${t.quien} está enviando. Espero 1 min.`);
    await programar(60);
    return false;
  }

  // 4. el chat: ¿ya le escribimos? Se abre UNA sola vez, ya con el mensaje cargado
  //    (en simulación, sin mensaje), para no recargar WhatsApp Web dos veces por contacto.
  const chat = await openChat(tab.id, tel, run.simulacion ? null : it.mensaje);
  if (!chat) {
    const st = await ask(tab.id, { type: 'chatState' });
    if (st && LIMITE_RX.test(st.aviso || '')) return topeDeChatsNuevos(run, tab.id, st.aviso);
    return falloDeCarga(run, `⚠️ ${etiqueta}: el chat no abrió o no cargó el mensaje, lo salto (sin marcar).`, st && st.aviso);
  }
  if (chat.invalid) {
    run.res.saltados += 1;
    if (!run.simulacion) await marcar({ tab: run.tab, fila: it.fila, celular: tel, estado: 'SIN_WHATSAPP' });
    await siguiente(run, { level: 'info', msg: `⏭️ ${etiqueta}: no tiene WhatsApp` });
    return true;
  }
  // los mensajes viejos a veces cargan un instante después que el cuadro de texto
  await sleep(1500);
  const estadoChat = (await ask(tab.id, { type: 'chatState' })) || chat;
  if (!run.diagHecho) {
    run.diagHecho = true;
    const d = await ask(tab.id, { type: 'diag' });
    if (d) await log('info', `🔎 Chat leído: ${d.pre} con fecha · ${d.idTrue} propios por id · ${d.out} por clase · ${d.textos} textos · ${d.filas} filas · ${d.iconos} íconos.`);
  }
  const escrito = yaEscritoEnChat(estadoChat.messages, now.date, dup);
  if (escrito.si) {
    if (!run.simulacion) await ask(tab.id, { type: 'clearDraft' });
    return saltar(`el chat ya tiene un mensaje de Rurush (${escrito.fecha})`, run.simulacion ? null : 'YA_CONTACTADO');
  }

  if (run.simulacion) {
    run.res.simulados += 1;
    await siguiente(run, { level: 'info', msg: `🧪 ${etiqueta} → ${it.mensaje.replace(/\n+/g, ' ').slice(0, 140)}…` });
    return true;
  }

  // Envío real: comprobar que el borrador es exactamente el mensaje
  const draft = estadoChat;
  if (!draft || !String(draft.draft || '').trim()) {
    if (draft && LIMITE_RX.test(draft.aviso || '')) return topeDeChatsNuevos(run, tab.id, draft.aviso);
    return falloDeCarga(run, `⚠️ ${etiqueta}: no se pudo cargar el mensaje (sin marcar).`, draft && draft.aviso);
  }
  if (normTexto(draft.draft) !== normTexto(it.mensaje)) {
    await ask(tab.id, { type: 'clearDraft' });
    run.res.alertas += 1;
    await siguiente(run, { level: 'warn', msg: `⚠️ ${etiqueta}: el borrador no coincide con el mensaje del Sheet, no envié.` });
    return true;
  }

  const inicio = normTexto(it.mensaje).slice(0, 30);
  const antes = await ask(tab.id, { type: 'lastOutgoing' });
  let r;
  if (run.conImagen) {
    // imagen con el mensaje como comentario: un solo envío
    const { imagen } = await chrome.storage.local.get('imagen');
    if (!imagen || imagen.tab !== run.tab) throw new Error('No tengo la imagen de esta pestaña. Vuelve a «Cargar pendientes».');
    r = await ask(tab.id, { type: 'enviarImagen', b64: imagen.b64, mime: imagen.mime, nombre: imagen.nombre, texto: it.mensaje }, 60000);
    if (!r || !r.ok) throw new Error(`no envié a ${etiqueta}: ${(r && r.error) || 'sin respuesta de WhatsApp Web'}. Revisa el chat y reanuda.`);
  } else {
    r = await ask(tab.id, { type: 'send' });
    if (!r || !r.ok) throw new Error(`falló el clic en Enviar con ${etiqueta} (${(r && r.error) || 'sin respuesta'})`);
  }

  // Confirmar la burbuja: se busca por su texto. Si tiene reloj se espera hasta 1 minuto;
  // si no se puede leer, no se espera de más (el cuadro ya quedó vacío: salió).
  const totalAntes = (antes && antes.total) || 0;
  const confirmada = (b) => b && b.estado === 'ok'
    && (b.porTexto || normTexto(b.text).startsWith(inicio) || (b.total || 0) > totalAntes);
  let burbuja = null, ultima = null, sinLeer = 0;
  const fin = Date.now() + 60000;
  while (Date.now() < fin) {
    ultima = await ask(tab.id, { type: 'lastOutgoing', inicio });
    if (confirmada(ultima)) { burbuja = ultima; break; }
    if (!ultima || !ultima.porTexto) { sinLeer += 1; if (sinLeer >= 4) break; }
    await sleep(1500);
  }

  // Cuenta como enviado aunque quede con reloj: WhatsApp lo manda al reconectar.
  await registrarEnvio(tel, run.linea, run.tab);
  if (!esInasist(run.tab)) await contador(run.linea, 1); // el tope es solo para difusiones
  await chrome.storage.local.set({ ultimoEnvio: Date.now() });
  run.res.enviados += 1;
  run.fallasSeguidas = 0;
  await marcar({ tab: run.tab, fila: it.fila, celular: tel, estado: 'ENVIADO' });
  await siguiente(run, { level: 'ok', msg: `✅ ${etiqueta}` });

  if (!burbuja) {
    const estado = ultima && ultima.porTexto && ultima.estado;
    if (estado === 'error' || estado === 'pendiente') {
      await pausar(estado === 'error'
        ? `WhatsApp marcó error al enviar a ${etiqueta}. Revisa el chat y reanuda.`
        : `El mensaje a ${etiqueta} sigue con reloj después de 1 minuto (¿sin internet?). Revisa el chat y reanuda.`);
      notify('Rurush Difusiones', 'Pausado: revisa el último envío.');
      return false;
    }
    // El cuadro quedó vacío (se envió) pero no pude leer la burbuja: sigo, sin pausar.
    await log('warn', `ℹ️ ${etiqueta}: enviado, pero no pude leer la burbuja para confirmarlo.`);
  }

  const pausa = cfg.pausaMinS + Math.random() * Math.max(0, cfg.pausaMaxS - cfg.pausaMinS);
  await programar(Math.round(pausa));
  return false;
}

// ───────────────────────── revisión de respuestas ─────────────────────────
// Abre cada chat enviado (que sigue «ENVIADO SIN RESPUESTA») y, si el contacto escribió
// después de nuestro mensaje, lo marca «RESPONDIO - POR CONTESTAR» y lo anota en 💬 RESPUESTAS.
let revisando = false;

async function lineaAbierta() {
  const tab = await waTab();
  const status = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn && r.wid, 90000);
  if (!status) throw new Error('WhatsApp Web no tiene sesión abierta.');
  const info = await api({ a: 'info' });
  const asesora = (Object.entries(info.lineas).find(([, tel]) => normPhone(tel) === status.wid) || [])[0];
  if (!asesora) throw new Error(`la línea ${status.wid} no está en ⚙️ CONFIG (LINEAS).`);
  return { tab, wid: status.wid, asesora };
}

async function revisarRespuestas(motivo) {
  if (revisando || procesando) throw new Error('Ya hay una revisión o un envío en curso.');
  const run = await getRun();
  if (run && run.estado === 'corriendo') throw new Error('Se está enviando: revisa al terminar o pausa primero.');
  revisando = true;
  const res = { revisados: 0, respondieron: [], sinHallar: 0, noHallados: [], at: Date.now() };
  try {
    const cfg = await getConfig();
    const { tab, asesora } = await lineaAbierta();
    const t = await turno(tab.id, 'tomar', 4 * 60e3);
    if (t && t.ok === false) { const e = new Error(`WhatsApp Web ocupado: ${t.quien} está enviando. Reviso en 10 min.`); e.ocupado = true; throw e; }
    const { items } = await api({ a: 'porRevisar', asesora, dias: cfg.revisarDias });
    await log('info', `💬 Revisando respuestas (${motivo}): ${items.length} chats de ${asesora}.`);
    for (const it of items) {
      const tel = normPhone(it.celular);
      const inicio = normTexto(it.inicio).slice(0, 30);
      if (!tel || inicio.length < 10) continue;
      await turno(tab.id, 'tomar', 4 * 60e3);
      const chat = await openChat(tab.id, tel);
      if (!chat || chat.invalid) continue;
      await sleep(1500);
      let r = await ask(tab.id, { type: 'respuestas', inicio });
      // El chat recién abierto tarda en pintar los mensajes: se reintenta hasta ~12 s.
      for (let intento = 0; intento < 5 && (!r || !r.nuestro); intento++) {
        await sleep(2500);
        r = await ask(tab.id, { type: 'respuestas', inicio });
      }
      res.revisados += 1;
      if (res.revisados === 1) {
        const d = await ask(tab.id, { type: 'diag' });
        if (d) await log('info', `🔎 Revisión, primer chat: ${d.pre} con fecha · ${d.idTrue} propios por id · ${d.textos} textos · ${d.filas} filas · ${d.iconos} íconos · método ${(r && r.metodo) || '—'}.`);
      }
      if (!r || !r.nuestro) { res.sinHallar += 1; res.noHallados.push(it.nombre || tel); continue; }
      if (r.respuestas.length) {
        const texto = r.respuestas.join(' / ');
        const m = await api({ a: 'respuesta', tab: it.tab, fila: it.fila, celular: tel, texto }).catch((e) => ({ error: e.message }));
        if (m && m.ok) {
          res.respondieron.push(it.nombre || tel);
          await log('ok', `💬 ${it.nombre || tel} respondió: «${texto.slice(0, 80)}»`);
        }
      }
      await sleep(1500 + Math.random() * 1500);
    }
    const resumen = `💬 ${res.respondieron.length} respondieron de ${res.revisados} revisados`
      + (res.respondieron.length ? `: ${res.respondieron.slice(0, 8).join(', ')}` : '')
      + (res.sinHallar ? ` · ${res.sinHallar} sin encontrar nuestro mensaje` : '');
    await log('ok', resumen);
    if (res.noHallados.length) await log('info', `💬 Sin encontrar nuestro mensaje (revísalos a mano si quieres): ${res.noHallados.join(', ')}`);
    if (res.respondieron.length) notify('Rurush Difusiones', resumen);
    await chrome.storage.local.set({ ultimaRevision: res });
    await chrome.tabs.update(tab.id, { url: 'https://web.whatsapp.com/' });
    return res;
  } finally {
    revisando = false;
    await soltarTurno();
  }
}

// Cuándo revisar: 2 h después del último envío (una vez), y cada mañana antes de enviar.
async function revisionPendiente(cfg, now) {
  if (!cfg.revisarActivo) return null;
  const { ultimoEnvio = 0, revisadoHasta = 0, revisionDia } = await chrome.storage.local.get(['ultimoEnvio', 'revisadoHasta', 'revisionDia']);
  if (!ultimoEnvio || Date.now() - ultimoEnvio > (cfg.revisarDias + 1) * 86400e3) return null; // nada reciente
  if (ultimoEnvio > revisadoHasta && Date.now() - ultimoEnvio >= cfg.revisarHorasDespues * 3600e3) return 'después de los envíos';
  if (revisionDia !== now.date && now.hour >= cfg.autoHora) return 'de la mañana';
  return null;
}

async function hacerRevision(motivo, now) {
  try {
    await revisarRespuestas(motivo);
  } catch (e) {
    await log(e.ocupado ? 'info' : 'warn', `💬 No pude revisar respuestas: ${e.message || e}`);
    if (e.ocupado) return;   // Rurush FP está enviando: se revisa en la próxima vuelta (10 min)
  }
  await chrome.storage.local.set({ revisadoHasta: Date.now(), revisionDia: now.date });
}

// ───────────────────────── modo automático ─────────────────────────
// Se revisa cada 10 minutos. Arranca una vez por día (o al prender la PC, si fue más tarde),
// solo en los días y horas configurados, y nunca encima de una corrida en curso.
let revisandoAuto = false;

async function autoCheck() {
  if (revisandoAuto || procesando) return;
  revisandoAuto = true;
  try {
    const cfg = await getConfig();
    const now = limaNow();
    const run = await getRun();
    if (run && run.estado === 'corriendo') {
      // Vigilante: si la corrida quedó «Enviando…» sin alarma agendada (Chrome cerró el proceso
      // a mitad de camino), se retoma sola en vez de quedarse congelada.
      if (!procesando && !(await chrome.alarms.get('next'))) {
        await log('info', '🔁 La corrida se había quedado quieta: la retomo.');
        await programar(5);
      }
      return;
    }

    // Revisión de respuestas (funciona aunque el envío automático esté apagado)
    if (now.hour >= 7 && now.hour < 22) {
      const motivo = await revisionPendiente(cfg, now);
      if (motivo) await hacerRevision(motivo, now);
    }

    if (!cfg.autoActivo) return;
    if (!cfg.autoDias.includes(now.dow) || now.hour >= cfg.horaFin) return;
    // Turnos del día: cada línea de Opciones arranca a su hora (una vez por día).
    let { autoHechas } = await chrome.storage.local.get('autoHechas');
    if (!autoHechas || autoHechas.date !== now.date) autoHechas = { date: now.date, claves: [] };
    const turnos = [...new Set((cfg.autoPestanas || []).map((e) => parseEntrada(e, cfg.autoHora))
      .filter((x) => x.nombre && now.hour >= x.hora).map((x) => `${x.nombre}@${x.hora}`))]
      .filter((k) => !autoHechas.claves.includes(k));
    if (!turnos.length) {
      // Nada nuevo a esta hora: solo se retoma la corrida automática que cortó un reinicio de Chrome.
      if (run && run.auto && run.dia === now.date && run.estado === 'pausado' && /reinici/i.test(run.motivo)) await iniciar();
      return;
    }

    // ¿Qué línea está abierta en WhatsApp Web?
    const tab = await waTab();
    const status = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn && r.wid, 90000);
    if (!status) {
      await log('warn', '🤖 Automático: WhatsApp Web no tiene sesión abierta. Reintento en 10 min.');
      return;
    }
    const info = await api({ a: 'info' });
    const asesora = (Object.entries(info.lineas).find(([, tel]) => normPhone(tel) === status.wid) || [])[0];
    autoHechas.claves.push(...turnos);
    await chrome.storage.local.set({ autoDia: now.date, autoHechas });
    if (!asesora) {
      await log('warn', `🤖 Automático: la línea ${status.wid} no está en ⚙️ CONFIG (LINEAS). No envío nada hoy.`);
      notify('Rurush Difusiones', `La línea ${status.wid} no está en ⚙️ CONFIG. Hoy no se envía.`);
      return;
    }
    const enTope = !cfg.dryRun && (await contador(status.wid)) >= cfg.topeDiario;
    const limitada = await limiteDeLinea(status.wid);
    if (limitada) await log('info', `🤖 ${asesora}: límite de chats nuevos de WhatsApp hasta el ${limitada}. Solo socios (🏃 INASISTENCIAS, 📣 SOCIOS).`);
    const cola = (await colaAuto(cfg, info)).filter((c) => turnos.includes(c.clave)).map((c) => c.tab);
    for (const pestana of cola) {
      if ((limitada || enTope) && !esInasist(pestana)) continue;
      const nuevo = await cargar(pestana, asesora);
      if (!nuevo.items.length) continue;
      nuevo.auto = true;
      nuevo.dia = now.date;
      await setRun(nuevo);
      await log('info', `🤖 Automático: ${asesora} · ${pestana} · ${nuevo.items.length} pendientes (tope ${cfg.topeDiario}).`);
      notify('Rurush Difusiones', `🤖 Arrancó solo: ${asesora} · ${pestana}`);
      await iniciar();
      return;
    }
    await log('info', `🤖 Automático: ${asesora} no tiene pendientes en ${cola.join(', ')}.`);
    notify('Rurush Difusiones', `🤖 ${asesora}: no hay nada por enviar hoy.`);
  } catch (e) {
    await log('warn', `🤖 Automático: ${e.message || e}`);
  } finally {
    revisandoAuto = false;
  }
}

async function siguientePestanaAuto(run) {
  const cfg = await getConfig();
  const enTope = !run.simulacion && (await contador(run.linea)) >= cfg.topeDiario;
  const hora = limaNow().hour;
  const lista = (await colaAuto(cfg)).filter((c) => hora >= c.hora).map((c) => c.tab);
  const limitada = await limiteDeLinea(run.linea);
  for (const pestana of lista.slice(lista.indexOf(run.tab) + 1)) {
    if ((limitada || enTope) && !esInasist(pestana)) continue;
    let nuevo;
    try { nuevo = await cargar(pestana, run.asesora); } catch (e) {
      await log('info', `🤖 ${pestana}: ${e.message || e}`);
      continue;
    }
    if (!nuevo.items.length) continue;
    Object.assign(nuevo, { auto: true, dia: run.dia, estado: 'corriendo', diagHecho: true });
    await setRun(nuevo);
    await log('info', `🤖 Sigue con ${pestana}: ${nuevo.items.length} pendientes.`);
    await programar(30);
    return true;
  }
  return false;
}

function programarAuto() {
  chrome.alarms.create('auto', { delayInMinutes: 1, periodInMinutes: 10 });
  chrome.alarms.create('recarga', { delayInMinutes: 2, periodInMinutes: 5 });
  chrome.alarms.create('cuadro', { delayInMinutes: 1, periodInMinutes: 5 });
}

// Autorrecarga: cuando ACTUALIZAR.bat deja archivos nuevos en la carpeta de la extensión, esta se
// recarga sola (cada 5 min se compara la versión del manifest en disco), pero nunca a mitad de un envío.
async function autoRecarga() {
  try {
    const r = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    const v = (await r.json()).version;
    if (!v || v === chrome.runtime.getManifest().version) return;
    if (await ocupadoParaRecargar()) return;
    chrome.runtime.reload();
  } catch (e) { /* manifest a medio copiar: se intenta en la próxima vuelta */ }
}
async function ocupadoParaRecargar() {
  const run = await getRun();
  return procesando || revisando || cuadroOcupado || estadosOcupado || (run && run.estado === 'corriendo');
}

// ───────────────────────── 📊 cuadro de ventas ─────────────────────────
// Lun-vie 7:00 am (lo que necesitan HOY) y 9:00 pm (cierre del día): baja el cuadro de RURUSH Hoy,
// lo convierte en imagen y lo manda a los números de la pestaña «📲 CUADRO WHATSAPP» (Hoja de Reportes).
// La extensión pide su alta una vez: a Omar le llega un correo para autorizarla. Respeta el turno con FP.
const CUADRO_EXEC = 'https://script.google.com/macros/s/AKfycbxQ43YCw8-Jrgqncz1QiW0lIA4mmNW5_-QGYhKGS68aomEJUaZ5P2t01WqESRlCXfbZ/exec';
const CUADRO_HORAS = [{ h: 7, m: 0, noche: false }, { h: 21, m: 0, noche: true }];
const CUADRO_VENTANA_MIN = 120;   // si a esa hora no se pudo (WhatsApp ocupado/cerrado), se reintenta hasta 2 h después
let cuadroOcupado = false;

async function cuadroGet(params) {
  const url = new URL(CUADRO_EXEC);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  // sin cookies: con varias cuentas de Google abiertas en Chrome, Apps Script responde 404
  const r = await fetch(url, { redirect: 'follow', cache: 'no-store', credentials: 'omit' });
  if (!r.ok) throw new Error('RURUSH Hoy → HTTP ' + r.status);
  return r.text();
}
async function cuadroClave() {
  let { cuadroClave: c } = await chrome.storage.local.get('cuadroClave');
  if (!c) {
    c = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await chrome.storage.local.set({ cuadroClave: c });
  }
  return c;
}
function cuadroTurnoActual() {
  const now = limaNow();
  if (now.dow === 0 || now.dow === 6) return null;
  const min = now.hour * 60 + now.min;
  const s = CUADRO_HORAS.find((x) => min >= x.h * 60 + x.m && min < x.h * 60 + x.m + CUADRO_VENTANA_MIN);
  return s ? { id: now.date + (s.noche ? '-noche' : '-manana'), noche: s.noche } : null;
}
async function cuadroPng(html) {
  try {
    const ya = chrome.offscreen.hasDocument ? await chrome.offscreen.hasDocument() : false;
    if (!ya) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: 'Dibujar el cuadro de ventas como imagen' });
  } catch (e) { if (!/single offscreen|already/i.test(String(e.message || e))) throw e; }
  const r = await chrome.runtime.sendMessage({ type: 'cuadroPng', html });
  if (!r || !r.ok) throw new Error('no pude dibujar el cuadro: ' + ((r && r.error) || 'sin respuesta'));
  return r.b64;
}
// prueba = true: lo manda ahora mismo (botón de prueba), sin mirar la hora
async function cuadroTick(prueba) {
  if (cuadroOcupado || procesando || revisando) return;
  const turnoHoy = prueba ? { id: 'prueba-' + Date.now(), noche: limaNow().hour >= 14 } : cuadroTurnoActual();
  if (!turnoHoy) return;
  const { cuadroHecho = {} } = await chrome.storage.local.get('cuadroHecho');
  if (cuadroHecho[turnoHoy.id]) return;
  const run = await getRun();
  if (run && run.estado === 'corriendo') return;           // primero termina la difusión
  cuadroOcupado = true;
  let tab = null, tomado = false;
  try {
    const clave = await cuadroClave();
    const alta = (await cuadroGet({ cuadroalta: clave })).trim();
    if (alta !== 'OK') {
      if (!cuadroHecho['aviso-' + limaNow().date]) {
        cuadroHecho['aviso-' + limaNow().date] = 1; await chrome.storage.local.set({ cuadroHecho });
        await log('warn', '📊 Cuadro de ventas: falta autorizar esta extensión. Omar: revisa tu correo y toca «Autorizar».');
      }
      return;
    }
    const info = JSON.parse(await cuadroGet({ cuadro: clave, info: 1 }));
    const cfg = await getConfig();
    const destinos = [...new Set((info.destinos && info.destinos.length ? info.destinos : [info.numero]).map(normPhone).filter(Boolean))]
      .filter((n) => !(cfg.blocklist || []).includes(n));
    if (!destinos.length) throw new Error('no hay números en la pestaña 📲 CUADRO WHATSAPP');
    const html = await cuadroGet(turnoHoy.noche ? { cuadro: clave, noche: 1 } : { cuadro: clave });
    if (!/RURUSH FITNESS CLUB/.test(html)) throw new Error('RURUSH Hoy no devolvió el cuadro');
    const b64 = await cuadroPng(html);
    tab = await waTab();
    // tras actualizar la extensión, la pestaña de WhatsApp queda con el script viejo: se recarga una vez
    let ping = await ask(tab.id, { type: 'ping' });
    if (!ping) { await chrome.tabs.reload(tab.id); await sleep(5000); }
    if (!ping || !ping.loggedIn) ping = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn, 90000);
    if (!ping) { await log('warn', '📊 Cuadro: WhatsApp Web no está abierto con sesión; reintento en 5 min.'); return; }
    // con la extensión en varias líneas (por los estados), el cuadro sale solo desde la de Mónica
    const lineaCuadro = await estadosLinea(tab);
    if (lineaCuadro && !/^\d+$/.test(lineaCuadro) && !/monica/.test(normTexto(lineaCuadro))) return;
    const t = await turno(tab.id, 'tomar', 5 * 60e3);
    if (!t || !t.ok) { await log('info', `📊 Cuadro: WhatsApp ocupado por ${(t && t.quien) || 'otro envío'}; reintento en 5 min.`); return; }
    tomado = true;
    const ahora = limaNow();
    const texto = (turnoHoy.noche ? '🌙 Cierre de ventas ' : '📊 Ventas de hoy ') + ahora.date.slice(8) + '/' + ahora.date.slice(5, 7);
    let ok = 0;
    for (const ph of destinos) {
      await turno(tab.id, 'tomar', 5 * 60e3);
      const st = await openChat(tab.id, ph);
      if (!st || st.invalid) { await log('warn', `📊 Cuadro: ${ph} no tiene WhatsApp o no abrió el chat.`); continue; }
      const r = await ask(tab.id, { type: 'enviarImagen', b64, mime: 'image/png', nombre: 'cuadro-ventas.png', texto }, 60000);
      if (r && r.ok) ok++; else await log('warn', `📊 Cuadro: no salió a ${ph} (${(r && r.error) || 'sin respuesta'}).`);
      await sleep(3000);
    }
    if (ok) {
      cuadroHecho[turnoHoy.id] = Date.now();
      const lim = Date.now() - 10 * 864e5;
      Object.keys(cuadroHecho).forEach((k) => { if (typeof cuadroHecho[k] === 'number' && cuadroHecho[k] > 1 && cuadroHecho[k] < lim) delete cuadroHecho[k]; });
      await chrome.storage.local.set({ cuadroHecho });
    }
    await log(ok ? 'info' : 'warn', `📊 Cuadro de ventas ${turnoHoy.noche ? '(cierre) ' : ''}enviado a ${ok}/${destinos.length}.`);
  } catch (e) {
    await log('error', '📊 Cuadro de ventas: ' + (e.message || e));
  } finally {
    if (tomado) await soltarTurno();
    cuadroOcupado = false;
  }
}

// ───────────────────────── 📲 estados de WhatsApp ─────────────────────────
// Cada 5 min pregunta a RURUSH Hoy qué historias de la hoja HISTORIAS (las mismas de Instagram) ya
// tocan para ESTA línea y las sube como estado. Cada línea se marca aparte en la columna WHATSAPP.
// Usa la misma clave autorizada del cuadro. Respeta el turno con FP y no interrumpe a quien usa WhatsApp.
let estadosOcupado = false;
async function estadosLinea(tab) {
  const ping = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn && r.wid, 30000);
  if (!ping) return null;
  try {
    const info = await api({ a: 'info' });
    const n = (Object.entries(info.lineas || {}).find(([, tel]) => normPhone(tel) === ping.wid) || [])[0];
    if (n) return n;
  } catch (e) { /* sin API de difusiones: se usa el número */ }
  return ping.wid;
}
async function bajarArchivo(it) {
  const urls = it.video
    ? [`https://drive.usercontent.google.com/download?id=${it.id}&export=download&confirm=t`]
    : [`https://lh3.googleusercontent.com/d/${it.id}=w1080-rj`, `https://drive.usercontent.google.com/download?id=${it.id}&export=download&confirm=t`];
  for (const u of urls) {
    try {
      const r = await fetch(u, { credentials: 'omit', cache: 'no-store' });
      const tipo = r.headers.get('content-type') || '';
      if (!r.ok || !/^(image|video)\//.test(tipo)) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { b64: btoa(bin), mime: tipo.split(';')[0] };
    } catch (e) { /* siguiente */ }
  }
  throw new Error('no pude bajar el archivo de Drive (¿está compartido con el link?)');
}
async function estadosTick(manual) {
  if (estadosOcupado || cuadroOcupado || procesando || revisando) return manual ? 'La extensión está ocupada; prueba en un rato.' : '';
  const run = await getRun();
  if (run && run.estado === 'corriendo') return manual ? 'Hay una difusión corriendo.' : '';
  const { waActivity = 0 } = await chrome.storage.local.get('waActivity');
  if (!manual && Date.now() - waActivity < 60e3) return '';             // alguien está usando WhatsApp
  estadosOcupado = true;
  let tomado = false;
  try {
    const clave = await cuadroClave();
    if ((await cuadroGet({ cuadroalta: clave })).trim() !== 'OK') return 'Falta autorizar la extensión (correo de Omar).';
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    if (!tabs.length) return 'WhatsApp Web no está abierto.';
    const tab = tabs[0];
    let ping = await ask(tab.id, { type: 'ping' });
    if (!ping) { await chrome.tabs.reload(tab.id); await sleep(5000); }
    const linea = await estadosLinea(tab);
    if (!linea) return 'WhatsApp Web no tiene sesión abierta.';
    const j = JSON.parse(await cuadroGet({ cuadro: clave, estados: linea }));
    if (!j.ok) throw new Error(j.error || 'RURUSH Hoy no respondió');
    if (!j.items.length) return manual ? `No hay estados por publicar ahora en ${linea}.` : '';
    const t = await turno(tab.id, 'tomar', 5 * 60e3);
    if (!t || !t.ok) return `WhatsApp ocupado por ${(t && t.quien) || 'otro envío'}; reintento en 5 min.`;
    tomado = true;
    let ok = 0;
    for (const it of j.items) {
      await turno(tab.id, 'tomar', 5 * 60e3);
      let r;
      try {
        const a = await bajarArchivo(it);
        r = await ask(tab.id, { type: 'subirEstado', b64: a.b64, mime: a.mime, nombre: it.archivo || 'estado.jpg' }, 90000);
      } catch (e) { r = { ok: false, error: e.message || String(e) }; }
      if (r && r.ok) {
        ok++;
        await cuadroGet({ cuadro: clave, estadoOk: it.fila, id: it.id, linea });
        await log('info', `📲 Estado publicado en ${linea}: ${it.archivo}`);
      } else {
        const err = (r && r.error) || 'sin respuesta de WhatsApp Web';
        await cuadroGet({ cuadro: clave, estadoError: it.fila, id: it.id, linea, error: err }).catch(() => {});
        await log('warn', `📲 Estado ${it.archivo} no salió en ${linea}: ${err}`);
      }
      await sleep(4000);
    }
    return `📲 ${ok}/${j.items.length} estado(s) publicados en ${linea}.`;
  } catch (e) {
    await log('error', '📲 Estados: ' + (e.message || e));
    return 'Error: ' + (e.message || e);
  } finally {
    if (tomado) await soltarTurno();
    estadosOcupado = false;
  }
}

// ───────────────────────── disparadores ─────────────────────────
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'next') procesar();
  if (a.name === 'auto') autoCheck();
  if (a.name === 'recarga') { autoRecarga(); recargarWASiLibre(); }
  if (a.name === 'cuadro') cuadroTick(false).then(() => estadosTick(false));
});

chrome.runtime.onStartup.addListener(async () => {
  // Si Chrome se cerró en medio de una corrida, queda pausada; el modo automático la retoma.
  const run = await getRun();
  if (run && run.estado === 'corriendo') await pausar('Chrome se reinició. Revisa y reanuda.');
  programarAuto();
});

chrome.runtime.onInstalled.addListener(async (d) => {
  programarAuto();
  // Tras actualizarse, la pestaña de WhatsApp Web queda con el script viejo: se recarga sola
  // (si alguien la está usando en este momento, espera a que pase 1 min sin actividad).
  if (d && d.reason === 'update') { await chrome.storage.local.set({ recargarWA: true }); recargarWASiLibre(); }
});
async function recargarWASiLibre() {
  const { recargarWA, waActivity = 0 } = await chrome.storage.local.get(['recargarWA', 'waActivity']);
  if (!recargarWA || Date.now() - waActivity < 60e3 || (await ocupadoParaRecargar())) return;
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  for (const t of tabs) { try { await chrome.tabs.reload(t.id); } catch (e) {} }
  await chrome.storage.local.set({ recargarWA: false });
  await log('info', `🔄 Extensión actualizada a ${chrome.runtime.getManifest().version}: recargué WhatsApp Web.`);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const responder = (p) => p.then((data) => reply({ ok: true, data })).catch((e) => reply({ ok: false, error: String(e.message || e) }));
  switch (msg.type) {
    case 'info': responder(api({ a: 'info' })); return true;
    case 'cargar': responder(cargar(msg.tab, msg.asesora)); return true;
    case 'iniciar': responder(iniciar()); return true;
    case 'pausar': responder(pausar()); return true;
    case 'detener': responder(detener()); return true;
    case 'revisar': responder(revisarRespuestas('manual')); return true;
    case 'cuadroProbar': responder(cuadroTick(true)); return true;
    case 'estadosAhora': responder(estadosTick(true)); return true;
    case 'waActivity': chrome.storage.local.set({ waActivity: Date.now() }); return false;
    default: return false;
  }
});

// exportado solo para pruebas en Node
if (typeof module !== 'undefined') module.exports = { normPhone, normTexto, yaEscritoEnChat, diasEntre };

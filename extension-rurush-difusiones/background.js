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
  autoDias: [1, 2, 3, 4, 5],  // 0 = domingo … 6 = sábado
  autoPestanas: ['📨 TANDA 8 EX ALUMNOS'],
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

async function ask(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); } catch { return null; }
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
    res: { enviados: 0, simulados: 0, saltados: 0, alertas: 0 },
    simulacion: cfg.dryRun,
  };
  await setRun(run);
  await log('info', `${tab} · ${asesora}: ${data.items.length} para enviar, ${data.excluidos.length} apartados.`);
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

async function pausar(motivo) {
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
    let seguir = false;
    for (let vuelta = 0; vuelta < 25; vuelta++) {
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
    const r = run.res;
    const linea = `✅ ${r.enviados} enviados · 🧪 ${r.simulados} simulados · ⏭️ ${r.saltados} saltados · ⚠️ ${r.alertas} alertas`;
    await log('ok', `Terminó ${run.tab} · ${run.asesora}: ${linea}`);
    notify('Rurush Difusiones — terminó', linea);
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
  if (!run.simulacion && (await contador(run.linea)) >= cfg.topeDiario) {
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
  if (previo && diasEntre(previo.fecha, now.date) <= cfg.diasAntiDup) {
    return saltar(`esta PC ya le envió el ${previo.fecha} (${previo.tab})`, run.simulacion ? null : 'YA_CONTACTADO');
  }

  // 3. el Sheet, ahora mismo (por si otra PC envió mientras tanto)
  const g = await api({ a: 'yaEnviado', celular: tel, dias: cfg.diasAntiDup });
  if (g.bloqueado) return saltar('NO CONTACTAR en el Sheet');
  if (g.enviado) return saltar(`ya recibió difusión el ${g.fecha} (${g.pestana})`, run.simulacion ? null : 'YA_CONTACTADO');

  // WhatsApp Web listo y en la línea correcta
  const tab = await waTab();
  const status = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn, 90000);
  if (!status) throw new Error('WhatsApp Web no cargó o no tiene sesión iniciada.');
  if (!status.wid || status.wid !== run.linea) {
    throw new Error(`WhatsApp Web está en ${status.wid || 'un número desconocido'} y esta tanda es de ${run.asesora} (${run.linea}). Cambia de sesión y reanuda.`);
  }

  // 4. el chat: ¿ya le escribimos? Se abre UNA sola vez, ya con el mensaje cargado
  //    (en simulación, sin mensaje), para no recargar WhatsApp Web dos veces por contacto.
  const chat = await openChat(tab.id, tel, run.simulacion ? null : it.mensaje);
  if (!chat) {
    run.res.alertas += 1;
    await siguiente(run, { level: 'warn', msg: `⚠️ ${etiqueta}: el chat no abrió, lo salto (sin marcar).` });
    return true;
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
  const escrito = yaEscritoEnChat(estadoChat.messages, now.date, cfg.diasAntiDup);
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
    run.res.alertas += 1;
    await siguiente(run, { level: 'warn', msg: `⚠️ ${etiqueta}: no se pudo cargar el mensaje (sin marcar).` });
    return true;
  }
  if (normTexto(draft.draft) !== normTexto(it.mensaje)) {
    await ask(tab.id, { type: 'clearDraft' });
    run.res.alertas += 1;
    await siguiente(run, { level: 'warn', msg: `⚠️ ${etiqueta}: el borrador no coincide con el mensaje del Sheet, no envié.` });
    return true;
  }

  const inicio = normTexto(it.mensaje).slice(0, 30);
  const antes = await ask(tab.id, { type: 'lastOutgoing' });
  const r = await ask(tab.id, { type: 'send' });
  if (!r || !r.ok) throw new Error(`falló el clic en Enviar con ${etiqueta} (${(r && r.error) || 'sin respuesta'})`);

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
  await contador(run.linea, 1);
  await chrome.storage.local.set({ ultimoEnvio: Date.now() });
  run.res.enviados += 1;
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
  const res = { revisados: 0, respondieron: [], sinHallar: 0, at: Date.now() };
  try {
    const cfg = await getConfig();
    const { tab, asesora } = await lineaAbierta();
    const { items } = await api({ a: 'porRevisar', asesora, dias: cfg.revisarDias });
    await log('info', `💬 Revisando respuestas (${motivo}): ${items.length} chats de ${asesora}.`);
    for (const it of items) {
      const tel = normPhone(it.celular);
      const inicio = normTexto(it.inicio).slice(0, 30);
      if (!tel || inicio.length < 10) continue;
      const chat = await openChat(tab.id, tel);
      if (!chat || chat.invalid) continue;
      await sleep(1500);
      const r = await ask(tab.id, { type: 'respuestas', inicio });
      res.revisados += 1;
      if (res.revisados === 1) {
        const d = await ask(tab.id, { type: 'diag' });
        if (d) await log('info', `🔎 Revisión, primer chat: ${d.pre} con fecha · ${d.idTrue} propios por id · ${d.textos} textos · ${d.filas} filas · ${d.iconos} íconos · método ${(r && r.metodo) || '—'}.`);
      }
      if (!r || !r.nuestro) { res.sinHallar += 1; continue; }
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
    if (res.respondieron.length) notify('Rurush Difusiones', resumen);
    await chrome.storage.local.set({ ultimaRevision: res });
    await chrome.tabs.update(tab.id, { url: 'https://web.whatsapp.com/' });
    return res;
  } finally {
    revisando = false;
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
    await log('warn', `💬 No pude revisar respuestas: ${e.message || e}`);
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
    if (run && run.estado === 'corriendo') return;

    // Revisión de respuestas (funciona aunque el envío automático esté apagado)
    if (now.hour >= 7 && now.hour < 22) {
      const motivo = await revisionPendiente(cfg, now);
      if (motivo) await hacerRevision(motivo, now);
    }

    if (!cfg.autoActivo) return;
    if (!cfg.autoDias.includes(now.dow) || now.hour < cfg.autoHora || now.hour >= cfg.horaFin) return;
    const { autoDia } = await chrome.storage.local.get('autoDia');
    if (autoDia === now.date) {
      // Mismo día: solo se retoma la corrida automática que cortó un reinicio de Chrome.
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
    await chrome.storage.local.set({ autoDia: now.date });
    if (!asesora) {
      await log('warn', `🤖 Automático: la línea ${status.wid} no está en ⚙️ CONFIG (LINEAS). No envío nada hoy.`);
      notify('Rurush Difusiones', `La línea ${status.wid} no está en ⚙️ CONFIG. Hoy no se envía.`);
      return;
    }
    if (!cfg.dryRun && (await contador(status.wid)) >= cfg.topeDiario) {
      await log('info', `🤖 Automático: ${asesora} ya llegó al tope de hoy.`);
      return;
    }

    for (const pestana of cfg.autoPestanas) {
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
    await log('info', `🤖 Automático: ${asesora} no tiene pendientes en ${cfg.autoPestanas.join(', ')}.`);
    notify('Rurush Difusiones', `🤖 ${asesora}: no hay nada por enviar hoy.`);
  } catch (e) {
    await log('warn', `🤖 Automático: ${e.message || e}`);
  } finally {
    revisandoAuto = false;
  }
}

function programarAuto() {
  chrome.alarms.create('auto', { delayInMinutes: 1, periodInMinutes: 10 });
}

// ───────────────────────── disparadores ─────────────────────────
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'next') procesar();
  if (a.name === 'auto') autoCheck();
});

chrome.runtime.onStartup.addListener(async () => {
  // Si Chrome se cerró en medio de una corrida, queda pausada; el modo automático la retoma.
  const run = await getRun();
  if (run && run.estado === 'corriendo') await pausar('Chrome se reinició. Revisa y reanuda.');
  programarAuto();
});

chrome.runtime.onInstalled.addListener(programarAuto);

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const responder = (p) => p.then((data) => reply({ ok: true, data })).catch((e) => reply({ ok: false, error: String(e.message || e) }));
  switch (msg.type) {
    case 'info': responder(api({ a: 'info' })); return true;
    case 'cargar': responder(cargar(msg.tab, msg.asesora)); return true;
    case 'iniciar': responder(iniciar()); return true;
    case 'pausar': responder(pausar()); return true;
    case 'detener': responder(detener()); return true;
    case 'revisar': responder(revisarRespuestas('manual')); return true;
    case 'waActivity': chrome.storage.local.set({ waActivity: Date.now() }); return false;
    default: return false;
  }
});

// exportado solo para pruebas en Node
if (typeof module !== 'undefined') module.exports = { normPhone, normTexto, yaEscritoEnChat, diasEntre };

// Rurush FP — mensajes automáticos de WhatsApp a los Free Pass, sin gastar uso de Claude.
// Pipedrive (API) dice a quién y cuándo; WhatsApp Web (pestaña de Chrome) lee el chat y envía.
// Módulos: recordatorio 2h, mañana, refuerzo noche anterior, no-shows (1pm, 8pm, día siguiente),
// sábado y domingo. Ver MODULOS.

const GPS = 'https://maps.app.goo.gl/8qmgUTHsMH7NHF698';
const LIMA_OFFSET_H = -5; // Perú no tiene horario de verano

const DEFAULTS = {
  enabled: true,
  dryRun: true,            // simulación: arma todo pero NO aprieta Enviar
  pipedriveToken: '',
  expectedNumber: '51926918075', // número de la sesión de WhatsApp Web (vacío = no verificar)
  blocklist: ['51942853538', '51953876647'],
  startHour: 8,            // primera corrida (hora Lima)
  endHour: 20,             // última corrida (hora Lima, inclusive)
  days: [1, 2, 3, 4, 5, 6],// lun–sáb (0 = domingo)
  sendWindowH: 4,          // enviar si a la clase le faltan ≤ 4h
  intervalMin: 30,
  modos: {},               // modo por módulo: 'off' | 'sim' | 'real' (ver MODULOS)
  mananaHora: 9,           // hora del recordatorio de la mañana
  mananaDesdeHora: 13,     // ...solo para clases desde esta hora
  maxEnviosCorrida: 15,
};

// ───────────────────────── utilidades ─────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getConfig() {
  const { config } = await chrome.storage.local.get('config');
  return { ...DEFAULTS, ...(config || {}) };
}

// Fecha/hora "de pared" en Lima, como objeto Date en UTC desplazado.
function limaNow() {
  const d = new Date(Date.now() + LIMA_OFFSET_H * 3600e3);
  return {
    ms: Date.now(),
    date: d.toISOString().slice(0, 10),
    hour: d.getUTCHours(),
    min: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}
function limaDateOffset(days) {
  const d = new Date(Date.now() + LIMA_OFFSET_H * 3600e3 + days * 86400e3);
  return d.toISOString().slice(0, 10);
}
function utcToLima(ms) {
  const d = new Date(ms + LIMA_OFFSET_H * 3600e3);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), min: d.getUTCMinutes() };
}
// "a las 7 pm" / "a la 1 pm"
const aLas = (h, m) => `${((h + 11) % 12) + 1 === 1 ? 'a la' : 'a las'} ${fmtHora(h, m)}`;
function fmtHora(h, m) {
  const suf = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suf}` : `${h12} ${suf}`;
}
function normPhone(raw) {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.length === 9 && p.startsWith('9')) p = '51' + p;
  return /^519\d{8}$/.test(p) ? p : null;
}
// Primer nombre "de verdad" para saludar. Si en Pipedrive el nombre es un número,
// un apodo de usuario o algo genérico, devuelve '' y el mensaje saluda sin nombre.
const NO_ES_NOMBRE = /^(fp|free|pass|lead|leads|cliente|clienta|contacto|whatsapp|wsp|sin|nombre|usuario|user|prueba|test|sr|sra|srta|dr|dra)$/i;
function firstName(full) {
  const palabras = String(full || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/);
  const n = palabras.find((w) => w.length >= 2 && !NO_ES_NOMBRE.test(w)) || '';
  const primera = String(full || '').trim().split(/\s+/)[0] || '';
  if (!n || /\d/.test(primera) || /^[@_.]/.test(primera) || /[_.]\w/.test(primera)) return '';
  return n[0].toUpperCase() + n.slice(1).toLowerCase();
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const ultimos9 = (x) => String(x || '').replace(/\D/g, '').slice(-9);

async function log(entry) {
  const { logs = [] } = await chrome.storage.local.get('logs');
  logs.unshift({ at: new Date().toISOString(), ...entry });
  await chrome.storage.local.set({ logs: logs.slice(0, 300) });
}

function notify(title, message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icon128.png', title, message });
}

// ───────────────────────── Pipedrive ─────────────────────────
async function pd(path, token, params = {}) {
  const url = new URL('https://api.pipedrive.com/v1/' + path);
  url.searchParams.set('api_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Pipedrive ${path} → HTTP ${r.status}`);
  return r.json();
}

// FP con fecha Lima entre `desde` y `hasta` (AAAA-MM-DD, inclusive).
// due_date/due_time vienen en UTC y end_date es exclusivo: se pide un margen de días
// a cada lado y se filtra después (con end_date=hoy se perdían los FP de 7pm en adelante).
async function fpsEntre(token, desde, hasta) {
  const out = [];
  let start = 0;
  for (;;) {
    const res = await pd('activities', token, {
      type: 'meeting', done: 0, user_id: 0, limit: 500, start,
      start_date: sumarDias(desde, -1), end_date: sumarDias(hasta, 2),
    });
    for (const a of res.data || []) {
      const subj = String(a.subject || '').trim();
      if (!/^(FP|FREE\s*PASS)\b/i.test(subj)) continue;
      if (!a.due_date || !a.due_time) continue;
      const classMs = Date.parse(`${a.due_date}T${a.due_time.slice(0, 5)}:00Z`);
      const lima = utcToLima(classMs);
      if (lima.date < desde || lima.date > hasta) continue;
      out.push({
        id: a.id, subject: subj, personId: a.person_id, personName: a.person_name,
        classMs, date: lima.date, hour: lima.hour, min: lima.min,
      });
    }
    const pg = res.additional_data && res.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  return out.sort((x, y) => x.classMs - y.classMs);
}

function sumarDias(fecha, n) {
  return new Date(Date.parse(fecha + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
}
const diaSemana = (fecha) => new Date(Date.parse(fecha + 'T12:00:00Z')).getUTCDay();

// Lo que había en Pipedrive cuando no se encontró celular (para el reporte).
let ultimoTelCrudo = '';
async function phoneOf(personId, token) {
  ultimoTelCrudo = '';
  if (!personId) return null;
  const res = await pd(`persons/${personId}`, token);
  const d = res.data || {};
  const phones = d.phone || [];
  const primary = phones.find((p) => p.primary) || phones[0];
  for (const p of [primary, ...phones]) {
    const n = p && normPhone(p.value);
    if (n) return n;
  }
  // Plan B: un celular peruano escrito en otro campo de la persona (nombre, campo
  // personalizado "Celular"/"WhatsApp", etc.), con o sin +51 y con espacios o guiones.
  for (const [k, v] of Object.entries(d)) {
    // solo el nombre y los campos personalizados (claves de 40 caracteres en Pipedrive)
    if (typeof v !== 'string' || !(k === 'name' || /^[0-9a-f]{40}$/.test(k))) continue;
    const m = v.match(/(?:\+?\s*51[\s-]*)?(9\d{2})[\s-]*(\d{3})[\s-]*(\d{3})(?!\d)/);
    if (m) return '51' + m[1] + m[2] + m[3];
  }
  ultimoTelCrudo = phones.map((p) => p && p.value).filter(Boolean).join(' / ');
  return null;
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

// Si WhatsApp Web ya estaba abierto antes de instalar/recargar la extensión,
// Chrome no le inyecta content.js: lo inyectamos a mano.
async function asegurarScript(tabId) {
  if (await ask(tabId, { type: 'ping' })) return;
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); } catch {}
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

async function openChat(tabId, phone) {
  const url = new URL('https://web.whatsapp.com/send');
  url.searchParams.set('phone', phone);
  await ask(tabId, { type: 'prepNav' });
  await chrome.tabs.update(tabId, { url: url.toString() });
  await sleep(4000);
  const r = await waitFor(tabId, { type: 'chatState', phone }, (x) => x.invalid || x.ready);
  if (!r || r.invalid) return r;
  // esperar a que terminen de cargar los mensajes (misma cantidad dos lecturas seguidas)
  let prev = r;
  for (let i = 0; i < 8; i++) {
    await sleep(1500);
    const cur = await ask(tabId, { type: 'chatState', phone });
    if (!cur || !cur.ready) break;
    if (cur.messages.length && cur.messages.length === prev.messages.length) return cur;
    prev = cur;
  }
  return prev;
}

// ───────────────────────── lectura del chat ─────────────────────────
const RX_CONFIRMA = /\b(confirmo|confirmado|s[ií] voy|voy|ah[ií] estar[eé]|all[aá] estar[eé]|ok\b|listo)/i;
const RX_CANCELA = /(no puedo|cancel|reagend|otro d[ií]a|no voy|no podr[eé]|ma[ñn]ana mejor|ya no|no llego|no llegar[eé]|complic|lo dejamos|lo pasamos|otra fecha|otra hora|posterg|mejor el (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado))/i;
const RX_HORA = /\b(?:a las?\s*)?(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|am|pm|hrs?|de la (?:ma[ñn]ana|tarde|noche))/gi;

// horas en 24h: "19:00", "18h", "18 hrs" (solo de 13 a 23, o con "h/hrs", para no confundir con montos)
const RX_HORA_24 = /\b([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\s*(hrs?|h)\b|\b(1[3-9]|2[0-3])[:.]([0-5]\d)\b/gi;

// Textos que son nuestros (plantillas del gym) aunque lleguen como entrantes, p. ej. cuando
// el lead responde citando nuestro mensaje: no cuentan como "otra hora".
const RX_PROPIO = /rurush|te esperamos|larco\s*11\d\d|maps\.app\.goo\.gl/i;

function horasMencionadas(text) {
  const out = [];
  if (RX_PROPIO.test(text)) return out;
  if (/6(:00)?\s*a\.?\s?m\.?\s*a\s*10(:00)?\s*p\.?\s?m/i.test(text)) return out; // horario del gym, no una cita
  for (const m of text.matchAll(RX_HORA)) out.push({ h12: Number(m[1]) % 12, m: m[2] ? Number(m[2]) : null });
  for (const m of text.matchAll(RX_HORA_24)) {
    const h = Number(m[1] ?? m[4]);
    const mi = m[2] ?? m[5];
    out.push({ h12: h % 12, m: mi ? Number(mi) : null });
  }
  return out;
}

// msgs: [{out, text, date:'YYYY-MM-DD'|null, minutes: minutos del día|null}]
function analizar(fp, msgs, hoy) {
  const deHoy = msgs.filter((m) => m.date === hoy);
  // cancelación: mensajes del lead de hoy, o el último mensaje del chat
  const recientes = [...deHoy.slice(-6), ...msgs.slice(-1)];
  const avisoDesde = fp.hour * 60 + fp.min - (fp.cfgWindowH * 60 + 30);

  const yaCercano = deHoy.some((m) => m.out && /maps\.app\.goo\.gl|larco 11(64|70)/i.test(m.text)
    && (m.minutes == null || m.minutes >= avisoDesde));
  const cancelo = recientes.some((m) => !m.out && RX_CANCELA.test(m.text));
  const confirmo = deHoy.some((m) => !m.out && RX_CONFIRMA.test(m.text));

  // ¿se acordó otra hora por chat? → no adivinar, que lo vea la asesora
  let otraHora = null;
  for (const m of deHoy.filter((x) => !x.out).slice(-8)) {
    for (const t of horasMencionadas(m.text)) {
      const mismaHora = t.h12 === fp.hour % 12 && (t.m == null || t.m === fp.min);
      if (!mismaHora) otraHora = m.text.slice(0, 80);
    }
  }
  return { yaCercano, cancelo, confirmo, otraHora };
}

// ───────────────────────── mensaje ─────────────────────────
function mensaje(fp, confirmo) {
  const n = firstName(fp.personName);
  const h = aLas(fp.hour, fp.min);
  const hola = n ? pick([`¡Hola ${n}! 👋`, `${n}, ¡hola! 😊`, `¡Hola ${n}! 🙌`]) : pick(['¡Hola! 👋', '¡Hola! 😊']);
  let cuerpo, cierre;
  if (confirmo) {
    cuerpo = pick([`¡Perfecto! Te esperamos hoy ${h} 💪`, `Todo listo para tu clase de hoy ${h} 💪`, `Nos vemos hoy ${h} 🔥`]);
    cierre = pick([`Te dejo la ubicación 📍 ${GPS}`, `📍 ${GPS}`, `Aquí la ubicación 📍 ${GPS}`]);
  } else {
    cuerpo = pick([`Hoy es tu clase de prueba GRATIS ${h} 🔥`, `Te esperamos hoy ${h} para tu clase gratis 💪`, `Hoy ${h} es tu clase de prueba 🔥`]);
    cierre = pick([`¿Confirmas? Te paso la ubicación 📍 ${GPS}`, `¿Me confirmas? 📍 ${GPS}`, `¿Confirmas tu asistencia? Ubicación 📍 ${GPS}`]);
  }
  const ref = 'Av. Larco 1164, Víctor Larco, al costado de Mass';
  const full = `${hola} ${cuerpo}\n${cierre}\n${ref}`;
  return full.length <= 180 ? full : `${hola} ${cuerpo}\n${cierre}`;
}

// ───────────────────────── módulos ─────────────────────────
// Cada módulo reemplaza (parte de) una rutina de Claude. modo por módulo en Opciones:
// 'off' = apagado · 'sim' = simulación (arma todo, no envía) · 'real' = envía.
const MODULOS = {
  m1:     { nombre: 'Recordatorio 2h',            reemplaza: 'FPS 2HRS' },
  manana: { nombre: 'Recordatorio de la mañana',   reemplaza: '(nuevo)',            dias: [1, 2, 3, 4, 5, 6] },
  m7:     { nombre: 'No-show de ayer',             reemplaza: 'FP 9 AM (no-shows)', hora: [9, 15], dias: [1, 2, 3, 4, 5, 6] },
  m6:     { nombre: 'Sábado seguimiento',          reemplaza: 'FP SABADOS SEGUIMIENTO', hora: [11, 0], dias: [6] },
  m3:     { nombre: 'No-show de la mañana',        reemplaza: 'FP 1PM',             hora: [13, 0], dias: [1, 2, 3, 4, 5, 6] },
  m2:     { nombre: 'Refuerzo noche anterior',     reemplaza: 'FP 8PM (FP de mañana)', hora: [20, 0], dias: [0, 1, 2, 3, 4, 5] },
  m4:     { nombre: 'No-show de la tarde',         reemplaza: 'FP 8PM (no-shows)',  hora: [20, 10], dias: [1, 2, 3, 4, 5, 6] },
  m5:     { nombre: 'Domingo',                     reemplaza: 'DOMINGO REC FP 9 AM', hora: [9, 0], dias: [0] },
  // pone la etiqueta de WhatsApp Business a todo el que tenga FP agendado (de hoy a 14 días)
  et:     { nombre: 'Etiquetar FREE PASS',         reemplaza: '(nuevo)', hora: [8, 40], cadaMin: 120, dias: [0, 1, 2, 3, 4, 5, 6] },
};
const ETIQUETA_FP = 'FREE PASS';
const MAX_ETIQUETAS_CORRIDA = 15;
const REAGENDOS = new Set(['m3', 'm4', 'm5b', 'm6', 'm7']);
const HORARIO = { 0: null, 6: [7, 18] }; // resto de días [6, 22]; domingo cerrado
const abre = (dow) => (dow in HORARIO ? HORARIO[dow] : [6, 22]);
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIR = 'Av. Larco 1164, Víctor Larco, al costado de Mass';

function modoDe(cfg, key) {
  if (cfg.modos && cfg.modos[key]) return cfg.modos[key];
  if (key === 'm1') return cfg.dryRun === false ? 'real' : 'sim'; // compatibilidad con la v1.x
  return 'sim';
}

// ── chat: tiempo absoluto de cada mensaje y reglas de texto ──
const msgMs = (m) => (m.date && m.minutes != null
  ? Date.parse(m.date + 'T00:00:00Z') - LIMA_OFFSET_H * 3600e3 + m.minutes * 60e3 : null);
const entrantesDesde = (msgs, ms) => msgs.filter((m) => !m.out && msgMs(m) != null && msgMs(m) >= ms);

const RX_ASISTIO = /(ya fui|ya vine|ya asist|gracias por la clase|estuve ah[ií]|me gust[oó] la clase)/i;
const RX_NO_INTERES = /(no me interesa|no gracias|ya no deseo|no estoy interesad|no quiero|dej(a|e)n? de escribir|no me escrib)/i;
const RX_AVISA = /(te aviso|le aviso|les aviso|avisar[eé]|me comunico|yo te escribo|yo les escribo)/i;
const RX_REAGENDO_DICHO = /(voy el|puedo el|para el|el (lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)|ma[ñn]ana (a las|en la|voy|puedo))/i;
const RX_BIENESTAR = /(enferm|resfri|gripe|viaj|hospital|cl[ií]nica|operac|duelo|falleci|me siento mal|estoy mal|lesi[oó]n|me lesion)/i;

function otraHoraDesde(fp, msgs, desdeMs) {
  for (const m of entrantesDesde(msgs, desdeMs).slice(-8)) {
    for (const t of horasMencionadas(m.text)) {
      if (!(t.h12 === fp.hour % 12 && (t.m == null || t.m === fp.min))) return m.text.slice(0, 80);
    }
  }
  return null;
}
const yaEnviado = (ctx, id, ...partes) => partes.some((p) => ctx.sent[`${p}:${id}`]) || (partes.includes('m1') && ctx.sent[id]);

// ── opciones de horario para reagendar (doble opción con días concretos) ──
function opciones(fp, now) {
  const ahoraMin = now.hour * 60 + now.min;
  const dentro = (dow, h) => { const r = abre(dow); return r && h >= r[0] && h <= r[1] - 1; };
  const sig = (fecha) => { let f = sumarDias(fecha, 1); while (!abre(diaSemana(f))) f = sumarDias(f, 1); return f; };
  const horaPara = (fecha) => (dentro(diaSemana(fecha), fp.hour) ? [fp.hour, fp.min] : [diaSemana(fecha) === 6 ? 10 : 18, 0]);
  const nombreDia = (fecha) => (fecha === sumarDias(now.date, 1) ? `mañana ${DIAS[diaSemana(fecha)]}` : `el ${DIAS[diaSemana(fecha)]}`);

  // ¿queda un horario hoy? (al menos 2h desde ahora, antes de las 17h para ofrecer "hoy")
  let hoy = null;
  if (now.hour < 17 && abre(now.dow)) {
    for (const h of [fp.hour, 18, 19, 16, 15]) {
      if (dentro(now.dow, h) && h * 60 >= ahoraMin + 120) { hoy = [h, h === fp.hour ? fp.min : 0]; break; }
    }
  }
  const d1 = sig(now.date);
  const [h1, m1] = horaPara(d1);
  if (hoy) return [`hoy ${aLas(...hoy)}`, `${nombreDia(d1)} ${aLas(h1, m1)}`];
  const d2 = sig(d1);
  const [h2, m2] = horaPara(d2);
  return [`${nombreDia(d1)} ${aLas(h1, m1)}`, `${nombreDia(d2)} ${aLas(h2, m2)}`];
}

// ── plantillas ──
const hola = (n, opts) => (n ? pick(opts.map((o) => o.replace('N', n))) : '¡Hola! 😊');

function msgManana(fp) {
  const n = firstName(fp.personName);
  return `${hola(n, ['¡Hola N! 😊', 'N, ¡buenos días! ☀️', '¡Buen día N! 😊'])} `
    + `${pick([`Hoy ${aLas(fp.hour, fp.min)} es tu clase de prueba GRATIS 💪`, `Te esperamos hoy ${aLas(fp.hour, fp.min)} para tu clase gratis 💪`])}\n`
    + `${pick(['¿Nos confirmas tu asistencia?', '¿Me confirmas que vienes?'])}\n\n✅ Confirmo\n🔄 Reagendar`;
}

function msgRefuerzo(fp, now) {
  const n = firstName(fp.personName);
  const dia = fp.date === sumarDias(now.date, 1) ? `Mañana ${DIAS[diaSemana(fp.date)]}` : `El ${DIAS[diaSemana(fp.date)]}`;
  return `${hola(n, ['¡Hola N! 😊', 'N, ¡hola! 👋', '¡Hola N! 🙌'])} `
    + `${pick([`${dia} ${aLas(fp.hour, fp.min)} es tu clase de prueba GRATIS 💪`, `Te recuerdo: ${dia.toLowerCase()} ${aLas(fp.hour, fp.min)} tienes tu clase gratis 🔥`])} `
    + `${pick(['¡Te esperamos!', '¡Nos vemos!'])}\n📍 ${DIR}\n${GPS}`;
}

function msgReagendo(fp, now) {
  const n = firstName(fp.personName);
  const [a, b] = opciones(fp, now);
  return `${hola(n, ['Hola N 😊', '¡Hola N! 👋', 'N, ¡hola! 😊'])} `
    + `${pick(['Vimos que no pudiste llegar a tu clase gratis 🔥', 'Tu clase de prueba GRATIS sigue en pie 🔥', 'Aún tienes tu clase de prueba GRATIS 🔥'])}\n`
    + `${pick([`¿La retomamos ${a} o ${b}? 💪`, `¿Te queda mejor ${a} o ${b}? 💪`])}\n📍 ${GPS}`;
}

function msgBienestar(fp) {
  const n = firstName(fp.personName);
  return pick([
    `Hola${n ? ' ' + n : ''} 💙 Espero que estés mejor. Cuando puedas, te esperamos en Rurush 💪`,
    `${n ? n + ', e' : 'E'}spero que todo esté bien 💙 Tu clase gratis te espera cuando puedas 💪`,
  ]);
}

function msgSabado(fp) {
  const n = firstName(fp.personName);
  return `¡Hola${n ? ' ' + n : ''}! 😊 No te quedes sin tu clase GRATIS 🔥 Retomémosla este lunes: rutina + nutrición + evaluación InBody hechos para ti 💪 ¿La prefieres en la mañana, en la tarde o en la noche?`;
}

function msgDomingoLunes(fp) {
  const n = firstName(fp.personName);
  return `¡Hola${n ? ' ' + n : ''}! 😊\n\n¡Te esperamos mañana Lunes! 💪 Tu clase gratuita ya está reservada.\n\n`
    + `🕒 Hora: ${fmtHora(fp.hour, fp.min)}\n📍 ${DIR}\n📍 Ubicación GPS: ${GPS}\n\n`
    + `Tu coach ya tiene preparada tu evaluación y plan de entrenamiento ✨\n\n¿Nos confirmas tu asistencia?\n\n✅ Confirmo\n🔄 Reagendar`;
}

function msgDomingoNoShow(fp) {
  const n = firstName(fp.personName);
  const h = abre(1)[0] <= fp.hour && fp.hour <= abre(1)[1] - 1 ? aLas(fp.hour, fp.min) : 'a las 6 pm';
  return `¡Hola${n ? ' ' + n : ''}! 😊 Vimos que no pudiste llegar a tu clase gratis 🔥\n\n`
    + `¿La retomamos mañana lunes ${h}? ¿O prefieres otro horario? 💪\n\n📍 ${DIR}\n📍 GPS: ${GPS}`;
}

// ── decisiones por tipo ── devuelven { enviar: texto, imagen } | { saltar } | { alerta }
function decidirRecordatorio2h(fp, msgs, now, cfg) {
  fp.cfgWindowH = cfg.sendWindowH;
  const a = analizar(fp, msgs, now.date);
  if (a.cancelo) return { saltar: 'canceló/reagenda' };
  if (a.yaCercano) return { saltar: 'ya tiene recordatorio cercano', marcar: 'previo' };
  if (a.otraHora) return { alerta: `el chat menciona otra hora → «${a.otraHora}» — revisar a mano` };
  return { enviar: mensaje(fp, a.confirmo), imagen: true };
}

function decidirManana(fp, msgs, now, ctx = { sent: {} }) {
  // va aunque haya recibido el refuerzo de la noche anterior (así lo pidió Omar: noche + mañana + 2h)
  if (yaEnviado(ctx, fp.id, 'm1', 'manana')) return { saltar: 'ya recibió el recordatorio 2h' };
  if (entrantesDesde(msgs, now.ms - 48 * 3600e3).some((m) => RX_CANCELA.test(m.text))) return { saltar: 'canceló/reagenda' };
  const otra = otraHoraDesde(fp, msgs, now.ms - 48 * 3600e3);
  if (otra) return { alerta: `el chat menciona otra hora → «${otra}» — revisar a mano` };
  if (entrantesDesde(msgs, now.ms - 24 * 3600e3).some((m) => RX_CONFIRMA.test(m.text) && !RX_CANCELA.test(m.text))) {
    return { saltar: 'ya confirmó' };
  }
  return { enviar: msgManana(fp), imagen: false };
}

function decidirRefuerzo(fp, msgs, now, ctx) {
  if (ctx.sent[`m5a:${fp.id}`]) return { saltar: 'ya recibió el recordatorio del domingo' };
  if (entrantesDesde(msgs, now.ms - 48 * 3600e3).some((m) => RX_CANCELA.test(m.text))) return { saltar: 'canceló/reagenda' };
  const otra = otraHoraDesde(fp, msgs, now.ms - 48 * 3600e3);
  if (otra) return { alerta: `el chat menciona otra hora → «${otra}» — revisar a mano` };
  return { enviar: msgRefuerzo(fp, now), imagen: true };
}

function decidirNoShow(fp, msgs, now, ctx, plantilla) {
  // ¿la persona tiene otro FP posterior a este (aunque sea hoy y ya haya pasado)? → ya reagendó
  const otros = (ctx.fpsPorPersona && ctx.fpsPorPersona.get(fp.personId)) || [];
  if (otros.some((o) => o.id !== fp.id && o.classMs > fp.classMs)) return { saltar: 'ya tiene un FP nuevo agendado' };
  const desdeClase = entrantesDesde(msgs, fp.classMs);
  if (desdeClase.some((m) => RX_ASISTIO.test(m.text))) return { saltar: 'dice que ya asistió' };
  if (desdeClase.some((m) => RX_NO_INTERES.test(m.text))) return { alerta: 'dice que no le interesa — revisar' };
  if (desdeClase.some((m) => RX_REAGENDO_DICHO.test(m.text))) return { alerta: 'dice que reagenda, pero no hay FP nuevo en Pipedrive — crear la actividad' };
  if (desdeClase.some((m) => RX_AVISA.test(m.text))) return { saltar: 'dijo que avisa' };
  if (msgs.some((m) => msgMs(m) != null && msgMs(m) >= now.ms - 3 * 3600e3)) return { saltar: 'conversación activa (mensajes hace <3h)' };
  if (plantilla === 'reagendo' && msgs.some((m) => m.out && msgMs(m) != null && msgMs(m) > fp.classMs)) {
    return { saltar: 'ya se le escribió después de la clase' };
  }
  if (entrantesDesde(msgs, now.ms - 72 * 3600e3).some((m) => RX_BIENESTAR.test(m.text))) {
    return plantilla === 'reagendo' ? { enviar: msgBienestar(fp), imagen: false } : { saltar: 'está enfermo/de viaje' };
  }
  const texto = plantilla === 'sabado' ? msgSabado(fp) : plantilla === 'domingo' ? msgDomingoNoShow(fp) : msgReagendo(fp, now);
  return { enviar: texto, imagen: false };
}

// ── qué FP toca cada módulo ──
async function candidatosDe(key, cfg, now) {
  const tok = cfg.pipedriveToken;
  const hoy = now.date;
  const pasados = (fps, graciaMin) => fps.filter((f) => f.classMs + graciaMin * 60e3 <= now.ms);
  // todos los FP (de `desde` a +14 días) agrupados por persona, para saber si ya reagendó
  const porPersonaMapa = async (desde) => {
    const todos = await fpsEntre(tok, desde, sumarDias(hoy, 14));
    const mapa = new Map();
    for (const f of todos) mapa.set(f.personId, [...(mapa.get(f.personId) || []), f]);
    return mapa;
  };
  // un solo FP por persona (el más reciente) para los reagendos semanales
  const porPersona = (fps) => [...new Map(fps.map((f) => [f.personId || f.id, f])).values()];
  const rango = (fps, desde, hasta) => fps.filter((f) => { const m = f.hour * 60 + f.min; return m >= desde && m < hasta; });

  switch (key) {
    case 'm1': {
      const fps = await fpsEntre(tok, hoy, hoy);
      const ventana = cfg.sendWindowH * 3600e3;
      return { lista: fps.filter((f) => f.classMs > now.ms && f.classMs - now.ms <= ventana), total: fps.length,
        decidir: (fp, msgs, ctx) => decidirRecordatorio2h(fp, msgs, now, cfg) };
    }
    case 'manana': {
      const fps = await fpsEntre(tok, hoy, hoy);
      // solo clases lejos de la ventana del recordatorio 2h, para no mandar dos mensajes seguidos
      return { lista: porPersona(fps.filter((f) => f.classMs - now.ms > (cfg.sendWindowH + 1) * 3600e3 && f.hour >= cfg.mananaDesdeHora)), total: fps.length,
        decidir: (fp, msgs, ctx) => decidirManana(fp, msgs, now, ctx) };
    }
    case 'm2': {
      const fps = await fpsEntre(tok, sumarDias(hoy, 1), sumarDias(hoy, 1));
      return { lista: porPersona(fps), total: fps.length, decidir: (fp, msgs, ctx) => decidirRefuerzo(fp, msgs, now, ctx) };
    }
    case 'm3': case 'm4': {
      const fps = await fpsEntre(tok, hoy, hoy);
      const ini = (now.dow === 6 ? 7 : 6) * 60;
      const lista = key === 'm3' ? rango(pasados(fps, 90), ini, 11 * 60 + 30) : rango(pasados(fps, 60), 11 * 60 + 30, 18 * 60 + 30);
      return { lista, total: fps.length, fpsPorPersona: await porPersonaMapa(fps.length ? fps[0].date : hoy), decidir: (fp, msgs, ctx) => decidirNoShow(fp, msgs, now, ctx, 'reagendo') };
    }
    case 'm7': {
      const ayer = sumarDias(hoy, -1);
      const fps = await fpsEntre(tok, ayer, ayer);
      return { lista: fps, total: fps.length, fpsPorPersona: await porPersonaMapa(fps.length ? fps[0].date : hoy), decidir: (fp, msgs, ctx) => decidirNoShow(fp, msgs, now, ctx, 'reagendo') };
    }
    case 'm6': {
      const fps = pasados(await fpsEntre(tok, sumarDias(hoy, -5), hoy), 60);
      return { lista: porPersona(fps), total: fps.length, fpsPorPersona: await porPersonaMapa(fps.length ? fps[0].date : hoy), decidir: (fp, msgs, ctx) => decidirNoShow(fp, msgs, now, ctx, 'sabado') };
    }
    case 'et': {
      const fps = await fpsEntre(tok, hoy, sumarDias(hoy, 14));
      const { etiquetados = {} } = await chrome.storage.local.get('etiquetados');
      const lista = porPersona(fps).filter((f) => !etiquetados['p' + (f.personId || f.id)]).slice(0, MAX_ETIQUETAS_CORRIDA);
      return { lista, total: fps.length, decidir: () => ({ etiquetar: true }) };
    }
    default: return null;
  }
}

// etiquetados['p<personId>'] = fecha ISO (para no abrir el chat de nuevo); se olvida a los 60 días
async function marcarEtiquetado(personId) {
  const { etiquetados = {} } = await chrome.storage.local.get('etiquetados');
  const limite = Date.now() - 60 * 86400e3;
  for (const k of Object.keys(etiquetados)) if (Date.parse(etiquetados[k]) < limite) delete etiquetados[k];
  etiquetados['p' + personId] = new Date().toISOString();
  await chrome.storage.local.set({ etiquetados });
}

// ── registro de envíos y de toques por teléfono ──
// sent[`${modulo}:${actividad}`] = { estado: 'intento'|'enviado'|'previo', at }
async function marcarSent(clave, estado) {
  const { sent = {} } = await chrome.storage.local.get('sent');
  sent[clave] = { estado, at: new Date().toISOString() };
  await chrome.storage.local.set({ sent: limpiarSent(sent) });
}
async function desmarcarSent(clave) {
  const { sent = {} } = await chrome.storage.local.get('sent');
  delete sent[clave];
  await chrome.storage.local.set({ sent });
}
function limpiarSent(sent, dias = 14) {
  const limite = Date.now() - dias * 86400e3;
  const out = {};
  for (const [k, v] of Object.entries(sent)) {
    const t = Date.parse(typeof v === 'string' ? v : v && v.at);
    if (t > limite) out[k] = v;
  }
  return out;
}
// toques[últimos 9 dígitos] = [{ mod, act, at }]
async function registrarToque(phone, mod, act) {
  const { toques = {} } = await chrome.storage.local.get('toques');
  const k = ultimos9(phone);
  const limite = Date.now() - 14 * 86400e3;
  toques[k] = [...(toques[k] || []).filter((t) => Date.parse(t.at) > limite), { mod, act, at: new Date().toISOString() }];
  await chrome.storage.local.set({ toques });
}
async function frenoReagendo(phone) {
  const { toques = {} } = await chrome.storage.local.get('toques');
  const lista = (toques[ultimos9(phone)] || []).filter((t) => REAGENDOS.has(t.mod) && Date.parse(t.at) > Date.now() - 14 * 86400e3);
  if (lista.length >= 3) return 'ya recibió 3 reagendos (lead frío)';
  if (lista.some((t) => Date.parse(t.at) > Date.now() - 48 * 3600e3)) return 'ya recibió un reagendo en las últimas 48h';
  return null;
}

// ── corrida de un módulo ──
let cola = Promise.resolve();
function encolar(key, reason, programado) {
  cola = cola.then(() => correrModulo(key, reason, programado)).catch((e) => log({ level: 'error', msg: `${key}: ${e.message || e}` }));
  return cola;
}

async function correrModulo(key, reason, programado) {
  const cfg = await getConfig();
  const now = limaNow();
  const manual = reason === 'manual';
  const mod = MODULOS[key];
  const modo = modoDe(cfg, key);
  const nombre = mod.nombre;

  if (!cfg.enabled && !manual) return;
  if (modo === 'off' && !manual) return;
  if (!cfg.pipedriveToken) { await log({ level: 'error', msg: 'Falta el token de Pipedrive (Opciones).' }); return; }
  if (key === 'm5' && now.dow !== 0) { await log({ level: 'info', msg: `${nombre}: solo corre los domingos.` }); return; }
  if (key === 'm1' && !manual && (!cfg.days.includes(now.dow) || now.hour < cfg.startHour || now.hour > cfg.endHour)) return;
  // nunca escribir de madrugada ni de noche, aunque la PC se haya prendido tarde
  const minDia = now.hour * 60 + now.min;
  if (minDia < 6 * 60 || minDia > 21 * 60 + 30) {
    if (manual) await log({ level: 'info', msg: `${nombre}: fuera del horario permitido (6:00–21:30), no se envía.` });
    return;
  }
  // corrida programada que llega muy tarde (PC apagada): no tiene sentido
  if (programado && Date.now() - programado > 3 * 3600e3) {
    await log({ level: 'info', msg: `${nombre}: la PC estuvo apagada a la hora programada, se omite.` });
    return;
  }
  const { waActivity = 0 } = await chrome.storage.local.get('waActivity');
  if (!manual && Date.now() - waActivity < 4 * 60e3) {
    chrome.alarms.create(`retry:${key}:${programado || ''}`, { delayInMinutes: 10 });
    await log({ level: 'info', msg: `${nombre}: WhatsApp Web en uso, reintento en 10 min.` });
    return;
  }

  await chrome.storage.local.set({ lock: Date.now() });
  const inicio = Date.now();
  const latido = setInterval(() => { chrome.runtime.getPlatformInfo(() => {}); chrome.storage.local.set({ lock: Date.now() }); }, 20000);
  const resumen = { enviados: [], simulados: [], saltados: [], alertas: [] };
  const real = modo === 'real';
  try {
    // domingo: el módulo tiene dos partes
    const partes = key === 'm5' ? ['m5a', 'm5b'] : [key];
    let enviadosCorrida = 0;
    const tocados = new Set(); // un solo mensaje por teléfono por corrida
    let fallosEtiqueta = 0;
    for (const parte of partes) {
     try {
      const plan = parte === 'm5a' ? await planDomingoLunes(cfg, now)
        : parte === 'm5b' ? await planDomingoNoShows(cfg, now)
        : await candidatosDe(parte, cfg, now);
      if (!plan.lista.length) {
        if (key === 'm1') {
          const fps = await fpsEntre(cfg.pipedriveToken, now.date, now.date);
          const fps_hoy = fps.map((f) => { const falta = (f.classMs - now.ms) / 3600e3; return `${f.personName || f.subject} · ${fmtHora(f.hour, f.min)} · ${falta <= 0 ? 'ya pasó' : `faltan ${falta.toFixed(1)}h`}`; });
          await log({ level: 'info', msg: `${nombre}: ${fps.length} FP hoy · ninguno a ≤${cfg.sendWindowH}h.`, detalle: fps_hoy.length ? { fps_hoy } : undefined });
        } else {
          resumen.saltados.push(`${parte === 'm5a' ? 'FP del lunes' : parte === 'm5b' ? 'no-shows de la semana' : 'nadie'}: sin candidatos`);
        }
        continue;
      }

      const tab = await waTab();
      await sleep(1000);
      await asegurarScript(tab.id);
      const status = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn, 90000);
      if (!status) throw new Error('WhatsApp Web no cargó o no tiene sesión iniciada.');
      if (cfg.expectedNumber) {
        if (!status.wid) throw new Error('No pude leer el número de la sesión de WhatsApp Web. No se envió nada.');
        if (status.wid !== String(cfg.expectedNumber).replace(/\D/g, '')) throw new Error(`Número de WhatsApp Web incorrecto (${status.wid}). No se envió nada.`);
      }
      const bloqueados = new Set(cfg.blocklist.map(ultimos9).filter((x) => x.length === 9));

      for (const fp of plan.lista) {
        const etiqueta = `${fp.personName || fp.subject} · ${fp.date !== now.date ? DIAS[diaSemana(fp.date)] + ' ' : ''}${fmtHora(fp.hour, fp.min)}`;
        const clave = `${parte}:${fp.id}`;
        try {
          const ahora = limaNow();
          if (ahora.hour * 60 + ahora.min > 21 * 60 + 30) { resumen.saltados.push(`${etiqueta} (pasó la hora límite 21:30)`); continue; }
          if (enviadosCorrida >= cfg.maxEnviosCorrida) { resumen.saltados.push(`${etiqueta} (tope de ${cfg.maxEnviosCorrida} envíos por corrida)`); continue; }
          const { sent = {} } = await chrome.storage.local.get('sent');
          if (sent[clave] || (parte === 'm1' && sent[fp.id])) { resumen.saltados.push(`${etiqueta} (ya enviado)`); continue; }

          const { waActivity: act = 0 } = await chrome.storage.local.get('waActivity');
          if (!manual && act > inicio) {
            chrome.alarms.create(`retry:${key}:${programado || ''}`, { delayInMinutes: 10 });
            resumen.alertas.push('WhatsApp Web empezó a usarse durante la corrida: pausa, reintento en 10 min');
            break;
          }

          const phone = await phoneOf(fp.personId, cfg.pipedriveToken);
          if (!phone) { resumen.alertas.push(`${etiqueta}: sin celular válido en Pipedrive (${ultimoTelCrudo ? 'tiene «' + ultimoTelCrudo + '»' : 'campo teléfono vacío'})`); continue; }
          if (bloqueados.has(ultimos9(phone))) { resumen.saltados.push(`${etiqueta} (bloqueado)`); continue; }
          if (tocados.has(ultimos9(phone))) { resumen.saltados.push(`${etiqueta} (ya se le escribió en esta corrida)`); continue; }
          if (REAGENDOS.has(parte)) {
            const freno = await frenoReagendo(phone);
            if (freno) { resumen.saltados.push(`${etiqueta} (${freno})`); continue; }
          }

          const chat = await openChat(tab.id, phone);
          if (!chat) { resumen.alertas.push(`${etiqueta}: el chat no abrió`); continue; }
          if (chat.invalid) { resumen.alertas.push(`${etiqueta}: número sin WhatsApp`); continue; }
          if (!chat.ready) { resumen.alertas.push(`${etiqueta}: no se pudo confirmar que el chat abierto sea el de ${phone}`); continue; }
          if (chat.hasDraft) { resumen.alertas.push(`${etiqueta}: el chat tiene un borrador escrito, no se tocó`); continue; }
          const msgs = chat.messages || [];
          if (msgs.length && !msgs.some((m) => m.date)) { resumen.alertas.push(`${etiqueta}: no pude leer las fechas del chat, no se envió por seguridad`); continue; }

          const d = plan.decidir(fp, msgs, { sent, fpsPorPersona: plan.fpsPorPersona || new Map() });
          if (d.etiquetar) {
            if (!real) { resumen.simulados.push(`${etiqueta} · ${phone} → se le pondría la etiqueta ${ETIQUETA_FP}`); continue; }
            const r = await ask(tab.id, { type: 'etiquetar', nombre: ETIQUETA_FP, phone });
            if (r && r.ok) {
              await marcarEtiquetado(fp.personId || fp.id);
              if (r.ya) resumen.saltados.push(`${etiqueta} (ya tenía la etiqueta)`);
              else resumen.enviados.push(`${etiqueta} · ${phone} · 🏷️ ${ETIQUETA_FP}`);
              fallosEtiqueta = 0;
            } else {
              resumen.alertas.push(`${etiqueta}: no se pudo etiquetar (${(r && r.error) || 'sin respuesta'})`);
              // si falla dos veces seguidas es que WhatsApp cambió: no seguir abriendo chats
              if (++fallosEtiqueta >= 2) { resumen.alertas.push('Etiquetar: 2 fallos seguidos, se detiene esta corrida'); break; }
            }
            await sleep(1500 + Math.random() * 1500);
            continue;
          }
          if (d.saltar) { if (d.marcar) await marcarSent(clave, d.marcar); resumen.saltados.push(`${etiqueta} (${d.saltar})`); continue; }
          if (d.alerta) { resumen.alertas.push(`${etiqueta}: ${d.alerta}`); continue; }

          tocados.add(ultimos9(phone));
          if (!real) { resumen.simulados.push(`${etiqueta} · ${phone} → ${d.enviar.replace(/\n+/g, ' ')}`); continue; }

          await marcarSent(clave, 'intento');
          const r = await ask(tab.id, { type: 'sendReminder', text: d.enviar, phone, header: chat.header, conImagen: !!d.imagen });
          if (r && r.ok) {
            await marcarSent(clave, 'enviado');
            await registrarToque(phone, parte, fp.id);
            enviadosCorrida++;
            resumen.enviados.push(`${etiqueta} · ${phone}${r.imagen ? ' · 🖼️' : ''} · «${d.enviar.replace(/\n+/g, ' ')}»`);
            if (r.aviso) resumen.alertas.push(`${etiqueta}: ${r.aviso}`);
          } else if (r && r.noEnviado) {
            await desmarcarSent(clave);
            resumen.alertas.push(`${etiqueta}: no se envió (${r.error})`);
          } else {
            await registrarToque(phone, parte, fp.id);
            resumen.alertas.push(`${etiqueta}: dudoso — se tocó Enviar pero no se confirmó (${(r && r.error) || 'sin respuesta'}). Revisar el chat; no se reintenta solo.`);
          }
          await sleep(3000 + Math.random() * 4000);
        } catch (e) {
          resumen.alertas.push(`${etiqueta}: ${e.message || e}`);
        }
      }
     } catch (e) {
      // falló WhatsApp Web o Pipedrive para esta parte: reintentar en 10 min (hasta 3h de atraso)
      resumen.alertas.push(`${parte}: ${e.message || e}`);
      if (!manual) chrome.alarms.create(`retry:${key}:${programado || ''}`, { delayInMinutes: 10 });
     }
    }
  } catch (e) {
    resumen.alertas.push(String(e.message || e));
  } finally {
    clearInterval(latido);
    await chrome.storage.local.set({ lock: 0 });
    const linea = [
      resumen.enviados.length && `✅ ${resumen.enviados.length} enviados`,
      resumen.simulados.length && `🧪 ${resumen.simulados.length} simulados`,
      resumen.saltados.length && `⏭️ ${resumen.saltados.length} saltados`,
      resumen.alertas.length && `⚠️ ${resumen.alertas.length} para revisar: ${resumen.alertas[0]}`,
    ].filter(Boolean).join(' · ');
    if (linea) {
      await log({ level: resumen.alertas.length ? 'warn' : 'ok', mod: key, msg: `${nombre}${real ? '' : ' (simulación)'}: ${linea}`, detalle: resumen });
      if (resumen.enviados.length || resumen.alertas.length || manual) notify(`Rurush FP · ${nombre}`, linea);
    }
  }
}

// ── domingo ──
async function planDomingoLunes(cfg, now) {
  const lunes = sumarDias(now.date, 1);
  const fps = await fpsEntre(cfg.pipedriveToken, lunes, lunes);
  return {
    lista: [...new Map(fps.map((f) => [f.personId || f.id, f])).values()],
    decidir: (fp, msgs) => {
      if (entrantesDesde(msgs, now.ms - 48 * 3600e3).some((m) => RX_CANCELA.test(m.text))) return { saltar: 'pidió reagendar' };
      const otra = otraHoraDesde(fp, msgs, now.ms - 48 * 3600e3);
      if (otra) return { alerta: `el chat menciona otra hora → «${otra}» — revisar a mano` };
      if (entrantesDesde(msgs, now.ms - 24 * 3600e3).some((m) => RX_CONFIRMA.test(m.text) && !RX_CANCELA.test(m.text))) return { saltar: 'ya confirmó' };
      return { enviar: msgDomingoLunes(fp), imagen: true };
    },
  };
}
async function planDomingoNoShows(cfg, now) {
  const tok = cfg.pipedriveToken;
  const todos = await fpsEntre(tok, sumarDias(now.date, -6), sumarDias(now.date, 14));
  const fpsPorPersona = new Map();
  for (const f of todos) fpsPorPersona.set(f.personId, [...(fpsPorPersona.get(f.personId) || []), f]);
  const fps = todos.filter((f) => f.date < now.date && f.classMs < now.ms);
  const lista = [...new Map(fps.map((f) => [f.personId || f.id, f])).values()];
  return { lista, fpsPorPersona, decidir: (fp, msgs, ctx) => decidirNoShow(fp, msgs, now, ctx, 'domingo') };
}


// ───────────────────────── reporte del día ─────────────────────────
const diaLima = (iso) => new Date(Date.parse(iso) + LIMA_OFFSET_H * 3600e3).toISOString().slice(0, 10);

async function reporte(dia) {
  const { logs = [], config = {}, sent = {} } = await chrome.storage.local.get(['logs', 'config', 'sent']);
  const deDia = logs.filter((l) => diaLima(l.at) === dia).reverse();
  const lineas = [
    `REPORTE RURUSH FP · ${dia} · v${chrome.runtime.getManifest().version}`,
    `activa: ${config.enabled !== false} · ventana 2h ≤${config.sendWindowH || 4}h · corridas: ${deDia.length}`,
    `módulos: ${Object.entries(MODULOS).map(([k, m]) => `${m.nombre}=${modoDe(config, k)}`).join(' · ')}`,
    `registro de enviados (últimos 14 días): ${Object.keys(sent).length}`,
    '',
  ];
  for (const l of deDia) {
    const d = new Date(Date.parse(l.at) + LIMA_OFFSET_H * 3600e3);
    const t = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    lineas.push(`[${t}] ${l.msg}`);
    for (const [k, arr] of Object.entries(l.detalle || {})) for (const x of arr) lineas.push(`    ${k}: ${x}`);
  }
  return { texto: lineas.join('\n'), corridas: deDia.length };
}

async function descargarReporte(cuando = Date.now()) {
  const dia = utcToLima(cuando - 10 * 60e3).date; // día al que corresponde la alarma de las 21:05
  const { texto, corridas } = await reporte(dia);
  if (!corridas) return;
  await chrome.downloads.download({
    url: 'data:text/plain;charset=utf-8,' + encodeURIComponent(texto),
    filename: `RurushFP/reporte-${dia}.txt`,
    conflictAction: 'overwrite',
    saveAs: false,
  });
}

// ───────────────────────── disparadores ─────────────────────────
// próxima vez que sean las h:m en Lima, en ms
function proximaLima(h, m) {
  const ahora = Date.now();
  const lima = new Date(ahora + LIMA_OFFSET_H * 3600e3);
  let t = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate(), h, m) - LIMA_OFFSET_H * 3600e3;
  if (t <= ahora) t += 86400e3;
  return t;
}

// Al instalar o cambiar Opciones se rehacen todas las alarmas. Al prender Chrome solo se
// crean las que falten: así una alarma que no sonó con la PC apagada suena al prender.
async function programar(soloFaltantes = false) {
  const cfg = await getConfig();
  const existentes = new Set((await chrome.alarms.getAll()).map((a) => a.name));
  const crear = (nombre, info) => { if (!soloFaltantes || !existentes.has(nombre)) chrome.alarms.create(nombre, info); };
  if (!soloFaltantes) {
    for (const a of await chrome.alarms.getAll()) if (!a.name.startsWith('retry:')) await chrome.alarms.clear(a.name);
  }
  crear('tick', { delayInMinutes: 1, periodInMinutes: cfg.intervalMin });
  crear('reporte', { when: proximaLima(21, 5), periodInMinutes: 1440 });
  for (const [key, mod] of Object.entries(MODULOS)) {
    const hora = key === 'manana' ? [cfg.mananaHora, 0] : mod.hora;
    if (hora) crear(`mod:${key}`, { when: proximaLima(hora[0], hora[1]), periodInMinutes: mod.cadaMin || 1440 });
  }
}

chrome.runtime.onInstalled.addListener((d) => programar(d.reason !== 'install' && d.reason !== 'update'));
chrome.runtime.onStartup.addListener(() => programar(true));
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'tick') return encolar('m1', 'alarm');
  if (a.name === 'reporte') return descargarReporte(a.scheduledTime);
  const [tipo, key, prog] = a.name.split(':');
  if (tipo === 'mod' && MODULOS[key]) {
    // la alarma diaria se dispara todos los días: aquí se filtra por día de la semana (Lima)
    const dow = new Date(a.scheduledTime + LIMA_OFFSET_H * 3600e3).getUTCDay();
    if (MODULOS[key].dias.includes(dow)) encolar(key, 'alarm', a.scheduledTime);
  }
  if (tipo === 'retry' && MODULOS[key]) encolar(key, 'retry', Number(prog) || undefined);
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'runNow') { encolar(msg.mod || 'm1', 'manual').then(() => reply({ ok: true })); return true; }
  if (msg.type === 'modulos') { reply(Object.fromEntries(Object.entries(MODULOS).map(([k, v]) => [k, v.nombre]))); return false; }
  if (msg.type === 'report') { reporte(limaNow().date).then((r) => reply(r)); return true; }
  if (msg.type === 'downloadReport') { descargarReporte().then(() => reply({ ok: true })); return true; }
  if (msg.type === 'reschedule') { programar().then(() => reply({ ok: true })); return true; }
  if (msg.type === 'waActivity') { chrome.storage.local.set({ waActivity: Date.now() }); }
  if (msg.type === 'probarEtiqueta') {
    (async () => {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      if (!tabs.length) return { ok: false, error: 'abre WhatsApp Web y un chat' };
      await asegurarScript(tabs[0].id);
      return (await ask(tabs[0].id, { type: 'etiquetar', nombre: ETIQUETA_FP })) || { ok: false, error: 'sin respuesta de WhatsApp Web' };
    })().then(reply);
    return true;
  }
  return false;
});

// exportado solo para pruebas en Node
if (typeof module !== 'undefined') {
  module.exports = { analizar, mensaje, horasMencionadas, normPhone, fmtHora, utcToLima, limpiarSent, ultimos9,
    opciones, sumarDias, diaSemana, decidirNoShow, aLas, decidirManana, decidirRefuerzo, msgReagendo, msgManana,
    msgRefuerzo, msgSabado, msgDomingoLunes, msgDomingoNoShow, MODULOS };
}

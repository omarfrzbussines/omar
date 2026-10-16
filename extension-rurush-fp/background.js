// Rurush FP — mensajes automáticos de WhatsApp a los Free Pass, sin gastar uso de Claude.
// Pipedrive (API) dice a quién y cuándo; WhatsApp Web (pestaña de Chrome) lee el chat y envía.
// Módulos: recordatorio 2h, mañana, refuerzo noche anterior, no-shows (1pm, 8pm, día siguiente),
// sábado y domingo. Ver MODULOS.

const GPS = 'https://maps.app.goo.gl/x2K9xZYXsLtzhxuW6';
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
  nutriUrl: '',            // link de la app web del Apps Script de la hoja NUTRICIÓN (termina en /exec)
  nutriLlave: '',          // llave que muestra nu_instalar en ese Apps Script
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

async function pdPut(path, token, body) {
  const url = new URL('https://api.pipedrive.com/v1/' + path);
  url.searchParams.set('api_token', token);
  const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Pipedrive PUT ${path} → HTTP ${r.status}`);
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
        addMs: a.add_time ? Date.parse(String(a.add_time).replace(' ', 'T') + 'Z') : 0,
        asesora: asesoraDe(subj, a.owner_name),
      });
    }
    const pg = res.additional_data && res.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  return out.sort((x, y) => x.classMs - y.classMs);
}

// "FP DANNA APC" → "Danna"; si el asunto no la trae, el dueño de la actividad en Pipedrive.
const NO_ASESORA = /^(FP|FREE|PASS|APC|APL|APV|NUTRI|RURUSH)$/i;
function asesoraDe(subject, owner) {
  const w = String(subject || '').replace(/^(FP|FREE\s*PASS)\b/i, '').trim().split(/\s+/).find((x) => /^[A-ZÁÉÍÓÚÑ]{3,}$/i.test(x) && !NO_ASESORA.test(x));
  const n = w || String(owner || '').trim().split(/\s+/)[0] || '';
  const tildes = { MONICA: 'Mónica', VALERIA: 'Valeria', ALVARO: 'Álvaro' };
  return n ? tildes[n.toUpperCase()] || n[0].toUpperCase() + n.slice(1).toLowerCase() : '';
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

// ─────────────── video del anuncio → campo "Video" de la persona ───────────────
// Las opciones salen del campo de persona "Video" de Pipedrive (se buscan por nombre, 1 h en caché).
async function campoVideo(token) {
  const { campoVideoCache: c } = await chrome.storage.local.get('campoVideoCache');
  if (c && Date.now() - c.at < 3600e3) return c;
  const res = await pd('personFields', token, { limit: 500 });
  const f = (res.data || []).find((x) => /^video$/i.test(String(x.name).trim()));
  if (!f) throw new Error('no existe el campo de persona "Video" en Pipedrive');
  const nuevo = { key: f.key, opciones: (f.options || []).map((o) => ({ id: o.id, label: o.label })), at: Date.now() };
  await chrome.storage.local.set({ campoVideoCache: nuevo });
  return nuevo;
}

// Busca a la persona por celular y le llena "Video" si está vacío (nunca cambia uno ya puesto).
// 'pendiente' si todavía no está en Pipedrive (se reintenta con cada tick, hasta 3 días).
async function aplicarVideo(p, reintento = false) {
  const cfg = await getConfig();
  const quien = `${p.header}${p.phone ? ' · ' + p.phone : ''} → Video «${p.label}»`;
  // (sin celular: p.usuario = el @usuario de la cabecera)
  if ((cfg.fbAdsModo || 'sim') !== 'real' && !p.forzar) { await log({ mod: 'fb', msg: `🧪 Video: ${quien} (se llenaría en Pipedrive)` }); return 'sim'; }
  if (!cfg.pipedriveToken) { await log({ mod: 'fb', msg: `⚠️ Video: ${quien} · falta el token de Pipedrive` }); return 'ok'; }
  const campo = await campoVideo(cfg.pipedriveToken);
  // por celular; si el chat solo muestra un @usuario (sin número), por nombre: así lo guardan en Pipedrive
  let ids;
  if (p.phone) {
    const tel = ultimos9(p.phone);
    const res = await pd('persons/search', cfg.pipedriveToken, { term: tel, fields: 'phone', limit: 10 });
    ids = ((res.data && res.data.items) || []).map((i) => i.item)
      .filter((it) => (it.phones || []).some((x) => ultimos9(x) === tel)).map((it) => it.id);
  } else {
    const u = p.usuario.toLowerCase();
    const res = await pd('persons/search', cfg.pipedriveToken, { term: u.replace(/^@/, ''), fields: 'name', limit: 10 });
    ids = ((res.data && res.data.items) || []).map((i) => i.item)
      .filter((it) => String(it.name || '').trim().toLowerCase().replace(/^@?/, '@') === u).map((it) => it.id);
  }
  if (!ids.length) {
    if (!reintento) await log({ mod: 'fb', msg: `⏳ Video: ${quien} · aún no está en Pipedrive, se reintenta cada ${cfg.intervalMin} min (3 días)` });
    return 'pendiente';
  }
  const hechos = [], otros = [];
  for (const id of ids) {
    const per = (await pd(`persons/${id}`, cfg.pipedriveToken)).data || {};
    const actual = per[campo.key];
    if (actual && String(actual) !== String(p.videoId)) {
      const o = campo.opciones.find((x) => String(x.id) === String(actual));
      otros.push(`${per.name} ya tenía «${o ? o.label : actual}»`);
    } else if (!actual) {
      await pdPut(`persons/${id}`, cfg.pipedriveToken, { [campo.key]: p.videoId });
      hechos.push(per.name);
    } else hechos.push(`${per.name} (ya lo tenía)`);
  }
  await log({ mod: 'fb', msg: `🎬 Video: ${quien}${hechos.length ? ' · ' + hechos.join(', ') : ''}${otros.length ? ' · no se cambió: ' + otros.join(', ') : ''}` });
  return 'ok';
}

async function recibirVideo(p) {
  if (p.error) return log({ mod: 'fb', msg: `⚠️ Video: ${p.header} · ${p.error}` });
  if (!p.phone && /^@\S+$/.test(String(p.header).trim())) p.usuario = String(p.header).trim();
  if (!p.phone && !p.usuario) return log({ mod: 'fb', msg: `⚠️ Video: ${p.header} → «${p.label}» · no pude leer el celular del chat (¿contacto guardado?): llénalo a mano` });
  // cada celular una sola vez (el chat se puede abrir muchas veces)
  const { videosAplicados = {} } = await chrome.storage.local.get('videosAplicados');
  const k = p.phone ? ultimos9(p.phone) : p.usuario.toLowerCase();
  if (!p.forzar && videosAplicados[k] === p.videoId) return;
  let r;
  try { r = await aplicarVideo(p); } catch (e) { return log({ mod: 'fb', msg: `⚠️ Video: ${p.header} · ${e.message || e}` }); }
  if (r === 'sim') return; // en simulación no se anota: al pasar a real se llena
  const limite = Date.now() - 60 * 864e5;
  for (const x of Object.keys(videosAplicados)) if (videosAplicados[x + ':at'] && Date.parse(videosAplicados[x + ':at']) < limite) { delete videosAplicados[x]; delete videosAplicados[x + ':at']; }
  videosAplicados[k] = p.videoId;
  videosAplicados[k + ':at'] = new Date().toISOString();
  await chrome.storage.local.set({ videosAplicados });
  if (r === 'pendiente') {
    const { videosPendientes = [] } = await chrome.storage.local.get('videosPendientes');
    await chrome.storage.local.set({ videosPendientes: [...videosPendientes.filter((x) => (x.phone ? ultimos9(x.phone) : String(x.usuario).toLowerCase()) !== k), { ...p, desde: Date.now() }] });
  }
}

async function reintentarVideos() {
  const { videosPendientes = [] } = await chrome.storage.local.get('videosPendientes');
  if (!videosPendientes.length) return;
  const quedan = [];
  for (const p of videosPendientes) {
    if (Date.now() - p.desde > 3 * 864e5) { await log({ mod: 'fb', msg: `⚠️ Video: ${p.header} · ${p.phone || p.usuario} no apareció en Pipedrive en 3 días: «${p.label}» llénalo a mano` }); continue; }
    try { if ((await aplicarVideo(p, true)) === 'pendiente') quedan.push(p); } catch { quedan.push(p); }
  }
  await chrome.storage.local.set({ videosPendientes: quedan });
}

// Huella (dHash) de una miniatura de otro dominio, que content.js no puede leer.
async function huellaUrl(url) {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const c = new OffscreenCanvas(9, 8);
  const x = c.getContext('2d');
  x.drawImage(bmp, 0, 0, 9, 8);
  const px = x.getImageData(0, 0, 9, 8).data;
  const g = (i, j) => { const k = (j * 9 + i) * 4; return px[k] * 0.299 + px[k + 1] * 0.587 + px[k + 2] * 0.114; };
  let hash = '';
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i += 4) {
    let v = 0;
    for (let b = 0; b < 4; b++) v = (v << 1) | (g(i + b, j) > g(i + b + 1, j) ? 1 : 0);
    hash += v.toString(16);
  }
  const t = new OffscreenCanvas(72, 72);
  t.getContext('2d').drawImage(bmp, 0, 0, 72, 72);
  const buf = new Uint8Array(await (await t.convertToBlob({ type: 'image/jpeg', quality: 0.7 })).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { hash, thumb: 'data:image/jpeg;base64,' + btoa(bin) };
}

// ───────────────────────── WhatsApp Web ─────────────────────────
async function waTab() {
  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  // Con varias pestañas de WhatsApp (otra extensión abrió la suya) solo una tiene la sesión:
  // se usa la que muestra la lista de chats.
  if (tabs.length > 1) {
    for (const t of tabs) {
      await asegurarScript(t.id);
      const r = await ask(t.id, { type: 'ping' });
      if (r && r.loggedIn) return t;
    }
  }
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

// Turno compartido con Rurush Difusiones (ver turnoWA en content.js): si Difusiones está
// enviando, esta corrida no entra y se reintenta en 10 min; mientras corre, se renueva cada minuto.
const QUIEN_TURNO = 'Rurush FP';
let turnoTimer = null, turnoTab = null;
async function tomarTurno(tabId) {
  const r = await ask(tabId, { type: 'turno', accion: 'tomar', quien: QUIEN_TURNO, ms: 4 * 60e3 });
  if (r && r.ok === false) throw new Error(`WhatsApp Web ocupado: ${r.quien} está enviando. Reintento en 10 min.`);
  turnoTab = tabId;
  clearInterval(turnoTimer);
  turnoTimer = setInterval(() => ask(turnoTab, { type: 'turno', accion: 'tomar', quien: QUIEN_TURNO, ms: 4 * 60e3 }), 60e3);
}
async function soltarTurno() {
  clearInterval(turnoTimer); turnoTimer = null;
  if (turnoTab != null) { await ask(turnoTab, { type: 'turno', accion: 'soltar', quien: QUIEN_TURNO }); turnoTab = null; }
}

// Mensaje claro cuando WhatsApp Web no está listo.
async function errorWA(tabId) {
  const r = await ask(tabId, { type: 'ping' });
  if (r && r.qr) return 'WhatsApp Web pide escanear el código QR (se cerró la sesión): escanéalo con el celular de esta línea.';
  if (r && r.otraVentana) return 'WhatsApp Web estaba abierto en otra pestaña; se tomó aquí, se reintenta en 10 min.';
  return 'WhatsApp Web no cargó o no tiene sesión iniciada.';
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

// ─────────────── módulo "Chats de anuncios": leads nuevos de Pipedrive ───────────────
// Cada 30 min (8:00–21:00): toma las personas creadas en Pipedrive en los últimos 3 días que todavía
// no revisó, abre su chat de WhatsApp (por celular, o por @usuario si no tiene), y si el chat vino de
// un anuncio: llena "Video" (por la miniatura) y pone la etiqueta FB ADS. Si el chat estaba sin leer,
// lo deja otra vez sin leer. Si alguien empieza a usar WhatsApp Web, para y sigue en la próxima vuelta.
const MAX_ANUNCIOS_CORRIDA = 15;

const distanciaHex = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
};
async function videoDeHuella(hash) {
  const { videosAnuncio = {} } = await chrome.storage.local.get('videosAnuncio');
  let mejor = null;
  for (const [h, v] of Object.entries(videosAnuncio)) {
    const d = distanciaHex(h, hash);
    if (d <= 12 && (!mejor || d < mejor.d)) mejor = { ...v, d };
  }
  return mejor;
}

// Llena Video de una persona ya conocida (solo si está vacío). Devuelve el texto para el resumen.
async function videoAPersona(personId, videoId, token) {
  const campo = await campoVideo(token);
  const per = (await pd(`persons/${personId}`, token)).data || {};
  const actual = per[campo.key];
  if (actual && String(actual) !== String(videoId)) {
    const o = campo.opciones.find((x) => String(x.id) === String(actual));
    return `ya tenía «${o ? o.label : actual}», no se cambió`;
  }
  if (actual) return 'ya lo tenía';
  await pdPut(`persons/${personId}`, token, { [campo.key]: videoId });
  return 'llenado';
}

async function guardarPorAprender(hash, thumb, lead) {
  const { videosPorAprender = {} } = await chrome.storage.local.get('videosPorAprender');
  const v = videosPorAprender[hash] || { thumb: thumb || '', leads: [], desde: new Date().toISOString() };
  if (!v.leads.some((l) => (lead.personId && l.personId === lead.personId) || (lead.header && l.header === lead.header))) v.leads.push(lead);
  videosPorAprender[hash] = v;
  await chrome.storage.local.set({ videosPorAprender });
}

async function correrAnuncios(reason) {
  const cfg = await getConfig();
  const manual = reason === 'manual';
  const modo = cfg.fbAdsModo || 'sim';
  const real = modo === 'real';
  const now = limaNow();
  if (!manual && (!cfg.enabled || modo === 'off' || now.hour < 8 || now.hour >= 21)) return;
  if (!cfg.pipedriveToken) { await log({ level: 'error', mod: 'fb', msg: 'Chats de anuncios: falta el token de Pipedrive (Opciones).' }); return; }
  const { waActivity = 0 } = await chrome.storage.local.get('waActivity');
  if (!manual && Date.now() - waActivity < 4 * 60e3) return; // alguien usa WhatsApp Web: la próxima vuelta

  const resumen = { anuncios: [], sinAnuncio: [], alertas: [], videosNuevos: [] };
  const inicio = Date.now();
  await chrome.storage.local.set({ lock: Date.now() });
  const latido = setInterval(() => { chrome.runtime.getPlatformInfo(() => {}); chrome.storage.local.set({ lock: Date.now() }); }, 20000);
  try {
    // personas nuevas (últimos 3 días) que todavía no se revisaron
    const { personasRevisadas = {} } = await chrome.storage.local.get('personasRevisadas');
    const desde = Date.now() - 3 * 864e5;
    const res = await pd('persons', cfg.pipedriveToken, { limit: 200, sort: 'add_time DESC' });
    const campo = await campoVideo(cfg.pipedriveToken);
    const nuevas = (res.data || []).filter((p) => Date.parse(p.add_time.replace(' ', 'T') + 'Z') >= desde)
      .filter((p) => { const r = personasRevisadas[p.id]; return !r || (r.sim && real) || (r.reintentar && r.intentos < 3); });
    if (!nuevas.length) return;

    const tab = await waTab();
    await sleep(1000);
    await asegurarScript(tab.id);
    const status = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn, 90000);
    if (!status) throw new Error(await errorWA(tab.id));
    if (cfg.expectedNumber && status.wid !== String(cfg.expectedNumber).replace(/\D/g, '')) throw new Error(`Número de WhatsApp Web incorrecto (${status.wid}).`);
    await tomarTurno(tab.id);
    const bloqueados = new Set(cfg.blocklist.map(ultimos9).filter((x) => x.length === 9));

    const anotar = async (id, dato) => {
      const { personasRevisadas: pr = {} } = await chrome.storage.local.get('personasRevisadas');
      const previo = pr[id] || {};
      pr[id] = { at: new Date().toISOString(), ...dato, intentos: (previo.intentos || 0) + (dato.reintentar ? 1 : 0) };
      for (const k of Object.keys(pr)) if (Date.parse(pr[k].at) < Date.now() - 30 * 864e5) delete pr[k];
      await chrome.storage.local.set({ personasRevisadas: pr });
    };

    let hechos = 0;
    for (const p of nuevas) {
      if (hechos >= MAX_ANUNCIOS_CORRIDA) break;
      const { waActivity: act = 0 } = await chrome.storage.local.get('waActivity');
      if (!manual && act > inicio) { resumen.alertas.push('alguien empezó a usar WhatsApp Web: sigue en la próxima vuelta'); break; }
      const nombre = String(p.name || '').trim();
      if (p[campo.key]) { await anotar(p.id, { listo: 'ya tenía Video' }); continue; }
      const phone = (p.phone || []).map((x) => normPhone(x.value)).find(Boolean) || null;
      const usuario = !phone && /^@\S+$/.test(nombre) ? nombre : null;
      if (!phone && !usuario) { await anotar(p.id, { listo: 'sin celular' }); resumen.alertas.push(`${nombre}: sin celular ni @usuario en Pipedrive`); continue; }
      if (phone && bloqueados.has(ultimos9(phone))) { await anotar(p.id, { listo: 'bloqueado' }); continue; }
      hechos++;
      const quien = `${nombre}${phone ? ' · ' + phone : ''}`;
      try {
        // ¿estaba sin leer? (para dejarlo igual al terminar)
        const antes = await ask(tab.id, { type: 'noLeidoDe', phone, titulo: usuario });
        let header;
        if (phone) {
          const chat = await openChat(tab.id, phone);
          if (!chat) { await anotar(p.id, { reintentar: true }); resumen.alertas.push(`${quien}: el chat no abrió`); continue; }
          if (chat.invalid) { await anotar(p.id, { listo: 'sin WhatsApp' }); resumen.alertas.push(`${quien}: número sin WhatsApp`); continue; }
          if (!chat.ready) { await anotar(p.id, { reintentar: true }); resumen.alertas.push(`${quien}: no se pudo confirmar que el chat abierto sea el suyo`); continue; }
          header = chat.header;
        } else {
          const r = await ask(tab.id, { type: 'abrirPorTitulo', titulo: usuario });
          if (!r || !r.ok) { await anotar(p.id, { reintentar: true }); resumen.alertas.push(`${quien}: ${(r && r.error) || 'el chat no abrió'}`); continue; }
          header = usuario;
        }
        const a = await ask(tab.id, { type: 'leerAnuncio', phone });
        if (!a || !a.ok) { await anotar(p.id, { reintentar: true }); resumen.alertas.push(`${quien}: ${(a && a.error) || 'sin respuesta de WhatsApp Web'}`); continue; }
        if (!a.anuncio) {
          if (a.arriba) { await anotar(p.id, { listo: 'no vino de anuncio' }); resumen.sinAnuncio.push(quien); }
          else { await anotar(p.id, { reintentar: true }); resumen.alertas.push(`${quien}: no se llegó al inicio del chat para ver si vino de anuncio`); }
        } else {
          // 1) Video
          let textoVideo;
          const video = a.hash ? await videoDeHuella(a.hash) : null;
          if (!a.hash) textoVideo = '⚠️ no pude leer la miniatura';
          else if (!video) {
            await guardarPorAprender(a.hash, a.thumb, { personId: p.id, header: nombre, phone, red: a.red });
            textoVideo = '🆕 video nuevo (Opciones → Videos por aprender)';
            resumen.videosNuevos.push(quien);
          } else if (!real) textoVideo = `🧪 Video «${video.label}»`;
          else textoVideo = `Video «${video.label}» ${await videoAPersona(p.id, video.id, cfg.pipedriveToken)}`;
          // 2) etiqueta de WhatsApp
          let textoEtiqueta = `🧪 se pondría ${cfg.fbAdsEtiqueta || 'FB ADS'}`;
          if (real) {
            const r = await ask(tab.id, { type: 'etiquetar', nombre: cfg.fbAdsEtiqueta || 'FB ADS', phone });
            textoEtiqueta = r && r.ok ? `🏷️ ${cfg.fbAdsEtiqueta || 'FB ADS'}${r.ya ? ' (ya la tenía)' : ''}` : `⚠️ etiqueta: ${(r && r.error) || 'sin respuesta'}`;
          }
          await anotar(p.id, { listo: 'anuncio', sim: !real });
          resumen.anuncios.push(`${quien} · anuncio de ${a.red} · ${textoVideo} · ${textoEtiqueta}`);
        }
        if (antes && antes.noLeido) {
          const r = await ask(tab.id, { type: 'marcarNoLeido', titulo: header });
          if (!r || !r.ok) resumen.alertas.push(`${quien}: no pude volver a marcarlo como no leído`);
        }
        await sleep(2000 + Math.random() * 3000);
      } catch (e) {
        await anotar(p.id, { reintentar: true });
        resumen.alertas.push(`${quien}: ${e.message || e}`);
      }
    }
  } catch (e) {
    resumen.alertas.push(String(e.message || e));
  } finally {
    clearInterval(latido);
    await soltarTurno();
    await chrome.storage.local.set({ lock: 0 });
    const linea = [
      resumen.anuncios.length && `📣 ${resumen.anuncios.length} de anuncio`,
      resumen.sinAnuncio.length && `💬 ${resumen.sinAnuncio.length} no vinieron de anuncio`,
      resumen.videosNuevos.length && `🆕 ${resumen.videosNuevos.length} con video nuevo por aprender`,
      resumen.alertas.length && `⚠️ ${resumen.alertas.length} para revisar: ${resumen.alertas[0]}`,
    ].filter(Boolean).join(' · ');
    if (linea) {
      await log({ level: resumen.alertas.length ? 'warn' : 'ok', mod: 'fb', msg: `Chats de anuncios${real ? '' : ' (simulación)'}: ${linea}`, detalle: resumen });
      if (resumen.videosNuevos.length || manual) notify('Rurush FP · Chats de anuncios', linea);
    }
  }
}

// Desde Opciones: se eligió cuál es un video nuevo → queda aprendido y se llena a los leads que esperaban.
async function aprenderVideo(hash, id, label) {
  const { videosPorAprender = {}, videosAnuncio = {} } = await chrome.storage.local.get(['videosPorAprender', 'videosAnuncio']);
  const v = videosPorAprender[hash];
  if (!v) return { ok: false, error: 'ya no está en la lista' };
  videosAnuncio[hash] = { id, label, thumb: v.thumb, at: new Date().toISOString() };
  delete videosPorAprender[hash];
  await chrome.storage.local.set({ videosAnuncio, videosPorAprender });
  const cfg = await getConfig();
  const hechos = [];
  for (const l of v.leads) {
    try {
      if (l.personId) {
        if ((cfg.fbAdsModo || 'sim') !== 'real') { hechos.push(`${l.header}: 🧪 se llenaría`); continue; }
        hechos.push(`${l.header}: ${await videoAPersona(l.personId, id, cfg.pipedriveToken)}`);
      } else {
        await recibirVideo({ ...l, videoId: id, label });
        hechos.push(`${l.header}: ver registro`);
      }
    } catch (e) { hechos.push(`${l.header}: ⚠️ ${e.message || e}`); }
  }
  await log({ mod: 'fb', msg: `🎬 Video aprendido «${label}» · ${v.leads.length} lead(s)`, detalle: { leads: hechos } });
  return { ok: true, leads: v.leads.length };
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
  // citas de nutrición con Diego (martes y miércoles): recordatorio la noche anterior
  n1:     { nombre: 'Nutrición: recordatorio 7pm',  reemplaza: 'Recordatorio nutricion 7pm', hora: [19, 0], dias: [1, 2] },
  // invita, reagenda no-shows y lee respuestas; el "cerebro" (Apps Script de la hoja NUTRICIÓN) arma la lista y agenda en Pipedrive
  n2:     { nombre: 'Nutrición: seguimiento 11:30', reemplaza: 'Seguimiento nutricion wa 1130', hora: [11, 30], dias: [1, 2, 3, 4, 5] },
  // apenas una asesora agenda un FP (app de llamadas → Pipedrive): confirmación con foto + GPS
  cf:     { nombre: 'Confirmación al agendar (cada 5 min)', reemplaza: '(nuevo)', cadaMin: 5, dias: [0, 1, 2, 3, 4, 5, 6] },
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
  if (key === 'cf') return 'real';   // pedido por Omar: la confirmación sale sola desde el inicio
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

// Confirmación al agendar: foto «cómo llegar» con este texto, y después el GPS en un mensaje aparte.
function nombreDia(fp, now) {
  if (fp.date === now.date) return 'Hoy';
  if (fp.date === sumarDias(now.date, 1)) return 'Mañana';
  const d = DIAS[diaSemana(fp.date)];
  return d[0].toUpperCase() + d.slice(1) + ' ' + fp.date.slice(8) + '/' + fp.date.slice(5, 7);
}
function msgConfirmacion(fp, now) {
  const n = firstName(fp.personName);
  return `¡Hola${n ? ' ' + n : ''}! 💪 Soy ${fp.asesora || 'tu asesora'} de RURUSH Fitness Club 🔥\n`
    + `Te confirmo tu Free Pass:\n📅 ${nombreDia(fp, now)} ${aLas(fp.hour, fp.min)}\n📍 ${DIR}\n`
    + `🎒 Trae ropa deportiva, toalla y agua 💧\nCualquier cambio, escríbeme por aquí. ¡Te esperamos! 🙌`;
}
const RX_YA_CONFIRMADO = /(free\s*pass|clase de prueba|clase gratis|te esperamos|larco\s*11\d\d|maps\.app\.goo\.gl)/i;
function decidirConfirmacion(fp, msgs, now) {
  // si ya se le escribió la confirmación (la asesora por chat o un módulo) desde que se agendó, no repetir
  const desde = (fp.addMs || now.ms) - 2 * 3600e3;
  if (msgs.some((m) => m.out && RX_YA_CONFIRMADO.test(m.text || '') && (msgMs(m) == null || msgMs(m) >= desde))) {
    return { saltar: 'ya tiene la confirmación en el chat', marcar: 'previo' };
  }
  const recientes = msgs.slice(-4).filter((m) => !m.out);
  if (recientes.some((m) => RX_CANCELA.test(m.text || ''))) return { alerta: 'en el chat pide cancelar o cambiar — revisar a mano' };
  return { enviar: msgConfirmacion(fp, now), imagen: true, extra: `🗺️ Ubicación GPS: ${GPS}` };
}

// ── decisiones por tipo ── devuelven { enviar: texto, imagen } | { saltar } | { alerta }
function decidirRecordatorio2h(fp, msgs, now, cfg, ctx) {
  if (cfReciente(ctx, fp, 2)) return { saltar: 'recibió la confirmación al agendar hace menos de 2h' };
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
  if (cfReciente(ctx, fp, 4)) return { saltar: 'recibió la confirmación al agendar hace menos de 4h' };
  if (entrantesDesde(msgs, now.ms - 48 * 3600e3).some((m) => RX_CANCELA.test(m.text))) return { saltar: 'canceló/reagenda' };
  const otra = otraHoraDesde(fp, msgs, now.ms - 48 * 3600e3);
  if (otra) return { alerta: `el chat menciona otra hora → «${otra}» — revisar a mano` };
  if (entrantesDesde(msgs, now.ms - 24 * 3600e3).some((m) => RX_CONFIRMA.test(m.text) && !RX_CANCELA.test(m.text))) {
    return { saltar: 'ya confirmó' };
  }
  return { enviar: msgManana(fp), imagen: false };
}

// ¿se le mandó la confirmación al agendar hace poco? (para no mandarle dos mensajes seguidos)
function cfReciente(ctx, fp, horas) {
  const v = ctx && ctx.sent && ctx.sent[`cf:${fp.id}`];
  return !!(v && v.estado === 'enviado' && Date.now() - Date.parse(v.at) < horas * 3600e3);
}

function decidirRefuerzo(fp, msgs, now, ctx) {
  if (cfReciente(ctx, fp, 4)) return { saltar: 'recibió la confirmación al agendar hace menos de 4h' };
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
        decidir: (fp, msgs, ctx) => decidirRecordatorio2h(fp, msgs, now, cfg, ctx) };
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
    case 'cf': {
      // FP agendados en las últimas 3 h (desde que el módulo existe), con la clase todavía por venir
      const fps = await fpsEntre(tok, hoy, sumarDias(hoy, 14));
      const { cfDesde } = await chrome.storage.local.get('cfDesde');
      const desde = Math.max(now.ms - 3 * 3600e3, cfDesde || now.ms);
      if (!cfDesde) await chrome.storage.local.set({ cfDesde: now.ms });
      const nuevos = fps.filter((f) => f.addMs >= desde && f.classMs > now.ms + 20 * 60e3);
      return { lista: porPersona(nuevos), total: nuevos.length, decidir: (fp, msgs) => decidirConfirmacion(fp, msgs, now) };
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
  if (!manual && Date.now() - waActivity < (key === 'cf' ? 60e3 : 4 * 60e3)) {
    if (key === 'cf') return;   // vuelve a mirar en 5 min
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
    const partes = key === 'm5' ? ['m5a', 'm5b'] : key === 'n2' ? [] : [key];
    if (key === 'n2') {
      try { await correrNutriSeguimiento(cfg, now, real, manual, inicio, resumen); }
      catch (e) {
        // WhatsApp Web sin sesión u ocupado por Difusiones: reintentar en 10 min (hasta 3 h de atraso)
        resumen.alertas.push(`n2: ${e.message || e}`);
        if (!manual) chrome.alarms.create(`retry:${key}:${programado || ''}`, { delayInMinutes: 10 });
      }
    }
    let enviadosCorrida = 0;
    const tocados = new Set(); // un solo mensaje por teléfono por corrida
    let fallosEtiqueta = 0;
    for (const parte of partes) {
     try {
      const plan = parte === 'n1' ? await planNutricion(cfg, now)
        : parte === 'm5a' ? await planDomingoLunes(cfg, now)
        : parte === 'm5b' ? await planDomingoNoShows(cfg, now)
        : await candidatosDe(parte, cfg, now);
      if (plan.alerta) resumen.alertas.push(plan.alerta);
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
      if (!status) throw new Error(await errorWA(tab.id));
      if (cfg.expectedNumber) {
        if (!status.wid) throw new Error('No pude leer el número de la sesión de WhatsApp Web. No se envió nada.');
        if (status.wid !== String(cfg.expectedNumber).replace(/\D/g, '')) throw new Error(`Número de WhatsApp Web incorrecto (${status.wid}). No se envió nada.`);
      }
      await tomarTurno(tab.id);
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
          fp.phone = phone;
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
          if (r && r.ok && d.extra) {
            await sleep(2000);
            const r2 = await ask(tab.id, { type: 'sendReminder', text: d.extra, phone, header: chat.header, conImagen: false });
            if (!r2 || !r2.ok) resumen.alertas.push(`${etiqueta}: salió la confirmación, pero no el link GPS (${(r2 && r2.error) || 'sin respuesta'})`);
          }
          if (r && r.ok) {
            await marcarSent(clave, 'enviado');
            await registrarToque(phone, parte, fp.id);
            enviadosCorrida++;
            resumen.enviados.push(`${etiqueta} · ${phone}${r.imagen ? ' · 🖼️' : ''} · «${d.enviar.replace(/\n+/g, ' ')}»`);
            if (r.aviso) resumen.alertas.push(`${etiqueta}: ${r.aviso}`);
            if (d.aviso) resumen.alertas.push(`${etiqueta}: ${d.aviso}`);
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
      if (!manual && key !== 'cf') chrome.alarms.create(`retry:${key}:${programado || ''}`, { delayInMinutes: 10 });
     }
    }
  } catch (e) {
    resumen.alertas.push(String(e.message || e));
  } finally {
    clearInterval(latido);
    await soltarTurno();
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


// ── nutrición ──
// Citas con Diego: actividades tipo "deadline" (plazo) cuyo asunto dice nutri/evaluación o que son del usuario de Diego.
const DIEGO_USER_ID = 17073823;
const PAUSAS_SHEET = '1j6Js9ToQUJ96yCUmMKh5jmEAebfNSzlpYs5ItSEDuUI';
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

async function citasNutricion(token, desde, hasta) {
  const out = [];
  let start = 0;
  for (;;) {
    const res = await pd('activities', token, {
      type: 'deadline', done: 0, user_id: 0, limit: 500, start,
      start_date: sumarDias(desde, -1), end_date: sumarDias(hasta, 2),
    });
    for (const a of res.data || []) {
      const subj = String(a.subject || '').trim();
      const uid = a.user_id && typeof a.user_id === 'object' ? a.user_id.id : a.user_id;
      if (!/nutri|evaluaci/i.test(subj) && uid !== DIEGO_USER_ID) continue;
      if (!a.due_date || !a.due_time || !a.person_id) continue;
      const classMs = Date.parse(`${a.due_date}T${a.due_time.slice(0, 5)}:00Z`);
      const lima = utcToLima(classMs);
      if (lima.date < desde || lima.date > hasta) continue;
      out.push({ id: a.id, subject: subj, personId: a.person_id, personName: a.person_name, classMs, date: lima.date, hour: lima.hour, min: lima.min });
    }
    const pg = res.additional_data && res.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  return out.sort((x, y) => x.classMs - y.classMs);
}

// CSV simple (con comillas) → filas
function parseCsv(t) {
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}
// Pestaña PAUSAS (B nombre, C celular, D motivo, E fecha de retorno DD/MM/AAAA, F estado). Se lee con la sesión de
// Google de este Chrome; si no se puede, devuelve null y el módulo avisa en el reporte.
async function pausasActivas() {
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${PAUSAS_SHEET}/gviz/tq?tqx=out:csv&sheet=PAUSAS`, { credentials: 'include' });
    if (!r.ok) return null;
    const txt = await r.text();
    if (/<html/i.test(txt.slice(0, 200))) return null;   // pidió iniciar sesión
    const mapa = new Map();
    for (const f of parseCsv(txt).slice(1)) {
      if (String(f[5] || '').trim().toLowerCase() !== 'activa') continue;
      const tel = ultimos9(f[2]);
      const m = String(f[4] || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (tel.length !== 9 || !m) continue;
      const vuelve = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      if (!mapa.has(tel) || vuelve > mapa.get(tel)) mapa.set(tel, vuelve);
    }
    return mapa;
  } catch { return null; }
}
// primer martes y primer miércoles después de la fecha de retorno
function opcionesNutricion(vuelve) {
  const out = [];
  for (let d = sumarDias(vuelve, 1); out.length < 2; d = sumarDias(d, 1)) {
    const w = diaSemana(d);
    if (w === 2 || w === 3) out.push(`${DIAS[w]} ${Number(d.slice(8))} ${MESES_CORTOS[Number(d.slice(5, 7)) - 1]}`);
  }
  return out;
}
function msgNutriRecordatorio(fp) {
  const n = firstName(fp.personName);
  return `Hola${n ? ' ' + n : ''}! 🥗 Te recordamos tu evaluación nutricional con Diego mañana ${DIAS[diaSemana(fp.date)]} ${aLas(fp.hour, fp.min)} en Rurush (${DIR}). ¡Te esperamos!`;
}
function msgNutriPausa(fp, vuelve) {
  const n = firstName(fp.personName);
  const [a, b] = opcionesNutricion(vuelve);
  return `Hola${n ? ' ' + n : ''}! 🥗 Vi que tienes una pausa activa — sin problema, reagendaremos tu evaluación con Diego para cuando regreses 💪 Te propongo:\n`
    + `• ${a} — ¿mañana (8-11am) o tarde (5-8pm)?\n• ${b} — ¿mañana (8-11am) o tarde (5-8pm)?\n¿Cuál te queda mejor? 😊`;
}
async function planNutricion(cfg, now) {
  const manana = sumarDias(now.date, 1);
  const citas = await citasNutricion(cfg.pipedriveToken, manana, manana);
  const pausas = citas.length ? await pausasActivas() : new Map();
  const lista = [...new Map(citas.map((c) => [c.personId, c])).values()];   // una cita por persona (la más temprana)
  return {
    lista,
    alerta: lista.length && !pausas ? 'Nutrición: no pude leer la pestaña PAUSAS (inicia sesión en Google en este Chrome con una cuenta que vea la hoja). Se envía el recordatorio normal a todos.' : null,
    decidir: (fp, msgs) => {
      const vuelve = pausas && fp.phone ? pausas.get(ultimos9(fp.phone)) : null;
      if (vuelve && vuelve > fp.date) return { enviar: msgNutriPausa(fp, vuelve), imagen: false, aviso: `en pausa hasta ${vuelve}: Mónica debe mover la cita en Pipedrive` };
      if (entrantesDesde(msgs, now.ms - 48 * 3600e3).some((m) => RX_CANCELA.test(m.text))) return { alerta: 'el chat dice que no puede / reagenda — revisar la cita con Mónica' };
      const otra = otraHoraDesde(fp, msgs, now.ms - 48 * 3600e3);
      if (otra) return { alerta: `el chat menciona otra hora → «${otra}» — revisar a mano` };
      return { enviar: msgNutriRecordatorio(fp), imagen: false };
    },
  };
}

// ── nutrición: seguimiento 11:30 ──
async function nutriApi(cfg, accion, cuerpo, extra = '') {
  if (!cfg.nutriUrl || !cfg.nutriLlave) throw new Error('Falta el link o la llave del Apps Script de NUTRICIÓN (Opciones).');
  const url = `${cfg.nutriUrl}?k=${encodeURIComponent(cfg.nutriLlave)}&accion=${accion}${extra}`;
  const r = await fetch(url, cuerpo ? { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(cuerpo), redirect: 'follow' } : { redirect: 'follow' });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(`NUTRICIÓN respondió algo raro (HTTP ${r.status}). ¿El link es el /exec y el acceso es "Cualquier usuario"?`); }
  if (j.ok === false && j.error) throw new Error(`NUTRICIÓN: ${j.error}`);
  return j;
}
const NU_DIA = { martes: 2, mar: 2, miercoles: 3, mie: 3 };
const NU_HORAS_OK = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];
const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nuLab = (iso) => `${DIAS[diaSemana(iso)]} ${Number(iso.slice(8))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;
const nuHoraTxt = (hhmm) => fmtHora(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
function nuProximo(hoy, dow) { let d = sumarDias(hoy, 1); while (diaSemana(d) !== dow) d = sumarDias(d, 1); return d; }

// Lee la respuesta del socio: { dia: 'AAAA-MM-DD'|null, hora: 'HH:MM'|null, franja: 'am'|'pm'|null, tipo }
function nuEntender(texto, hoy) {
  const t = sinTildes(texto);
  if (/ya (me )?(hice|pase|tuve|tengo|hize)|ya (fui|estoy) evaluad|ya me evalu|ya pase (mi|la) evalu/.test(t)) return { tipo: 'ya evaluado' };
  if (/no (me )?interesa|no gracias|no deseo|no quiero|no estoy interesad/.test(t)) return { tipo: 'no interesado' };
  if (/no puedo|otra semana|mas adelante|despues|luego te (aviso|escribo)|te aviso|no podre|estoy de viaje|otro dia/.test(t) && !/\b(martes|miercoles)\b/.test(t)) return { tipo: 'otra fecha' };
  let dia = null;
  const dm = t.match(/\b(martes|miercoles|mar|mie)\b/);
  if (dm) dia = nuProximo(hoy, NU_DIA[dm[1]]);
  const fm = t.match(/\b(\d{1,2})\s*(?:\/|de\s+)(\d{1,2}|ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)/);
  if (fm) {
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const mes = /^\d+$/.test(fm[2]) ? Number(fm[2]) : (fm[2] === 'set' ? 9 : meses.indexOf(fm[2]) + 1);
    if (mes >= 1 && mes <= 12) {
      let y = Number(hoy.slice(0, 4)); const iso = `${y}-${String(mes).padStart(2, '0')}-${String(fm[1]).padStart(2, '0')}`;
      const f = iso < hoy ? `${y + 1}${iso.slice(4)}` : iso;
      if (!Number.isNaN(Date.parse(f + 'T12:00:00Z'))) dia = f;
    }
  }
  let franja = /\b(tarde|noche|pm|p\.m)\b/.test(t) ? 'pm' : /\b(temprano|am|a\.m)\b|en la manana|por la manana|de la manana/.test(t) ? 'am' : null;
  let hora = null;
  const hm = t.match(/(?:a las?|las|tipo|como a las)\s*(\d{1,2})(?:[:.](\d{2}))?|\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m|p\.m|hrs?|h)\b/);
  if (hm) {
    let h = Number(hm[1] || hm[3]); const m = Number(hm[2] || hm[4] || 0);
    const suf = hm[5] || '';
    if (/p/.test(suf) || franja === 'pm') { if (h < 12) h += 12; } else if (!/a/.test(suf) && franja !== 'am' && h >= 1 && h <= 7) h += 12;   // "a las 5" = 5 pm
    const hhmm = `${String(h).padStart(2, '0')}:${m >= 30 ? '30' : '00'}`;
    if (NU_HORAS_OK.includes(hhmm)) { hora = hhmm; franja = h >= 12 ? 'pm' : 'am'; }
  }
  if (dia && diaSemana(dia) !== 2 && diaSemana(dia) !== 3) return { tipo: 'dia no valido', dia };
  return { tipo: dia || hora || franja ? 'propuesta' : 'otro', dia, hora, franja };
}

async function correrNutriSeguimiento(cfg, now, real, manual, inicio, resumen) {
  const plan = await nutriApi(cfg, 'plan');
  if (plan.sync) resumen.saltados.push(`Hoja al día: ${plan.sync.actualizados} socios · ${plan.sync.agregados} nuevos agregados`);
  for (const x of plan.fueraHoja || []) resumen.alertas.push(`No-show de nutrición que no está en la hoja (para Mónica): ${x}`);
  const envios = [...plan.noshows, ...plan.pausas, ...plan.nuevos];
  if (!envios.length && !plan.revisar.length) { resumen.saltados.push('Nutrición: nada que enviar ni revisar hoy'); return; }

  const tab = await waTab();
  await sleep(1000);
  await asegurarScript(tab.id);
  const status = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn, 90000);
  if (!status) throw new Error(await errorWA(tab.id));
  if (cfg.expectedNumber && status.wid !== String(cfg.expectedNumber).replace(/\D/g, '')) throw new Error(`Número de WhatsApp Web incorrecto (${status.wid}). No se envió nada.`);
  await tomarTurno(tab.id);
  const bloqueados = new Set(cfg.blocklist.map(ultimos9));
  const guardar = [];
  let enviados = 0;
  const TOPE = 40;

  const enviar = async (chat, phone, texto, etiqueta) => {
    if (!real) { resumen.simulados.push(`${etiqueta} · ${phone} → ${texto.replace(/\n+/g, ' ')}`); return 'sim'; }
    const r = await ask(tab.id, { type: 'sendReminder', text: texto, phone, header: chat.header, conImagen: false });
    if (r && r.ok) { enviados++; resumen.enviados.push(`${etiqueta} · ${phone} · «${texto.replace(/\n+/g, ' ')}»`); await sleep(3000 + Math.random() * 4000); return 'ok'; }
    if (r && r.noEnviado) { resumen.alertas.push(`${etiqueta}: no se envió (${r.error})`); return 'no'; }
    resumen.alertas.push(`${etiqueta}: dudoso — se tocó Enviar pero no se confirmó. Revisar el chat.`);
    return 'ok';
  };
  const abrir = async (item, etiqueta) => {
    const phone = normPhone(item.tel);
    if (!phone) { guardar.push({ fila: item.fila, estado: 'revisar telefono' }); resumen.alertas.push(`${etiqueta}: teléfono inválido`); return null; }
    if (bloqueados.has(ultimos9(phone))) { resumen.saltados.push(`${etiqueta} (bloqueado)`); return null; }
    const { waActivity: act = 0 } = await chrome.storage.local.get('waActivity');
    if (!manual && act > inicio) throw new Error('WhatsApp Web empezó a usarse durante la corrida: se detiene (lo que falta queda para mañana).');
    const chat = await openChat(tab.id, phone);
    if (!chat) { resumen.alertas.push(`${etiqueta}: el chat no abrió`); return null; }
    if (chat.invalid) { guardar.push({ fila: item.fila, estado: 'sin whatsapp' }); resumen.alertas.push(`${etiqueta}: número sin WhatsApp`); return null; }
    if (!chat.ready) { guardar.push({ fila: item.fila, estado: 'revisar telefono' }); resumen.alertas.push(`${etiqueta}: el chat abierto no coincide con ${phone}`); return null; }
    if (chat.hasDraft) { resumen.alertas.push(`${etiqueta}: el chat tiene un borrador, no se tocó`); return null; }
    return { chat, phone };
  };

  try {
    // 1) envíos del día (no-shows, en pausa, invitaciones nuevas)
    for (const j of envios) {
      if (enviados >= TOPE) { resumen.saltados.push(`${j.nombre} (tope de ${TOPE} por corrida)`); continue; }
      const etiqueta = `${j.tipo === 'noshow' ? '🚨' : j.tipo === 'pausa' ? '⏸️' : '📤'} ${j.nombre}`;
      try {
        const a = await abrir(j, etiqueta); if (!a) continue;
        const r = await enviar(a.chat, a.phone, j.texto, etiqueta);
        if (r !== 'ok') continue;
        guardar.push({ fila: j.fila, contacto: true, resp: j.resp, opA: j.opA, opB: j.opB,
          estado: j.tipo === 'noshow' ? 'por confirmar' : j.tipo === 'pausa' ? 'en pausa' : 'enviado', intentos: j.tipo === 'nuevo' ? 1 : undefined });
      } catch (e) { resumen.alertas.push(`${etiqueta}: ${e.message || e}`); if (/empezó a usarse/.test(e.message)) throw e; }
    }
    // 2) leer respuestas
    for (const s of plan.revisar) {
      if (enviados >= TOPE) break;
      const etiqueta = `💬 ${s.nombre}`;
      try {
        const a = await abrir(s, etiqueta); if (!a) continue;
        const msgs = a.chat.messages || [];
        let ultSale = -1; msgs.forEach((m, i) => { if (m.out) ultSale = i; });
        const resp = msgs.slice(ultSale + 1).filter((m) => !m.out && m.text);
        const n = firstName(s.nombre);
        if (!resp.length) {
          const dias = s.ult ? Math.round((Date.parse(now.date) - Date.parse(s.ult)) / 86400e3) : 99;
          if (s.intentos >= 2 || dias >= 4) { guardar.push({ fila: s.fila, estado: 'no responde' }); resumen.saltados.push(`${etiqueta} (no responde → marcado)`); continue; }
          if (dias < 2) { resumen.saltados.push(`${etiqueta} (esperando respuesta)`); continue; }
          const [oa, ob] = plan.opciones;
          const texto = `Hola${n ? ' ' + n : ''}! 😊 ¿Pudiste ver mi mensaje? Diego tiene espacios el ${nuLab(oa)} y el ${nuLab(ob)} para tu evaluación nutricional 🥗 ¿Cuál te acomoda, mañana o tarde?`;
          if (await enviar(a.chat, a.phone, texto, `${etiqueta} (recordatorio)`) === 'ok') guardar.push({ fila: s.fila, intentos: s.intentos + 1, contacto: true });
          continue;
        }
        const texto = resp.map((m) => m.text).join(' · ');
        const q = nuEntender(texto, now.date);
        const corto = texto.slice(0, 120);
        if (q.tipo === 'ya evaluado' || q.tipo === 'no interesado') { guardar.push({ fila: s.fila, estado: q.tipo, resp: corto }); resumen.saltados.push(`${etiqueta} (${q.tipo})`); continue; }
        if (q.tipo === 'otra fecha') {
          const [oa, ob] = [nuProximo(sumarDias(now.date, 6), 2), nuProximo(sumarDias(now.date, 6), 3)];
          const t2 = `¡Sin problema${n ? ' ' + n : ''}! 😊 ¿Te acomoda más adelante: ${nuLab(oa)} o ${nuLab(ob)}? Mañana (8-11am) o tarde (5-8pm) 🥗`;
          if (await enviar(a.chat, a.phone, t2, `${etiqueta} (otra fecha)`) === 'ok') guardar.push({ fila: s.fila, estado: 'por confirmar', resp: 'Pide otra fecha: ' + corto, contacto: true });
          continue;
        }
        if (q.tipo === 'propuesta' && q.dia && q.hora) {
          if (!real) { resumen.simulados.push(`${etiqueta} → se agendaría ${nuLab(q.dia)} ${nuHoraTxt(q.hora)} con Diego («${corto}»)`); continue; }
          const r = await nutriApi(cfg, 'agendar', { fila: s.fila, pid: s.pid, fecha: q.dia, hora: q.hora });
          if (r.ok) {
            const cita = `${nuLab(r.fecha)} ${nuHoraTxt(r.hora)}`;
            const t2 = `¡Listo${n ? ' ' + n : ''}! ✅ Tu evaluación nutricional con Diego quedó para el ${cita} en Rurush (${DIR}). Solo toma 30 min. ¡Te esperamos! 🥗`;
            await enviar(a.chat, a.phone, t2, `${etiqueta} (agendado ${cita})`);
            guardar.push({ fila: s.fila, estado: 'agendado', cita, resp: `${r.yaTenia ? 'Ya tenía cita' : 'Agendado'} ${cita} (confirmó: «${corto}»)`, contacto: true });
            continue;
          }
          if (r.motivo === 'sin person_id') { guardar.push({ fila: s.fila, estado: 'respondio', resp: 'Quiere ' + nuLab(q.dia) + ' ' + nuHoraTxt(q.hora) + ' pero no tiene person_id — agendar a mano' }); resumen.alertas.push(`${etiqueta}: quiere ${nuLab(q.dia)} ${nuHoraTxt(q.hora)} pero no tiene ficha en Pipedrive — agendar a mano`); continue; }
          q.hora = null; q.libres = r.libres;
        }
        if (q.tipo === 'propuesta' && q.dia) {
          const libres = (q.libres || (await nutriApi(cfg, 'libres', null, `&fecha=${q.dia}`)).libres || []).filter((h) => !q.franja || (q.franja === 'am') === (h < '12:00'));
          const t2 = libres.length
            ? `¡Genial${n ? ' ' + n : ''}! 🙌 Para el ${nuLab(q.dia)} Diego tiene libre: ${libres.map(nuHoraTxt).join(', ')}. ¿Cuál prefieres? 🥗`
            : `Uy${n ? ' ' + n : ''}, ese día Diego ya no tiene espacios 😅 ¿Te sirve otro martes o miércoles?`;
          if (await enviar(a.chat, a.phone, t2, `${etiqueta} (pide hora)`) === 'ok') guardar.push({ fila: s.fila, estado: 'por confirmar', resp: 'Eligió ' + nuLab(q.dia) + ', falta hora', contacto: true });
          continue;
        }
        if (q.tipo === 'propuesta' || q.tipo === 'dia no valido') {
          const [oa, ob] = plan.opciones;
          const t2 = `¡Perfecto${n ? ' ' + n : ''}! 😊 Diego atiende martes y miércoles. ¿Te queda mejor el ${nuLab(oa)} o el ${nuLab(ob)}?${q.franja ? ` (${q.franja === 'am' ? 'en la mañana, 8-11am' : 'en la tarde, 5-8pm'})` : ''}`;
          if (await enviar(a.chat, a.phone, t2, `${etiqueta} (pide día)`) === 'ok') guardar.push({ fila: s.fila, estado: 'por confirmar', resp: 'Respondió sin día: ' + corto, contacto: true });
          continue;
        }
        guardar.push({ fila: s.fila, estado: 'respondio', resp: corto });
        resumen.alertas.push(`${etiqueta}: respondió «${corto}» — que lo vea Mónica`);
      } catch (e) { resumen.alertas.push(`${etiqueta}: ${e.message || e}`); if (/empezó a usarse/.test(e.message)) throw e; }
    }
  } finally {
    if (real && guardar.length) {
      try { await nutriApi(cfg, 'guardar', { lista: guardar }); } catch (e) { resumen.alertas.push(`No se pudo guardar en la hoja NUTRICIÓN: ${e.message || e}`); }
    } else if (!real && guardar.length) resumen.simulados.push(`(simulación: no se guardó nada en la hoja · ${guardar.length} cambios)`);
  }
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
    `etiquetar chats de anuncios: ${config.fbAdsModo || 'sim'} (${config.fbAdsEtiqueta || 'FB ADS'})`,
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
  crear('anuncios', { delayInMinutes: 3, periodInMinutes: 30 });
  crear('recarga', { delayInMinutes: 2, periodInMinutes: 5 });
  for (const [key, mod] of Object.entries(MODULOS)) {
    const hora = key === 'manana' ? [cfg.mananaHora, 0] : mod.hora;
    if (hora) crear(`mod:${key}`, { when: proximaLima(hora[0], hora[1]), periodInMinutes: mod.cadaMin || 1440 });
    else if (mod.cadaMin) crear(`mod:${key}`, { delayInMinutes: 1, periodInMinutes: mod.cadaMin });
  }
}

// Videos que vienen cargados con la extensión (videos-precargados.json: huella → opción de Video).
// Se agregan una sola vez: si alguien borra uno en Opciones, no vuelve.
async function cargarVideosPrecargados() {
  const pre = await (await fetch(chrome.runtime.getURL('videos-precargados.json'))).json();
  const { videosAnuncio = {}, precargadosVistos = [] } = await chrome.storage.local.get(['videosAnuncio', 'precargadosVistos']);
  const vistos = new Set(precargadosVistos);
  for (const [h, v] of Object.entries(pre)) {
    if (vistos.has(h)) continue;
    if (!videosAnuncio[h]) videosAnuncio[h] = { ...v, at: new Date().toISOString(), precargado: true };
    vistos.add(h);
  }
  await chrome.storage.local.set({ videosAnuncio, precargadosVistos: [...vistos] });
}

chrome.runtime.onInstalled.addListener((d) => { programar(d.reason !== 'install' && d.reason !== 'update'); cargarVideosPrecargados().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { programar(true); cargarVideosPrecargados().catch(() => {}); });
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
  const { lock = 0 } = await chrome.storage.local.get('lock');
  return lock && Date.now() - lock < 10 * 60e3;
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'recarga') return autoRecarga();
  if (a.name === 'tick') { reintentarVideos().catch(() => {}); return encolar('m1', 'alarm'); }
  if (a.name === 'reporte') return descargarReporte(a.scheduledTime);
  if (a.name === 'anuncios') { cola = cola.then(() => correrAnuncios('alarm')).catch((e) => log({ level: 'error', mod: 'fb', msg: `Chats de anuncios: ${e.message || e}` })); return; }
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
  // un chat abierto en WhatsApp Web vino de un anuncio (lo detecta content.js)
  if (msg.type === 'fbAd') {
    const quien = `${msg.header} (anuncio de ${msg.red})`;
    const texto = msg.sim ? `🧪 FB ADS: ${quien} → se le pondría la etiqueta ${msg.etiqueta}`
      : msg.ok ? `🏷️ FB ADS: ${quien} · ${msg.ya ? 'ya tenía' : 'etiquetado'} ${msg.etiqueta}`
      : `⚠️ FB ADS: ${quien} · no se pudo etiquetar (${msg.error || 'sin respuesta'})`;
    log({ mod: 'fb', msg: texto });
    return false;
  }
  if (msg.type === 'fbVideo') { recibirVideo(msg); return false; }
  if (msg.type === 'videoNuevo') { log({ mod: 'fb', msg: `🆕 Video nuevo de anuncio (${msg.header}): elígelo en Opciones → Videos por aprender` }); return false; }
  if (msg.type === 'aprenderVideo') { aprenderVideo(msg.hash, msg.id, msg.label).then(reply, (e) => reply({ ok: false, error: e.message || String(e) })); return true; }
  if (msg.type === 'correrAnuncios') { cola = cola.then(() => correrAnuncios('manual')); cola.then(() => reply({ ok: true }), () => reply({ ok: false })); return true; }
  if (msg.type === 'huellaUrl') { huellaUrl(msg.url).then(reply, () => reply(null)); return true; }
  if (msg.type === 'videoOpciones') {
    getConfig().then((cfg) => cfg.pipedriveToken ? campoVideo(cfg.pipedriveToken) : Promise.reject(new Error('falta el token de Pipedrive en Opciones')))
      .then((c) => reply({ ok: true, opciones: c.opciones }), (e) => reply({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg.type === 'probarFbAd') {
    (async () => {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      if (!tabs.length) return { ok: false, error: 'abre WhatsApp Web y un chat' };
      await asegurarScript(tabs[0].id);
      return (await ask(tabs[0].id, { type: 'fbAdAhora' })) || { ok: false, error: 'sin respuesta de WhatsApp Web' };
    })().then(reply);
    return true;
  }
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
    msgRefuerzo, msgSabado, msgDomingoLunes, msgDomingoNoShow, MODULOS,
    parseCsv, opcionesNutricion, msgNutriRecordatorio, msgNutriPausa, nuEntender };
}

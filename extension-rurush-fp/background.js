// Rurush FP — recordatorio cercano + GPS a los Free Pass de hoy.
// Pipedrive (API) detecta los FP; WhatsApp Web (pestaña de Chrome) lee el chat y envía.
// Reemplaza la rutina "FPS 2HRS" sin gastar uso de Claude.

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
function firstName(full) {
  const n = String(full || '').trim().split(/\s+/)[0] || '';
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : '';
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Registro de envíos por id de actividad: { estado: 'intento'|'enviado'|'previo', at }.
// Se guarda al instante (antes y después del clic) para que un corte nunca provoque reenvíos.
async function marcarSent(id, estado) {
  const { sent = {} } = await chrome.storage.local.get('sent');
  sent[id] = { estado, at: new Date().toISOString() };
  await chrome.storage.local.set({ sent: limpiarSent(sent) });
}

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

// FP de HOY (Lima). Ventana ayer → hoy+2: due_date/due_time vienen en UTC y
// end_date es exclusivo; con end_date=hoy se pierden los FP de 7pm en adelante.
async function fpDeHoy(token) {
  const hoy = limaNow().date;
  const out = [];
  let start = 0;
  for (;;) {
    const res = await pd('activities', token, {
      type: 'meeting', done: 0, user_id: 0, limit: 500, start,
      start_date: limaDateOffset(-1), end_date: limaDateOffset(2),
    });
    for (const a of res.data || []) {
      const subj = String(a.subject || '').trim();
      if (!/^(FP|FREE\s*PASS)\b/i.test(subj)) continue;
      if (!a.due_date || !a.due_time) continue;
      const classMs = Date.parse(`${a.due_date}T${a.due_time.slice(0, 5)}:00Z`);
      const lima = utcToLima(classMs);
      if (lima.date !== hoy) continue;
      out.push({
        id: a.id, subject: subj, personId: a.person_id, personName: a.person_name,
        classMs, hour: lima.hour, min: lima.min,
      });
    }
    const pg = res.additional_data && res.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  return out;
}

async function phoneOf(personId, token) {
  if (!personId) return null;
  const res = await pd(`persons/${personId}`, token);
  const phones = (res.data && res.data.phone) || [];
  const primary = phones.find((p) => p.primary) || phones[0];
  for (const p of [primary, ...phones]) {
    const n = p && normPhone(p.value);
    if (n) return n;
  }
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

function horasMencionadas(text) {
  const out = [];
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

  const yaCercano = deHoy.some((m) => m.out && /maps\.app\.goo\.gl|larco 1170/i.test(m.text)
    && (m.minutes == null || m.minutes >= avisoDesde));
  const cancelo = recientes.some((m) => !m.out && RX_CANCELA.test(m.text));
  const confirmo = deHoy.some((m) => !m.out && RX_CONFIRMA.test(m.text));

  // ¿se acordó otra hora por chat? → no adivinar, que lo vea la asesora
  let otraHora = null;
  for (const m of deHoy.slice(-8)) {
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
  const h = fmtHora(fp.hour, fp.min);
  const hola = n ? pick([`¡Hola ${n}! 👋`, `${n}, ¡hola! 😊`, `¡Hola ${n}! 🙌`]) : pick(['¡Hola! 👋', '¡Hola! 😊']);
  let cuerpo, cierre;
  if (confirmo) {
    cuerpo = pick([`¡Perfecto! Te esperamos hoy a las ${h} 💪`, `Todo listo para tu clase de hoy a las ${h} 💪`, `Nos vemos hoy a las ${h} 🔥`]);
    cierre = pick([`Te dejo la ubicación 📍 ${GPS}`, `📍 ${GPS}`, `Aquí la ubicación 📍 ${GPS}`]);
  } else {
    cuerpo = pick([`Hoy es tu clase de prueba GRATIS a las ${h} 🔥`, `Te esperamos hoy a las ${h} para tu clase gratis 💪`, `Hoy a las ${h} es tu clase de prueba 🔥`]);
    cierre = pick([`¿Confirmas? Te paso la ubicación 📍 ${GPS}`, `¿Me confirmas? 📍 ${GPS}`, `¿Confirmas tu asistencia? Ubicación 📍 ${GPS}`]);
  }
  const ref = 'Av. Larco 1170, al costado de Mass.';
  const full = `${hola} ${cuerpo}\n${cierre}\n${ref}`;
  return full.length <= 180 ? full : `${hola} ${cuerpo}\n${cierre}`;
}

// ───────────────────────── corrida ─────────────────────────
let corriendo = false;

async function run(reason) {
  if (corriendo) return;
  corriendo = true;
  try { await correr(reason); } finally { corriendo = false; }
}

async function correr(reason) {
  const cfg = await getConfig();
  const now = limaNow();
  const manual = reason === 'manual';

  if (!cfg.enabled && !manual) return;
  if (!manual && (!cfg.days.includes(now.dow) || now.hour < cfg.startHour || now.hour > cfg.endHour)) return;
  if (!cfg.pipedriveToken) { await log({ level: 'error', msg: 'Falta el token de Pipedrive (Opciones).' }); return; }

  // candado: una sola corrida a la vez
  const { lock } = await chrome.storage.local.get('lock');
  if (lock && Date.now() - lock < 20 * 60e3) { await log({ level: 'info', msg: 'Otra corrida en curso, salto.' }); return; }

  // si alguien (asesora o Claude) está usando WhatsApp Web, posponer 10 min
  const { waActivity = 0 } = await chrome.storage.local.get('waActivity');
  if (!manual && Date.now() - waActivity < 4 * 60e3) {
    chrome.alarms.create('retry', { delayInMinutes: 10 });
    await log({ level: 'info', msg: 'WhatsApp Web en uso, reintento en 10 min.' });
    return;
  }

  await chrome.storage.local.set({ lock: Date.now() });
  const inicio = Date.now();
  // mantiene vivo el service worker y renueva el candado mientras corre
  const latido = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
    chrome.storage.local.set({ lock: Date.now() });
  }, 20000);
  const resumen = { enviados: [], simulados: [], saltados: [], alertas: [] };
  try {
    const fps = await fpDeHoy(cfg.pipedriveToken);
    const ventanaMs = cfg.sendWindowH * 3600e3;

    const candidatos = fps
      .filter((f) => f.classMs > now.ms && f.classMs - now.ms <= ventanaMs)
      .sort((a, b) => a.classMs - b.classMs);
    const fuera = fps.length - candidatos.length;

    if (!candidatos.length) {
      const fps_hoy = fps.sort((a, b) => a.classMs - b.classMs).map((f) => {
        const falta = (f.classMs - now.ms) / 3600e3;
        const estado = falta <= 0 ? 'ya pasó' : `faltan ${falta.toFixed(1)}h`;
        return `${f.personName || f.subject} · ${fmtHora(f.hour, f.min)} · ${estado}`;
      });
      await log({
        level: 'info',
        msg: `${fps.length} FP hoy · ninguno a ≤${cfg.sendWindowH}h (${fuera} ya pasaron o faltan más).`,
        detalle: fps_hoy.length ? { fps_hoy } : undefined,
      });
      return;
    }

    const tab = await waTab();
    await sleep(1000);
    await asegurarScript(tab.id);
    const status = await waitFor(tab.id, { type: 'ping' }, (r) => r.loggedIn, 90000);
    if (!status) throw new Error('WhatsApp Web no cargó o no tiene sesión iniciada.');
    if (cfg.expectedNumber) {
      if (!status.wid) throw new Error('No pude leer el número de la sesión de WhatsApp Web. No se envió nada.');
      if (status.wid !== String(cfg.expectedNumber).replace(/\D/g, '')) {
        throw new Error(`Número de WhatsApp Web incorrecto (${status.wid}). No se envió nada.`);
      }
    }
    const bloqueados = new Set(cfg.blocklist.map(ultimos9).filter((x) => x.length === 9));

    for (const fp of candidatos) {
      fp.cfgWindowH = cfg.sendWindowH;
      const etiqueta = `${fp.personName || fp.subject} · ${fmtHora(fp.hour, fp.min)}`;
      try {
        const { sent: ya = {} } = await chrome.storage.local.get('sent');
        if (ya[fp.id]) { resumen.saltados.push(`${etiqueta} (ya enviado)`); continue; }

        // si una persona empezó a usar WhatsApp Web durante la corrida, parar y reintentar luego
        const { waActivity: act = 0 } = await chrome.storage.local.get('waActivity');
        if (!manual && act > inicio) {
          chrome.alarms.create('retry', { delayInMinutes: 10 });
          resumen.alertas.push('WhatsApp Web empezó a usarse durante la corrida: pausa, reintento en 10 min');
          break;
        }

        const phone = await phoneOf(fp.personId, cfg.pipedriveToken);
        if (!phone) { resumen.alertas.push(`${etiqueta}: sin celular válido en Pipedrive`); continue; }
        if (bloqueados.has(ultimos9(phone))) { resumen.saltados.push(`${etiqueta} (bloqueado)`); continue; }

        const chat = await openChat(tab.id, phone);
        if (!chat) { resumen.alertas.push(`${etiqueta}: el chat no abrió`); continue; }
        if (chat.invalid) { resumen.alertas.push(`${etiqueta}: número sin WhatsApp`); continue; }
        if (!chat.ready) { resumen.alertas.push(`${etiqueta}: no se pudo confirmar que el chat abierto sea el de ${phone}`); continue; }
        if (chat.hasDraft) { resumen.alertas.push(`${etiqueta}: el chat tiene un borrador escrito, no se tocó`); continue; }

        const msgs = chat.messages || [];
        if (msgs.length && !msgs.some((m) => m.date)) {
          resumen.alertas.push(`${etiqueta}: no pude leer las fechas del chat, no se envió por seguridad`); continue;
        }

        const a = analizar(fp, msgs, now.date);
        if (a.cancelo) { resumen.saltados.push(`${etiqueta} (canceló/reagenda)`); continue; }
        if (a.yaCercano) {
          await marcarSent(fp.id, 'previo');
          resumen.saltados.push(`${etiqueta} (ya tiene recordatorio cercano)`); continue;
        }
        if (a.otraHora) { resumen.alertas.push(`${etiqueta}: el chat menciona otra hora → «${a.otraHora}» — revisar a mano`); continue; }

        const texto = mensaje(fp, a.confirmo);
        if (cfg.dryRun) { resumen.simulados.push(`${etiqueta} · ${phone} → ${texto.replace(/\n/g, ' ')}`); continue; }

        // marcar ANTES de tocar Enviar: si algo se corta a la mitad, nunca se reintenta solo
        await marcarSent(fp.id, 'intento');
        const r = await ask(tab.id, { type: 'sendReminder', text: texto, phone, header: chat.header });
        if (r && r.ok) {
          await marcarSent(fp.id, 'enviado');
          resumen.enviados.push(`${etiqueta} · ${phone}${r.imagen ? ' · 🖼️' : ''} · «${texto.replace(/\n/g, ' ')}»`);
          if (r.aviso) resumen.alertas.push(`${etiqueta}: ${r.aviso}`);
        } else if (r && r.noEnviado) {
          // se abortó antes del clic: se puede reintentar en la próxima corrida
          const { sent: s2 = {} } = await chrome.storage.local.get('sent');
          delete s2[fp.id];
          await chrome.storage.local.set({ sent: s2 });
          resumen.alertas.push(`${etiqueta}: no se envió (${r.error})`);
        } else {
          resumen.alertas.push(`${etiqueta}: dudoso — se tocó Enviar pero no se confirmó (${(r && r.error) || 'sin respuesta'}). Revisar el chat; no se reintenta solo.`);
        }
        await sleep(3000 + Math.random() * 4000);
      } catch (e) {
        resumen.alertas.push(`${etiqueta}: ${e.message || e}`);
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
      await log({ level: resumen.alertas.length ? 'warn' : 'ok', msg: linea, detalle: resumen });
      if (resumen.enviados.length || resumen.alertas.length || manual) notify('Rurush FP', linea);
    }
  }
}

// guarda solo los últimos 3 días de envíos
function limpiarSent(sent) {
  const limite = Date.now() - 3 * 86400e3;
  const out = {};
  for (const [k, v] of Object.entries(sent)) {
    const t = Date.parse(typeof v === 'string' ? v : v && v.at);
    if (t > limite) out[k] = v;
  }
  return out;
}

// ───────────────────────── reporte del día ─────────────────────────
const diaLima = (iso) => new Date(Date.parse(iso) + LIMA_OFFSET_H * 3600e3).toISOString().slice(0, 10);

async function reporte(dia) {
  const { logs = [], config = {}, sent = {} } = await chrome.storage.local.get(['logs', 'config', 'sent']);
  const deDia = logs.filter((l) => diaLima(l.at) === dia).reverse();
  const lineas = [
    `REPORTE RURUSH FP · ${dia} · v${chrome.runtime.getManifest().version}`,
    `modo: ${config.dryRun === false ? 'ENVÍO REAL' : 'SIMULACIÓN'} · activa: ${config.enabled !== false} · ventana ≤${config.sendWindowH || 4}h · corridas: ${deDia.length}`,
    `FP marcados como enviados (últimos 3 días): ${Object.keys(sent).length}`,
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

// próxima 9:05pm hora Lima, en ms
function proximaHoraReporte() {
  const ahora = Date.now();
  const lima = new Date(ahora + LIMA_OFFSET_H * 3600e3);
  let t = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate(), 21, 5) - LIMA_OFFSET_H * 3600e3;
  if (t <= ahora) t += 86400e3;
  return t;
}

// ───────────────────────── disparadores ─────────────────────────
async function programar() {
  const cfg = await getConfig();
  await chrome.alarms.clear('tick');
  chrome.alarms.create('tick', { delayInMinutes: 1, periodInMinutes: cfg.intervalMin });
  await chrome.alarms.clear('reporte');
  chrome.alarms.create('reporte', { when: proximaHoraReporte(), periodInMinutes: 1440 });
}

chrome.runtime.onInstalled.addListener(programar);
chrome.runtime.onStartup.addListener(programar);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'tick' || a.name === 'retry') run('alarm');
  if (a.name === 'reporte') descargarReporte(a.scheduledTime);
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'runNow') { run('manual').then(() => reply({ ok: true })); return true; }
  if (msg.type === 'report') { reporte(limaNow().date).then((r) => reply(r)); return true; }
  if (msg.type === 'downloadReport') { descargarReporte().then(() => reply({ ok: true })); return true; }
  if (msg.type === 'reschedule') { programar().then(() => reply({ ok: true })); return true; }
  if (msg.type === 'waActivity') { chrome.storage.local.set({ waActivity: Date.now() }); }
  return false;
});

// exportado solo para pruebas en Node
if (typeof module !== 'undefined') module.exports = { analizar, mensaje, horasMencionadas, normPhone, fmtHora, utcToLima, limpiarSent, ultimos9 };

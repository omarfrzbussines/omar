/* 🎟️ FREE PASS DE HOY — app de computadora para las asesoras (link ?fp=<llave>).
   Muestra SOLO lo del día (free pass de hoy, pendientes de ayer, mañana y nutrición) y deja
   marcar: ¿vino?, coach y ¿se inscribió? — y agendar free pass o nutrición por número.
   No hay buscador, ni lista de contactos, ni descargas: las asesoras no necesitan entrar a
   Pipedrive. El token de Pipedrive se queda aquí, en Google.

   Cada marca se escribe en Pipedrive (como siempre: actividad hecha = vino, campo COACH FP,
   campo CIERRE) y además en el 📒 REGISTRO (un Sheet de Omar que solo crece: quién marcó qué
   y a qué hora). Si alguien corrige una marca, queda la corrección y a Omar le llega un aviso.

   Instalar: ejecutar fp_crearLlaves UNA vez → llega a Omar un correo con el link y el PIN de
   cada asesora. La primera vez que una asesora abre su link en una PC, pone su PIN (máx. 2 PCs). */

const FP_CAMPO = {
  COACH: '9e850eece75b5e1d9ed9b4e61e8643a57e1d4b70',
  CIERRE: '33b8be2e235bd672060ee054b04372be13b53f52',
  PRESENTO: '7de502a12cd072ed8904fc783228913fa16a0e29'   // PRESENTÓ PLAN (quién le presentó el plan)
};
const FP_YA_NO_ESTAN = ['GUSTAVO', 'ERIK', 'ALVARO', 'VALERIA'];   // opciones viejas de PRESENTÓ PLAN que ya no se ofrecen (igual que el panel)
const FP_CIERRE = { SI: '136', NO: '137', SEG: '149' };
const FP_PLANES = ['Mensual', 'Trimestral', 'Semestral', 'Anual', 'Otro'];
const FP_NUTRI = { dias: [2, 3], cupos: ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'] };
const FP_MAX_PCS = 2;
const FP_REG_COLS = ['CUANDO', 'QUIEN', 'TIPO', 'ACTIVIDAD', 'PERSONA ID', 'NOMBRE', 'FECHA CITA', 'HORA CITA', 'AGENDÓ', 'VÍA', 'CAMPO', 'VALOR', 'ANTES'];

/* ---------- acceso ---------- */

// solo letras y números: si la llave llega con comillas u otro adorno, igual se reconoce
function fp_l_(llave) { return String(llave || '').replace(/[^a-z0-9]/gi, ''); }
// URL pública /exec (getUrl() da /dev si se corre desde el editor, y /dev solo lo abre el dueño)
function fp_url_() { return ScriptApp.getService().getUrl().replace(/\/dev$/, '/exec'); }
function fp_llaves_() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('FP_LLAVES') || '{}'); }
function fp_guardarLlaves_(o) { PropertiesService.getScriptProperties().setProperty('FP_LLAVES', JSON.stringify(o)); }

/** Ejecutar UNA vez (o para rehacer las llaves: las viejas dejan de servir). */
function fp_crearLlaves() {
  const out = {};
  DV_ASESORAS.concat(['OMAR']).forEach(function (a) {
    const llave = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    out[llave] = { ase: a, pin: pin, pcs: [] };
  });
  fp_guardarLlaves_(out);
  fp_reenviarLinks();
}

/** Vuelve a mandar el correo con los MISMOS links y PIN (no cambia nada, las PCs activadas siguen). */
function fp_reenviarLinks() {
  const base = fp_url_(), todas = fp_llaves_(), filas = [];
  Object.keys(todas).forEach(function (llave) {
    const x = todas[llave], url = base + '?fp=' + llave;
    filas.push('<tr><td><b>' + (DV_NOMBRE[x.ase] || x.ase) + '</b></td><td><a href="' + url + '">' + url + '</a></td><td><b>' + x.pin +
      '</b></td><td>' + x.pcs.length + '/' + FP_MAX_PCS + '</td></tr>');
  });
  MailApp.sendEmail({
    to: DV_CORREO, name: 'RURUSH Free Pass',
    subject: '🎟️ Links de la app Free Pass de hoy (uno por asesora)',
    htmlBody: '<p>Pásale a cada asesora SOLO su link y su PIN. La primera vez que lo abra en una PC le pedirá el PIN (máximo ' + FP_MAX_PCS +
      ' PCs por asesora). Para quitar una PC, vuelve a ejecutar fp_crearLlaves (cambian todos los links).</p><table border="1" cellpadding="6" style="border-collapse:collapse">' +
      '<tr><th>Asesora</th><th>Link</th><th>PIN</th><th>PCs</th></tr>' + filas.join('') + '</table>'
  });
  Logger.log('Listo: links y PIN enviados a ' + DV_CORREO);
}

function fp_quien_(llave, pc) {
  const x = fp_llaves_()[fp_l_(llave)];
  if (!x) throw new Error('Link no válido.');
  if (x.pcs.indexOf(String(pc || '')) < 0) throw new Error('PC_NO_AUTORIZADA');
  return x.ase;
}

function fp_estado(llave, pc) {
  const x = fp_llaves_()[fp_l_(llave)];
  if (!x) return { ok: false, error: 'Link no válido.' };
  return { ok: x.pcs.indexOf(String(pc || '')) >= 0, asesora: DV_NOMBRE[x.ase] || x.ase };
}

function fp_activar(llave, pc, pin) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const todas = fp_llaves_(), x = todas[fp_l_(llave)];
    if (!x) return { ok: false, error: 'Link no válido.' };
    if (String(pin || '').trim() !== x.pin) return { ok: false, error: 'PIN incorrecto.' };
    pc = String(pc || '');
    if (!/^[a-z0-9]{12,40}$/.test(pc)) return { ok: false, error: 'Esta PC no se pudo identificar.' };
    if (x.pcs.indexOf(pc) < 0) {
      if (x.pcs.length >= FP_MAX_PCS) return { ok: false, error: 'Ya hay ' + FP_MAX_PCS + ' PCs activadas con este link. Pídele a Omar que lo renueve.' };
      x.pcs.push(pc);
      fp_guardarLlaves_(todas);
    }
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function fp_pagina_(llave) {
  llave = fp_l_(llave);
  if (!fp_llaves_()[llave]) return ContentService.createTextOutput('Link no válido.');
  const t = HtmlService.createTemplateFromFile('FreePassUI');
  t.llave = llave;
  return t.evaluate().setTitle('RURUSH · Free Pass de hoy')
    .setFaviconUrl('https://raw.githubusercontent.com/omarfrzbussines/omar/main/rurush-hoy/icono-192.png')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- Pipedrive (lectura y escritura) ---------- */

function fp_pd_(method, path, body) {
  const o = { method: method, muteHttpExceptions: true, headers: { 'x-api-token': token('PIPEDRIVE_TOKEN') } };
  if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  let r;
  for (let i = 0; ; i++) {
    try { r = UrlFetchApp.fetch(PIPEDRIVE_BASE + path, o); if (r.getResponseCode() >= 500 && i < 2) { Utilities.sleep(700); continue; } break; }
    catch (e) { if (i >= 2) throw new Error('Pipedrive no respondió. Intenta de nuevo.'); Utilities.sleep(700); }
  }
  let j = null;
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() >= 300 || (j && j.success === false)) throw new Error((j && j.error) || ('Pipedrive respondió ' + r.getResponseCode() + '.'));
  return j ? j.data : null;
}

const fp_mas_ = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
function fp_utc_(fecha, hora) {
  const u = new Date(Date.parse(fecha + 'T' + hora + ':00Z') - LIMA * 3600e3);
  return { due_date: u.toISOString().slice(0, 10), due_time: u.toISOString().slice(11, 16) };
}

// Actividades (meeting = free pass / deadline = nutrición) con fecha Lima entre desde y hasta.
function fp_acts_(tipo, desde, hasta) {
  const out = [];
  let start = 0;
  for (let v = 0; v < 10; v++) {
    const q = '/activities?type=' + tipo + '&user_id=0&limit=500&start=' + start + '&start_date=' + fp_mas_(desde, -1) + '&end_date=' + fp_mas_(hasta, 2);
    const o = { muteHttpExceptions: true, headers: { 'x-api-token': token('PIPEDRIVE_TOKEN') } };
    const j = JSON.parse(UrlFetchApp.fetch(PIPEDRIVE_BASE + q, o).getContentText() || '{}');
    (j.data || []).forEach(function (a) {
      if (!a.due_date || !a.due_time) return;
      const l = new Date(Date.parse(a.due_date + 'T' + a.due_time.slice(0, 5) + ':00Z') + LIMA * 3600e3);
      const fecha = l.toISOString().slice(0, 10);
      if (fecha < desde || fecha > hasta) return;
      out.push({ id: a.id, asunto: a.subject || '', nombre: a.person_name || '(sin nombre)', personId: a.person_id || null,
        hecha: !!a.done, fecha: fecha, hora: l.toISOString().slice(11, 16) });
    });
    const pg = j.additional_data && j.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  return out.sort(function (x, y) { return (x.fecha + x.hora).localeCompare(y.fecha + y.hora); });
}

// Personas en paralelo (coach, cierre y teléfono), 5 min en caché.
function fp_personas_(ids) {
  const cache = CacheService.getScriptCache(), out = {}, faltan = [];
  const ya = ids.length ? cache.getAll(ids.map(function (i) { return 'fpP' + i; })) : {};
  ids.forEach(function (i) { if (ya['fpP' + i]) out[i] = JSON.parse(ya['fpP' + i]); else faltan.push(i); });
  const tk = token('PIPEDRIVE_TOKEN');
  for (let k = 0; k < faltan.length; k += 25) {
    const lote = faltan.slice(k, k + 25);
    const rs = UrlFetchApp.fetchAll(lote.map(function (i) {
      return { url: PIPEDRIVE_BASE + '/persons/' + i, headers: { 'x-api-token': tk }, muteHttpExceptions: true };
    }));
    const guardar = {};
    rs.forEach(function (r, n) {
      let d = {};
      try { d = JSON.parse(r.getContentText()).data || {}; } catch (e) {}
      const tel = ((d.phone || []).map(function (x) { return String(x.value || '').replace(/\D/g, ''); }).filter(String))[0] || '';
      const v = (k) => (d[k] == null ? '' : String(d[k]));
      out[lote[n]] = { coach: v(FP_CAMPO.COACH), cierre: v(FP_CAMPO.CIERRE), presento: v(FP_CAMPO.PRESENTO), tel: tel };
      guardar['fpP' + lote[n]] = JSON.stringify(out[lote[n]]);
    });
    try { cache.putAll(guardar, 300); } catch (e) {}
    if (faltan.length > 50) Utilities.sleep(400);   // muchas fichas (métricas del mes): no saturar Pipedrive
  }
  return out;
}

// Opciones del campo COACH FP (se leen de Pipedrive: si Omar agrega un coach, sale solo). 6 h en caché.
function fp_coaches_() {
  const cache = CacheService.getScriptCache(), c = cache.get('fpCoaches');
  if (c) return JSON.parse(c);
  const f = (fp_pd_('get', '/personFields?limit=500') || []).filter(function (x) { return x.key === FP_CAMPO.COACH; })[0];
  const ops = ((f && f.options) || []).map(function (o) { return { id: String(o.id), label: String(o.label) }; });
  cache.put('fpCoaches', JSON.stringify(ops), 21600);
  return ops;
}

// Opciones de PRESENTÓ PLAN (sin la gente que ya no está). 6 h en caché.
function fp_presentadores_() {
  const cache = CacheService.getScriptCache(), c = cache.get('fpPresento');
  if (c) return JSON.parse(c);
  const f = (fp_pd_('get', '/personFields?limit=500') || []).filter(function (x) { return x.key === FP_CAMPO.PRESENTO; })[0];
  const ops = ((f && f.options) || []).map(function (o) { return { id: String(o.id), label: String(o.label) }; })
    .filter(function (o) { return FP_YA_NO_ESTAN.indexOf(o.label.toUpperCase().trim()) < 0; });
  cache.put('fpPresento', JSON.stringify(ops), 21600);
  return ops;
}

const fp_mascara_ = (t) => { t = String(t || '').slice(-9); return t.length === 9 ? t.slice(0, 3) + ' ••• ' + t.slice(6) : ''; };
const fp_via_ = (asunto) => (String(asunto).toUpperCase().match(/\b(APC|APV|APL)\b/) || [])[1] || '';

/* ---------- 📒 registro (Sheet de Omar que solo crece) ---------- */

function fp_registro_() {
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty('FP_REG_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('RURUSH · Registro Free Pass (no editar)');
    const sh = ss.getSheets()[0].setName('REGISTRO');
    sh.getRange(1, 1, 1, FP_REG_COLS.length).setValues([FP_REG_COLS]).setFontWeight('bold').setBackground('#141414').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.protect().setDescription('Lo escribe solo la app Free Pass');
    p.setProperty('FP_REG_ID', ss.getId());
  }
  return ss.getSheetByName('REGISTRO');
}

// { "actividad|campo": { valor, cuando, quien } } con lo último anotado (últimos 4.000 registros)
function fp_ultimas_() {
  const sh = fp_registro_(), n = sh.getLastRow() - 1, out = {};
  if (n < 1) return out;
  const ini = Math.max(2, sh.getLastRow() - 3999);
  sh.getRange(ini, 1, sh.getLastRow() - ini + 1, FP_REG_COLS.length).getDisplayValues().forEach(function (f) {
    out[f[3] + '|' + f[10]] = { valor: f[11], cuando: f[0], quien: f[1] };
  });
  return out;
}

function fp_anotar_(quien, tipo, act, campo, valor, sinAviso) {
  const sh = fp_registro_();
  const prev = fp_ultimas_()[act.id + '|' + campo];
  const cuando = Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd HH:mm:ss');
  sh.appendRow([cuando, quien, tipo, String(act.id), String(act.personId || ''), act.nombre || '', act.fecha || '', act.hora || '',
    asesoraDeAsunto(act.asunto) || '', fp_via_(act.asunto), campo, valor, prev ? prev.valor : '']);
  // Corrección: avisar a Omar (una vez por actividad y campo cada 30 min)
  if (prev && prev.valor !== valor && !sinAviso) {
    const k = 'fpAviso' + act.id + campo, cache = CacheService.getScriptCache();
    if (!cache.get(k)) {
      cache.put(k, '1', 1800);
      try {
        MailApp.sendEmail({ to: DV_CORREO, name: 'RURUSH Free Pass',
          subject: '🚨 Corrección en un free pass: ' + (act.nombre || '') + ' · ' + campo,
          htmlBody: '<p><b>' + quien + '</b> cambió <b>' + campo + '</b> de <b>' + prev.valor + '</b> (marcado por ' + prev.quien + ' el ' + prev.cuando +
            ') a <b>' + valor + '</b>.</p><p>' + (act.nombre || '') + ' · cita ' + (act.fecha || '') + ' ' + (act.hora || '') + ' · ' + (act.asunto || '') + '</p>' });
      } catch (e) {}
    }
  }
  return cuando;
}

/* ---------- lo que pide la pantalla ---------- */

function fp_datos(llave, pc) {
  const quien = fp_quien_(llave, pc);
  const hoy = fechaLima(0), ayer = fechaLima(-1), man = fechaLima(1);
  const fps = fp_acts_('meeting', ayer, man).filter(function (a) { return /^\s*FP\b/i.test(a.asunto); });
  const nut = fp_acts_('deadline', hoy, hoy).filter(function (a) { return /NUTRICI/i.test(a.asunto); });
  const ids = fps.map(function (a) { return a.personId; }).filter(Boolean).filter(function (x, i, z) { return z.indexOf(x) === i; });
  const per = fp_personas_(ids);
  const ult = fp_ultimas_();
  const coaches = fp_coaches_();
  let presentadores = []; try { presentadores = fp_presentadores_(); } catch (e) { /* sin el campo, la app sigue igual */ }
  const nomCoach = {}; coaches.forEach(function (c) { nomCoach[c.id] = c.label; });
  const item = (a) => {
    const p = per[a.personId] || {};
    const m = (c) => ult[a.id + '|' + c] || null;
    return { id: a.id, personId: a.personId, nombre: a.nombre, fecha: a.fecha, hora: a.hora, asunto: a.asunto,
      asesora: asesoraDeAsunto(a.asunto), via: fp_via_(a.asunto), tel: fp_mascara_(p.tel),
      vino: a.hecha ? 'SI' : (m('VINO') && m('VINO').valor === 'NO' ? 'NO' : ''),
      coach: p.coach || '', coachNombre: nomCoach[p.coach] || '', presento: p.presento || '',
      cierre: p.cierre === FP_CIERRE.SI ? 'SI' : p.cierre === FP_CIERRE.NO ? 'NO' : p.cierre === FP_CIERRE.SEG ? 'SEG' : '',
      plan: m('PLAN') ? m('PLAN').valor : '',
      marca: m('VINO') ? m('VINO').quien + ' · ' + m('VINO').cuando.slice(11, 16) : '' };
  };
  const lista = fps.map(item);
  return {
    quien: DV_NOMBRE[quien] || quien, esOmar: quien === 'OMAR', hoy: hoy, coaches: coaches, presentadores: presentadores, planes: FP_PLANES,
    hoyL: lista.filter(function (x) { return x.fecha === hoy; }),
    ayer: lista.filter(function (x) { return x.fecha === ayer && (!x.vino || (x.vino === 'SI' && (!x.coach || !x.cierre))); }),
    manana: lista.filter(function (x) { return x.fecha === man; }),
    nutri: nut.map(function (a) { return { id: a.id, personId: a.personId, nombre: a.nombre, fecha: a.fecha, hora: a.hora, asunto: a.asunto,
      asistio: a.hecha ? 'SI' : (ult[a.id + '|ASISTIO'] && ult[a.id + '|ASISTIO'].valor === 'NO' ? 'NO' : '') }; })
  };
}

// campo: VINO (SI/NO) · COACH (id de opción) · PRESENTO (id de opción) · CIERRE (SI/NO/SEG) · PLAN (texto) · ASISTIO (nutrición SI/NO)
function fp_marcar(llave, pc, act, campo, valor) {
  const quien = DV_NOMBRE[fp_quien_(llave, pc)] || fp_quien_(llave, pc);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    act = act || {};
    if (!act.id) throw new Error('Falta la cita.');
    let texto = String(valor);
    if (campo === 'VINO' || campo === 'ASISTIO') {
      if (['SI', 'NO'].indexOf(valor) < 0) throw new Error('Valor no válido.');
      fp_pd_('put', '/activities/' + act.id, { done: valor === 'SI' ? 1 : 0 });
    } else if (campo === 'COACH') {
      const c = fp_coaches_().filter(function (x) { return x.id === String(valor); })[0];
      if (!c || !act.personId) throw new Error('Coach no válido.');
      fp_pd_('put', '/persons/' + act.personId, { [FP_CAMPO.COACH]: c.id });
      texto = c.label;
    } else if (campo === 'PRESENTO') {
      const c = fp_presentadores_().filter(function (x) { return x.id === String(valor); })[0];
      if (!c || !act.personId) throw new Error('Opción no válida.');
      fp_pd_('put', '/persons/' + act.personId, { [FP_CAMPO.PRESENTO]: c.id });
      texto = c.label;
    } else if (campo === 'CIERRE') {
      if (!FP_CIERRE[valor] || !act.personId) throw new Error('Valor no válido.');
      fp_pd_('put', '/persons/' + act.personId, { [FP_CAMPO.CIERRE]: FP_CIERRE[valor] });
    } else if (campo === 'PLAN') {
      if (FP_PLANES.indexOf(valor) < 0) throw new Error('Plan no válido.');
    } else throw new Error('Campo no válido.');
    if (act.personId) CacheService.getScriptCache().remove('fpP' + act.personId);
    const cuando = fp_anotar_(quien, campo === 'ASISTIO' ? 'NUTRI' : 'FP', act, campo, texto);
    return { ok: true, marca: quien + ' · ' + cuando.slice(11, 16) };
  } finally { lock.releaseLock(); }
}

// Cupos libres de nutrición (martes y miércoles de las 2 próximas semanas)
function fp_cupos(llave, pc) {
  fp_quien_(llave, pc);
  const dias = [];
  for (let i = 1; i <= 14; i++) { const f = fechaLima(i); if (FP_NUTRI.dias.indexOf(new Date(f + 'T12:00:00Z').getUTCDay()) >= 0) dias.push(f); }
  if (!dias.length) return [];
  const ocup = {};
  fp_acts_('deadline', dias[0], dias[dias.length - 1]).forEach(function (a) { if (!a.hecha) ocup[a.fecha + ' ' + a.hora] = 1; });
  const out = [];
  dias.forEach(function (d) { FP_NUTRI.cupos.forEach(function (h) { if (!ocup[d + ' ' + h]) out.push(d + ' ' + h); }); });
  return out;
}

// Agendar free pass o nutrición por número exacto (si no hay ficha, se crea con el nombre).
function fp_agendar(llave, pc, d) {
  const ase = fp_quien_(llave, pc), quien = DV_NOMBRE[ase] || ase;
  d = d || {};
  const t9 = String(d.tel || '').replace(/\D/g, '').slice(-9);
  if (!/^9\d{8}$/.test(t9)) throw new Error('Escribe un celular de 9 dígitos (empieza con 9).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || '') || !/^\d{2}:\d{2}$/.test(d.hora || '')) throw new Error('Elige fecha y hora.');
  if (d.fecha < fechaLima(0)) throw new Error('Esa fecha ya pasó.');
  const r = fp_pd_('get', '/persons/search?term=' + t9 + '&fields=phone&exact_match=false&limit=5') || {};
  const items = (r.items || []).map(function (i) { return i.item; });
  let p = items[0];
  if (items.length > 1) throw new Error('Ese número tiene ' + items.length + ' fichas en Pipedrive. Avísale a Omar para unirlas.');
  if (!p) {
    const nom = String(d.nombre || '').trim();
    if (nom.length < 2) throw new Error('Ese número no está en Pipedrive: escribe su nombre para crearlo.');
    p = fp_pd_('post', '/persons', { name: nom, phone: ['51' + t9] });
  }
  const u = fp_utc_(d.fecha, d.hora);
  let body;
  if (d.tipo === 'nutri') {
    body = { subject: (p.name || '') + ' / Omar rurush - EVALUACIÓN NUTRICIONAL', type: 'deadline', person_id: p.id, due_date: u.due_date, due_time: u.due_time, duration: '00:30' };
  } else {
    const via = { chat: 'APC', llamada: 'APL', visita: 'APV' }[d.via];
    if (!via) throw new Error('Elige por dónde se agendó: chat, llamada o visita.');
    const quienAtiende = ase === 'OMAR' ? String(d.asesora || 'OMAR').toUpperCase() : ase;
    body = { subject: 'FP ' + quienAtiende + ' ' + via, type: 'meeting', person_id: p.id, due_date: u.due_date, due_time: u.due_time, duration: '01:00' };
  }
  const a = fp_pd_('post', '/activities', body);
  fp_anotar_(quien, d.tipo === 'nutri' ? 'NUTRI' : 'FP', { id: a.id, personId: p.id, nombre: p.name, fecha: d.fecha, hora: d.hora, asunto: body.subject }, 'AGENDADO', body.subject);
  return { ok: true, nombre: p.name, asunto: body.subject };
}

/* ---------- 📊 métricas (solo el link de OMAR) ----------
   Agendados = free pass con fecha en el rango (hasta hoy). Vino = actividad hecha.
   Inscrito = vino y su ficha tiene CIERRE = Sí. Coach = COACH FP de la ficha. Plan y correcciones: 📒 registro. */
const FP_SEMAFORO = { verde: 35, rojo: 25 };   // % de cierre (inscritos / vinieron)

function fp_metricas(llave, pc, desde, hasta) {
  if (fp_quien_(llave, pc) !== 'OMAR') throw new Error('Solo Omar ve las métricas.');
  const hoy = fechaLima(0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) throw new Error('Elige las fechas.');
  if (hasta > hoy) hasta = hoy;
  if (desde > hasta) throw new Error('La fecha inicial es posterior a la final.');
  if (Date.parse(hasta) - Date.parse(desde) > 92 * 864e5) throw new Error('Máximo 3 meses por consulta.');

  const fps = fp_acts_('meeting', desde, hasta).filter(function (a) { return /^\s*FP\b/i.test(a.asunto) && !/RETOMA/i.test(a.asunto); });
  const nut = fp_acts_('deadline', desde, hasta).filter(function (a) { return /NUTRICI/i.test(a.asunto); });
  const ids = fps.filter(function (a) { return a.hecha; }).map(function (a) { return a.personId; }).filter(Boolean)
    .filter(function (x, i, z) { return z.indexOf(x) === i; });
  const per = fp_personas_(ids);
  const nomCoach = {}; fp_coaches_().forEach(function (c) { nomCoach[c.id] = c.label; });

  // registro completo: último PLAN por actividad y correcciones del rango
  const sh = fp_registro_(), planDe = {}, correcciones = [];
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, FP_REG_COLS.length).getDisplayValues().forEach(function (f) {
      if (f[10] === 'PLAN') planDe[f[3]] = f[11];
      const dia = f[0].slice(0, 10);
      if (f[12] && f[12] !== f[11] && dia >= desde && dia <= hasta)
        correcciones.push({ cuando: f[0].slice(0, 16), quien: f[1], nombre: f[5], campo: f[10], antes: f[12], ahora: f[11] });
    });
  }

  const nuevo = () => ({ agend: 0, vino: 0, inscr: 0 });
  const tot = nuevo(), porAse = {}, porCoach = {}, porVia = {}, planes = {};
  fps.forEach(function (a) {
    const ase = asesoraDeAsunto(a.asunto) || 'SIN ASESORA', via = fp_via_(a.asunto) || 'SIN CANAL';
    const fil = [tot, porAse[ase] = porAse[ase] || nuevo(), porVia[via] = porVia[via] || nuevo()];
    fil.forEach(function (x) { x.agend++; });
    if (!a.hecha) return;
    const p = per[a.personId] || {};
    const coach = nomCoach[p.coach] || (p.coach ? 'Coach ' + p.coach : 'Sin coach');
    fil.push(porCoach[coach] = porCoach[coach] || nuevo());   // al coach solo le cuentan las clases que sí se dieron
    fil.forEach(function (x) { x.vino++; });
    if (p.cierre === FP_CIERRE.SI) {
      fil.forEach(function (x) { x.inscr++; });
      const pl = planDe[String(a.id)] || 'Sin plan marcado';
      planes[pl] = (planes[pl] || 0) + 1;
    }
  });
  const tabla = (o) => Object.keys(o).map(function (k) { return Object.assign({ nombre: DV_NOMBRE[k] || k }, o[k]); })
    .sort(function (x, y) { return y.inscr - x.inscr || y.vino - x.vino || y.agend - x.agend; });
  return {
    desde: desde, hasta: hasta, semaforo: FP_SEMAFORO, total: tot,
    asesoras: tabla(porAse), coaches: tabla(porCoach), canales: tabla(porVia),
    planes: Object.keys(planes).map(function (k) { return { plan: k, n: planes[k] }; }).sort(function (x, y) { return y.n - x.n; }),
    nutri: { agend: nut.length, vino: nut.filter(function (a) { return a.hecha; }).length },
    correcciones: correcciones.reverse().slice(0, 50)
  };
}

/* ---------- 🥗 nutrición con la base de socios (proyecto de Nutrición, ?app=reservas) ----------
   La búsqueda (celular, código AppsFit, DNI o nombre), las fichas, los cupos y las reglas viven en el proyecto
   de Nutrición; aquí solo se le pregunta por su link /exec con su llave. Propiedades del script (a mano):
   FP_NU_URL = link /exec del proyecto de Nutrición · FP_NU_LLAVE = su NU_LLAVE.
   Si no están, la pantalla usa el agendar simple de antes (fp_cupos / fp_agendar). */
function fp_nu_(accion, params, body) {
  const p = PropertiesService.getScriptProperties(), url = p.getProperty('FP_NU_URL'), k = p.getProperty('FP_NU_LLAVE');
  if (!url || !k) throw new Error('NU_SIN_CONEXION');
  let q = url + '?accion=' + accion + '&k=' + encodeURIComponent(k);
  Object.keys(params || {}).forEach(function (x) { q += '&' + x + '=' + encodeURIComponent(params[x] == null ? '' : params[x]); });
  const o = { muteHttpExceptions: true, followRedirects: true };
  if (body) { o.method = 'post'; o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch(q, o);
  let j = null;
  try { j = JSON.parse(r.getContentText()); } catch (e) { throw new Error('Nutrición no respondió. Intenta de nuevo.'); }
  if (!j.ok) throw new Error(j.error === 'llave' ? 'La llave de Nutrición no coincide (avísale a Omar).' : (j.error || 'Error en Nutrición.'));
  return j.r;
}

function fp_nuInicio(llave, pc) {
  fp_quien_(llave, pc);
  try { return Object.assign({ conectado: true }, fp_nu_('rv_inicio')); }
  catch (e) { if (e.message === 'NU_SIN_CONEXION') return { conectado: false }; throw e; }
}
function fp_nuBuscar(llave, pc, q) { fp_quien_(llave, pc); return fp_nu_('rv_buscar', { q: q }); }
function fp_nuLibres(llave, pc, fecha) { fp_quien_(llave, pc); return fp_nu_('rv_libres', { fecha: fecha }); }
function fp_nuParecidos(llave, pc, nombre, dni) { fp_quien_(llave, pc); return fp_nu_('rv_parecidos', { nombre: nombre, dni: dni }); }

// q = { pid?, nombre, tel, dni?, fecha, hora, mover? } — la asesora sale de su llave, no de la pantalla
function fp_nuAgendar(llave, pc, q) {
  const ase = fp_quien_(llave, pc), quien = DV_NOMBRE[ase] || ase;
  q = Object.assign({}, q || {}, { asesora: quien });
  const r = fp_nu_('rv_agendar', null, q);
  try {
    fp_anotar_(quien, 'NUTRI', { id: r.act || q.mover || '', personId: r.pid || q.pid || '', nombre: r.nombre || q.nombre || '', fecha: q.fecha, hora: q.hora,
      asunto: 'EVALUACIÓN NUTRICIONAL' }, q.mover ? 'MOVIDA' : 'AGENDADO', r.msg || '', true);
  } catch (e) { /* el registro no debe frenar la cita ya creada */ }
  return r;
}

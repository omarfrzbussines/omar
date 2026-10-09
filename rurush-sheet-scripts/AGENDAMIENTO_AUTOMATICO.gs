/**
 * RURUSH — AUTO-CREAR / ACTUALIZAR / CANCELAR ACTIVIDAD "FREE PASS" EN PIPEDRIVE
 * ============================================================================
 * v2 (oct-2026): las columnas se buscan por su TÍTULO (fila 2), no por letra, y se
 * revisan las 6 llamadas. Así sigue funcionando aunque se agreguen columnas.
 *
 * QUÉ HACE:
 *   - Trigger onEdit INSTALABLE (instantáneo).
 *   - En todas las pestañas de llamadas: al marcar un ESTADO a mano se llenan solas la
 *     FECHA (hoy) y la HORA exacta de esa llamada, si estaban vacías.
 *   - En la pestaña 2026:
 *   - Si alguna llamada tiene ESTADO=AGENDADO + ASESOR + FECHA FP + HORA FP (y la fila
 *     tiene TELÉFONO) -> crea la actividad "meeting" con asunto "FP <ASESOR> APL".
 *     Si hay varias llamadas en AGENDADO, manda la última.
 *   - Corriges fecha/hora/asesor -> ACTUALIZA la misma tarea (reagenda, no duplica).
 *   - Ya no queda ninguna llamada agendada con fecha y hora -> CANCELA la tarea.
 *   - Los scripts (LlamadasAPI, app del celular) llaman a procesarFilaFP() después de
 *     escribir, porque el onEdit solo se dispara con ediciones hechas a mano.
 *
 * INSTALACIÓN: pega TODO -> Ctrl+S. El trigger que ya tenías sigue sirviendo
 * (llama a onEditFP). Si es la primera vez: ejecuta instalarTriggerFP.
 */

// ===================== CONFIG =====================
// ⚠️ Deja aquí TU línea actual del token (la que ya tenías en este archivo).
const PD_TOKEN = 'PEGA-AQUI-TU-TOKEN-DE-PIPEDRIVE';
const PD_BASE  = 'https://api.pipedrive.com/v1';

const SHEET_NAME = '2026';
const TIPO_FP = 'meeting';
const TZ_OFFSET_HORAS = 5;        // Perú = UTC-5
const CANCELAR = 'borrar';        // 'borrar' | 'hecho'
const FILA_TITULOS = 2;
const FILA_INICIO = 3;
// ==================================================

/** Columnas de la pestaña, leídas de los títulos de la fila 2 (base 1). */
function estructuraFP(sh) {
  const ancho = sh.getLastColumn();
  const head = sh.getRange(FILA_TITULOS, 1, 1, ancho).getDisplayValues()[0]
    .map(function (c) { return String(c || '').trim().toUpperCase(); });
  const col = function (n) { return head.indexOf(n) + 1; };
  const rondas = [];
  for (let i = 0; i < head.length; i++) {
    if (head[i] !== 'ESTADO') continue;
    const r = { estado: i + 1, asesor: 0, fecha: 0, hora: 0, fpFecha: 0, fpHora: 0 };
    for (let j = i - 1; j >= 0; j--) {          // hacia atrás hasta el ASESOR de esta llamada
      if (head[j] === 'ESTADO') break;
      if (!r.hora && head[j] === 'HORA') r.hora = j + 1;
      if (!r.fecha && head[j] === 'FECHA') r.fecha = j + 1;
      if (head[j] === 'ASESOR') { r.asesor = j + 1; break; }
    }
    if (!r.asesor && rondas.length === 0) r.asesor = col('NUMERO') + 1;   // 1ª llamada: título a veces es un nombre
    for (let j = i + 1; j < head.length; j++) { // hacia adelante hasta la siguiente llamada
      if (head[j] === 'ASESOR' || head[j] === 'ESTADO') break;
      if (head[j] === 'FECHA FP' && !r.fpFecha) r.fpFecha = j + 1;
      if (head[j] === 'HORA FP' && !r.fpHora) r.fpHora = j + 1;
    }
    rondas.push(r);
  }
  return { ancho: ancho, nombre: col('NOMBRE'), tel: col('NUMERO'), rondas: rondas };
}

/** Crea el trigger instalable. Ejecutar UNA vez. */
function instalarTriggerFP() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEditFP') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditFP').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  SpreadsheetApp.getActive().toast('Trigger FP instalado ✅');
}

/** Handler del onEdit instalable.
 *  1) En CUALQUIER pestaña de llamadas: al marcar un ESTADO a mano, llena la FECHA (hoy)
 *     y la HORA exacta de esa llamada si están vacías.
 *  2) En la pestaña 2026: crea / actualiza / cancela el FP en Pipedrive. */
function onEditFP(e) {
  try {
    const sh = e.range.getSheet();
    if (e.range.getRow() + e.range.getNumRows() - 1 < FILA_INICIO) return;
    const est = estructuraFP(sh);
    if (!est.rondas.length) return;              // pestaña sin columnas de llamadas
    sellarFechaHora(sh, e.range, est);
    if (sh.getName() !== SHEET_NAME) return;

    const relevantes = [est.nombre, est.tel];
    est.rondas.forEach(r => relevantes.push(r.asesor, r.estado, r.fpFecha, r.fpHora));
    const c1 = e.range.getColumn(), c2 = c1 + e.range.getNumColumns() - 1;
    if (!relevantes.some(c => c && c >= c1 && c <= c2)) return;
    const r1 = Math.max(FILA_INICIO, e.range.getRow());
    const r2 = e.range.getRow() + e.range.getNumRows() - 1;
    for (let r = r1; r <= r2; r++) procesarFilaFP(sh, r, est);
  } catch (err) {
    console.error('onEditFP: ' + err);
  }
}

/** Si se escribió un ESTADO, pone FECHA = hoy y HORA = hora exacta en esa llamada (solo si están vacías). */
function sellarFechaHora(sh, rango, est) {
  const c1 = rango.getColumn(), c2 = c1 + rango.getNumColumns() - 1;
  const rondas = est.rondas.filter(r => r.estado >= c1 && r.estado <= c2 && (r.fecha || r.hora));
  if (!rondas.length) return;
  const ahora = new Date();
  const hoy = Utilities.formatDate(ahora, 'America/Lima', 'dd/MM/yyyy');
  const h = Number(Utilities.formatDate(ahora, 'America/Lima', 'H'));
  const hora = (((h + 11) % 12) + 1) + ':' + Utilities.formatDate(ahora, 'America/Lima', 'mm') + ' ' + (h < 12 ? 'am' : 'pm');
  const r1 = Math.max(FILA_INICIO, rango.getRow()), r2 = rango.getRow() + rango.getNumRows() - 1;
  if (r2 - r1 > 200) return;                     // pegado masivo: no sellar
  for (let row = r1; row <= r2; row++) {
    rondas.forEach(r => {
      if (!String(sh.getRange(row, r.estado).getValue()).trim()) return;
      if (r.fecha && !String(sh.getRange(row, r.fecha).getValue()).trim()) sh.getRange(row, r.fecha).setValue(hoy);
      if (r.hora && !String(sh.getRange(row, r.hora).getValue()).trim()) sh.getRange(row, r.hora).setValue(hora);
    });
  }
}

/** Lee la fila; crea, actualiza o cancela la actividad. Lo llaman también otros scripts. */
function procesarFilaFP(sh, row, est) {
  est = est || estructuraFP(sh);
  const v = sh.getRange(row, 1, 1, est.ancho).getDisplayValues()[0];
  const g = c => (c ? String(v[c - 1] || '').trim() : '');

  const tel = g(est.tel).replace(/\D/g, '');
  if (tel.length < 8) return;                 // sin teléfono no hay referencia
  const nombre = g(est.nombre) || tel;

  // La última llamada en AGENDADO que tenga asesor, fecha y hora de FP
  let asesor = '', due = null;
  est.rondas.forEach(r => {
    if (g(r.estado).toUpperCase().indexOf('AGEND') === -1) return;
    const d = toDueUTC(g(r.fpFecha), g(r.fpHora));
    if (g(r.asesor) && d) { asesor = g(r.asesor); due = d; }
  });

  const props = PropertiesService.getDocumentProperties();
  const keyAct = 'ACT_' + tel, keyPer = 'PER_' + tel;
  const existingId = props.getProperty(keyAct);

  if (!due) {                                  // ya no hay agendamiento válido -> cancelar
    if (existingId) {
      if (CANCELAR === 'hecho') pd('PUT', '/activities/' + existingId, { done: 1 });
      else pd('DELETE', '/activities/' + existingId);
      props.deleteProperty(keyAct);
    }
    return;
  }

  const subject = 'FP ' + asesor.toUpperCase() + ' APL';
  let personId = props.getProperty(keyPer);
  if (!personId) {
    personId = buscarOCrearPersona(nombre, tel);
    if (personId) props.setProperty(keyPer, String(personId));
  }
  const payload = { subject: subject, type: TIPO_FP, due_date: due.due_date, due_time: due.due_time };
  if (personId) payload.person_id = personId;

  if (existingId) {
    pd('PUT', '/activities/' + existingId, payload);
  } else {
    const res = pd('POST', '/activities', payload);
    if (res && res.data && res.data.id) props.setProperty(keyAct, String(res.data.id));
  }
}

/** Busca persona por teléfono; si no existe la crea. Devuelve id. */
function buscarOCrearPersona(nombre, tel) {
  const s = pd('GET', '/persons/search?term=' + encodeURIComponent(tel) + '&fields=phone&exact_match=false&limit=1');
  if (s && s.data && s.data.items && s.data.items.length) return s.data.items[0].item.id;
  const c = pd('POST', '/persons', { name: nombre, phone: [tel] });
  return (c && c.data) ? c.data.id : null;
}

/** Llamada genérica a Pipedrive. */
function pd(method, path, body) {
  const url = PD_BASE + path + (path.indexOf('?') >= 0 ? '&' : '?') + 'api_token=' + PD_TOKEN;
  const opt = { method: method, muteHttpExceptions: true, contentType: 'application/json' };
  if (body) opt.payload = JSON.stringify(body);
  const r = UrlFetchApp.fetch(url, opt);
  try { return JSON.parse(r.getContentText()); } catch (e) { return null; }
}

/** Fecha + hora del sheet -> {due_date, due_time} en UTC. null si algo no parsea. */
function toDueUTC(fecha, hora) {
  const iso = toISO(fecha);
  const t = parseHora(hora);
  if (!iso || !t) return null;
  const p = iso.split('-');
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], t.h + TZ_OFFSET_HORAS, t.m));
  return { due_date: Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'), due_time: Utilities.formatDate(d, 'UTC', 'HH:mm') };
}

/** Fecha -> YYYY-MM-DD. Acepta dd/mm/yyyy, dd/mm/yy y yyyy-mm-dd. */
function toISO(f) {
  f = String(f).trim();
  let m = f.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  m = f.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  return '';
}

/** Hora -> {h, m} en 24h. Acepta 6:00, 06:00, 6:00 AM/PM, 6 PM. null si no parsea. */
function parseHora(h) {
  h = String(h).trim();
  if (!h) return null;
  const pm = /p\.?\s?m/i.test(h), am = /a\.?\s?m/i.test(h);
  let hh, mm;
  let m = h.match(/(\d{1,2}):(\d{2})/);
  if (m) { hh = parseInt(m[1], 10); mm = parseInt(m[2], 10); }
  else {
    const m2 = h.match(/(\d{1,2})\s*(am|pm)?/i);
    if (!m2) return null;
    hh = parseInt(m2[1], 10); mm = 0;
  }
  if (pm && hh < 12) hh += 12;
  if (am && hh === 12) hh = 0;
  if (hh > 23 || mm > 59) return null;
  return { h: hh, m: mm };
}

/** Diagnóstico: pestaña, token, trigger y columnas detectadas (no crea nada). */
function diagnosticoFP() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_NAME);
  Logger.log('1) Pestaña "' + SHEET_NAME + '": ' + (sh ? 'OK ✅' : 'NO EXISTE ❌'));
  const me = pd('GET', '/users/me');
  Logger.log('2) Token: ' + (me && me.data ? 'OK ✅ (' + me.data.name + ')' : 'FALLA ❌'));
  const trg = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'onEditFP');
  Logger.log('3) Trigger onEditFP: ' + (trg.length ? 'instalado ✅' : 'NO instalado ❌ → corre instalarTriggerFP()'));
  if (sh) {
    const est = estructuraFP(sh);
    const L = (c) => c ? sh.getRange(1, c).getA1Notation().replace(/\d+/, '') : '—';
    Logger.log('4) Columnas: NOMBRE=' + L(est.nombre) + ' NUMERO=' + L(est.tel));
    est.rondas.forEach((r, i) => Logger.log('   ' + (i + 1) + 'ª llamada: ASESOR=' + L(r.asesor) +
      ' ESTADO=' + L(r.estado) + ' FECHA FP=' + L(r.fpFecha) + ' HORA FP=' + L(r.fpHora)));
  }
}

/**
 * RURUSH — API de difusiones para la extensión "Rurush Difusiones".
 *
 * Va pegado en el Sheet DIFUSIONES_RURUSH_ago2026 (Extensiones → Apps Script).
 * La extensión le pide los pendientes de una pestaña de tanda y, después de cada
 * envío confirmado, le pide marcar la fila (ENV, FECHA, RESULTADO, NOTA).
 *
 * Instalación: ver apps-script/INSTALAR_API.md
 *
 * Reglas que aplica en el servidor (no dependen de la PC de la asesora):
 *  - Solo entrega filas con ENV vacío y RESULTADO vacío o "PENDIENTE…".
 *  - Nunca entrega un celular marcado NO CONTACTAR en cualquier pestaña.
 *  - Nunca entrega un celular que ya recibió una difusión (ENV=TRUE) en cualquier
 *    pestaña en los últimos N días (por defecto 30).
 *  - Reemplaza {DIAS} por la frase del día, calculada al momento con la fecha de Lima
 *    (mismas reglas que DIAS_HOY de ⚙️ CONFIG: lunes a sábado, sin feriados).
 *  - Aparta los mensajes con un día fijo escrito ("mañana jueves…") o con {HORA}
 *    sin reemplazar, para que nunca salga una fecha vieja.
 *  - Al marcar, vuelve a revisar con candado (LockService) que la fila no esté ya
 *    enviada: dos PCs no pueden marcar el mismo envío dos veces.
 */

var HEADER_SCAN_ROWS = 15;          // la cabecera se busca en las primeras 15 filas
var STOP_MARKER = /NO ENVIAR/i;     // bloque «NO ENVIAR TODAVÍA»: ahí terminan los datos
var LOG_SHEET = '📜 LOG EXTENSIÓN';
var RESPUESTAS_SHEET = '💬 RESPUESTAS';
var CERRADOS = /(NO CONTACTAR|BLOQUEAD)/i;
var DIAS_SEMANA = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i;

// ───────────────────────── instalación ─────────────────────────

/** Ejecutar UNA vez desde el editor: crea la clave y la muestra en el registro. */
function configurar() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('API_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('API_KEY', key);
  }
  Logger.log('Clave de la API (pégala en Opciones de la extensión): ' + key);
  return key;
}

// ───────────────────────── entrada web ─────────────────────────

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var key = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!key || p.key !== key) return json_({ ok: false, error: 'Clave incorrecta. Revisa Opciones de la extensión.' });
    switch (p.a) {
      case 'info': return json_(info_());
      case 'pendientes': return json_(pendientes_(p.tab, p.asesora, Number(p.dias) || 30));
      case 'yaEnviado': return json_(yaEnviado_(p.celular, Number(p.dias) || 30, p.tab));
      case 'marcar': return json_(marcar_(p));
      case 'porRevisar': return json_(porRevisar_(p.asesora, Number(p.dias) || 3));
      case 'respuesta': return json_(respuesta_(p));
      default: return json_({ ok: false, error: 'Acción desconocida: ' + p.a });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────── utilidades ─────────────────────────

function normPhone_(raw) {
  var p = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (p.length === 9 && p.charAt(0) === '9') p = '51' + p;
  return /^519\d{8}$/.test(p) ? p : null;
}

function sinTildes_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function esTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function hoyLima_() {
  return Utilities.formatDate(new Date(), 'America/Lima', 'dd/MM/yyyy');
}

/** Acepta Date o texto dd/mm/aaaa (o d/m/aaaa). Devuelve Date o null. */
function parseFecha_(v) {
  // al mediodía: así el día no cambia al mostrarlo en hora de Lima
  if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12);
  var m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : null;
}

function diasDesde_(fecha) {
  var d = parseFecha_(fecha);
  return d ? Math.floor((Date.now() - d.getTime()) / 86400000) : null;
}

/** Busca la fila de cabecera y el índice (0-based) de cada columna por su nombre. */
function cabecera_(sh) {
  var n = Math.min(HEADER_SCAN_ROWS, sh.getLastRow());
  if (n < 1) return null;
  var vals = sh.getRange(1, 1, n, Math.min(sh.getLastColumn(), 30)).getDisplayValues();
  for (var r = 0; r < vals.length; r++) {
    var row = vals[r].map(sinTildes_);
    var col = function (rx) {
      for (var c = 0; c < row.length; c++) if (rx.test(row[c])) return c;
      return -1;
    };
    var cel = col(/^CELULAR/), env = col(/^ENV$/), msj = col(/^MENSAJE/);
    if (cel >= 0 && env >= 0 && msj >= 0) {
      return {
        row: r + 1,
        cod: col(/^COD/), nombre: col(/^NOMBRE/), celular: cel, asesora: col(/^ASES/),
        mensaje: msj, env: env, fecha: col(/^FECHA$/), resultado: col(/^RESULTADO/), nota: col(/^MOTIVO|^NOTA/),
        width: vals[r].length,
      };
    }
  }
  return null;
}

/** Filas de datos de una pestaña (se detiene en el bloque «NO ENVIAR TODAVÍA»). */
function filas_(sh, h) {
  var last = sh.getLastRow();
  if (last <= h.row) return [];
  var vals = sh.getRange(h.row + 1, 1, last - h.row, h.width).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (STOP_MARKER.test(String(v[0])) || STOP_MARKER.test(String(v[1]))) break;
    out.push({ fila: h.row + 1 + i, v: v });
  }
  return out;
}

/** Pestañas que tienen formato de tanda (CELULAR + MENSAJE + ENV). */
function pestanasTanda_() {
  var out = [];
  SpreadsheetApp.getActive().getSheets().forEach(function (sh) {
    var h = cabecera_(sh);
    if (h) out.push({ sh: sh, h: h });
  });
  return out;
}

/**
 * Índice global por celular: último envío (ENV=TRUE) y si está marcado NO CONTACTAR,
 * mirando TODAS las pestañas de tanda.
 */
function indiceGlobal_() {
  var idx = {};
  pestanasTanda_().forEach(function (t) {
    filas_(t.sh, t.h).forEach(function (f) {
      var tel = normPhone_(f.v[t.h.celular]);
      if (!tel) return;
      var e = idx[tel] || (idx[tel] = { ultimo: null, pestana: null, bloqueado: false, socioActivo: false });
      var res = t.h.resultado >= 0 ? String(f.v[t.h.resultado]) : '';
      var nota = t.h.nota >= 0 ? String(f.v[t.h.nota]) : '';
      if (CERRADOS.test(res) || /NO CONTACTAR/i.test(nota)) {
        // «NO CONTACTAR - SOCIO ACTIVO» solo frena las difusiones; a los socios sí se les escribe
        // desde 🏃 INASISTENCIAS.
        if (/SOCIO ACTIVO/i.test(res + ' ' + nota)) e.socioActivo = true; else e.bloqueado = true;
      }
      if (esTrue_(f.v[t.h.env])) {
        var d = t.h.fecha >= 0 ? parseFecha_(f.v[t.h.fecha]) : null;
        var ts = d ? d.getTime() : 1; // enviado sin fecha: cuenta como antiguo
        if (!e.ultimo || ts > e.ultimo) { e.ultimo = ts; e.pestana = t.sh.getName(); }
      }
    });
  });
  return idx;
}

/**
 * Frase de días para {DIAS}, calculada en el momento con la fecha de Lima (no depende de que
 * la fórmula de ⚙️ CONFIG se haya recalculado). Ofrece los dos próximos días hábiles de lunes
 * a sábado, saltando domingos y los FERIADOS de ⚙️ CONFIG. Ej. viernes → «mañana sábado o el lunes».
 */
var NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function feriados_() {
  var set = {};
  var r = SpreadsheetApp.getActive().getRangeByName('FERIADOS');
  if (!r) return set;
  var vals = r.getValues(), disp = r.getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    var d = parseFecha_(vals[i][0]) || parseFecha_(disp[i][0]);
    if (d) set[Utilities.formatDate(d, 'America/Lima', 'yyyy-MM-dd')] = true;
  }
  return set;
}

function diasHoy_(ahora) {
  var hoy = Utilities.formatDate(ahora || new Date(), 'America/Lima', 'yyyy-MM-dd').split('-');
  var base = Date.UTC(Number(hoy[0]), Number(hoy[1]) - 1, Number(hoy[2]), 12);
  var fer = feriados_(), elegidos = [];
  for (var n = 1; elegidos.length < 2 && n < 30; n++) {
    var d = new Date(base + n * 86400000);
    var iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() === 0 || fer[iso]) continue;
    elegidos.push({ n: n, dia: NOMBRE_DIA[d.getUTCDay()] });
  }
  if (elegidos.length < 2) return '';
  return (elegidos[0].n === 1 ? 'mañana ' : 'el ') + elegidos[0].dia + ' o el ' + elegidos[1].dia;
}

function lineas_() {
  var out = {};
  var r = SpreadsheetApp.getActive().getRangeByName('LINEAS');
  if (!r) return out;
  r.getDisplayValues().forEach(function (row) {
    var nombre = sinTildes_(row[0]);
    var tel = normPhone_(row[1]);
    if (nombre) out[nombre] = tel; // null = sin línea → la extensión no envía
  });
  return out;
}

/** ¿La línea de esta asesora está marcada «SOLO INASISTENCIAS» en la nota de LINEAS (⚙️ CONFIG)? */
function soloInasistencias_(asesora) {
  var r = SpreadsheetApp.getActive().getRangeByName('LINEAS');
  if (!r) return false;
  var quien = sinTildes_(asesora), solo = false;
  var sh = r.getSheet();
  sh.getRange(r.getRow(), r.getColumn(), r.getNumRows(), 3).getDisplayValues().forEach(function (row) {
    if (sinTildes_(row[0]) === quien && /SOLO INASIST/i.test(row[2])) solo = true;
  });
  return solo;
}

function mismaAsesora_(a, b) {
  return sinTildes_(a) && sinTildes_(a) === sinTildes_(b);
}

// ───────────────────────── acciones ─────────────────────────

function info_() {
  return {
    ok: true,
    hoy: hoyLima_(),
    dias: diasHoy_(),
    lineas: lineas_(),
    pestanas: pestanasTanda_().map(function (t) { return t.sh.getName(); }),
  };
}

/** Pestaña de recordatorio a socios (se arma desde Apps Fit): reglas propias de repetición. */
function esInasistencias_(tab) {
  return /INASIST/i.test(String(tab || ''));
}

function pendientes_(tab, asesora, diasAntiDup) {
  // En INASISTENCIAS la frecuencia ya la controla la lista (un mensaje cada 5 días):
  // aquí solo se evita escribirle si recibió cualquier mensaje en los últimos 4 días.
  if (esInasistencias_(tab)) diasAntiDup = Math.min(diasAntiDup, 4);
  var sh = SpreadsheetApp.getActive().getSheetByName(tab);
  if (!sh) return { ok: false, error: 'No existe la pestaña «' + tab + '».' };
  var h = cabecera_(sh);
  if (!h) return { ok: false, error: 'La pestaña «' + tab + '» no tiene columnas CELULAR, MENSAJE y ENV.' };
  if (h.asesora < 0) return { ok: false, error: 'La pestaña no tiene columna ASESORA.' };

  var lineas = lineas_();
  var linea = lineas[sinTildes_(asesora)];
  if (!linea) return { ok: false, error: (asesora || 'Esa asesora') + ' no tiene línea en ⚙️ CONFIG. No se envía nada.' };
  if (soloInasistencias_(asesora) && !esInasistencias_(tab)) {
    return { ok: false, error: 'La línea de ' + asesora + ' solo envía 🏃 INASISTENCIAS (⚙️ CONFIG). No se envía esta tanda.' };
  }

  var dias = diasHoy_();
  var idx = indiceGlobal_();
  var items = [], excluidos = [];
  var vistos = {};

  filas_(sh, h).forEach(function (f) {
    var v = f.v;
    if (!mismaAsesora_(v[h.asesora], asesora)) return;
    var nombre = h.nombre >= 0 ? String(v[h.nombre]).trim() : '';
    var tel = normPhone_(v[h.celular]);
    if (!String(v[h.celular]).trim() && !nombre) return; // fila vacía
    if (esTrue_(v[h.env])) return;                       // ya enviado en esta pestaña
    var res = h.resultado >= 0 ? String(v[h.resultado]).trim() : '';
    var excluir = function (motivo) { excluidos.push({ fila: f.fila, nombre: nombre, motivo: motivo }); };

    if (res && !/^PENDIENTE/i.test(res)) return excluir(res);
    if (!tel) return excluir('Celular inválido');
    if (/(\d)\1{5,}/.test(tel.slice(2))) return excluir('Número falso (dígitos repetidos)');
    if (vistos[tel]) return excluir('Celular repetido en esta pestaña (fila ' + vistos[tel] + ')');
    vistos[tel] = f.fila;

    var g = idx[tel];
    if (g && (g.bloqueado || (g.socioActivo && !esInasistencias_(tab)))) return excluir('NO CONTACTAR en alguna pestaña');
    if (g && g.ultimo && (Date.now() - g.ultimo) / 86400000 < diasAntiDup) {
      return excluir('Ya recibió difusión el ' + Utilities.formatDate(new Date(g.ultimo), 'America/Lima', 'dd/MM') + ' (' + g.pestana + ')');
    }

    var msj = String(v[h.mensaje] || '').trim();
    if (!msj) return excluir('Sin mensaje');
    if (/\{HORA\}/i.test(msj)) return excluir('Mensaje con {HORA} sin reemplazar');
    if (/\{DIAS\}/i.test(msj)) {
      if (!dias) return excluir('No se pudo calcular la frase de días');
      msj = msj.replace(/\{DIAS\}/gi, dias);
    } else if (DIAS_SEMANA.test(msj)) {
      return excluir('Mensaje con día fijo: cambia el día por {DIAS}');
    }
    if (/\{[A-Z_]+\}/.test(msj)) return excluir('Mensaje con una variable {…} sin reemplazar');

    items.push({ fila: f.fila, nombre: nombre, celular: tel, mensaje: msj });
  });

  return { ok: true, tab: tab, asesora: asesora, linea: linea, dias: dias, diasAntiDup: diasAntiDup, items: items, excluidos: excluidos };
}

function yaEnviado_(celular, diasAntiDup, tab) {
  var tel = normPhone_(celular);
  if (!tel) return { ok: false, error: 'Celular inválido' };
  if (esInasistencias_(tab)) diasAntiDup = Math.min(diasAntiDup, 4);
  var g = indiceGlobal_()[tel];
  if (!g) return { ok: true, enviado: false, bloqueado: false };
  var reciente = !!(g.ultimo && (Date.now() - g.ultimo) / 86400000 < diasAntiDup);
  return {
    ok: true,
    bloqueado: g.bloqueado || (g.socioActivo && !esInasistencias_(tab)),
    enviado: reciente,
    fecha: g.ultimo ? Utilities.formatDate(new Date(g.ultimo), 'America/Lima', 'dd/MM/yyyy') : null,
    pestana: g.pestana,
  };
}

/**
 * estado: ENVIADO | SIN_WHATSAPP | YA_CONTACTADO
 * Exige que el celular coincida con el de la fila (por si alguien movió filas).
 */
function marcar_(p) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'Hoja ocupada, reintentar' };
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(p.tab);
    if (!sh) return { ok: false, error: 'No existe la pestaña «' + p.tab + '».' };
    var h = cabecera_(sh);
    var fila = Number(p.fila);
    if (!h || !(fila > h.row)) return { ok: false, error: 'Fila inválida' };

    var v = sh.getRange(fila, 1, 1, h.width).getValues()[0];
    var tel = normPhone_(v[h.celular]);
    if (!tel || tel !== normPhone_(p.celular)) {
      return { ok: false, error: 'La fila ' + fila + ' ya no tiene ese celular (¿se movieron filas?). No marqué nada.' };
    }

    var ahora = new Date();
    var fecha = Utilities.formatDate(ahora, 'America/Lima', 'dd/MM/yyyy');
    var hora = Utilities.formatDate(ahora, 'America/Lima', 'HH:mm');
    var asesora = h.asesora >= 0 ? String(v[h.asesora]) : '';
    var nota = '';

    if (p.estado === 'ENVIADO') {
      if (esTrue_(v[h.env])) return { ok: false, dup: true, error: 'Ya estaba marcado como enviado' };
      sh.getRange(fila, h.env + 1).setValue(true);
      if (h.fecha >= 0) sh.getRange(fila, h.fecha + 1).setValue("'" + fecha);
      if (h.resultado >= 0) sh.getRange(fila, h.resultado + 1).setValue('ENVIADO SIN RESPUESTA');
      nota = 'Enviado ' + fecha.slice(0, 5) + ' ' + hora + ' línea ' + asesora + ' — extensión, verificado';
    } else if (p.estado === 'SIN_WHATSAPP') {
      if (h.resultado >= 0) sh.getRange(fila, h.resultado + 1).setValue('SIN WHATSAPP');
      nota = 'Número no está en WhatsApp — verificado por extensión ' + fecha.slice(0, 5);
    } else if (p.estado === 'YA_CONTACTADO') {
      if (h.resultado >= 0) sh.getRange(fila, h.resultado + 1).setValue('YA CONTACTADO');
      nota = 'No se envió: ' + String(p.nota || 'ya tenía mensaje de Rurush').slice(0, 120) + ' (' + fecha.slice(0, 5) + ')';
    } else {
      return { ok: false, error: 'Estado desconocido: ' + p.estado };
    }
    if (h.nota >= 0) sh.getRange(fila, h.nota + 1).setValue(nota);
    log_([fecha, hora, p.tab, fila, tel, asesora, p.estado, nota]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────── revisión de respuestas ─────────────────────────

/**
 * Filas enviadas por la extensión que siguen «ENVIADO SIN RESPUESTA», de esa asesora,
 * con FECHA dentro de los últimos `dias` días, en todas las pestañas de tanda.
 * `inicio` = el comienzo del mensaje (hasta la primera variable {…}) para ubicarlo en el chat.
 */
function porRevisar_(asesora, dias) {
  var quien = sinTildes_(asesora);
  if (!quien) return { ok: false, error: 'Falta la asesora' };
  var items = [];
  pestanasTanda_().forEach(function (t) {
    var h = t.h;
    if (h.asesora < 0 || h.resultado < 0) return;
    filas_(t.sh, h).forEach(function (f) {
      var v = f.v;
      if (sinTildes_(v[h.asesora]) !== quien || !esTrue_(v[h.env])) return;
      if (sinTildes_(v[h.resultado]) !== 'ENVIADO SIN RESPUESTA') return;
      var d = h.fecha >= 0 ? diasDesde_(v[h.fecha]) : null;
      if (d === null || d > dias) return;
      var tel = normPhone_(v[h.celular]);
      if (!tel) return;
      items.push({
        tab: t.sh.getName(), fila: f.fila, celular: tel,
        nombre: h.nombre >= 0 ? String(v[h.nombre]) : '',
        inicio: String(v[h.mensaje] || '').split('{')[0].slice(0, 80),
      });
    });
  });
  return { ok: true, items: items };
}

/** Marca que el contacto respondió y lo anota en 💬 RESPUESTAS. Solo si sigue «ENVIADO SIN RESPUESTA». */
function respuesta_(p) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'Hoja ocupada, reintentar' };
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(p.tab);
    if (!sh) return { ok: false, error: 'No existe la pestaña «' + p.tab + '».' };
    var h = cabecera_(sh);
    var fila = Number(p.fila);
    if (!h || !(fila > h.row) || h.resultado < 0) return { ok: false, error: 'Fila inválida' };
    var v = sh.getRange(fila, 1, 1, h.width).getValues()[0];
    var tel = normPhone_(v[h.celular]);
    if (!tel || tel !== normPhone_(p.celular)) return { ok: false, error: 'La fila ' + fila + ' ya no tiene ese celular. No marqué nada.' };
    if (sinTildes_(v[h.resultado]) !== 'ENVIADO SIN RESPUESTA') return { ok: false, dup: true, error: 'La fila ya tenía otro resultado' };

    var ahora = new Date();
    var fecha = Utilities.formatDate(ahora, 'America/Lima', 'dd/MM/yyyy');
    var hora = Utilities.formatDate(ahora, 'America/Lima', 'HH:mm');
    var texto = String(p.texto || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    var nombre = h.nombre >= 0 ? String(v[h.nombre]) : '';
    var asesora = h.asesora >= 0 ? String(v[h.asesora]) : '';

    sh.getRange(fila, h.resultado + 1).setValue('RESPONDIO - POR CONTESTAR');
    if (h.nota >= 0) {
      var previa = String(v[h.nota] || '');
      sh.getRange(fila, h.nota + 1).setValue('Respondió (visto ' + fecha.slice(0, 5) + ' ' + hora + '): «' + texto.slice(0, 150) + '»' + (previa ? ' | ' + previa : ''));
    }
    var r = ss.getSheetByName(RESPUESTAS_SHEET);
    if (r) r.appendRow([fecha, hora, nombre, asesora, texto, '', 'RESPONDIÓ', 'Contestar hoy', 'Detectado por la extensión · ' + p.tab + ' fila ' + fila]);
    log_([fecha, hora, p.tab, fila, tel, asesora, 'RESPONDIO', texto.slice(0, 150)]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function log_(row) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.appendRow(['FECHA', 'HORA', 'PESTAÑA', 'FILA', 'CELULAR', 'ASESORA', 'ESTADO', 'NOTA']);
    sh.setFrozenRows(1);
  }
  sh.appendRow(row);
}

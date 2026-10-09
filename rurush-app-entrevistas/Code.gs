/**
 * RURUSH Entrevistas — app del celular + puente de la extensión de Chrome con el Sheet
 * "ENTREVISTA ASESOR V3" (pestaña "Respuestas de formulario 2").
 *
 * Se implementa como Aplicación web (Ejecutar como: Yo · Acceso: Cualquier usuario).
 * Solo responde a celulares autorizados con una invitación (ver ACCESO).
 *
 * GET  /exec[?invita=CÓDIGO]         → la app (sin un celular autorizado no muestra datos)
 * POST {t, a:'lista'|'guardar'|…}    → extensión de Chrome (t = clave del dispositivo)
 * La app llama a appLista / appGuardar / … con google.script.run.
 *
 * ⚠️ La pestaña del formulario NO se modifica en su estructura (ni columnas nuevas ni orden):
 * solo se escribe en columnas que ya se llenan a mano (ESTADO, NOTAS, FECHA E1/E2, puntajes).
 * La agenda vive en una pestaña aparte, "AGENDA ENTREVISTAS", que se crea sola.
 */

var SHEET_ID = '1XNgxVXAu2nwAwFkxtvQQuksQzHqHyIz72V8r73nLDPY';
var HOJA = 'Respuestas de formulario 2';
var CRITERIOS = ['actitud', 'comunicacion', 'cierre', 'experiencia', 'cultura', 'permanencia'];

// Columnas del formulario: se buscan por el texto del encabezado (sin tildes ni mayúsculas),
// así no se rompe si alguien mueve o agrega columnas.
var CAMPOS = [
  ['marca', /^(columna 1|marca temporal)$/],
  ['email', /correo/],
  ['estado', /^estado$/],
  ['nombre', /^nombre completo/],
  ['edad', /^edad/],
  ['ciudad', /^ciudad/],
  ['wa', /numero de whatsapp/],
  ['ig', /^instagram/],
  ['cv', /link a tu cv/],
  ['certijoven', /certijoven/],
  ['video', /video de presentacion/],
  ['tiempoVentas', /tiempo llevas trabajando/],
  ['permanencia', /te imaginas trabajando/],
  ['gimnasio', /vendido membresias/],
  ['promedioVentas', /promedio por mes/],
  ['mejorMes', /mejor mes/],
  ['peorMes', /peor mes/],
  ['ultimoTrabajo', /ultimo trabajo/],
  ['whatsappVentas', /cerrado ventas por whatsapp/],
  ['crm', /crm/],
  ['tiposVenta', /tipos de venta/],
  ['caso1', /^caso 1/],
  ['caso2', /^caso 2/],
  ['caso3', /^caso 3/],
  ['reaccion', /no logras una venta/],
  ['horario', /franjas horarias/],
  ['jornada', /tipo de jornada/],
  ['sueldo', /sueldo base/],
  ['comision', /comisiones/],
  ['metas', /metas diarias/],
  ['fitness', /mundo del fitness/],
  ['porQue', /por que quieres trabajar/],
  ['vision', /vision profesional/],
  ['contratarte', /deberiamos contratarte/],
  ['algoMas', /algo importante/],
  ['referencias', /referencias laborales/],
  ['fechaE1', /^fecha e1$/],
  ['fechaE2', /^fecha e2$/],
  ['pp1', /^puntaje\/p1$/],
  ['pp2', /^puntaje\/p2$/],
  ['pf', /^final\/pf$/]
];

// ============ ACCESO: solo celulares autorizados (no hay "link con llave") ============
// Cada celular recibe una invitación de UN solo uso. Al activarla, el servidor le da a ese
// celular su propia clave secreta, que queda guardada SOLO en él. El link de la app, sin
// esa clave, no muestra ningún dato. Desde el celular del administrador se ven los
// celulares autorizados, se les quita el acceso y se invita a otros.
//
// ⚠️ Toda función sin "_" al final se puede llamar desde la página: por eso las de
// trabajo terminan en "_" y las públicas validan el celular antes de hacer nada.

var INVITACION_HORAS = 24;
var NO_AUTORIZADO = 'NO_AUTORIZADO';

/** Ejecutar desde el editor (▶): crea la invitación de administrador (la tuya) y la muestra en el registro. */
function primerAcceso() {
  var url = ScriptApp.getService().getUrl();
  if (!url) throw new Error('Primero implementa como Aplicación web (Implementar → Nueva implementación)');
  // Solo sirve mientras no haya administrador: así nadie puede usarla desde afuera después.
  var hayAdmin = props_().getKeys().some(function (k) {
    return k.indexOf('DISP_') === 0 && JSON.parse(props_().getProperty(k)).rol === 'admin';
  });
  if (hayAdmin) throw new Error('Ya hay un celular administrador. Si lo perdiste: Configuración del proyecto → Propiedades del script → borra las que empiezan con DISP_ y vuelve a ejecutar primerAcceso.');
  var codigo = invitar_('Omar', 'admin');
  Logger.log('📱 Abre este link EN TU CELULAR y toca "Activar" (vale 1 sola vez, 24 horas):');
  Logger.log(url + '?invita=' + codigo);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var t = HtmlService.createTemplateFromFile('App');
  // Solo se acepta un código con forma válida: nada de texto libre dentro de la página.
  t.invita = /^[a-f0-9]{64}$/.test(p.invita || '') ? p.invita : '';
  t.config = { firma: props_().getProperty('FIRMA') || 'Rurush Fitness Club' };
  return t.evaluate().setTitle('Rurush Entrevistas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Para escribir datos dentro de un <script> sin que "</script>" pueda romperlo. */
function jsonSeguro_(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

// ---- Llamadas de la app del celular (google.script.run) ----
function appActivar(codigo) { return envolver_(function () { return activar_(codigo); }); }
function appLista(t) { return envolver_(function () { var yo = dispositivo_(t, true); var r = lista_(); r.yo = yo; return r; }); }
function appGuardar(p) { return envolver_(function () { dispositivo_(p && p.t); return guardar_(p); }); }
function appEquipo(t) { return envolver_(function () { return equipo_(admin_(t)); }); }
function appInvitar(t, nombre) { return envolver_(function () { admin_(t); return { codigo: invitar_(nombre, 'evaluador'), url: ScriptApp.getService().getUrl() }; }); }
function appQuitar(t, id) { return envolver_(function () { return quitar_(admin_(t), id); }); }

// ---- Extensión de Chrome: todo por POST (la clave nunca va en la URL) ----
function doPost(e) {
  return responder_(function () {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (p.a === 'activar') return activar_(p.codigo);
    var yo = dispositivo_(p.t, p.a === 'lista');
    if (p.a === 'lista') { var r = lista_(); r.yo = yo; return r; }
    if (p.a === 'guardar') return guardar_(p);
    if (p.a === 'equipo') return equipo_(admin_(p.t));
    if (p.a === 'invitar') { admin_(p.t); return { codigo: invitar_(p.nombre, 'evaluador'), url: ScriptApp.getService().getUrl() }; }
    if (p.a === 'quitar') return quitar_(admin_(p.t), p.id);
    throw new Error('Acción desconocida');
  });
}

function envolver_(fn) {
  try { var out = fn(); out.ok = true; return out; } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

function responder_(fn) {
  return ContentService.createTextOutput(JSON.stringify(envolver_(fn))).setMimeType(ContentService.MimeType.JSON);
}

function props_() { return PropertiesService.getScriptProperties(); }
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s))
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function aleatorio_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); } // 64 hex, 244 bits
function ahora_() { return Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd HH:mm'); }

/** Valida la clave del celular. Se guarda solo su huella (SHA-256), nunca la clave. */
function dispositivo_(t, marcarUso) {
  if (!/^[a-f0-9]{64}$/.test(t || '')) throw new Error(NO_AUTORIZADO);
  var h = hash_(t);
  var raw = props_().getProperty('DISP_' + h);
  if (!raw) throw new Error(NO_AUTORIZADO);
  var d = JSON.parse(raw);
  if (marcarUso && d.ultimo !== ahora_().slice(0, 13)) {   // a lo más 1 escritura por hora
    d.ultimo = ahora_().slice(0, 13);
    props_().setProperty('DISP_' + h, JSON.stringify(d));
  }
  return { id: h.slice(0, 12), nombre: d.nombre, rol: d.rol };
}

function admin_(t) {
  var yo = dispositivo_(t);
  if (yo.rol !== 'admin') throw new Error('Solo el administrador puede hacer esto');
  return yo;
}

/** Invitación de un solo uso. La de admin ocupa siempre la misma ranura (no se acumulan). */
function invitar_(nombre, rol) {
  nombre = String(nombre || '').replace(/[<>]/g, '').trim().slice(0, 40);
  if (!nombre) throw new Error('Ponle un nombre (ej.: Celular de la administradora)');
  var codigo = aleatorio_();
  var inv = { h: hash_(codigo), nombre: nombre, rol: rol, expira: Date.now() + INVITACION_HORAS * 3600000 };
  props_().setProperty(rol === 'admin' ? 'INV_ADMIN' : 'INV_' + inv.h, JSON.stringify(inv));
  return codigo;
}

function activar_(codigo) {
  if (!/^[a-f0-9]{64}$/.test(codigo || '')) throw new Error('Invitación inválida');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = props_(), h = hash_(codigo), clave = 'INV_' + h, raw = p.getProperty(clave);
    if (!raw) {
      var adm = p.getProperty('INV_ADMIN');
      if (adm && JSON.parse(adm).h === h) { clave = 'INV_ADMIN'; raw = adm; }
    }
    if (!raw) throw new Error('Esta invitación ya se usó o no existe. Pide una nueva.');
    var inv = JSON.parse(raw);
    p.deleteProperty(clave);                       // un solo uso, aunque esté vencida
    if (Date.now() > inv.expira) throw new Error('La invitación venció. Pide una nueva.');
    var t = aleatorio_();
    p.setProperty('DISP_' + hash_(t), JSON.stringify({ nombre: inv.nombre, rol: inv.rol, creado: ahora_(), ultimo: ahora_().slice(0, 13) }));
    return { t: t, nombre: inv.nombre, rol: inv.rol };
  } finally {
    lock.releaseLock();
  }
}

function equipo_(yo) {
  var todo = props_().getProperties(), lista = [], pendientes = [];
  Object.keys(todo).forEach(function (k) {
    if (k.indexOf('DISP_') !== 0 && k.indexOf('INV_') !== 0) return;   // FIRMA, CALENDARIO_ID…
    var v = JSON.parse(todo[k]);
    if (k.indexOf('DISP_') === 0) {
      var id = k.slice(5, 17);
      lista.push({ id: id, nombre: v.nombre, rol: v.rol, creado: v.creado, ultimo: v.ultimo, yo: id === yo.id });
    } else if (k.indexOf('INV_') === 0 && Date.now() < v.expira) {
      pendientes.push({ nombre: v.nombre, vence: Utilities.formatDate(new Date(v.expira), 'America/Lima', 'dd/MM HH:mm') });
    }
  });
  return { dispositivos: lista, pendientes: pendientes };
}

function quitar_(yo, id) {
  if (!/^[a-f0-9]{12}$/.test(id || '')) throw new Error('Celular inválido');
  if (id === yo.id) throw new Error('No puedes quitarte el acceso a ti mismo desde aquí');
  var p = props_(), claves = p.getKeys().filter(function (k) { return k.indexOf('DISP_' + id) === 0; });
  if (!claves.length) throw new Error('Ese celular ya no tiene acceso');
  p.deleteProperty(claves[0]);
  return equipo_(yo);
}

function norm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!]/g, '').replace(/\s+/g, ' ').trim();
}

function hoja_() {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(HOJA);
  if (!sh) throw new Error('No encuentro la pestaña "' + HOJA + '"');
  return sh;
}

/** id → número de columna (1-based). */
function columnas_(encabezados) {
  var cols = {};
  var h = encabezados.map(norm_);
  CAMPOS.forEach(function (c) {
    for (var i = 0; i < h.length; i++) if (c[1].test(h[i])) { cols[c[0]] = i + 1; break; }
  });
  // NOTAS aparece dos veces: la primera son notas rápidas, la última el comentario final.
  var notas = [];
  h.forEach(function (t, i) { if (t === 'notas') notas.push(i + 1); });
  if (notas.length) cols.notas = notas[0];
  if (notas.length > 1) cols.notasFinal = notas[notas.length - 1];
  // Criterios: "ACTITUD/E1", "COMUNICACIÓN/E2", ...
  h.forEach(function (t, i) {
    var m = t.match(/^([a-z]+)\/e([12])$/);
    if (m && CRITERIOS.indexOf(m[1]) >= 0) cols[m[1] + 'E' + m[2]] = i + 1;
  });
  ['estado', 'nombre', 'fechaE1', 'fechaE2'].forEach(function (k) {
    if (!cols[k]) throw new Error('No encuentro la columna ' + k.toUpperCase() + ' en el Sheet');
  });
  return cols;
}

/** Identifica la fila aunque alguien ordene el Sheet. Las filas sin marca/correo/nombre
 *  (leads cargados a mano) se reconocen por su celular y NOTAS para no confundirlas entre sí. */
function huella_(fila, cols) {
  var v = function (k) { return cols[k] ? String(fila[cols[k] - 1] == null ? '' : fila[cols[k] - 1]).trim() : ''; };
  var h = [v('marca'), v('email'), v('nombre')].join('|');
  return h === '||' ? h + '|' + v('wa') + '|' + v('notas') : h;
}

/** Texto tal cual: sin esto Sheets convierte "=…" en fórmula y "3/10" en fecha. */
function texto_(v) {
  v = String(v);
  return /^[=+\-@]/.test(v) || /^[\d\s\/.,:%-]+$/.test(v) ? "'" + v : v;
}

function lista_() {
  var sh = hoja_();
  var datos = sh.getDataRange().getDisplayValues();
  var cols = columnas_(datos[0]);
  var estados = [];
  var dv = sh.getRange(2, cols.estado).getDataValidation();
  if (dv && dv.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
    estados = dv.getCriteriaValues()[0];
  }
  var agenda = leerAgenda_();
  var cands = [];
  for (var r = 1; r < datos.length; r++) {
    var fila = datos[r];
    if (!fila.some(function (v) { return String(v).trim() !== ''; })) continue;
    var d = {};
    Object.keys(cols).forEach(function (k) { d[k] = fila[cols[k] - 1]; });
    cands.push({ fila: r + 1, huella: huella_(fila, cols), d: d, ag: agenda[claveAgenda_(fila, cols)] || null });
  }
  return { estados: estados, cands: cands, leido: new Date().toISOString() };
}

/**
 * p = { fila, huella, estado?, notas?, notasFinal?,
 *       ronda?: 1|2, puntajes?: {actitud: 7.5, ...} }
 * Con ronda + puntajes: escribe la FECHA de esa ronda (hoy), los 6 puntajes
 * y, si no se mandó un estado, pone "Entrevista N hecha".
 */
function guardar_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = hoja_();
    var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var cols = columnas_(enc);
    var fila = Number(p.fila);
    if (!(fila >= 2 && fila <= sh.getLastRow())) throw new Error('Fila inválida');
    var actual = sh.getRange(fila, 1, 1, enc.length).getDisplayValues()[0];
    if (huella_(actual, cols) !== p.huella) {
      throw new Error('El Sheet cambió (¿se ordenó o se borró una fila?). Toca 🔄 y vuelve a intentar.');
    }

    // Las notas se mandan completas: si alguien las cambió en el Sheet desde que se leyeron, no se pisan.
    [['notas', 'notasBase'], ['notasFinal', 'notasFinalBase']].forEach(function (n) {
      if (p[n[0]] == null || p[n[1]] == null || !cols[n[0]]) return;
      if (String(actual[cols[n[0]] - 1]).trim() !== String(p[n[1]]).trim()) {
        throw new Error('Alguien cambió las notas en el Sheet mientras tanto. Copia tu texto, toca 🔄 y vuelve a guardar.');
      }
    });

    var avisos = [];
    var clave = claveAgenda_(actual, cols);
    if (p.agendar) {
      var nombre = String(actual[cols.nombre - 1] || '').trim() || '(sin nombre)';
      agendar_(clave, nombre, cols.wa ? actual[cols.wa - 1] : '', p.agendar, avisos);
      if (!p.estado) p.estado = 'Entrevista ' + Number(p.agendar.ronda) + ' agendada';
    }
    if (p.agendaEstado === 'No vino' || p.agendaEstado === 'Cancelada') {
      var cita = ultimaAgenda_(clave);
      if (!cita || cita.estado !== 'Agendada') throw new Error('No hay una entrevista agendada para marcar');
      cambiarAgenda_(cita, p.agendaEstado);
      if (p.agendaEstado === 'Cancelada') borrarEvento_(cita.evento);
    }

    var ronda = Number(p.ronda);
    if (ronda === 1 || ronda === 2) {
      var citaHecha = ultimaAgenda_(clave);
      if (citaHecha && citaHecha.estado === 'Agendada' && citaHecha.ronda === 'E' + ronda) cambiarAgenda_(citaHecha, 'Asistió');
      var pts = p.puntajes || {};
      CRITERIOS.forEach(function (c) {
        var col = cols[c + 'E' + ronda];
        if (!col || pts[c] == null || pts[c] === '') return;
        var n = Number(pts[c]);
        if (!(n >= 1 && n <= 10)) throw new Error('Puntaje fuera de rango en ' + c);
        sh.getRange(fila, col).setValue(n);
      });
      var celFecha = sh.getRange(fila, cols['fechaE' + ronda]);
      celFecha.setValue(new Date()).setNumberFormat('dd/MM/yyyy');
      asegurarFormulas_(sh, fila, cols);
      if (!p.estado) p.estado = 'Entrevista ' + ronda + ' hecha';
    }

    if (p.estado != null) sh.getRange(fila, cols.estado).setValue(texto_(p.estado));
    if (p.notas != null && cols.notas) sh.getRange(fila, cols.notas).setValue(texto_(p.notas));
    if (p.notasFinal != null && cols.notasFinal) sh.getRange(fila, cols.notasFinal).setValue(texto_(p.notasFinal));

    SpreadsheetApp.flush();
    var nueva = sh.getRange(fila, 1, 1, enc.length).getDisplayValues()[0];
    var d = {};
    Object.keys(cols).forEach(function (k) { d[k] = nueva[cols[k] - 1]; });
    return { cand: { fila: fila, huella: huella_(nueva, cols), d: d, ag: publicaAgenda_(ultimaAgenda_(clave)) }, avisos: avisos };
  } finally {
    lock.releaseLock();
  }
}

/** Las filas nuevas del formulario no traen las fórmulas de PUNTAJE: se las pone si faltan. */
function asegurarFormulas_(sh, fila, cols) {
  function letra(c) { return sh.getRange(1, c).getA1Notation().replace(/\d+/g, ''); }
  function prom(ronda) {
    return CRITERIOS.map(function (c) { return cols[c + 'E' + ronda]; })
      .filter(Boolean).map(function (c) { return letra(c) + fila; }).join(',');
  }
  var objetivos = [
    ['pp1', '=IFERROR(ROUND(AVERAGE(' + prom(1) + '),1),"")'],
    ['pp2', '=IFERROR(ROUND(AVERAGE(' + prom(2) + '),1),"")']
  ];
  if (cols.pp1 && cols.pp2) {
    objetivos.push(['pf', '=IFERROR(ROUND(AVERAGE(' + letra(cols.pp1) + fila + ',' + letra(cols.pp2) + fila + '),1),"")']);
  }
  objetivos.forEach(function (o) {
    if (!cols[o[0]]) return;
    var cel = sh.getRange(fila, cols[o[0]]);
    if (!cel.getFormula()) cel.setFormula(o[1]);
  });
}

// ===================== AGENDA (pestaña aparte: no toca la del formulario) =====================

var HOJA_AGENDA = 'AGENDA ENTREVISTAS';
var ENC_AGENDA = ['CLAVE', 'NOMBRE', 'WHATSAPP', 'RONDA', 'FECHA', 'HORA', 'ESTADO', 'EVENTO CALENDAR', 'ACTUALIZADO'];
var TZ = 'America/Lima';
var DURACION_MIN = 30;
var DIRECCION = 'Av. Larco 1164, Víctor Larco (al costado de Mass)';

/** Identifica al postulante con datos que no cambian (marca temporal, correo, nombre, celular). */
function claveAgenda_(fila, cols) {
  return ['marca', 'email', 'nombre', 'wa'].map(function (k) {
    return cols[k] ? String(fila[cols[k] - 1] == null ? '' : fila[cols[k] - 1]).trim() : '';
  }).join('|');
}

function hojaAgenda_(crear) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(HOJA_AGENDA);
  if (!sh && crear) {
    sh = ss.insertSheet(HOJA_AGENDA, ss.getSheets().length);
    sh.getRange(1, 1, sh.getMaxRows(), ENC_AGENDA.length).setNumberFormat('@'); // todo como texto
    sh.getRange(1, 1, 1, ENC_AGENDA.length).setValues([ENC_AGENDA]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function filaAgenda_(v, i) {
  return { fila: i + 1, clave: v[0], ronda: v[3], fecha: v[4], hora: v[5], estado: v[6], evento: v[7] };
}

function publicaAgenda_(c) {
  return c ? { ronda: c.ronda, fecha: c.fecha, hora: c.hora, estado: c.estado } : null;
}

/** clave → la cita más reciente de cada postulante. */
function leerAgenda_() {
  var sh = hojaAgenda_(false);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(1, 1, sh.getLastRow(), ENC_AGENDA.length).getDisplayValues().forEach(function (v, i) {
    if (i > 0 && v[0]) out[v[0]] = publicaAgenda_(filaAgenda_(v, i));
  });
  return out;
}

function ultimaAgenda_(clave) {
  var sh = hojaAgenda_(false);
  if (!sh || sh.getLastRow() < 2) return null;
  var datos = sh.getRange(1, 1, sh.getLastRow(), ENC_AGENDA.length).getDisplayValues();
  for (var i = datos.length - 1; i > 0; i--) if (datos[i][0] === clave) return filaAgenda_(datos[i], i);
  return null;
}

function cambiarAgenda_(cita, estado) {
  var sh = hojaAgenda_(true);
  sh.getRange(cita.fila, 7).setValue(estado);
  sh.getRange(cita.fila, 9).setValue(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
}

function calendario_() {
  var id = PropertiesService.getScriptProperties().getProperty('CALENDARIO_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error('No encuentro el calendario ' + id);
  return cal;
}

function borrarEvento_(id) {
  if (!id) return;
  try { var ev = calendario_().getEventById(id); if (ev) ev.deleteEvent(); } catch (err) { /* ya no existe */ }
}

/** ag = { ronda: 1|2, fecha: 'yyyy-MM-dd', hora: 'HH:mm' }. Si ya tenía una cita, la marca "Reagendada". */
function agendar_(clave, nombre, wa, ag, avisos) {
  var ronda = Number(ag.ronda);
  if (ronda !== 1 && ronda !== 2) throw new Error('Ronda inválida');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ag.fecha || '') || !/^\d{2}:\d{2}$/.test(ag.hora || '')) throw new Error('Fecha u hora inválida');
  var inicio = Utilities.parseDate(ag.fecha + ' ' + ag.hora, TZ, 'yyyy-MM-dd HH:mm');
  if (inicio.getTime() < Date.now() - 15 * 60000) throw new Error('Esa fecha y hora ya pasaron');

  var sh = hojaAgenda_(true);
  var previa = ultimaAgenda_(clave);
  if (previa && previa.estado === 'Agendada') {
    cambiarAgenda_(previa, 'Reagendada');
    borrarEvento_(previa.evento);
  }
  var evento = '';
  try {
    var ev = calendario_().createEvent('Entrevista E' + ronda + ' · ' + nombre, inicio,
      new Date(inicio.getTime() + DURACION_MIN * 60000), {
        location: DIRECCION,
        description: 'Postulante a Asesor(a) Comercial — Rurush\nWhatsApp: ' + wa
      });
    ev.addPopupReminder(30);
    evento = ev.getId();
  } catch (err) {
    avisos.push('Quedó agendada, pero no se pudo crear el evento en Calendar: ' + (err.message || err));
  }
  // Como texto: si no, Sheets convierte "2026-10-12" en fecha y "16:30" en hora.
  sh.getRange(sh.getLastRow() + 1, 1, 1, ENC_AGENDA.length).setNumberFormat('@').setValues([[
    clave, nombre, String(wa || ''), 'E' + ronda, ag.fecha, ag.hora, 'Agendada', evento,
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')]]);
}

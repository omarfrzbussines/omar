/**
 * RURUSH Entrevistas — app del celular + puente de la extensión de Chrome con el Sheet
 * "ENTREVISTA ASESOR V3" (pestaña "Respuestas de formulario 2").
 *
 * Se implementa como Aplicación web (Ejecutar como: Yo · Acceso: Cualquier usuario).
 * Sin la llave no muestra ni responde nada.
 *
 * GET  ?k=LLAVE                      → la app del celular (App.html)
 * GET  ?k=LLAVE&a=lista              → todos los postulantes (extensión)
 * POST {k, a:'guardar', fila, huella, ...} → guarda estado / notas / entrevista (extensión)
 * La app llama a appLista / appGuardar con google.script.run.
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

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.a) return app_(p.k);
  return responder_(function () {
    validarLlave_(p.k);
    if (p.a === 'lista') return lista_();
    throw new Error('Acción desconocida');
  });
}

function app_(k) {
  var llave = PropertiesService.getScriptProperties().getProperty('LLAVE');
  var salida;
  if (!llave || k !== llave) {
    salida = HtmlService.createHtmlOutput('<p style="font:17px system-ui;padding:24px">🔒 Este link no tiene la llave correcta. Pide el link completo.</p>');
  } else {
    var t = HtmlService.createTemplateFromFile('App');
    t.llave = k;
    t.config = { firma: PropertiesService.getScriptProperties().getProperty('FIRMA') || 'Rurush Fitness Club' };
    salida = t.evaluate();
  }
  return salida.setTitle('Rurush Entrevistas')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Llamadas de la app (google.script.run)
function appLista(k) { return envolver_(function () { validarLlave_(k); return lista_(); }); }
function appGuardar(p) { return envolver_(function () { validarLlave_(p && p.k); return guardar_(p); }); }

function doPost(e) {
  return responder_(function () {
    var p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    validarLlave_(p.k);
    if (p.a === 'guardar') return guardar_(p);
    throw new Error('Acción desconocida');
  });
}

function envolver_(fn) {
  try { var out = fn(); out.ok = true; return out; } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

function responder_(fn) {
  return ContentService.createTextOutput(JSON.stringify(envolver_(fn))).setMimeType(ContentService.MimeType.JSON);
}

function validarLlave_(k) {
  var llave = PropertiesService.getScriptProperties().getProperty('LLAVE');
  if (!llave) throw new Error('Falta crear la llave: ejecuta crearLlave en el editor');
  if (k !== llave) throw new Error('Llave incorrecta');
}

/** Ejecutar UNA vez desde el editor: crea la llave y la muestra en el registro. */
function crearLlave() {
  var props = PropertiesService.getScriptProperties();
  var llave = props.getProperty('LLAVE');
  if (!llave) {
    llave = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('LLAVE', llave);
  }
  var url = ScriptApp.getService().getUrl();
  Logger.log('LLAVE → ' + llave);
  Logger.log('URL   → ' + (url || '(implementa primero como Aplicación web)'));
  if (url) Logger.log('📱 LINK DEL CELULAR → ' + url + '?k=' + llave);
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
  var cands = [];
  for (var r = 1; r < datos.length; r++) {
    var fila = datos[r];
    if (!fila.some(function (v) { return String(v).trim() !== ''; })) continue;
    var d = {};
    Object.keys(cols).forEach(function (k) { d[k] = fila[cols[k] - 1]; });
    cands.push({ fila: r + 1, huella: huella_(fila, cols), d: d });
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

    var ronda = Number(p.ronda);
    if (ronda === 1 || ronda === 2) {
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
    return { cand: { fila: fila, huella: huella_(nueva, cols), d: d } };
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

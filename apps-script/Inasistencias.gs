/**
 * 🏃 INASISTENCIAS — recordatorio a socios ACTIVOS que dejaron de venir (reemplaza la rutina
 * «WTS SEGUIMIENTO INASISTENCIAS»). Va en el mismo proyecto que Difusiones_API.gs.
 *
 * Todos los días (lun–sáb, 7 am) consulta Apps Fit y arma la pestaña 🏃 INASISTENCIAS:
 *   - socios con plan vigente que llevan 4 días o más sin venir (los vencidos no entran),
 *   - asesora = la responsable/vendedora del socio en Apps Fit (Laura, Mónica o Danna),
 *   - grupo por días sin venir: A 4–6 · B 7–10 · C 11–15 · D 16–30 · E 31 o más,
 *   - a cada socio, como máximo un mensaje cada 5 días; si respondió y a los 3 días no vino,
 *     un SEGUIMIENTO,
 *   - salta a los de ⏸️ PAUSAS y a los marcados NO CONTACTAR.
 * Si un socio al que se le escribió vuelve a entrenar, su fila pasa a VOLVIO.
 * La extensión Rurush Difusiones la envía como cualquier tanda.
 */

var INASIST_HOJA = '🏃 INASISTENCIAS';
var PAUSAS_HOJA = '⏸️ PAUSAS';
var APPSFIT_BASE = 'https://webapiappsfit-cliente.azurewebsites.net';
var INASIST_FILA_CAB = 13;   // fila de cabecera (la API la busca en las primeras 15)
var INASIST_CADA = 5;        // días mínimos entre mensajes al mismo socio
var INASIST_SEGUIMIENTO = 3; // días después de responder sin venir → seguimiento

var MENSAJES_INASIST = {
  A: 'Hola {NOMBRE} 👋 soy {ASESORA} de Rurush. Te extrañamos estos días, ¿todo bien? 💪 ¿Te esperamos {DIAS}?',
  B: '¡Hola {NOMBRE}! Te habla {ASESORA} de Rurush 👋 No queremos que pierdas el ritmo que llevabas 🔥 ¿Vienes {DIAS}?',
  C: '{NOMBRE}, soy {ASESORA} de Rurush 👋 Si se te complicó el horario, te ayudo a encontrar uno que te acomode 💪 ¿Te queda {DIAS}?',
  D: 'Hola {NOMBRE} 👋 soy {ASESORA} de Rurush. Sé que cuesta retomar, por eso te escribo 🙌 Volvemos con una rutina a tu medida, ¿empezamos {DIAS}?',
  E: 'Hola {NOMBRE} 👋 soy {ASESORA} de Rurush. Hace un tiempo que no te vemos y queremos ayudarte a volver 💪 Empezamos con una rutina suave, a tu ritmo. ¿Te queda {DIAS}?',
  SEGUIMIENTO: '{NOMBRE}, te esperábamos estos días 😊 ¿Seguimos en pie? ¿Te queda {DIAS}?',
};
var NOMBRE_ASESORA = { LAURA: 'Laura', 'MÓNICA': 'Mónica', DANNA: 'Danna' };

// ───────────────────────── menú ─────────────────────────

function guardarClaveAppsFit() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Clave de empresa de Apps Fit', 'Pega el «TokenEmpresa» de Apps Fit. Queda guardado solo en este script.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var t = r.getResponseText().trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) { ui.alert('Eso no parece una clave de Apps Fit. No guardé nada.'); return; }
  PropertiesService.getScriptProperties().setProperty('APPSFIT_TOKEN', t);
  try { tokenAppsFit_(); ui.alert('Listo ✅ Apps Fit respondió bien.'); }
  catch (e) { ui.alert('Guardado, pero Apps Fit no aceptó la clave: ' + e.message); }
}

function generarInasistenciasMenu() {
  var r = generarInasistencias(true);
  SpreadsheetApp.getUi().alert(r.ok
    ? '✅ Lista de hoy en ' + INASIST_HOJA + ':\n' + r.nuevos + ' para enviar (' + r.porAsesora + ')\n'
      + r.seguimientos + ' seguimientos · ' + r.volvieron + ' volvieron a entrenar\n'
      + (r.sinAsesora ? r.sinAsesora + ' socios sin asesora en Apps Fit (no se les escribe)' : '')
    : '⚠️ ' + r.error);
}

function activarInasistenciasDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'generarInasistencias') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('generarInasistencias').timeBased().everyDays(1).atHour(7).inTimezone('America/Lima').create();
  SpreadsheetApp.getUi().alert('Listo ✅ La lista de inasistencias se arma sola de lunes a sábado a las 7 am.');
}

// ───────────────────────── proceso ─────────────────────────

function generarInasistencias(manual) {
  var hoyIso = Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
  var dow = new Date(hoyIso + 'T12:00:00Z').getUTCDay();
  if (dow === 0 && manual !== true) return { ok: true, domingo: true };

  var socios;
  try { socios = sociosAppsFit_(); } catch (e) { return { ok: false, error: e.message }; }

  var sh = hojaInasistencias_();
  var ancho = 12;
  var ultima = sh.getLastRow();
  var previas = ultima > INASIST_FILA_CAB ? sh.getRange(INASIST_FILA_CAB + 1, 1, ultima - INASIST_FILA_CAB, ancho).getValues() : [];

  // 1. Quedan solo las filas ya enviadas o con resultado; las de ayer sin enviar se rehacen.
  var quedan = previas.filter(function (r) { return esTrue_(r[8]) || String(r[10] || '').trim(); });
  quedan.forEach(function (r) { // texto, para que la hoja no lo convierta en fecha al reescribir
    if (r[0] instanceof Date) r[0] = Utilities.formatDate(r[0], 'America/Lima', 'dd/MM');
    r[0] = "'" + String(r[0]).replace(/^'/, '');
  });

  // 2. ¿Volvieron a entrenar después del mensaje?
  var volvieron = 0;
  quedan.forEach(function (r) {
    var s = socios[normPhone_(r[2])];
    var env = parseFecha_(r[9]);
    if (!s || !env || !esTrue_(r[8]) || /VOLVI/i.test(String(r[10]))) return;
    if (s.ultima && s.ultima > isoLima_(env)) {
      r[10] = 'VOLVIO';
      r[11] = '🏋️ Volvió ' + ddmm_(s.ultima) + (r[11] ? ' | ' + r[11] : '');
      volvieron++;
    }
  });

  // 3. Historial por celular (último mensaje enviado)
  var hist = {};
  quedan.forEach(function (r) {
    var tel = normPhone_(r[2]);
    var env = parseFecha_(r[9]);
    if (!tel || !esTrue_(r[8]) || !env) return;
    var iso = isoLima_(env);
    if (!hist[tel] || iso >= hist[tel].fecha) hist[tel] = { fecha: iso, grupo: String(r[4]), resultado: String(r[10] || '') };
  });

  // 4. A quién le toca hoy
  var pausas = pausas_(hoyIso), idx = indiceGlobal_();
  var nuevos = [], sinAsesora = 0, cuenta = {};
  Object.keys(socios).forEach(function (tel) {
    var s = socios[tel];
    if (!s.activo || s.dias === null || s.dias < 4) return;
    if (pausas[tel] || (idx[tel] && idx[tel].bloqueado)) return;
    if (!s.asesora) { sinAsesora++; return; }
    var h = hist[tel], grupo;
    var desde = h ? diasEntreIso_(h.fecha, hoyIso) : 999;
    if (h && desde < INASIST_CADA) {
      var respondio = /RESPONDI/i.test(h.resultado);
      if (!(respondio && desde >= INASIST_SEGUIMIENTO && h.grupo !== 'SEGUIMIENTO')) return;
      grupo = 'SEGUIMIENTO';
    } else {
      grupo = s.dias <= 6 ? 'A' : s.dias <= 10 ? 'B' : s.dias <= 15 ? 'C' : s.dias <= 30 ? 'D' : 'E';
    }
    var msj = MENSAJES_INASIST[grupo].replace('{ASESORA}', NOMBRE_ASESORA[s.asesora]);
    msj = conNombre_(msj, primerNombre_(s.nombres));
    nuevos.push(["'" + ddmm_(hoyIso), s.nombre, tel, s.asesora, grupo, s.dias, s.cod, msj, false, '', '', '']);
    cuenta[s.asesora] = (cuenta[s.asesora] || 0) + 1;
  });
  nuevos.sort(function (a, b) { return a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : a[5] - b[5]; });

  // 5. Escribir: historial + lista de hoy
  var filas = quedan.concat(nuevos);
  if (previas.length) sh.getRange(INASIST_FILA_CAB + 1, 1, previas.length, ancho).clearContent();
  if (filas.length) {
    sh.getRange(INASIST_FILA_CAB + 1, 1, filas.length, ancho).setValues(filas);
    sh.getRange(INASIST_FILA_CAB + 1, 9, filas.length, 1).insertCheckboxes();
  }
  sh.getRange(1, 1).setValue('🏃 INASISTENCIAS — lista del ' + ddmm_(hoyIso) + ': ' + nuevos.length + ' para enviar · socios activos con 4 o más días sin venir');
  var seguimientos = nuevos.filter(function (r) { return r[4] === 'SEGUIMIENTO'; }).length;
  var ahora = new Date();
  log_([Utilities.formatDate(ahora, 'America/Lima', 'dd/MM/yyyy'), Utilities.formatDate(ahora, 'America/Lima', 'HH:mm'),
    INASIST_HOJA, '', '', '', 'LISTA', nuevos.length + ' nuevos · ' + seguimientos + ' seguimientos · ' + volvieron + ' volvieron · ' + sinAsesora + ' sin asesora']);
  return {
    ok: true, nuevos: nuevos.length, seguimientos: seguimientos, volvieron: volvieron, sinAsesora: sinAsesora,
    porAsesora: Object.keys(cuenta).map(function (a) { return NOMBRE_ASESORA[a] + ' ' + cuenta[a]; }).join(' · ') || '—',
  };
}

// ───────────────────────── Apps Fit ─────────────────────────

function tokenAppsFit_() {
  var clave = PropertiesService.getScriptProperties().getProperty('APPSFIT_TOKEN');
  if (!clave) throw new Error('Falta la clave de Apps Fit (menú 🔁 Rurush → Guardar clave de Apps Fit).');
  var r = UrlFetchApp.fetch(APPSFIT_BASE + '/api/managements/auth', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ TokenEmpresa: clave }), muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw new Error('Apps Fit rechazó la clave (HTTP ' + r.getResponseCode() + ').');
  var tok = (JSON.parse(r.getContentText()).Item || {}).Token;
  if (!tok) throw new Error('Apps Fit no devolvió el acceso.');
  return tok;
}

/** { '519xxxxxxxx': { cod, nombre, nombres, activo, dias, ultima: 'AAAA-MM-DD'|null, asesora } } */
function sociosAppsFit_() {
  var bearer = tokenAppsFit_();
  var todos = [];
  for (var page = 1; page <= 100; page++) {
    var r = UrlFetchApp.fetch(APPSFIT_BASE + '/api/managements/customers?page=' + page
      + '&date_from=2020-01-01&date_to=2099-12-31&type_date=2&with_frostbite=0',
      { headers: { Authorization: 'Bearer ' + bearer }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('Apps Fit no respondió la lista de socios (HTTP ' + r.getResponseCode() + ').');
    var item = JSON.parse(r.getContentText()).Item || {};
    todos = todos.concat(item.cutomers || item.customers || []); // «cutomers»: así lo escribe Apps Fit
    if (!item.paging || page >= item.paging.pages) break;
  }

  // Un registro por socio: el de plan más reciente
  var mejor = {};
  todos.forEach(function (c) {
    var k = c.CodigoSocio;
    if (!mejor[k] || String(c.FechaFin || '') > String(mejor[k].FechaFin || '')) mejor[k] = c;
  });

  var hoyIso = Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
  var out = {};
  Object.keys(mejor).forEach(function (k) {
    var c = mejor[k];
    var nombre = (String(c.Nombres || '').trim() + ' ' + String(c.Apellidos || '').trim()).trim();
    if (/PRUEBA|USUARIO CLIENTE/i.test(nombre)) return;
    var tel = normPhone_(c.Celular);
    if (!tel) return;
    var fin = String(c.FechaFin || '').slice(0, 10);
    var ultima = String(c.UltimaAsistencia || '').slice(0, 10) || null;
    out[tel] = {
      cod: c.CodigoSocio, nombre: nombre, nombres: String(c.Nombres || ''),
      activo: !!fin && fin >= hoyIso,
      ultima: ultima,
      dias: ultima ? diasEntreIso_(ultima, hoyIso) : null,
      asesora: asesoraDe_(c),
    };
  });
  return out;
}

/**
 * Asesora del socio = su VENDEDOR en la membresía de Apps Fit (monica10da, DANNA123, LAURA31…).
 * El «Responsable» del registro es quien lo dio de alta (p. ej. recepción), no su asesora:
 * solo se usa si el socio no tiene vendedor.
 */
function asesoraDe_(c) {
  var valores = [c.Vendedor];
  Object.keys(c).forEach(function (k) { if (/respons/i.test(k) && c[k]) valores.push(c[k]); });
  for (var i = 0; i < valores.length; i++) {
    var v = sinTildes_(valores[i]);
    if (/^LAURA/.test(v)) return 'LAURA';
    if (/^MONICA/.test(v)) return 'MÓNICA';
    if (/^DANNA/.test(v)) return 'DANNA';
  }
  return null;
}

// ───────────────────────── hojas ─────────────────────────

function hojaInasistencias_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(INASIST_HOJA);
  if (sh) return sh;
  sh = ss.insertSheet(INASIST_HOJA);
  var C = '$C$14:$C', D = '$D$14:$D', E = '$E$14:$E', I = '$I$14:$I', K = '$K$14:$K';
  var RESP = '"RESPONDI|VOLVI|NO INTERESA"', VOL = '"VOLVI"';
  var fila = function (label, cond, r) {
    var c = cond ? ',' + cond : '';
    return [label,
      '=SUMPRODUCT(--(LEN(' + C + ')>=9)' + c + ')',
      '=SUMPRODUCT(--(TO_TEXT(' + I + ')="TRUE")' + c + ')',
      '=B' + r + '-C' + r,
      '=IFERROR(TEXT(C' + r + '/B' + r + ',"0.0%"),"—")',
      '=SUMPRODUCT(--REGEXMATCH(UPPER(TO_TEXT(' + K + ')),' + RESP + ')' + c + ')',
      '=IFERROR(TEXT(F' + r + '/C' + r + ',"0.0%"),"—")',
      '=SUMPRODUCT(--REGEXMATCH(UPPER(TO_TEXT(' + K + ')),' + VOL + ')' + c + ')',
      '=IFERROR(TEXT(H' + r + '/C' + r + ',"0.0%"),"—")'];
  };
  var cab = function (t) { return [t, 'Asignados', 'Enviados', 'Pendientes', '% avance', 'Respondieron', '% respuesta', 'Volvieron', '% volvió']; };
  var as = function (L) { return '--(LEFT(UPPER(TO_TEXT(' + D + ')),1)="' + L + '")'; };
  var gr = function (g) { return '--(TO_TEXT(' + E + ')="' + g + '")'; };
  sh.getRange(1, 1, 12, 9).setValues([
    ['🏃 INASISTENCIAS', '', '', '', '', '', '', '', ''],
    ['Se arma sola cada mañana desde Apps Fit (socios activos con 4 o más días sin venir). Volvieron = entrenó después del mensaje.', '', '', '', '', '', '', '', ''],
    cab('📊 AVANCE'), fila('TOTAL', '', 4),
    cab('POR ASESORA'), fila('LAURA', as('L'), 6), fila('MÓNICA', as('M'), 7), fila('DANNA', as('D'), 8),
    cab('POR GRUPO'), fila('A · 4 a 6 días', gr('A'), 10), fila('B a E · 7 días o más', '--REGEXMATCH(TO_TEXT(' + E + '),"^[BCDE]$")', 11),
    fila('SEGUIMIENTO', gr('SEGUIMIENTO'), 12),
  ]);
  sh.getRange(INASIST_FILA_CAB, 1, 1, 12).setValues([['LISTA DEL', 'NOMBRE', 'CELULAR', 'ASESORA', 'GRUPO', 'DÍAS SIN VENIR', 'CÓD SOCIO', 'MENSAJE', 'ENV', 'FECHA', 'RESULTADO', 'NOTA']]);
  sh.setFrozenRows(INASIST_FILA_CAB);
  sh.getRange(1, 1, 1, 12).setFontWeight('bold').setFontSize(13).setBackground('#1e3863').setFontColor('#ffffff');
  [3, 5, 9].forEach(function (f) { sh.getRange(f, 1, 1, 9).setFontWeight('bold').setBackground('#38751c').setFontColor('#ffffff'); });
  sh.getRange(INASIST_FILA_CAB, 1, 1, 12).setFontWeight('bold').setBackground('#38751c').setFontColor('#ffffff');
  sh.getRange(1, 1, 200, 12).setFontFamily('Arial');
  sh.setColumnWidth(2, 220); sh.setColumnWidth(8, 460); sh.setColumnWidths(11, 2, 190);
  sh.getRange(INASIST_FILA_CAB + 1, 8, 500, 1).setWrap(true);
  sh.getRange(INASIST_FILA_CAB + 1, 11, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['ENVIADO SIN RESPUESTA', 'RESPONDIO - POR CONTESTAR', 'RESPONDIO - ATENDIDO', 'VOLVIO', 'NO INTERESA', 'NUMERO MALO', 'SIN WHATSAPP', 'NO CONTACTAR'], true)
    .setAllowInvalid(true).build());
  return sh;
}

/** Celulares en pausa: hoja ⏸️ PAUSAS (CELULAR · NOMBRE · VUELVE EL · MOTIVO). Sin fecha = pausa indefinida. */
function pausas_(hoyIso) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(PAUSAS_HOJA);
  if (!sh) {
    sh = ss.insertSheet(PAUSAS_HOJA);
    sh.getRange(1, 1, 1, 4).setValues([['CELULAR', 'NOMBRE', 'VUELVE EL (dd/mm/aaaa)', 'MOTIVO']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return {};
  }
  var out = {}, n = sh.getLastRow() - 1;
  if (n < 1) return out;
  sh.getRange(2, 1, n, 3).getValues().forEach(function (r) {
    var tel = normPhone_(r[0]);
    var vuelve = parseFecha_(r[2]);
    if (tel && (!vuelve || isoLima_(vuelve) >= hoyIso)) out[tel] = true;
  });
  return out;
}

// ───────────────────────── utilidades ─────────────────────────

function diasEntreIso_(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}

/** Pone el nombre; si no hay un nombre usable, deja un saludo neutro sin huecos. */
function conNombre_(msj, nombre) {
  if (nombre) return msj.replace('{NOMBRE}', nombre);
  return msj.replace(/^\{NOMBRE\}, /, '¡Hola! ').replace('¡Hola {NOMBRE}!', '¡Hola!').replace('Hola {NOMBRE} ', 'Hola ');
}

function primerNombre_(nombres) {
  var p = String(nombres || '').trim().split(/\s+/)[0] || '';
  p = p.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, '');
  return p.length >= 3 ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

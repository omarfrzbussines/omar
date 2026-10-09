/**
 * Embudo de las difusiones: ¿el contacto AGENDÓ, VINO o SE INSCRIBIÓ después del envío?
 * Va en el mismo proyecto de Apps Script que Difusiones_API.gs (usa sus utilidades).
 *
 * No lee chats ni usa IA: cruza cada número enviado con lo que ya está registrado.
 *   - Pipedrive: actividad «FP …» / «FREE PASS …» creada DESPUÉS del envío → AGENDADO;
 *     si esa actividad está realizada (done) → VINO.
 *   - 3. BASE DE SOCIOS (archivo de ventas): plan que inicia en o después del envío → SE INSCRIBIO.
 * Solo sube el estado (nunca lo baja) y deja el detalle en la NOTA.
 *
 * Uso: menú «🔁 Rurush» del Sheet → «Guardar token de Pipedrive» (una vez) →
 *      «Activar actualización diaria» (corre todos los días a las 9 pm) o «Actualizar embudo ahora».
 */

var SOCIOS_ID = '1j6Js9ToQUJ96yCUmMKh5jmEAebfNSzlpYs5ItSEDuUI';
var SOCIOS_HOJA = '3. BASE DE SOCIOS';
var EMBUDO_DIAS = 60; // revisa envíos de los últimos 60 días

var RANGO_EMBUDO = { AGENDADO: 2, VINO: 3, 'SE INSCRIBIO': 4 };

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔁 Rurush')
    .addItem('Guardar token de Pipedrive', 'guardarTokenPipedrive')
    .addItem('Actualizar embudo ahora', 'actualizarEmbudoMenu')
    .addItem('Activar actualización diaria (9 pm)', 'activarEmbudoDiario')
    .addToUi();
}

function guardarTokenPipedrive() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Token de Pipedrive', 'Pégalo aquí (Pipedrive → Configuración personal → API). Queda guardado solo en este script.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var t = r.getResponseText().trim();
  if (!/^[a-f0-9]{30,50}$/i.test(t)) { ui.alert('Eso no parece un token de Pipedrive. No guardé nada.'); return; }
  PropertiesService.getScriptProperties().setProperty('PIPEDRIVE_TOKEN', t);
  var yo = pipedrive_('/users/me', {}, t);
  ui.alert(yo && yo.data ? 'Listo ✅ Conectado como ' + yo.data.name + '.' : 'Guardado, pero Pipedrive no respondió. Revisa el token.');
}

function activarEmbudoDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'actualizarEmbudo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('actualizarEmbudo').timeBased().everyDays(1).atHour(21).inTimezone('America/Lima').create();
  SpreadsheetApp.getUi().alert('Listo ✅ El embudo se actualiza solo todos los días a las 9 pm.');
}

function actualizarEmbudoMenu() {
  var r = actualizarEmbudo();
  SpreadsheetApp.getUi().alert(r.ok
    ? '✅ Revisados ' + r.revisados + ' envíos.\nAgendados nuevos: ' + r.agendados + '\nVinieron nuevos: ' + r.vinieron + '\nInscritos nuevos: ' + r.inscritos
    : '⚠️ ' + r.error);
}

// ───────────────────────── proceso ─────────────────────────

function actualizarEmbudo() {
  var token = PropertiesService.getScriptProperties().getProperty('PIPEDRIVE_TOKEN');
  if (!token) return { ok: false, error: 'Falta el token de Pipedrive (menú 🔁 Rurush → Guardar token).' };

  // 1. Envíos a revisar
  var envios = [];
  pestanasTanda_().forEach(function (t) {
    var h = t.h;
    if (h.resultado < 0 || h.fecha < 0) return;
    filas_(t.sh, h).forEach(function (f) {
      if (!esTrue_(f.v[h.env])) return;
      var fecha = parseFecha_(f.v[h.fecha]);
      var tel = normPhone_(f.v[h.celular]);
      if (!fecha || !tel || (Date.now() - fecha.getTime()) / 86400000 > EMBUDO_DIAS) return;
      envios.push({ sh: t.sh, h: h, fila: f.fila, tel: tel, enviado: isoLima_(fecha), resultado: String(f.v[h.resultado] || ''), nota: h.nota >= 0 ? String(f.v[h.nota] || '') : '' });
    });
  });
  if (!envios.length) return { ok: true, revisados: 0, agendados: 0, vinieron: 0, inscritos: 0 };
  var desde = envios.reduce(function (m, e) { return e.enviado < m ? e.enviado : m; }, '9999-99-99');

  // 2. Free Pass de Pipedrive y 3. inscripciones
  var fps = freePassPorTelefono_(token, desde);
  var socios = iniciosPorTelefono_();

  // 4. Subir el estado de cada fila
  var cuenta = { ok: true, revisados: envios.length, agendados: 0, vinieron: 0, inscritos: 0 };
  envios.forEach(function (e) {
    var nuevo = null, detalle = '';
    var inicio = (socios[e.tel] || []).filter(function (d) { return d >= e.enviado; }).sort()[0];
    var fp = (fps[e.tel] || []).filter(function (a) { return a.creado >= e.enviado; })
      .sort(function (a, b) { return (b.hecho - a.hecho) || (a.cita < b.cita ? -1 : 1); })[0];
    if (inicio) { nuevo = 'SE INSCRIBIO'; detalle = '✅ Plan desde ' + ddmm_(inicio) + ' (BASE DE SOCIOS)'; }
    else if (fp && fp.hecho) { nuevo = 'VINO'; detalle = '🏋️ Vino al FP ' + fp.texto + ' (Pipedrive)'; }
    else if (fp) { nuevo = 'AGENDADO'; detalle = '📅 FP ' + fp.texto + ' (Pipedrive)'; }
    if (!nuevo || rangoEmbudo_(e.resultado) >= RANGO_EMBUDO[nuevo]) return;

    e.sh.getRange(e.fila, e.h.resultado + 1).setValue(nuevo);
    if (e.h.nota >= 0) e.sh.getRange(e.fila, e.h.nota + 1).setValue(detalle + (e.nota ? ' | ' + e.nota : ''));
    if (nuevo === 'AGENDADO') cuenta.agendados++;
    if (nuevo === 'VINO') cuenta.vinieron++;
    if (nuevo === 'SE INSCRIBIO') cuenta.inscritos++;
    var ahora = new Date();
    log_([Utilities.formatDate(ahora, 'America/Lima', 'dd/MM/yyyy'), Utilities.formatDate(ahora, 'America/Lima', 'HH:mm'),
      e.sh.getName(), e.fila, e.tel, '', nuevo, detalle]);
  });
  return cuenta;
}

function rangoEmbudo_(resultado) {
  var r = sinTildes_(resultado);
  if (/INSCRIB/.test(r)) return 4;
  if (/^VINO/.test(r)) return 3;
  if (/AGEND/.test(r)) return 2;
  return 1;
}

// ───────────────────────── Pipedrive ─────────────────────────

function pipedrive_(ruta, params, token) {
  var q = Object.keys(params || {}).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
  var res = UrlFetchApp.fetch('https://api.pipedrive.com/v1' + ruta + (q ? '?' + q : ''), {
    headers: { 'x-api-token': token }, muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText());
}

/** { '519xxxxxxxx': [{ creado: 'AAAA-MM-DD', cita: 'AAAA-MM-DD HH:MM', hecho: bool, texto }] } */
function freePassPorTelefono_(token, desde) {
  var hasta = isoLima_(new Date(Date.now() + 45 * 86400000));
  var acts = [], start = 0;
  for (var vuelta = 0; vuelta < 40; vuelta++) {
    var r = pipedrive_('/activities', { user_id: 0, type: 'meeting', start_date: desde, end_date: hasta, start: start, limit: 500 }, token);
    if (!r) throw new Error('Pipedrive no respondió (¿token vencido?).');
    (r.data || []).forEach(function (a) {
      if (/^(FP|FREE PASS)/i.test(String(a.subject || '').trim()) && a.person_id) acts.push(a);
    });
    var pag = r.additional_data && r.additional_data.pagination;
    if (!pag || !pag.more_items_in_collection) break;
    start = pag.next_start;
  }

  // Teléfonos de las personas, en paralelo de a 25
  var ids = {};
  acts.forEach(function (a) { ids[a.person_id && a.person_id.value || a.person_id] = true; });
  var lista = Object.keys(ids), tels = {};
  for (var i = 0; i < lista.length; i += 25) {
    var lote = lista.slice(i, i + 25);
    var res = UrlFetchApp.fetchAll(lote.map(function (id) {
      return { url: 'https://api.pipedrive.com/v1/persons/' + id, headers: { 'x-api-token': token }, muteHttpExceptions: true };
    }));
    res.forEach(function (rr, k) {
      if (rr.getResponseCode() !== 200) return;
      var p = JSON.parse(rr.getContentText()).data || {};
      tels[lote[k]] = (p.phone || []).map(function (x) { return normPhone_(x.value); }).filter(Boolean);
    });
  }

  var out = {};
  acts.forEach(function (a) {
    var pid = a.person_id && a.person_id.value || a.person_id;
    var cita = limaDeUtc_(a.due_date, a.due_time);
    var item = {
      creado: limaDeUtc_(String(a.add_time || '').slice(0, 10), String(a.add_time || '').slice(11, 16)).slice(0, 10),
      cita: cita, hecho: !!a.done, texto: textoCita_(cita),
    };
    (tels[pid] || []).forEach(function (t) { (out[t] = out[t] || []).push(item); });
  });
  return out;
}

/** Pipedrive guarda fecha/hora en UTC: devuelve 'AAAA-MM-DD HH:MM' en hora de Lima. */
function limaDeUtc_(fecha, hora) {
  if (!fecha) return '';
  var p = String(fecha).split('-'), h = String(hora || '12:00').split(':');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), Number(h[0]) || 0, Number(h[1]) || 0) - 5 * 3600000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function textoCita_(cita) {
  if (!cita) return '';
  var dia = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(cita.slice(0, 10) + 'T12:00:00Z').getUTCDay()];
  return dia + ' ' + ddmm_(cita) + ' ' + cita.slice(11, 16);
}

// ───────────────────────── socios ─────────────────────────

/** { '519xxxxxxxx': ['AAAA-MM-DD' de inicio de plan, …] } desde 3. BASE DE SOCIOS (D celular, H inicio). */
function iniciosPorTelefono_() {
  var sh = SpreadsheetApp.openById(SOCIOS_ID).getSheetByName(SOCIOS_HOJA);
  var out = {};
  if (!sh) return out;
  var last = sh.getLastRow();
  if (last < 6) return out;
  sh.getRange(6, 3, last - 5, 6).getValues().forEach(function (r) { // C..H: r[1]=D celular, r[5]=H inicio
    var tel = normPhone_(r[1]);
    var inicio = parseFecha_(r[5]);
    if (tel && inicio) (out[tel] = out[tel] || []).push(isoLima_(inicio));
  });
  return out;
}

// ───────────────────────── fechas ─────────────────────────

function isoLima_(d) {
  return Utilities.formatDate(d, 'America/Lima', 'yyyy-MM-dd');
}

function ddmm_(iso) {
  return iso.slice(8, 10) + '/' + iso.slice(5, 7);
}

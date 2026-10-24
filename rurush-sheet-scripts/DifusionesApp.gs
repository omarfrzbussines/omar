/**
 * RURUSH Llamadas → pestaña 📣 Difusiones (por ahora solo DANNA, desde su celular 977 576 273).
 * Lee las tandas del Sheet DIFUSIONES_RURUSH_ago2026 (rurushfitclub tiene edición) con LAS MISMAS
 * reglas que la extensión Rurush Difusiones (Difusiones_API.gs): ENV vacío, RESULTADO vacío o
 * PENDIENTE…, nadie marcado NO CONTACTAR / socio activo, nadie que recibió difusión en 30 días,
 * {DIAS} con la frase del día y fuera los mensajes con día fijo o {HORA}. Las pestañas con imagen
 * no salen (WhatsApp no deja adjuntarla desde un enlace).
 * La asesora toca 📲 Enviar → se abre su WhatsApp con el texto → al volver a la app se marca sola
 * la fila (ENV, FECHA, RESULTADO, NOTA) y queda en 📜 LOG EXTENSIÓN. Tope por día en DF_ASESORAS.
 * Prefijo de todo: df_ / DF_.
 */
const DF_ID = "1xhvbdPgd9Nyhj96ZrFIkDKnZvE2gh5WVph5c0tHkI0E";
const DF_ASESORAS = { DANNA: 15 };     // asesora → envíos de difusión al día desde la app
const DF_ANTIDUP = 30;                 // días sin repetir difusión al mismo número
const DF_TANDAS = /TANDA/i;            // solo pestañas de tanda (no las listas viejas de agosto)
const DF_MARCA = "app Llamadas";       // va en la NOTA y en el LOG: así se cuentan los envíos de la app

let DF_LIBRO = null, DF_TABS = null;
function df_libro_() { return DF_LIBRO || (DF_LIBRO = SpreadsheetApp.openById(DF_ID)); }
function df_tandas_() {
  if (DF_TABS) return DF_TABS;
  DF_TABS = [];
  df_libro_().getSheets().forEach(function (sh) { const h = df_cabecera_(sh); if (h) DF_TABS.push({ sh: sh, h: h }); });
  return DF_TABS;
}
function df_base_(s) { return df_sinTildes_(s).split(/[\s·(]+/)[0]; }
function df_hoy_() { return Utilities.formatDate(new Date(), "America/Lima", "dd/MM/yyyy"); }
function df_quien_(llave, como) {
  const q = so_quien_(llave, como);
  if (!DF_ASESORAS[q]) throw new Error("📣 Difusiones todavía no está activo para " + q + ".");
  return q;
}
function df_log_() { return df_libro_().getSheetByName(DF_LOG); }
/** Envíos de hoy hechos desde la app por esa asesora (los «DESHECHO» no cuentan). */
function df_enviadosHoy_(quien) {
  const sh = df_log_();
  if (!sh || sh.getLastRow() < 2) return 0;
  const desde = Math.max(2, sh.getLastRow() - 600), hoy = df_hoy_();
  return sh.getRange(desde, 1, sh.getLastRow() - desde + 1, 8).getDisplayValues().filter(function (r) {
    return r[0] === hoy && r[6] === "ENVIADO" && df_base_(r[5]) === quien && r[7].indexOf(DF_MARCA) >= 0;
  }).length;
}

/** Lista para la asesora: hasta lo que le queda del tope de hoy. */
function df_lista(llave, como) {
  const quien = df_quien_(llave, como), tope = DF_ASESORAS[quien];
  const hechos = df_enviadosHoy_(quien), quedan = Math.max(0, tope - hechos);
  const dias = df_diasHoy_(), idx = df_indiceGlobal_(), items = [];
  let pendientes = 0;
  df_tandas_().forEach(function (t) {
    const tab = t.sh.getName(), h = t.h;
    if (!DF_TANDAS.test(tab) || df_esChatExistente_(tab) || h.asesora < 0) return;
    if (df_imagenUrl_(t.sh, h)) return;
    const vistos = {};
    df_filas_(t.sh, h).forEach(function (f) {
      const v = f.v;
      if (df_base_(v[h.asesora]) !== quien || df_esTrue_(v[h.env])) return;
      const res = h.resultado >= 0 ? String(v[h.resultado]).trim() : "";
      if (res && !/^PENDIENTE/i.test(res)) return;
      const tel = df_normPhone_(v[h.celular]);
      if (!tel || /(\d)\1{5,}/.test(tel.slice(2)) || vistos[tel]) return;
      vistos[tel] = 1;
      const g = idx[tel];
      if (g && (g.bloqueado || g.socioActivo)) return;
      if (g && g.ultimo && (Date.now() - g.ultimo) / 864e5 < DF_ANTIDUP) return;
      let msj = String(v[h.mensaje] || "").trim();
      if (!msj || /\{HORA\}/i.test(msj)) return;
      if (/\{DIAS\}/i.test(msj)) { if (!dias) return; msj = msj.replace(/\{DIAS\}/gi, dias); }
      else if (DF_DIAS_SEMANA.test(msj)) return;
      if (/\{[A-Z_]+\}/.test(msj)) return;
      pendientes++;
      if (items.length < quedan) items.push({ tab: tab, fila: f.fila, nombre: h.nombre >= 0 ? String(v[h.nombre]).trim() : "", celular: tel, mensaje: msj });
    });
  });
  return { quien: quien, tope: tope, hoy: hechos, quedan: quedan, pendientes: pendientes, items: items };
}

/** Marca enviada la fila (la asesora volvió a la app después de abrir WhatsApp). d = { tab, fila, celular, seg, como } */
function df_marcar(llave, d) {
  const quien = df_quien_(llave, d && d.como);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (df_enviadosHoy_(quien) >= DF_ASESORAS[quien]) throw new Error("Ya llegaste a tus " + DF_ASESORAS[quien] + " difusiones de hoy.");
    const sh = df_libro_().getSheetByName(String(d.tab)), h = sh && df_cabecera_(sh), fila = Number(d.fila);
    if (!h || !(fila > h.row)) throw new Error("No encuentro esa fila. Toca 🔄.");
    const v = sh.getRange(fila, 1, 1, h.width).getValues()[0], tel = df_normPhone_(v[h.celular]);
    if (!tel || tel !== df_normPhone_(d.celular)) throw new Error("La fila cambió de número (¿movieron filas?). No marqué nada. Toca 🔄.");
    if (df_base_(v[h.asesora]) !== quien) throw new Error("Esa fila ya no es tuya. Toca 🔄.");
    if (df_esTrue_(v[h.env])) return { ok: true, ya: true };
    const ahora = new Date(), fecha = df_hoy_(), hora = Utilities.formatDate(ahora, "America/Lima", "HH:mm");
    const antes = { resultado: h.resultado >= 0 ? v[h.resultado] : "", nota: h.nota >= 0 ? v[h.nota] : "", fecha: h.fecha >= 0 ? v[h.fecha] : "" };
    const nota = "Enviado " + fecha.slice(0, 5) + " " + hora + " línea " + quien + " — " + DF_MARCA + " (WhatsApp " + Math.round(Number(d.seg) || 0) + " s)";
    sh.getRange(fila, h.env + 1).setValue(true);
    if (h.fecha >= 0) sh.getRange(fila, h.fecha + 1).setValue("'" + fecha);
    if (h.resultado >= 0) sh.getRange(fila, h.resultado + 1).setValue("ENVIADO SIN RESPUESTA");
    if (h.nota >= 0) sh.getRange(fila, h.nota + 1).setValue(nota);
    df_log_().appendRow([fecha, hora, d.tab, fila, tel, String(v[h.asesora]), "ENVIADO", nota]);
    uc_anotarSeguro_([{ tel: tel, chat: ahora.getTime(), chatEn: quien, escribio: quien }]);
    return { ok: true, antes: antes, logFila: df_log_().getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

/** Deshacer (se tocó Enviar pero no se mandó): la fila vuelve a pendiente y el LOG queda «DESHECHO». */
function df_deshacer(llave, d) {
  df_quien_(llave, d && d.como);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = df_libro_().getSheetByName(String(d.tab)), h = sh && df_cabecera_(sh), fila = Number(d.fila);
    if (!h) throw new Error("No encuentro la pestaña.");
    const v = sh.getRange(fila, 1, 1, h.width).getValues()[0];
    if (df_normPhone_(v[h.celular]) !== df_normPhone_(d.celular)) throw new Error("La fila cambió. No deshice nada.");
    const a = d.antes || {};
    sh.getRange(fila, h.env + 1).setValue(false);
    if (h.fecha >= 0) sh.getRange(fila, h.fecha + 1).setValue(a.fecha || "");
    if (h.resultado >= 0) sh.getRange(fila, h.resultado + 1).setValue(a.resultado || "");
    if (h.nota >= 0) sh.getRange(fila, h.nota + 1).setValue(a.nota || "");
    const lg = df_log_(), lf = Number(d.logFila);
    if (lf > 1 && df_normPhone_(lg.getRange(lf, 5).getDisplayValue()) === df_normPhone_(d.celular)) lg.getRange(lf, 7).setValue("DESHECHO");
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ───── copiado de apps-script/Difusiones_API.gs (mismas reglas que la extensión), con prefijo df_ ─────
var DF_HEADER_SCAN_ROWS = 15;
var DF_STOP_MARKER = /NO ENVIAR/i;
var DF_LOG = '📜 LOG EXTENSIÓN';
var DF_CERRADOS = /(NO CONTACTAR|BLOQUEAD)/i;
var DF_DIAS_SEMANA = /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i;
var DF_NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function df_normPhone_(raw) {
  var p = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (p.length === 9 && p.charAt(0) === '9') p = '51' + p;
  return /^519\d{8}$/.test(p) ? p : null;
}

function df_sinTildes_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

function df_esTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function df_parseFecha_(v) {
  // al mediodía: así el día no cambia al mostrarlo en hora de Lima
  if (v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12);
  var m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : null;
}

function df_cabecera_(sh) {
  var n = Math.min(DF_HEADER_SCAN_ROWS, sh.getLastRow());
  if (n < 1) return null;
  var vals = sh.getRange(1, 1, n, Math.min(sh.getLastColumn(), 30)).getDisplayValues();
  for (var r = 0; r < vals.length; r++) {
    var row = vals[r].map(df_sinTildes_);
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

function df_filas_(sh, h) {
  var last = sh.getLastRow();
  if (last <= h.row) return [];
  var vals = sh.getRange(h.row + 1, 1, last - h.row, h.width).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (DF_STOP_MARKER.test(String(v[0])) || DF_STOP_MARKER.test(String(v[1]))) break;
    out.push({ fila: h.row + 1 + i, v: v });
  }
  return out;
}

function df_indiceGlobal_() {
  var idx = {};
  df_tandas_().forEach(function (t) {
    df_filas_(t.sh, t.h).forEach(function (f) {
      var tel = df_normPhone_(f.v[t.h.celular]);
      if (!tel) return;
      var e = idx[tel] || (idx[tel] = { ultimo: null, pestana: null, bloqueado: false, socioActivo: false });
      var res = t.h.resultado >= 0 ? String(f.v[t.h.resultado]) : '';
      var nota = t.h.nota >= 0 ? String(f.v[t.h.nota]) : '';
      if (DF_CERRADOS.test(res) || /NO CONTACTAR/i.test(nota)) {
        // «NO CONTACTAR - SOCIO ACTIVO» solo frena las difusiones; a los socios sí se les escribe
        // desde 🏃 INASISTENCIAS.
        if (/SOCIO ACTIVO/i.test(res + ' ' + nota)) e.socioActivo = true; else e.bloqueado = true;
      }
      if (df_esTrue_(f.v[t.h.env])) {
        var d = t.h.fecha >= 0 ? df_parseFecha_(f.v[t.h.fecha]) : null;
        var ts = d ? d.getTime() : 1; // enviado sin fecha: cuenta como antiguo
        if (!e.ultimo || ts > e.ultimo) { e.ultimo = ts; e.pestana = t.sh.getName(); }
      }
    });
  });
  return idx;
}

function df_feriados_() {
  var set = {};
  var r = df_libro_().getRangeByName('FERIADOS');
  if (!r) return set;
  var vals = r.getValues(), disp = r.getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    var d = df_parseFecha_(vals[i][0]) || df_parseFecha_(disp[i][0]);
    if (d) set[Utilities.formatDate(d, 'America/Lima', 'yyyy-MM-dd')] = true;
  }
  return set;
}

function df_diasHoy_(ahora) {
  var hoy = Utilities.formatDate(ahora || new Date(), 'America/Lima', 'yyyy-MM-dd').split('-');
  var base = Date.UTC(Number(hoy[0]), Number(hoy[1]) - 1, Number(hoy[2]), 12);
  var fer = df_feriados_(), elegidos = [];
  for (var n = 1; elegidos.length < 2 && n < 30; n++) {
    var d = new Date(base + n * 86400000);
    var iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() === 0 || fer[iso]) continue;
    elegidos.push({ n: n, dia: DF_NOMBRE_DIA[d.getUTCDay()] });
  }
  if (elegidos.length < 2) return '';
  return (elegidos[0].n === 1 ? 'mañana ' : 'el ') + elegidos[0].dia + ' o el ' + elegidos[1].dia;
}

function df_esInasistencias_(tab) {
  return /INASIST/i.test(String(tab || ''));
}

function df_esSocios_(tab) {
  return /SOCIOS/i.test(String(tab || ''));
}

function df_esChatExistente_(tab) {
  return df_esInasistencias_(tab) || df_esSocios_(tab);
}

function df_imagenUrl_(sh, h) {
  var n = Math.max(1, (h ? h.row : DF_HEADER_SCAN_ROWS) - 1);
  var vals = sh.getRange(1, 1, n, Math.min(sh.getLastColumn(), 30)).getDisplayValues();
  var falta = '';
  for (var r = 0; r < vals.length; r++) {
    for (var c = 0; c < vals[r].length - 1; c++) {
      if (!/^\W*IMAGEN\b/.test(df_sinTildes_(vals[r][c]))) continue;
      var url = String(vals[r][c + 1]).trim();
      if (/^https?:\/\//i.test(url)) return url;
      falta = 'FALTA';
    }
  }
  return falta;
}

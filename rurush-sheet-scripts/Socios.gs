/**
 * RURUSH Llamadas → pestaña 🏋️ Socios: llamadas a socios ACTIVOS, en dos listas que la asesora elige:
 *   😴 "no"  = no vienen hace más de 5 días (que vuelvan)  · meta: toda su lista (mínimo 7)
 *   💪 "si"  = sí vienen (que sigan, renueven y den referidos) · meta 3 al día
 * Lee "3. BASE DE SOCIOS" del Sheet VENTAS RETENCIÓN (el mismo de Cobros, COB_ID) y escribe ahí mismo
 * el resultado en sus columnas de retención: U LLAMADA? · V RESULTADO · W FECHA LLAM. · X NOTAS · Y LLAMÓ.
 * Cada llamada queda además en la pestaña "🏋️ LLAMADAS SOCIOS" de este Sheet (con su duración): de ahí
 * sale el control de Omar (quién llamó de verdad, cuánto duró, quién volvió después de la llamada).
 * Solo se puede registrar si la asesora llamó desde la app (📞 Llamar) y la llamada duró el mínimo.
 * Todos los nombres llevan el prefijo so_ / SO_.
 */

const SO_HOJA = "3. BASE DE SOCIOS";
const SO_INI = 6;                 // primera fila de datos
const SO_MIN_DIAS = 5;            // se llama a los que no vienen hace MÁS de 5 días
const SO_META = { no: 7, si: 3 };  // mínimo de llamadas al día por lista (😴 sube a toda la lista si tiene más)
const SO_REPOSO = { no: 7, si: 30 }; // días sin volver a llamar al mismo socio
const SO_LOG = "🏋️ LLAMADAS SOCIOS";
const SO_LOG_COLS = ["FECHA", "HORA", "ASESORA", "CÓDIGO", "SOCIO", "CELULAR", "DÍAS S/A", "INTENTOS", "SEGUNDOS", "RESULTADO", "NOTA", "TIPO"];
// Columnas desde B (índice 0): B cód · C nombre · D celular · G paquete · I fin · J vence días · L asesor orig. ·
// M asesora asignada · R últ. asistencia · S días S/A · U llamada? · V resultado · W fecha llam. · X notas · Y llamó
const SO = { cod: 0, nombre: 1, cel: 2, plan: 5, fin: 7, vence: 8, aseOrig: 10, ase: 11, ult: 16, dias: 17, llamada: 19, res: 20, fLlam: 21, notas: 22, llamo: 23 };
const SO_ANCHO = 24;
// Resultados de la app → valor de la lista de RESULTADO del Sheet, y segundos mínimos de llamada
const SO_RES = {
  "VIENE": { hoja: "COMPROMISO", min: 30 },
  "DA EXCUSAS": { hoja: "DA EXCUSAS", min: 30 },
  "NO INTERESA": { hoja: "NO INTERESA", min: 30 },
  "CONTENTO": { hoja: "CONTENTO", min: 30 },
  "QUEJA": { hoja: "QUEJA / SUGERENCIA", min: 30 },
  "REFERIDO": { hoja: "DIO REFERIDO", min: 30 },
  "NO CONTESTÓ": { hoja: "NO CONTESTÓ", min: 15 }
};

function so_tel(v) { const d = String(v || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; }
function so_ent_(v) { const n = so_num(v); return n == null ? null : Math.round(n); }   // "82.666…" → 83
function so_num(v) { if (v === "" || v == null) return null; const n = Number(v); return isFinite(n) ? n : null; }
function so_hoja() { return cob_libro().getSheetByName(SO_HOJA); }
// Filas de BASE DE SOCIOS (B..Y desde la fila 6). Rápido: API de Sheets (no espera recálculos) y caché de 5 min;
// al guardar una llamada se borra la caché. Las fechas vienen como número de serie (cob_iso las entiende).
function so_filas_() {
  const c = uc_cacheGet_("so_filas");
  if (c) return c;
  let v = null;
  if (app_conApi()) {
    try {
      v = app_valores(COB_ID, ["'" + SO_HOJA + "'!B" + SO_INI + ":" + app_col(SO_ANCHO)], COB_API_OPC)[0]
        .map(function (f) { while (f.length < SO_ANCHO) f.push(""); return f; });
    } catch (e) { if (!/^API Sheets/.test(e.message)) throw e; v = null; }
  }
  if (!v) {
    const sh = so_hoja();
    if (!sh) throw new Error("No encuentro la pestaña " + SO_HOJA + ".");
    const n = sh.getLastRow() - SO_INI + 1;
    v = n > 0 ? sh.getRange(SO_INI, 2, n, SO_ANCHO).getValues() : [];
  }
  uc_cachePut_("so_filas", v, 300);
  return v;
}
function so_quien_(llave, como) {
  const a = app_asesora(llave);
  return a === "OMAR" && como ? cob_norm(como) : a;
}

// Registro de llamadas (pestaña de este Sheet)
function so_log_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SO_LOG);
  if (!sh) {
    sh = ss.insertSheet(SO_LOG);
    sh.setFrozenRows(1);
  }
  if (sh.getRange(1, SO_LOG_COLS.length).getValue() !== SO_LOG_COLS[SO_LOG_COLS.length - 1])
    sh.getRange(1, 1, 1, SO_LOG_COLS.length).setValues([SO_LOG_COLS]).setFontWeight("bold");
  return sh;
}
// El registro solo crece hacia abajo: para hoy / la semana bastan las últimas 3000 filas (todo = el registro entero).
function so_logFilas_(desdeIso, todo) {
  const sh = so_log_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const k = todo ? n : Math.min(n, 3000);
  return sh.getRange(2 + n - k, 1, k, SO_LOG_COLS.length).getDisplayValues()
    .map(function (f) { return { fecha: cob_iso(f[0]), hora: f[1], ase: cob_norm(f[2]), cod: String(f[3]), socio: f[4], tel: f[5],
      dias: so_num(f[6]), intentos: so_num(f[7]) || 0, seg: so_num(f[8]) || 0, res: f[9], nota: f[10], tipo: f[11] === "si" ? "si" : "no" }; })
    .filter(function (x) { return x.fecha && x.fecha >= desdeIso; });
}

/** Las dos listas de la asesora, para que elija a quién llamar. */
function so_lista(llave, como) {
  const quien = so_quien_(llave, como), hoy = cob_hoy();
  const hechas = so_logFilas_(hoy).filter(function (x) { return x.ase === quien; });
  const yaHoy = {};
  hechas.forEach(function (x) { yaHoy[x.cod] = 1; yaHoy[x.tel] = 1; });
  const hace = function (d) { return Utilities.formatDate(new Date(Date.now() - d * 864e5), "America/Lima", "yyyy-MM-dd"); };
  const reposo = { no: hace(SO_REPOSO.no), si: hace(SO_REPOSO.si) };
  const vistos = {}, listas = { no: [], si: [] };
  let uc = {};
  try { uc = uc_mapa_(); } catch (e) { console.error("último contacto: " + e); }
  so_filas_().forEach(function (f, i) {
    const cod = String(f[SO.cod] || "").trim(), tel = so_tel(f[SO.cel]);
    if (!cod || !tel) return;
    if (cob_norm(f[SO.ase] || f[SO.aseOrig]) !== quien) return;
    const vence = so_ent_(f[SO.vence]), dias = so_ent_(f[SO.dias]);
    if (vence == null || vence < 0) return;                 // plan vencido: eso es renovación, no este seguimiento
    const fin = cob_iso(f[SO.fin]);
    if (fin && fin < hoy) return;                           // "VENCE DÍAS" a veces no se recalcula
    if (dias == null) return;
    const tipo = dias > SO_MIN_DIAS ? "no" : "si";
    const fLlam = cob_iso(f[SO.fLlam]);
    if (fLlam && fLlam > reposo[tipo]) return;              // ya se le llamó hace poco
    if (yaHoy[cod] || yaHoy[tel] || vistos[tel]) return;    // mismo celular (familiares): una llamada basta
    vistos[tel] = 1;
    listas[tipo].push({ uc: uc_de_(uc, tel), fila: SO_INI + i, cod: cod, nombre: String(f[SO.nombre] || "").trim(), tel: tel, plan: String(f[SO.plan] || ""),
      fin: fin, vence: vence, dias: dias, tipo: tipo,
      ult: (function (u) { return u ? u.slice(8, 10) + "/" + u.slice(5, 7) : String(f[SO.ult] || "").slice(0, 10); })(cob_iso(f[SO.ult])),
      antes: f[SO.res] ? String(f[SO.res]) + (fLlam ? " · " + fLlam.slice(8, 10) + "/" + fLlam.slice(5, 7) : "") + (f[SO.notas] ? " · " + String(f[SO.notas]).slice(0, 60) : "") : "" });
  });
  listas.no.sort(function (a, b) { return a.dias - b.dias || a.vence - b.vence; });   // los recién alejados se recuperan más fácil
  listas.si.sort(function (a, b) { return a.vence - b.vence || b.dias - a.dias; });   // los que están por renovar primero
  const cuenta = function (t) { return hechas.filter(function (x) { return x.tipo === t; }).length; };
  // 😴 meta = TODA su lista del día (mínimo 7): si Mónica tiene 16 que no vienen, su meta es 16.
  const hoyN = { no: cuenta("no"), si: cuenta("si") };
  const meta = { no: Math.max(SO_META.no, hoyN.no + listas.no.length), si: SO_META.si };
  return { quien: quien, meta: meta, hoy: hoyN, listas: listas,
    hechas: hechas.map(function (x) { return { socio: x.socio, res: x.res, seg: x.seg, hora: x.hora, tipo: x.tipo }; }) };
}

/** Guarda una llamada. d = { fila, cod, nombre, tel, dias, tipo, resultado, nota, intentos, segundos, como } */
function so_guardar(llave, d) {
  const quien = so_quien_(llave, d && d.como);
  d = d || {};
  const r = SO_RES[String(d.resultado || "")];
  if (!r) throw new Error("Elige cómo salió la llamada.");
  if (!(Number(d.intentos) > 0)) throw new Error("Primero toca 📞 Llamar.");
  if (Number(d.segundos) < r.min) throw new Error("Para marcar «" + d.resultado + "» la llamada debe durar al menos " + r.min + " s.");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = so_hoja();
    let fila = Number(d.fila);
    // si ordenaron o insertaron filas, se busca al socio por su código
    if (!(fila >= SO_INI) || String(sh.getRange(fila, 2).getDisplayValue()).trim() !== String(d.cod)) {
      const cods = sh.getRange(SO_INI, 2, Math.max(1, sh.getLastRow() - SO_INI + 1), 1).getDisplayValues();
      const i = cods.findIndex(function (c) { return String(c[0]).trim() === String(d.cod); });
      if (i < 0) throw new Error("No encuentro al socio " + d.cod + " en la base. Toca 🔄.");
      fila = SO_INI + i;
    }
    const seg = Math.round(Number(d.segundos) || 0), dur = Math.floor(seg / 60) + ":" + ("0" + seg % 60).slice(-2);
    const nota = "⏱ " + dur + (d.nota ? " · " + String(d.nota).trim() : "");
    ll_escribir(sh.getRange(fila, 2 + SO.llamada), "SÍ");
    ll_escribir(sh.getRange(fila, 2 + SO.res), r.hoja);
    sh.getRange(fila, 2 + SO.fLlam).setValue(new Date());
    sh.getRange(fila, 2 + SO.notas).setValue(nota);
    ll_escribir(sh.getRange(fila, 2 + SO.llamo), quien);
    const ahora = new Date();
    so_log_().appendRow([Utilities.formatDate(ahora, "America/Lima", "yyyy-MM-dd"), Utilities.formatDate(ahora, "America/Lima", "HH:mm"),
      quien, "'" + d.cod, d.nombre || "", "'" + so_tel(d.tel), d.dias == null ? "" : d.dias, Number(d.intentos) || 0, seg, d.resultado, String(d.nota || "").trim(), d.tipo === "si" ? "si" : "no"]);
    uc_anotarSeguro_([{ tel: d.tel, nombre: d.nombre, llam: ahora.getTime(), llamo: quien, res: d.resultado, donde: "SOCIO" }]);
    CacheService.getScriptCache().remove("so_filas");
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Control de Omar: por asesora, hoy y últimos 7 días. «Volvió» = vino al gym después de la llamada. */
function so_resumen(llave) {
  if (app_asesora(llave) !== "OMAR") throw new Error("Solo Omar ve el control.");
  const hoy = cob_hoy(), desde = Utilities.formatDate(new Date(Date.now() - 6 * 864e5), "America/Lima", "yyyy-MM-dd");
  const ult = {};
  so_filas_().forEach(function (f) {
    const u = cob_iso(f[SO.ult]);
    if (u) ult[String(f[SO.cod]).trim()] = u;
  });
  const por = {}, nuevo = function () { return { llamadas: 0, no: 0, si: 0, contesto: 0, viene: 0, volvio: 0, segC: 0, cortas: 0 }; };
  so_logFilas_(desde).forEach(function (x) {
    const p = por[x.ase] || (por[x.ase] = { hoy: nuevo(), sem: nuevo() });
    [x.fecha === hoy ? p.hoy : null, p.sem].forEach(function (t) {
      if (!t) return;
      t.llamadas++; t[x.tipo]++;
      if (x.res !== "NO CONTESTÓ") { t.contesto++; t.segC += x.seg; if (x.seg < 45) t.cortas++; }
      if (x.res === "VIENE") t.viene++;
      if (x.tipo === "no" && ult[x.cod] && ult[x.cod] > x.fecha) t.volvio++;
    });
  });
  return Object.keys(por).sort().map(function (a) {
    const f = function (t) { return Object.assign({}, t, { prom: t.contesto ? Math.round(t.segC / t.contesto) : 0 }); };
    return { asesora: a, hoy: f(por[a].hoy), sem: f(por[a].sem) };
  });
}

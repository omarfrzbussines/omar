/**
 * RURUSH Llamadas → pestaña 💰 Cobros.
 * Lee y escribe la pestaña "2. COLA RENOVAR" del Sheet VENTAS RETENCIÓN 2026 V2 (otro archivo).
 * Columnas que cuentan: B = código del socio, K = asesor, N = monto, O = RENOVADO?, S = fecha de cobro.
 * Pendiente = K es la asesora, N > 0, S tiene fecha y O no es "SÍ" (lo mismo que "FALTA COBRAR" del Sheet).
 * Agregar un cobro: se escribe el código en B (las fórmulas de la fila traen nombre, celular,
 * plan y asesor desde "3. BASE DE SOCIOS"), el monto en N y la fecha en S.
 * Todos los nombres llevan el prefijo cob_ / COB_.
 */

const COB_ID = "1j6Js9ToQUJ96yCUmMKh5jmEAebfNSzlpYs5ItSEDuUI";
const COB_HOJA = "2. COLA RENOVAR";
const COB_SOCIOS = "3. BASE DE SOCIOS";
const COB_FILA_HEADER = 7;          // títulos de COLA RENOVAR; los datos empiezan en la 8
const COB_SOCIOS_INI = 6;           // primera fila de datos de BASE DE SOCIOS
const COB_SOCIOS_FIN = 501;         // hasta donde buscan las fórmulas de COLA RENOVAR
// Columnas leídas de COLA RENOVAR, desde B (índice 0) hasta V (índice 20).
const COB = { cod: 0, nombre: 1, cel: 2, plan: 3, asesor: 9, monto: 12, renovado: 13, montoPact: 15, fecha: 17, notas: 18, contacto: 19, diasSA: 20 };
const COB_ANCHO = 21;
// false: K queda con su fórmula (asesor del socio en BASE DE SOCIOS).
// true:  K se llena con la asesora que registra el cobro.
const COB_ASESOR_ES_QUIEN_REGISTRA = false;

function cob_libro() { return SpreadsheetApp.openById(COB_ID); }
function cob_norm(s) { return String(s == null ? "" : s).trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

// Fecha de la celda → "yyyy-MM-dd" ("" si no es fecha). Acepta Date, serial de Sheets y texto.
function cob_iso(v) {
  const iso = cob_isoBruto(v), a = Number(iso.slice(0, 4));
  return a >= 2020 && a <= 2099 ? iso : "";    // fuera de rango = fecha mal tipeada (ej. 0206-08-30)
}
function cob_isoBruto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "America/Lima", "yyyy-MM-dd");
  if (typeof v === "number") {
    if (v < 40000 || v > 60000) return "";
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
  return "";
}
function cob_monto(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v || "").replace(/^[^\d]+/, "").replace(/[^\d.]/g, ""));   // "S/.1,145" → 1145
  return isFinite(n) ? n : 0;
}
// Días sin asistir (columna V / DÍAS S/A de BASE DE SOCIOS): número o null si no hay dato.
function cob_diasSA(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function cob_hoy() { return Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM-dd"); }
function cob_dias(iso) { return Math.round((Date.parse(iso) - Date.parse(cob_hoy())) / 86400000); }

/* Filas B..V de COLA RENOVAR desde la 8. Con el servicio Sheets (el mismo de la lectura rápida
   de la cola) no espera a que el Sheet recalcule; sin él, lee con SpreadsheetApp. */
function cob_leerCola() {
  if (app_conApi()) {
    const r = Sheets.Spreadsheets.Values.get(COB_ID, "'" + COB_HOJA + "'!B" + COB_FILA_HEADER + ":V",
      { valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" });
    const v = r.values || [];
    cob_verificarTitulos(v[0] || []);
    return v.slice(1).map(function (f) { while (f.length < COB_ANCHO) f.push(""); return f; });
  }
  const hoja = cob_libro().getSheetByName(COB_HOJA);
  const n = hoja.getLastRow() - COB_FILA_HEADER + 1;
  const v = hoja.getRange(COB_FILA_HEADER, 2, n, COB_ANCHO).getValues();
  cob_verificarTitulos(v[0]);
  return v.slice(1);
}
// Si alguien mueve columnas, mejor avisar que leer o escribir en la columna equivocada.
function cob_verificarTitulos(t) {
  const ok = cob_norm(t[COB.cod]) === "COD" && cob_norm(t[COB.asesor]) === "ASESOR" &&
    cob_norm(t[COB.monto]) === "PROYECCION" && cob_norm(t[COB.fecha]) === "FECHA COBRO";
  if (!ok) throw new Error("La pestaña '" + COB_HOJA + "' cambió de columnas (se esperaba B=Cod, K=ASESOR, N=PROYECCIÓN, S=FECHA COBRO). Avísale a Omar.");
}

function cob_pendientesDe(filas, asesora, codigo) {
  const out = [];
  filas.forEach(function (f, i) {
    const cod = String(f[COB.cod]).trim();
    if (!cod) return;
    if (codigo != null ? cob_norm(cod) !== cob_norm(codigo) : cob_norm(f[COB.asesor]) !== asesora) return;
    if (cob_norm(f[COB.renovado]) === "SI") return;
    const monto = cob_monto(f[COB.monto]), fecha = cob_iso(f[COB.fecha]);
    if (!(monto > 0) || !fecha) return;
    out.push({
      fila: COB_FILA_HEADER + 1 + i, codigo: cod, nombre: String(f[COB.nombre] || "").trim(),
      celular: ll_limpiarTel(f[COB.cel]), plan: String(f[COB.plan] || "").trim(),
      asesor: String(f[COB.asesor] || "").trim(), monto: monto, fecha: fecha, dias: cob_dias(fecha),
      notas: String(f[COB.notas] || "").trim(), diasSA: cob_diasSA(f[COB.diasSA])
    });
  });
  out.sort(function (a, b) { return a.fecha.localeCompare(b.fecha) || a.fila - b.fila; });
  return out;
}

/** Cobros pendientes de la asesora (ordenados por fecha: los atrasados primero). */
function cob_lista(llave) {
  const asesora = app_asesora(llave);
  const t0 = Date.now();
  const lista = cob_pendientesDe(cob_leerCola(), cob_norm(asesora), null);
  return { asesora: asesora, lista: lista, hoy: cob_hoy(), ms: Date.now() - t0 };
}

/* Socio por código en BASE DE SOCIOS (B..S): lo mismo que traen las fórmulas de COLA RENOVAR. */
function cob_socio(codigo) {
  const hoja = cob_libro().getSheetByName(COB_SOCIOS);
  const v = hoja.getRange(COB_SOCIOS_INI, 2, COB_SOCIOS_FIN - COB_SOCIOS_INI + 1, 18).getValues();
  const c = cob_norm(codigo);
  for (let i = 0; i < v.length; i++) {
    if (cob_norm(v[i][0]) !== c) continue;
    return {
      codigo: String(v[i][0]).trim(), nombre: String(v[i][1] || "").trim(), celular: ll_limpiarTel(v[i][2]),
      plan: String(v[i][5] || "").trim(), vence: cob_iso(v[i][7]), estado: String(v[i][9] || "").trim(),
      asesor: String(v[i][10] || "").trim(),  // ASESOR ORIG. = lo que muestra la columna K
      diasSA: cob_diasSA(v[i][17])            // DÍAS S/A
    };
  }
  return null;
}

/** La asesora escribe el código: datos del socio + los cobros que ya tiene pendientes. */
function cob_buscar(llave, codigo) {
  const asesora = app_asesora(llave);
  if (!String(codigo || "").trim()) throw new Error("Escribe el código del socio.");
  const s = cob_socio(codigo);
  if (!s) throw new Error("El código " + codigo + " no está en '" + COB_SOCIOS + "'.");
  s.pendientes = cob_pendientesDe(cob_leerCola(), null, s.codigo);
  s.quedaA = COB_ASESOR_ES_QUIEN_REGISTRA ? asesora : s.asesor;
  return s;
}

/** Agrega el cobro en la primera fila libre de COLA RENOVAR: B = código, N = monto, S = fecha. */
function cob_agregar(llave, codigo, monto, fechaIso) {
  const asesora = app_asesora(llave);
  monto = Number(monto);
  if (!(monto > 0) || monto > 100000) throw new Error("Monto no válido.");
  const m = String(fechaIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error("Pon la fecha de cobro.");
  const s = cob_socio(codigo);
  if (!s) throw new Error("El código " + codigo + " no está en '" + COB_SOCIOS + "'.");

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const hoja = cob_libro().getSheetByName(COB_HOJA);
    const filas = cob_leerCola();
    // libre = sin código y sin nada escrito a mano en las columnas de cobro y notas
    const libre = [COB.cod, COB.renovado, COB.montoPact, COB.fecha, COB.notas, COB.contacto];
    let i = filas.findIndex(function (f) { return libre.every(function (c) { return String(f[c]).trim() === ""; }); });
    let fila = i >= 0 ? COB_FILA_HEADER + 1 + i : hoja.getLastRow() + 1;
    if (fila > hoja.getMaxRows()) throw new Error("La pestaña '" + COB_HOJA + "' no tiene filas libres. Avísale a Omar.");

    const cod = /^\d+$/.test(s.codigo) ? Number(s.codigo) : s.codigo;
    hoja.getRange(fila, 2).setValue(cod);                                           // B
    if (COB_ASESOR_ES_QUIEN_REGISTRA) hoja.getRange(fila, 11).setValue(asesora);     // K
    hoja.getRange(fila, 14).setValue(monto);                                        // N
    hoja.getRange(fila, 19).setValue(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)); // S
    hoja.getRange(fila, 20).setValue("📱 app " + asesora + " " + Utilities.formatDate(new Date(), "America/Lima", "dd/MM HH:mm")); // T
    SpreadsheetApp.flush();
    return { ok: true, fila: fila, nombre: s.nombre, quedaA: COB_ASESOR_ES_QUIEN_REGISTRA ? asesora : s.asesor };
  } finally { lock.releaseLock(); }
}

/** Marca un cobro como hecho: O = "SÍ", N = monto cobrado, S = fecha en que se cobró
 *  (así entra en YA COBRADO del cuadro con esa fecha) y deja constancia en T. */
function cob_marcarCobrado(llave, fila, codigo, monto, fechaIso) {
  const asesora = app_asesora(llave);
  fila = Number(fila); monto = Number(monto);
  if (!(fila > COB_FILA_HEADER)) throw new Error("Fila no válida.");
  if (!(monto > 0) || monto > 100000) throw new Error("Monto no válido.");
  const m = String(fechaIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error("Pon la fecha en que se cobró.");

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const hoja = cob_libro().getSheetByName(COB_HOJA);
    cob_verificarTitulos(hoja.getRange(COB_FILA_HEADER, 2, 1, COB_ANCHO).getValues()[0]);
    const f = hoja.getRange(fila, 2, 1, COB_ANCHO).getValues()[0];
    // la fila tiene que seguir siendo el mismo cobro (por si alguien ordenó o borró filas)
    if (cob_norm(f[COB.cod]) !== cob_norm(codigo)) throw new Error("La fila " + fila + " cambió en el Sheet. Toca 🔄 y vuelve a intentar.");
    if (cob_norm(f[COB.asesor]) !== cob_norm(asesora)) throw new Error("Este cobro es de " + f[COB.asesor] + ".");
    if (cob_norm(f[COB.renovado]) === "SI") throw new Error("Ya estaba marcado como cobrado.");
    hoja.getRange(fila, 15).setValue("SÍ");                                         // O
    hoja.getRange(fila, 14).setValue(monto);                                        // N
    hoja.getRange(fila, 19).setValue(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)); // S
    const nota = String(f[COB.notas] || "").trim();
    hoja.getRange(fila, 20).setValue((nota ? nota + " · " : "") + "✓ cobrado app " + asesora + " " + Utilities.formatDate(new Date(), "America/Lima", "dd/MM HH:mm")); // T
    SpreadsheetApp.flush();
    return { ok: true };
  } finally { lock.releaseLock(); }
}

/* Prueba desde el editor: muestra los pendientes de cada asesora (no escribe nada). */
function cob_probar() {
  const filas = cob_leerCola();
  Logger.log("Filas leídas de '" + COB_HOJA + "': " + filas.length + (app_conApi() ? " (API Sheets)" : " (SpreadsheetApp)"));
  APP_ASESORAS.forEach(function (a) {
    const l = cob_pendientesDe(filas, cob_norm(a), null);
    const total = l.reduce(function (t, x) { return t + x.monto; }, 0);
    Logger.log(a + ": " + l.length + " pendientes · S/" + total + (l[0] ? " · el más antiguo " + l[0].fecha + " (" + l[0].nombre + ")" : ""));
  });
}

/**
 * RURUSH — puente de llamadas entre el Sheet y la extensión de Chrome
 *          + la app del celular de las asesoras (archivo AppLlamadas).
 *
 * v2 (oct-2026):
 *   - Cada llamada puede tener HORA, OBSERVACION, FECHA FP y HORA FP (se buscan por título).
 *   - Al registrar AGENDADO se crea el FP en Pipedrive (llama a procesarFilaFP del
 *     archivo AGENDAMIENTO AUTOMÁTICO): el onEdit no se dispara con escrituras de scripts.
 *   - doGet atiende también la app del celular (?k=llave de la asesora).
 *
 * Todos los nombres llevan el prefijo LL_ / ll_ (los archivos comparten ámbito global).
 *
 * DESPLIEGUE: Implementar → Administrar implementaciones → ✏️ → Nueva versión.
 */

// ⚠️ Deja aquí TU línea actual de LL_TOKEN (la que ya tenías en este archivo).
const LL_TOKEN = "PEGA-AQUI-TU-LL_TOKEN";

const LL_BASES = [
  "DIARIO 🔥", "2026", "FP 2026 NI", "FPS NA 2026",
  "ACTIVOS", "INASISTENCIAS", "INACTIVOS",
  "EXAL2025", "FPS 2025", "2025", "2024"
];
const LL_FILA_HEADER = 2;
const LL_CIERRA = ["CLIENTE", "DESCARTADO", "AGENDADO", "OTRA CIUDAD"];

// Horas tal como las tiene el desplegable del Sheet ("6:00 am" … "10:30 pm")
const LL_HORAS = (function () {
  const out = [];
  for (let m = 6 * 60; m <= 22 * 60 + 30; m += 30) {
    const h = Math.floor(m / 60), h12 = ((h + 11) % 12) + 1;
    out.push(h12 + ":" + (m % 60 ? "30" : "00") + " " + (h < 12 ? "am" : "pm"));
  }
  return out;
})();

/* ---------- entradas ---------- */

function doGet(e) {
  // La app del celular entra con ?k=<llave de la asesora>
  if (e && e.parameter && e.parameter.k) return app_doGet(e);
  return ll_responder(function () {
    ll_verificar(e);
    const p = e.parameter;
    switch (p.accion) {
      case "bases":  return { bases: ll_contarBases(p.asesora || "") };
      case "cola":   return { cola: ll_traerCola(p.base, p.asesora || "", Number(p.limit || 25)) };
      case "ping":   return { ok: true, sheet: SpreadsheetApp.getActive().getName() };
      case "registrar": return ll_registrar({
        base: p.base, fila: Number(p.fila), telefono: p.telefono,
        asesora: p.asesora, estado: p.estado, observacion: p.observacion || "",
        fechaFp: p.fechaFp || "", horaFp: p.horaFp || ""
      });
      default:       throw new Error("Acción desconocida: " + p.accion);
    }
  });
}

function doPost(e) {
  return ll_responder(function () {
    ll_verificar(e);
    const d = JSON.parse(e.postData.contents || "{}");
    if (d.token !== LL_TOKEN) throw new Error("Token inválido");
    return ll_registrar(d);
  });
}

function ll_verificar(e) {
  const t = (e && e.parameter && e.parameter.token) || "";
  if (t !== LL_TOKEN && !(e.postData)) throw new Error("Token inválido");
}

function ll_responder(fn) {
  let salida;
  try { salida = { ok: true, data: fn() }; }
  catch (err) { salida = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- lectura de la estructura ----------
   Cada "ESTADO" es una llamada. Hacia atrás (hasta el ASESOR) están FECHA y HORA;
   hacia adelante (hasta la siguiente llamada) OBSERVACION, FECHA FP y HORA FP.
   Nada está clavado por número de columna (índices base 0, -1 = no existe). */

function ll_estructura(hoja) {
  const ancho = hoja.getLastColumn();
  const head = hoja.getRange(LL_FILA_HEADER, 1, 1, ancho).getValues()[0]
    .map(function (c) { return String(c || "").trim().toUpperCase(); });
  const col = function (nombre) { return head.indexOf(nombre); };
  const numero = col("NUMERO");

  const rondas = [];
  for (let i = 0; i < head.length; i++) {
    if (head[i] !== "ESTADO") continue;
    const ro = { asesor: -1, fecha: -1, hora: -1, estado: i, obs: -1, fpFecha: -1, fpHora: -1 };
    for (let j = i - 1; j >= 0; j--) {
      if (head[j] === "ESTADO") break;
      if (ro.hora < 0 && head[j] === "HORA") ro.hora = j;
      if (ro.fecha < 0 && head[j] === "FECHA") ro.fecha = j;
      if (head[j] === "ASESOR") { ro.asesor = j; break; }
    }
    // En la primera llamada el título del asesor a veces es un nombre ("VALERIA").
    if (ro.asesor < 0 && rondas.length === 0 && numero >= 0) ro.asesor = numero + 1;
    for (let j = i + 1; j < head.length; j++) {
      if (head[j] === "ASESOR" || head[j] === "ESTADO") break;
      if (ro.obs < 0 && (head[j] === "OBSERVACION" || head[j] === "OBSERVACIÓN")) ro.obs = j;
      if (ro.fpFecha < 0 && head[j] === "FECHA FP") ro.fpFecha = j;
      if (ro.fpHora < 0 && head[j] === "HORA FP") ro.fpHora = j;
    }
    rondas.push(ro);
  }

  return {
    head: head, ancho: ancho, numero: numero, nombre: col("NOMBRE"), rondas: rondas,
    origen: col("ORIGEN") >= 0 ? col("ORIGEN") : col("MEDIO"),
    dia: col("DIA") >= 0 ? col("DIA") : col("FECHA"),
    membresia: col("MENBRESIA") >= 0 ? col("MENBRESIA") : col("MEMBRESIA")
  };
}

/* ---------- cola de llamadas (extensión) ---------- */

function ll_traerCola(base, asesora, limite) {
  const hoja = SpreadsheetApp.getActive().getSheetByName(base);
  if (!hoja) throw new Error("No existe la pestaña " + base);
  const est = ll_estructura(hoja);
  const ultima = hoja.getLastRow();
  if (ultima <= LL_FILA_HEADER) return [];

  const datos = hoja.getRange(LL_FILA_HEADER + 1, 1, ultima - LL_FILA_HEADER, est.ancho).getValues();
  const yo = String(asesora || "").trim().toUpperCase();
  const salida = [];

  for (let r = 0; r < datos.length && salida.length < limite; r++) {
    const fila = datos[r];
    const tel = ll_limpiarTel(fila[est.numero]);
    if (!tel) continue;
    const hechas = ll_historial(est, fila);
    const libre = ll_rondaLibre(est, fila);
    if (libre < 0) continue;
    if (hechas.length && LL_CIERRA.indexOf(hechas[hechas.length - 1].estado) >= 0) continue;
    const duenio = String(fila[est.rondas[0].asesor] || "").trim().toUpperCase();
    if (yo && duenio && duenio !== yo) continue;
    salida.push({
      fila: LL_FILA_HEADER + 1 + r,
      nombre: String(fila[est.nombre] || "").trim(),
      telefono: tel,
      origen: est.origen >= 0 ? String(fila[est.origen] || "").trim() : "",
      dia: est.dia >= 0 ? ll_comoTexto(fila[est.dia]) : "",
      membresia: est.membresia >= 0 ? String(fila[est.membresia] || "").trim() : "",
      asignada: duenio, ronda: libre + 1, historial: hechas
    });
  }
  return salida;
}

function ll_historial(est, fila) {
  const hechas = [];
  est.rondas.forEach(function (ro, k) {
    const e = String(fila[ro.estado] || "").trim();
    if (!e) return;
    hechas.push({
      n: k + 1,
      asesor: ro.asesor >= 0 ? String(fila[ro.asesor] || "").trim() : "",
      fecha: ro.fecha >= 0 ? ll_comoTexto(fila[ro.fecha]) : "",
      fechaIso: ro.fecha >= 0 && fila[ro.fecha] instanceof Date ? Utilities.formatDate(fila[ro.fecha], "America/Lima", "yyyy-MM-dd") : "",
      estado: e.toUpperCase(),
      obs: ro.obs >= 0 ? String(fila[ro.obs] || "").trim() : ""
    });
  });
  return hechas;
}

function ll_rondaLibre(est, fila) {
  for (let k = 0; k < est.rondas.length; k++) {
    if (!String(fila[est.rondas[k].estado] || "").trim()) return k;
  }
  return -1;
}

function ll_contarBases(asesora) {
  const ss = SpreadsheetApp.getActive();
  const out = [];
  for (let i = 0; i < LL_BASES.length; i++) {
    if (!ss.getSheetByName(LL_BASES[i])) continue;
    out.push({ base: LL_BASES[i], pendientes: ll_traerCola(LL_BASES[i], asesora, 500).length });
  }
  return out;
}

/* ---------- registrar una llamada (extensión y app del celular) ---------- */

function ll_registrar(d) {
  if (!d.fila || !d.estado) throw new Error("Faltan datos de la llamada");
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const hoja = SpreadsheetApp.getActive().getSheetByName(d.base);
    if (!hoja) throw new Error("No existe la pestaña " + d.base);
    const est = ll_estructura(hoja);
    const fila = hoja.getRange(d.fila, 1, 1, est.ancho).getValues()[0];

    // Si alguien ordenó o insertó filas mientras la asesora llamaba, ya no es la misma persona.
    if (d.telefono && ll_limpiarTel(fila[est.numero]) !== ll_limpiarTel(d.telefono)) {
      throw new Error("La fila cambió en el Sheet. Refresca la cola y vuelve a intentar.");
    }
    const libre = ll_rondaLibre(est, fila);
    if (libre < 0) throw new Error("Esta persona ya tiene las 6 llamadas registradas.");

    const ro = est.rondas[libre];
    const ahora = new Date();
    const hoy = Utilities.formatDate(ahora, "America/Lima", "dd/MM/yyyy");
    const estado = String(d.estado).trim().toUpperCase() === "OTRA CIUDAD" ? "Otra Ciudad" : String(d.estado).toUpperCase();
    const set = function (c, v) { if (c >= 0) hoja.getRange(d.fila, c + 1).setValue(v); };

    set(ro.asesor, String(d.asesora || "").toUpperCase());
    set(ro.fecha, hoy);
    set(ro.hora, ll_horaDeLista(ahora));
    set(ro.estado, estado);
    if (d.observacion) set(ro.obs, d.observacion);

    // Si agendó free pass: fecha y hora del FP en ESTA llamada, y se crea en Pipedrive.
    if (estado === "AGENDADO" && d.fechaFp) {
      set(ro.fpFecha, ll_fechaTexto(d.fechaFp));
      if (d.horaFp) set(ro.fpHora, d.horaFp);
    }
    SpreadsheetApp.flush();
    if (estado === "AGENDADO" && typeof procesarFilaFP === "function" && hoja.getName() === SHEET_NAME) {
      try { procesarFilaFP(hoja, d.fila); } catch (err) { console.error("procesarFilaFP: " + err); }
    }
    return { fila: d.fila, ronda: libre + 1, fecha: hoy };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- utilidades ---------- */

// Hora actual de Lima, redondeada a la media hora, con el texto del desplegable
function ll_horaDeLista(fecha) {
  const h = Number(Utilities.formatDate(fecha, "America/Lima", "H"));
  const m = Number(Utilities.formatDate(fecha, "America/Lima", "m"));
  const t = Math.min(Math.max(h * 60 + (m < 30 ? 0 : 30), 6 * 60), 22 * 60 + 30);
  return LL_HORAS[(t - 6 * 60) / 30];
}

// "2026-10-09" (lo que manda un <input type=date>) → "09/10/2026"
function ll_fechaTexto(f) {
  const m = String(f).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + "/" + m[2] + "/" + m[1] : String(f);
}

function ll_limpiarTel(v) {
  let s = String(v == null ? "" : v).trim();
  if (s.indexOf("E") > 0 || s.indexOf("e") > 0) s = Number(s).toFixed(0);
  s = s.replace(/\.0+$/, "").replace(/\D/g, "");
  return s.length >= 9 ? s.slice(-9) : "";
}

function ll_comoTexto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "America/Lima", "dd/MM/yyyy");
  return String(v == null ? "" : v).trim();
}

/* ---------- prueba manual desde el editor ---------- */
function ll_probar() {
  const est = ll_estructura(SpreadsheetApp.getActive().getSheetByName("2026"));
  Logger.log(JSON.stringify(est.rondas));
  Logger.log(JSON.stringify(ll_traerCola("2026", "", 2), null, 2));
}

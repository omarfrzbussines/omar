/**
 * RURUSH Llamadas — app del celular para Mónica, Danna y Laura.
 * Vive en el MISMO proyecto que LlamadasAPI y AGENDAMIENTO AUTOMÁTICO y reutiliza
 * su código: lee las columnas por título (ll_estructura), guarda con ll_registrar
 * (verifica el teléfono, llena la siguiente llamada libre y crea el FP en Pipedrive
 * cuando es AGENDADO). Todos los nombres llevan el prefijo app_ / APP_.
 *
 * Se entra con el link de la aplicación web + ?k=<llave de la asesora>
 * (doGet de LlamadasAPI la redirige aquí). Los links salen de app_crearLlaves().
 */

const APP_ASESORAS = ["MONICA", "DANNA", "LAURA"];
const APP_BASES = ["2026"];
const APP_ESTADOS = ["CONTESTO", "NO CONTESTO", "CORTO", "APAGADO", "AGENDADO", "CLIENTE", "DESCARTADO", "Otra Ciudad"];
const APP_TAM_COLA = 30;
const APP_RESERVA_SEG = 30 * 60;   // lo que se le muestra a una asesora no le sale a otra por 30 min

function app_asesora(k) {
  const llaves = JSON.parse(PropertiesService.getScriptProperties().getProperty("APP_LLAVES") || "{}");
  const a = llaves[String(k || "")];
  if (!a) throw new Error("Link no válido. Pídele a Omar tu link de acceso.");
  return a;
}

/** Ejecutar UNA vez después de implementar (y cuando quieras cambiar los links).
 *  En el registro salen los 3 links para mandar por WhatsApp. */
function app_crearLlaves() {
  const llaves = {};
  const url = ScriptApp.getService().getUrl();
  APP_ASESORAS.forEach(function (a) {
    const k = Utilities.getUuid().replace(/-/g, "").slice(0, 20);
    llaves[k] = a;
    Logger.log(a + " → " + url + "?k=" + k);
  });
  PropertiesService.getScriptProperties().setProperty("APP_LLAVES", JSON.stringify(llaves));
}

function app_doGet(e) {
  let asesora;
  try { asesora = app_asesora(e.parameter.k); } catch (err) {
    return HtmlService.createHtmlOutput('<p style="font:18px sans-serif;padding:24px">' + err.message + "</p>")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }
  const t = HtmlService.createTemplateFromFile("Llamadas");
  t.asesora = asesora;
  t.llave = e.parameter.k;
  return t.evaluate()
    .setTitle("RURUSH Llamadas · " + asesora)
    .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1")
    .setFaviconUrl("https://em-content.zobj.net/source/apple/391/telephone-receiver_1f4de.png");
}

/** Cola de la asesora: primero los nunca llamados (más nuevos arriba), después los
 *  seguimientos (los que llevan más tiempo sin llamar). Sin cerrados, sin 6 llamadas,
 *  sin los llamados hoy, sin los que lleva otra asesora del equipo, sin reservados. */
function app_getCola(llave, base, excluir) {
  const t0 = Date.now();
  const asesora = app_asesora(llave);
  if (APP_BASES.indexOf(base) < 0) throw new Error("Base no habilitada: " + base);
  const hoja = SpreadsheetApp.getActive().getSheetByName(base);
  const est = ll_estructura(hoja);
  const ultima = hoja.getLastRow();
  const n = ultima - LL_FILA_HEADER;
  const vacio = { asesora: asesora, cola: [], hoy: {}, estados: APP_ESTADOS, horas: LL_HORAS, pendientes: { nuevos: 0, seguimiento: 0 }, ms: 0 };
  if (n <= 0) return vacio;

  const datos = hoja.getRange(LL_FILA_HEADER + 1, 1, n, est.ancho).getValues();
  const hoy = Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM-dd");
  const yaTengo = {};
  (excluir || []).forEach(function (f) { yaTengo[f] = true; });
  const mias = {};
  APP_ESTADOS.forEach(function (e) { mias[e.toUpperCase()] = 0; });
  const nuevos = [], seguimiento = [];

  datos.forEach(function (fila, i) {
    const nFila = LL_FILA_HEADER + 1 + i;
    const hechas = ll_historial(est, fila);
    hechas.forEach(function (h) {
      if (h.asesor.toUpperCase() === asesora && h.fechaIso === hoy && mias[h.estado] != null) mias[h.estado]++;
    });
    const tel = ll_limpiarTel(fila[est.numero]);
    if (!tel || yaTengo[nFila]) return;
    const libre = ll_rondaLibre(est, fila);
    if (libre < 0) return;
    const ult = hechas[hechas.length - 1];
    if (ult && LL_CIERRA.indexOf(ult.estado) >= 0) return;
    if (ult && ult.fechaIso === hoy) return;
    const ultAsesor = ult ? ult.asesor.toUpperCase() : "";
    if (ultAsesor && ultAsesor !== asesora && APP_ASESORAS.indexOf(ultAsesor) >= 0) return;
    const dia = est.dia >= 0 ? fila[est.dia] : "";
    const item = {
      fila: nFila, numero: tel, nombre: String(fila[est.nombre] || "").trim(),
      dia: dia instanceof Date ? Utilities.formatDate(dia, "America/Lima", "dd/MM") : String(dia || ""),
      diaIso: dia instanceof Date ? Utilities.formatDate(dia, "America/Lima", "yyyy-MM-dd") : "",
      origen: est.origen >= 0 ? String(fila[est.origen] || "") : "",
      ronda: libre + 1,
      rondas: hechas.map(function (h) { return { n: h.n, asesor: h.asesor, fecha: h.fecha.slice(0, 5), estado: h.estado, obs: h.obs }; }),
      ultFecha: ult ? ult.fechaIso : ""
    };
    (hechas.length ? seguimiento : nuevos).push(item);
  });

  nuevos.sort(function (a, c) { return c.diaIso.localeCompare(a.diaIso); });
  seguimiento.sort(function (a, c) { return a.ultFecha.localeCompare(c.ultFecha); });

  const cache = CacheService.getScriptCache();
  const todos = nuevos.concat(seguimiento);
  const reservas = cache.getAll(todos.slice(0, 400).map(function (x) { return "r" + base + x.fila; }));
  const cola = todos.filter(function (x) { const r = reservas["r" + base + x.fila]; return !r || r === asesora; }).slice(0, APP_TAM_COLA);
  const res = {};
  cola.forEach(function (x) { res["r" + base + x.fila] = asesora; });
  if (cola.length) cache.putAll(res, APP_RESERVA_SEG);

  const hoyMias = {};
  APP_ESTADOS.forEach(function (e) { hoyMias[e] = mias[e.toUpperCase()]; });
  return {
    asesora: asesora, cola: cola, hoy: hoyMias, estados: APP_ESTADOS, horas: LL_HORAS,
    pendientes: { nuevos: nuevos.length, seguimiento: seguimiento.length }, ms: Date.now() - t0
  };
}

function app_guardar(llave, base, fila, numero, estado, obs, fpFecha, fpHora) {
  const asesora = app_asesora(llave);
  if (APP_BASES.indexOf(base) < 0) throw new Error("Base no habilitada: " + base);
  if (APP_ESTADOS.indexOf(estado) < 0) throw new Error("Estado no válido.");
  const r = ll_registrar({
    base: base, fila: Number(fila), telefono: numero, asesora: asesora, estado: estado,
    observacion: obs || "", fechaFp: fpFecha || "", horaFp: fpHora || ""
  });
  CacheService.getScriptCache().remove("r" + base + fila);
  return r;
}

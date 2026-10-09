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

/** Última fila con NÚMERO (no getLastRow: hay columnas prellenadas hasta el fondo). */
function app_ultimaFila(hoja, est) {
  const n = hoja.getLastRow();
  const col = hoja.getRange(1, est.numero + 1, n, 1).getValues();
  for (let i = col.length - 1; i >= LL_FILA_HEADER; i--) if (String(col[i][0]).trim()) return i + 1;
  return LL_FILA_HEADER;
}

/** Contador de llamadas hechas desde la app hoy, por asesora (sin recorrer la hoja). */
function app_claveHoy(asesora) {
  return "hoy_" + asesora + "_" + Utilities.formatDate(new Date(), "America/Lima", "yyyyMMdd");
}
function app_contadorHoy(asesora) {
  const c = CacheService.getScriptCache().get(app_claveHoy(asesora));
  return c ? JSON.parse(c) : {};
}

/** Cola de la asesora. Lee la hoja DE ABAJO HACIA ARRIBA en bloques (los leads nuevos
 *  están al final) y para apenas junta suficientes personas: casi siempre basta un bloque.
 *  Orden: nunca llamados (más nuevos arriba) y después seguimientos (más tiempo sin llamar).
 *  Fuera: cerrados, 6 llamadas, llamados hoy, los que lleva otra asesora, reservados. */
const APP_BLOQUE = 1200;

function app_getCola(llave, base, excluir) {
  const t0 = Date.now();
  const asesora = app_asesora(llave);
  if (APP_BASES.indexOf(base) < 0) throw new Error("Base no habilitada: " + base);
  const hoja = SpreadsheetApp.getActive().getSheetByName(base);
  const est = ll_estructura(hoja);
  const ultima = app_ultimaFila(hoja, est);
  const hoy = Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM-dd");
  const yaTengo = {};
  (excluir || []).forEach(function (f) { yaTengo[f] = true; });
  const cache = CacheService.getScriptCache();
  const nuevos = [], seguimiento = [];
  let leidas = 0;

  for (let fin = ultima; fin > LL_FILA_HEADER; fin -= APP_BLOQUE) {
    const ini = Math.max(LL_FILA_HEADER + 1, fin - APP_BLOQUE + 1);
    const datos = hoja.getRange(ini, 1, fin - ini + 1, est.ancho).getValues();
    leidas += datos.length;
    const bloque = [];
    for (let i = datos.length - 1; i >= 0; i--) {
      const fila = datos[i], nFila = ini + i;
      const tel = ll_limpiarTel(fila[est.numero]);
      if (!tel || yaTengo[nFila]) continue;
      const libre = ll_rondaLibre(est, fila);
      if (libre < 0) continue;
      // filtro barato con la última llamada hecha, antes de armar el historial
      if (libre > 0) {
        const ro = est.rondas[libre - 1];
        if (LL_CIERRA.indexOf(String(fila[ro.estado] || "").trim().toUpperCase()) >= 0) continue;
        const f = ro.fecha >= 0 ? fila[ro.fecha] : null;
        if (f instanceof Date && ll_iso(f) === hoy) continue;
        const a = ro.asesor >= 0 ? String(fila[ro.asesor] || "").trim().toUpperCase() : "";
        if (a && a !== asesora && APP_ASESORAS.indexOf(a) >= 0) continue;
      }
      const hechas = ll_historial(est, fila);
      const ult = hechas[hechas.length - 1];
      const dia = est.dia >= 0 ? fila[est.dia] : "";
      bloque.push({
        fila: nFila, numero: tel, nombre: String(fila[est.nombre] || "").trim(),
        dia: dia instanceof Date ? ll_comoTexto(dia).slice(0, 5) : String(dia || ""),
        diaIso: dia instanceof Date ? ll_iso(dia) : "",
        origen: est.origen >= 0 ? String(fila[est.origen] || "") : "",
        ronda: libre + 1,
        rondas: hechas.map(function (h) { return { n: h.n, asesor: h.asesor, fecha: h.fecha.slice(0, 5), estado: h.estado, obs: h.obs }; }),
        ultFecha: ult ? ult.fechaIso : ""
      });
    }
    // quitar los reservados por otra asesora
    const reservas = bloque.length ? cache.getAll(bloque.map(function (x) { return "r" + base + x.fila; })) : {};
    bloque.forEach(function (x) {
      const r = reservas["r" + base + x.fila];
      if (r && r !== asesora) return;
      (x.rondas.length ? seguimiento : nuevos).push(x);
    });
    if (nuevos.length + seguimiento.length >= APP_TAM_COLA * 2) break;
  }

  nuevos.sort(function (a, c) { return c.diaIso.localeCompare(a.diaIso) || c.fila - a.fila; });
  seguimiento.sort(function (a, c) { return a.ultFecha.localeCompare(c.ultFecha); });
  const cola = nuevos.concat(seguimiento).slice(0, APP_TAM_COLA);
  const res = {};
  cola.forEach(function (x) { res["r" + base + x.fila] = asesora; });
  if (cola.length) cache.putAll(res, APP_RESERVA_SEG);

  return {
    asesora: asesora, cola: cola, hoy: app_contadorHoy(asesora), estados: APP_ESTADOS, horas: LL_HORAS,
    pendientes: null, leidas: leidas, ms: Date.now() - t0
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
  const cache = CacheService.getScriptCache();
  cache.remove("r" + base + fila);
  // contador de hoy (para el marcador de la app)
  const k = app_claveHoy(asesora);
  const c = JSON.parse(cache.get(k) || "{}");
  c[estado] = (c[estado] || 0) + 1;
  cache.put(k, JSON.stringify(c), 21600);
  return r;
}

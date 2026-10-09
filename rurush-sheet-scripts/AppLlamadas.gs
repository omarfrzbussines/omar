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

function app_getCola(llave, base, excluir, sinApi) {
  const t0 = Date.now();
  const asesora = app_asesora(llave);
  if (APP_BASES.indexOf(base) < 0) throw new Error("Base no habilitada: " + base);
  const api = !sinApi && app_conApi();
  const hoja = api ? app_hojaApi(base) : SpreadsheetApp.getActive().getSheetByName(base);
  const est = ll_estructura(hoja);
  const ultima = api ? hoja.ultimaFila(est) : app_ultimaFila(hoja, est);
  const hoy = Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM-dd");
  const yaTengo = {};
  (excluir || []).forEach(function (f) { yaTengo[f] = true; });
  const cache = CacheService.getScriptCache();
  const nuevos = [], seguimiento = [];
  let leidas = 0;

  for (let fin = ultima; fin > LL_FILA_HEADER; fin -= APP_BLOQUE) {
    const ini = Math.max(LL_FILA_HEADER + 1, fin - APP_BLOQUE + 1);
    const datos = api ? hoja.filas(est, ini, fin) : hoja.getRange(ini, 1, fin - ini + 1, est.ancho).getValues();
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
    pendientes: null, leidas: leidas, ms: Date.now() - t0, api: api
  };
}

/* ---------- lectura rápida con la API de Sheets ----------
   SpreadsheetApp espera a que el Sheet recalcule (RESUMEN, etc.) antes de cada lectura:
   en RURUSH Hoy eso eran 6-15 s por consulta. La API de Sheets devuelve los valores ya
   calculados. Se activa sola cuando el proyecto tiene el servicio avanzado "Sheets"
   (Servicios → + → Google Sheets API); sin él, la app sigue leyendo como antes. */
const APP_USAR_API = true;

function app_conApi() {
  return APP_USAR_API && typeof Sheets !== "undefined";
}

function app_col(n) { let s = ""; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }

function app_leerApi(rangos) {
  const r = Sheets.Spreadsheets.Values.batchGet(SpreadsheetApp.getActive().getId(),
    { ranges: rangos, valueRenderOption: "FORMATTED_VALUE" });
  return (r.valueRanges || []).map(function (v) { return v.values || []; });
}

// "08/10/2026" → Date a la medianoche de Lima (lo mismo que devuelve getValues).
function app_aFecha(v) {
  const m = String(v || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (!m) return v;
  const a = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
  return new Date(Date.UTC(a, Number(m[2]) - 1, Number(m[1]), 5));
}

/* Imita lo que app_getCola usa de la hoja (getLastColumn / getRange del encabezado para
   ll_estructura), más ultimaFila y filas, leyendo con la API. */
function app_hojaApi(base) {
  const q = "'" + base + "'!";
  const head = app_leerApi([q + LL_FILA_HEADER + ":" + LL_FILA_HEADER])[0][0] || [];
  return {
    getLastColumn: function () { return head.length; },
    getRange: function () { return { getValues: function () { return [head]; } }; },
    ultimaFila: function (est) {
      const c = app_col(est.numero);
      const col = app_leerApi([q + c + "1:" + c])[0];
      for (let i = col.length - 1; i >= LL_FILA_HEADER; i--) if (String((col[i] || [])[0] || "").trim()) return i + 1;
      return LL_FILA_HEADER;
    },
    filas: function (est, ini, fin) {
      const datos = app_leerApi([q + "A" + ini + ":" + app_col(est.ancho - 1) + fin])[0];
      const fechas = [est.dia].concat(est.rondas.map(function (ro) { return ro.fecha; })).filter(function (c) { return c >= 0; });
      const out = [];
      for (let i = 0; i <= fin - ini; i++) {
        const f = (datos[i] || []).slice();
        while (f.length < est.ancho) f.push("");
        fechas.forEach(function (c) { if (f[c]) f[c] = app_aFecha(f[c]); });
        out.push(f);
      }
      return out;
    }
  };
}

/* Prueba desde el editor: compara la cola leída con la API y sin ella (debe salir igual). */
function app_probarApi() {
  const llave = Object.keys(JSON.parse(PropertiesService.getScriptProperties().getProperty("APP_LLAVES") || "{}"))[0];
  if (typeof Sheets === "undefined") { Logger.log("Falta el servicio Sheets: Servicios → + → Google Sheets API → Agregar."); return; }
  const cache = CacheService.getScriptCache();
  const a = app_getCola(llave, "2026", []);
  a.cola.forEach(function (x) { cache.remove("r2026" + x.fila); });
  const b = app_getCola(llave, "2026", [], true);
  b.cola.forEach(function (x) { cache.remove("r2026" + x.fila); });
  const igual = JSON.stringify(a.cola) === JSON.stringify(b.cola);
  Logger.log("Con API: " + a.ms + " ms · sin API: " + b.ms + " ms · misma cola: " + (igual ? "SÍ ✅" : "NO ❌"));
  if (!igual) {
    const i = a.cola.findIndex(function (x, k) { return JSON.stringify(x) !== JSON.stringify(b.cola[k]); });
    Logger.log("Primera diferencia (puesto " + (i + 1) + "):\nAPI:   " + JSON.stringify(a.cola[i]) + "\nantes: " + JSON.stringify(b.cola[i]));
  }
}

function app_guardar(llave, base, fila, numero, estado, obs, fpFecha, fpHora, intentos, segundos) {
  const asesora = app_asesora(llave);
  if (APP_BASES.indexOf(base) < 0) throw new Error("Base no habilitada: " + base);
  if (APP_ESTADOS.indexOf(estado) < 0) throw new Error("Estado no válido.");
  const r = ll_registrar({
    base: base, fila: Number(fila), telefono: numero, asesora: asesora, estado: estado,
    observacion: obs || "", fechaFp: fpFecha || "", horaFp: fpHora || "",
    intentos: Number(intentos) || 0, segundos: Number(segundos) || 0
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

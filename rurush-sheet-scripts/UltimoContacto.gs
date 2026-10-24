/**
 * RURUSH Llamadas → 💬📞 ÚLTIMO CONTACTO de cada número: su último chat de WhatsApp y su última llamada.
 * Vive en la pestaña "💬 ÚLTIMO CONTACTO" de este Sheet (una fila por celular, nunca se borran ni reordenan filas).
 * Se llena solo:
 *   📞 al guardar una llamada (leads: ll_registrar · socios: so_guardar) y cada madrugada con todas las bases
 *      + 🏋️ LLAMADAS SOCIOS (uc_reconstruir, por si alguna llamada entró por otro lado);
 *   💬 desde la extensión de WhatsApp de cada computadora (doPost accion "chats": solo la FECHA del último
 *      mensaje de cada chat y si lo mandó la asesora o el cliente; nunca el texto) y al marcar una difusión.
 * Lo usan las tarjetas de Llamadas y 🏋️ Socios, y la pestaña 👥 Alumnos (uc_alumnos).
 * Todos los nombres llevan el prefijo uc_ / UC_.
 */

const UC_HOJA = "💬 ÚLTIMO CONTACTO";
const UC_COLS = ["CELULAR", "NOMBRE", "ÚLT. CHAT", "CHAT EN", "ESCRIBIÓ", "ÚLT. LLAMADA", "LLAMÓ", "RESULTADO", "DÓNDE"];
const UC = { tel: 0, nombre: 1, chat: 2, chatEn: 3, escribio: 4, llam: 5, llamo: 6, res: 7, donde: 8 };
const UC_LEAD_DIAS = 30;                 // un lead es "de" la asesora que lo llamó en los últimos 30 días
const UC_LEAD_FUERA = ["DESCARTADO", "OTRA CIUDAD", "CLIENTE"];
const UC_CACHE_MIN = 10;

function uc_tel_(v) { const d = String(v == null ? "" : v).replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : ""; }
function uc_ms_(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number" && v > 30000 && v < 80000) return Math.round((v - 25569) * 864e5) + 5 * 36e5;   // serial de Sheets (hora de Lima)
  return 0;
}
const uc_esNombre_ = (s) => !!String(s || "").trim() && !/^[+\d\s()-]+$/.test(String(s));

function uc_hoja_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(UC_HOJA);
  if (!sh) {
    sh = ss.insertSheet(UC_HOJA);
    sh.getRange(1, 1, 1, UC_COLS.length).setValues([UC_COLS]).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.getRange("A:A").setNumberFormat("@");
    sh.getRange("C:C").setNumberFormat("dd/MM/yyyy HH:mm");
    sh.getRange("F:F").setNumberFormat("dd/MM/yyyy HH:mm");
  }
  return sh;
}

/* ---------- caché (el mapa completo no entra en una sola llave: gzip + trozos) ---------- */
function uc_cachePut_(k, obj, seg) {
  const c = CacheService.getScriptCache();
  const b = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(obj), "application/json")).getBytes());
  const partes = {}, n = Math.ceil(b.length / 90000);
  for (let i = 0; i < n; i++) partes[k + "_" + i] = b.slice(i * 90000, (i + 1) * 90000);
  partes[k] = String(n);
  try { c.putAll(partes, seg); } catch (e) { console.error("uc cache: " + e); }
}
function uc_cacheGet_(k) {
  const c = CacheService.getScriptCache(), n = Number(c.get(k) || 0);
  if (!n) return null;
  const ks = []; for (let i = 0; i < n; i++) ks.push(k + "_" + i);
  const t = c.getAll(ks);
  let b = ""; for (let i = 0; i < n; i++) { if (t[ks[i]] == null) return null; b += t[ks[i]]; }
  try { return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b), "application/x-gzip")).getDataAsString()); }
  catch (e) { return null; }
}

/** tel → [nombre, chatMs, chatEn, escribio, llamMs, llamo, res, donde]. Lo recién anotado se suma encima. */
function uc_mapa_() {
  let m = uc_cacheGet_("uc_m");
  if (!m) {
    m = {};
    let v = null;
    if (app_conApi()) {
      try { v = app_valores(SpreadsheetApp.getActive().getId(), ["'" + UC_HOJA + "'!A2:I"], COB_API_OPC)[0]; }
      catch (e) { v = null; }
    }
    if (!v) { const sh = uc_hoja_(), n = sh.getLastRow() - 1; v = n > 0 ? sh.getRange(2, 1, n, UC_COLS.length).getValues() : []; }
    v.forEach(function (f) {
      const t = uc_tel_(f[UC.tel]);
      if (t) m[t] = [String(f[UC.nombre] || ""), uc_ms_(f[UC.chat]), String(f[UC.chatEn] || ""), String(f[UC.escribio] || ""),
                     uc_ms_(f[UC.llam]), String(f[UC.llamo] || ""), String(f[UC.res] || ""), String(f[UC.donde] || "")];
    });
    uc_cachePut_("uc_m", m, UC_CACHE_MIN * 60);
  }
  const rec = JSON.parse(CacheService.getScriptCache().get("uc_rec") || "[]");
  rec.forEach(function (x) { m[x.tel] = uc_unir_(m[x.tel], x).fila; });
  return m;
}

// Une lo nuevo (x) con lo que había (a: arreglo del mapa). Solo gana lo más reciente.
function uc_unir_(a, x) {
  a = (a || ["", 0, "", "", 0, "", "", ""]).slice();
  let cambio = false;
  if (x.nombre && uc_esNombre_(x.nombre) && !uc_esNombre_(a[0])) { a[0] = String(x.nombre).trim().slice(0, 60); cambio = true; }
  if (x.chat && x.chat > a[1] + 30000) { a[1] = x.chat; a[2] = x.chatEn || ""; a[3] = x.escribio || ""; cambio = true; }
  const mismoDia = x.soloDia && a[4] && Utilities.formatDate(new Date(x.llam), "America/Lima", "yyyyMMdd") === Utilities.formatDate(new Date(a[4]), "America/Lima", "yyyyMMdd");
  if (x.llam && x.llam >= a[4] + 1000 && !mismoDia) { a[4] = x.llam; a[5] = x.llamo || ""; a[6] = x.res || ""; if (x.donde) a[7] = x.donde; cambio = true; }
  if (x.donde && !a[7]) { a[7] = x.donde; cambio = true; }
  return { fila: a, cambio: cambio };
}
const uc_aFila_ = (tel, a) => ["'" + tel, a[0], a[1] ? new Date(a[1]) : "", a[2], a[3], a[4] ? new Date(a[4]) : "", a[5], a[6], a[7]];

/** Anota contactos: [{ tel, nombre?, chat?(ms), chatEn?, escribio?, llam?(ms), llamo?, res?, donde? }]. */
function uc_anotar_(items) {
  items = (items || []).map(function (x) { return Object.assign({}, x, { tel: uc_tel_(x && x.tel) }); }).filter(function (x) { return x.tel; });
  if (!items.length) return 0;
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  let n = 0;
  try {
    const sh = uc_hoja_(), filas = sh.getLastRow() - 1;
    const tels = filas > 0 ? sh.getRange(2, 1, filas, 1).getDisplayValues() : [];
    const pos = {};
    tels.forEach(function (t, i) { const k = uc_tel_(t[0]); if (k && !(k in pos)) pos[k] = i; });
    const muchos = items.length > 15 && filas > 0;
    const datos = muchos ? sh.getRange(2, 1, filas, UC_COLS.length).getValues() : null;
    const leer = function (i) { return datos ? datos[i] : sh.getRange(i + 2, 1, 1, UC_COLS.length).getValues()[0]; };
    const aArr = function (f) { return [String(f[UC.nombre] || ""), uc_ms_(f[UC.chat]), String(f[UC.chatEn] || ""), String(f[UC.escribio] || ""),
                                        uc_ms_(f[UC.llam]), String(f[UC.llamo] || ""), String(f[UC.res] || ""), String(f[UC.donde] || "")]; };
    const cambiadas = {}, nuevas = {}, rec = [];
    items.forEach(function (x) {
      if (x.tel in nuevas) { const u = uc_unir_(nuevas[x.tel], x); nuevas[x.tel] = u.fila; return; }
      if (x.tel in pos) {
        const i = pos[x.tel], antes = cambiadas[i] || aArr(leer(i)), u = uc_unir_(antes, x);
        if (u.cambio) { cambiadas[i] = u.fila; rec.push(x); n++; }
        return;
      }
      nuevas[x.tel] = uc_unir_(null, x).fila; rec.push(x); n++;
    });
    const idx = Object.keys(cambiadas).map(Number);
    if (datos && idx.length > 40) {
      idx.forEach(function (i) { datos[i] = uc_aFila_(uc_tel_(datos[i][UC.tel]), cambiadas[i]); });
      sh.getRange(2, 1, filas, UC_COLS.length).setValues(datos);
    } else {
      idx.forEach(function (i) { sh.getRange(i + 2, 1, 1, UC_COLS.length).setValues([uc_aFila_(uc_tel_(tels[i][0]), cambiadas[i])]); });
    }
    const add = Object.keys(nuevas).map(function (t) { return uc_aFila_(t, nuevas[t]); });
    if (add.length) sh.getRange(filas + 2, 1, add.length, UC_COLS.length).setValues(add);
    // lo recién anotado se ve al instante, sin volver a leer toda la pestaña
    if (rec.length) {
      const c = CacheService.getScriptCache();
      if (rec.length > 200) c.remove("uc_m");
      else {
        const viejo = JSON.parse(c.get("uc_rec") || "[]").concat(rec).slice(-300);
        c.put("uc_rec", JSON.stringify(viejo), (UC_CACHE_MIN + 5) * 60);
      }
    }
  } finally {
    lock.releaseLock();
  }
  return n;
}
// Igual que uc_anotar_ pero nunca rompe lo que lo llama (guardar una llamada no puede fallar por esto).
function uc_anotarSeguro_(items) { try { uc_anotar_(items); } catch (e) { console.error("último contacto: " + e); } }

/** Lo que va en cada tarjeta. */
function uc_de_(m, tel) {
  const a = m[uc_tel_(tel)];
  return a ? { c: a[1], ce: a[2], e: a[3], l: a[4], lq: a[5], r: a[6] } : null;
}

/* ---------- 💬 desde la extensión de WhatsApp ----------
   d = { accion: "chats", k: <llave de la app de Llamadas de la asesora>, chats: [{ t: celular, ms, yo: true|false|null, n: nombre }] } */
function uc_chatsExt(d) {
  const quien = app_asesoraLlave(d.k);
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty("UC_CHATS_DESDE")) props.setProperty("UC_CHATS_DESDE", String(Date.now()));
  const ahora = Date.now(), lista = (d.chats || []).slice(0, 600);
  const items = lista.map(function (x) {
    const ms = Number(x.ms) || 0;
    if (!(ms > ahora - 400 * 864e5 && ms < ahora + 10 * 60000)) return null;
    return { tel: x.t, chat: ms, chatEn: quien, escribio: x.yo === true ? quien : x.yo === false ? "CLIENTE" : "", nombre: x.n || "" };
  }).filter(Boolean);
  return { asesora: quien, recibidos: lista.length, anotados: uc_anotar_(items) };
}

/* ---------- 📞 todas las llamadas de las bases + socios (cada madrugada) ---------- */
function uc_reconstruir() {
  const t0 = Date.now(), items = {};
  const poner = function (x) { const v = items[x.tel]; if (!v || x.llam > v.llam) items[x.tel] = x; };
  LL_BASES.forEach(function (base) {
    try {
      const api = app_conApi();
      const hoja = api ? app_hojaApi(base) : SpreadsheetApp.getActive().getSheetByName(base);
      if (!hoja) return;
      const est = ll_estructura(hoja);
      if (est.numero < 0) return;
      const ultima = api ? hoja.ultimaFila(est) : app_ultimaFila(hoja, est);
      for (let ini = LL_FILA_HEADER + 1; ini <= ultima; ini += APP_BLOQUE) {
        const fin = Math.min(ultima, ini + APP_BLOQUE - 1);
        const datos = api ? hoja.filas(est, ini, fin) : hoja.getRange(ini, 1, fin - ini + 1, est.ancho).getValues();
        if (!api) { const t = hoja.getRange(ini, est.numero + 1, fin - ini + 1, 1).getDisplayValues(); datos.forEach(function (f, i) { f[est.numero] = t[i][0]; }); }
        datos.forEach(function (f) {
          const tel = uc_tel_(f[est.numero]);
          if (!tel) return;
          for (let k = est.rondas.length - 1; k >= 0; k--) {
            const ro = est.rondas[k], e = String(f[ro.estado] || "").trim();
            if (!e) continue;
            const fe = ro.fecha >= 0 ? f[ro.fecha] : null;
            if (!(fe instanceof Date)) continue;
            poner({ tel: tel, nombre: est.nombre >= 0 ? String(f[est.nombre] || "") : "", llam: fe.getTime() + 12 * 36e5, soloDia: true,   // sin hora: mediodía
                    llamo: ro.asesor >= 0 ? String(f[ro.asesor] || "").trim().toUpperCase() : "", res: e.toUpperCase(), donde: base });
            break;
          }
        });
      }
    } catch (e) { console.error("uc base " + base + ": " + e); }
  });
  try {
    so_logFilas_("2000-01-01").forEach(function (x) {
      const tel = uc_tel_(x.tel);
      if (!tel) return;
      const hm = String(x.hora || "12:00").split(":");
      const ms = Date.parse(x.fecha + "T00:00:00-05:00") + (Number(hm[0]) || 0) * 36e5 + (Number(hm[1]) || 0) * 6e4;
      poner({ tel: tel, nombre: x.socio, llam: ms, llamo: x.ase, res: x.res, donde: "SOCIO" });
    });
  } catch (e) { console.error("uc socios: " + e); }
  const lista = Object.keys(items).map(function (t) { return items[t]; });
  const n = uc_anotar_(lista);
  CacheService.getScriptCache().remove("uc_m");
  PropertiesService.getScriptProperties().setProperty("UC_ULT", String(Date.now()));
  console.log("último contacto: " + lista.length + " números, " + n + " actualizados en " + Math.round((Date.now() - t0) / 1000) + " s");
  return { numeros: lista.length, actualizados: n, seg: Math.round((Date.now() - t0) / 1000) };
}

// Disparador de cada madrugada (4 am) + la primera vez al minuto. Se instala solo al abrir la app.
function uc_instalarSiFalta() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("UC_TRIGGER")) return;
  props.setProperty("UC_TRIGGER", "1");
  ScriptApp.newTrigger("uc_reconstruir").timeBased().atHour(4).everyDays(1).inTimezone("America/Lima").create();
  ScriptApp.newTrigger("uc_primeraVez").timeBased().after(60 * 1000).create();
}
function uc_primeraVez() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "uc_primeraVez") ScriptApp.deleteTrigger(t); });
  uc_reconstruir();
}

/* ---------- 👥 Alumnos: socios activos + leads de cada asesora, con su último chat y última llamada ---------- */
function uc_alumnos(llave, como) {
  const quien = so_quien_(llave, como), todas = quien === APP_PRUEBA;
  const m = uc_mapa_(), hoy = cob_hoy(), out = [], esSocio = {};
  const ok = function (a) { a = cob_norm(a); return todas ? APP_ASESORAS.indexOf(a) >= 0 || a === APP_PRUEBA : a === quien; };
  so_filas_().forEach(function (f) {
    const cod = String(f[SO.cod] || "").trim(), tel = uc_tel_(f[SO.cel]);
    if (!cod || !tel) return;
    const vence = so_ent_(f[SO.vence]), fin = cob_iso(f[SO.fin]);
    if (vence == null || vence < 0 || (fin && fin < hoy)) return;          // solo socios con plan vigente
    esSocio[tel] = 1;
    const ase = cob_norm(f[SO.ase] || f[SO.aseOrig]);
    if (!ok(ase)) return;
    out.push({ t: "s", nombre: String(f[SO.nombre] || "").trim(), tel: tel, ase: ase, cod: cod, plan: String(f[SO.plan] || ""), fin: fin,
               dias: so_ent_(f[SO.dias]), uc: uc_de_(m, tel) });
  });
  const desde = Date.now() - UC_LEAD_DIAS * 864e5;
  Object.keys(m).forEach(function (tel) {
    const a = m[tel];
    if (esSocio[tel] || a[7] === "SOCIO" || !(a[4] >= desde) || !ok(a[5])) return;
    if (UC_LEAD_FUERA.indexOf(cob_norm(a[6])) >= 0) return;
    out.push({ t: "l", nombre: a[0], tel: tel, ase: cob_norm(a[5]), base: a[7], res: a[6], uc: uc_de_(m, tel) });
  });
  return { quien: quien, todas: todas, lista: out, chatsDesde: Number(PropertiesService.getScriptProperties().getProperty("UC_CHATS_DESDE") || 0) };
}

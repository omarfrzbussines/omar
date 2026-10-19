/* 🚫 Números DESCARTADOS: no vuelven a salir en ninguna cola de llamadas (ninguna base, ninguna asesora)
   durante DESC_MESES meses desde que se marcaron. Antes solo se cerraba la fila donde se descartó y el
   mismo número volvía a aparecer en otra base o como lead nuevo.
   OTRA CIUDAD no entra aquí (por ahora se les sigue llamando desde otras bases).
   La lista se arma leyendo todas las bases con la API de Sheets (solo celular + estado + fecha de cada
   llamada) cada 30 min, y queda en caché. Lo que se descarta en la app se suma al momento. No escribe nada. */

const DESC_MESES = 6;
const DESC_VER = "1";   // subir para reinstalar el disparador

// { celular9: "AAAA-MM-DD" (último descarte) | "" (sin fecha) }
function desc_construir() {
  const desde = desc_desde_();
  const out = {};
  const bases = APP_BASES.concat(LL_BASES).filter(function (b, i, a) { return a.indexOf(b) === i; });
  bases.forEach(function (base) {
    try {
      const est = ll_estructura(app_hojaApi(base));
      const fin = LL_FILA_HEADER + 1;
      const cols = [est.numero];
      est.rondas.forEach(function (ro) { cols.push(ro.estado, ro.fecha); });
      const q = "'" + base + "'!";
      const datos = app_leerApi(cols.map(function (c) { return c >= 0 ? q + app_col(c) + fin + ":" + app_col(c) : q + "A1:A1"; }));
      const tels = datos[0] || [];
      tels.forEach(function (t, i) {
        const tel = ll_limpiarTel((t || [])[0]);
        if (!tel) return;
        est.rondas.forEach(function (ro, k) {
          if (String(((datos[1 + 2 * k] || [])[i] || [])[0] || "").trim().toUpperCase() !== "DESCARTADO") return;
          const f = ro.fecha >= 0 ? app_aFecha(((datos[2 + 2 * k] || [])[i] || [])[0]) : "";
          const iso = f instanceof Date ? ll_iso(f) : "";
          if (iso && iso < desde) return;
          if (!(tel in out) || (iso && out[tel] && iso > out[tel])) out[tel] = iso;
        });
      });
    } catch (e) { console.error("descartados " + base + ": " + e); }
  });
  desc_guardar_(out);
  return out;
}

function desc_desde_() {
  const d = new Date();
  d.setMonth(d.getMonth() - DESC_MESES);
  return Utilities.formatDate(d, "America/Lima", "yyyy-MM-dd");
}

// En caché en trozos (cada valor admite ~100 KB)
function desc_guardar_(mapa) {
  const cache = CacheService.getScriptCache();
  const ks = Object.keys(mapa), trozos = {};
  let n = 0;
  for (let i = 0; i < ks.length; i += 3000, n++) {
    const parte = {};
    ks.slice(i, i + 3000).forEach(function (k) { parte[k] = mapa[k]; });
    trozos["desc_" + n] = JSON.stringify(parte);
  }
  trozos.desc_n = String(n);
  cache.putAll(trozos, 21600);
}

/** Lista para filtrar las colas. Si la caché venció, se rehace (tarda unos segundos, una vez). */
function desc_mapa() {
  const cache = CacheService.getScriptCache();
  const n = cache.get("desc_n");
  let mapa = null;
  if (n != null) {
    const ks = [];
    for (let i = 0; i < Number(n); i++) ks.push("desc_" + i);
    const t = cache.getAll(ks);
    if (ks.every(function (k) { return k in t; })) {
      mapa = {};
      ks.forEach(function (k) { const p = JSON.parse(t[k]); Object.keys(p).forEach(function (x) { mapa[x] = p[x]; }); });
    }
  }
  if (!mapa) mapa = desc_construir();
  const nuevos = JSON.parse(cache.get("desc_nuevos") || "{}");
  Object.keys(nuevos).forEach(function (x) { mapa[x] = nuevos[x]; });
  return mapa;
}

/** La app acaba de marcar DESCARTADO: que deje de salir ya, sin esperar la próxima lectura. */
function desc_anotar(numero) {
  const tel = ll_limpiarTel(numero);
  if (!tel) return;
  const cache = CacheService.getScriptCache();
  const nuevos = JSON.parse(cache.get("desc_nuevos") || "{}");
  nuevos[tel] = Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM-dd");
  cache.put("desc_nuevos", JSON.stringify(nuevos), 21600);
}

/* Disparador cada 30 min (lo instala la primera cola que se pide). */
function desc_tick() { desc_construir(); }
function desc_instalarSiFalta() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty("DESC_VER") === DESC_VER) return;
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "desc_tick"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("desc_tick").timeBased().everyMinutes(30).create();
  p.setProperty("DESC_VER", DESC_VER);
}

/* Prueba desde el editor: cuántos números quedan ocultos y algunos ejemplos. */
function desc_probar() {
  const t0 = Date.now(), m = desc_construir(), ks = Object.keys(m);
  Logger.log(ks.length + " números descartados en los últimos " + DESC_MESES + " meses (" + (Date.now() - t0) + " ms). Ej.: " +
    ks.slice(0, 5).map(function (k) { return k + " (" + (m[k] || "sin fecha") + ")"; }).join(", "));
}

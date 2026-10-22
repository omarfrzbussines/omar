/* 🕐 ¿A qué hora viene cada socio?
   Apps Fit solo da la ÚLTIMA asistencia (con hora). Cada hora (y cada vez que se abre la app) se
   anota la visita nueva de cada socio en la pestaña oculta _HORAS_SOCIOS de la HOJA DE REPORTES
   (una fila por socio, últimas 20 horas de llegada). Con eso sale su hora habitual (mediana). */

const HS_HOJA = '_HORAS_SOCIOS';
const HS_MAX = 20;          // visitas guardadas por socio
const HS_VER = '1';         // subir para reinstalar el activador

// "2026-10-16T18:32:10" / "2026-10-16 18:32" → { dia, min } (min = minutos desde 00:00). Sin hora → null.
function hs_visita_(ua) {
  const m = String(ua || '').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const min = Number(m[2]) * 60 + Number(m[3]);
  if (!min) return null;    // 00:00 = Apps Fit no guardó la hora
  return { dia: m[1], min: min };
}
const hs_clave_ = (c) => String(c.CodigoSocio || tel9(c.Celular) || ((c.Nombres || '') + ' ' + (c.Apellidos || '')).trim());

function hs_hoja_() {
  const ss = SpreadsheetApp.openById(DV_ID);
  let sh = ss.getSheetByName(HS_HOJA);
  if (!sh) {
    sh = ss.insertSheet(HS_HOJA);
    sh.getRange(1, 1, 1, 5).setValues([['CODIGO', 'NOMBRE', 'ULTIMA', 'MINUTOS', 'N']]);
    sh.getRange('A:D').setNumberFormat('@');
    sh.hideSheet();
  }
  return sh;
}

// Lee la pestaña: { clave: { fila, nombre, ultima, mins: [..] } }
function hs_leer_(sh) {
  const out = {}, n = sh.getLastRow() - 1;
  if (n < 1) return out;
  sh.getRange(2, 1, n, 4).getDisplayValues().forEach(function (f, i) {
    if (!f[0]) return;
    out[f[0]] = { fila: i + 2, nombre: f[1], ultima: f[2], mins: f[3] ? f[3].split(',').map(Number) : [] };
  });
  return out;
}

/** Anota las visitas nuevas de la lista de clientes de Apps Fit (los que ya trae getDashboard). */
function hs_anotar_(clientes) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const sh = hs_hoja_(), datos = hs_leer_(sh);
    const cambios = [], nuevos = [];
    clientes.forEach(function (c) {
      const v = hs_visita_(c.UltimaAsistencia);
      if (!v) return;
      const k = hs_clave_(c), sello = v.dia + ' ' + pad(Math.floor(v.min / 60)) + ':' + pad(v.min % 60);
      const x = datos[k];
      if (x && x.ultima >= sello) return;           // ya anotada
      const mins = (x ? x.mins : []).concat([v.min]).slice(-HS_MAX);
      const fila = [k, ((c.Nombres || '') + ' ' + (c.Apellidos || '')).trim(), sello, mins.join(','), mins.length];
      if (x) { x.ultima = sello; x.mins = mins; cambios.push({ fila: x.fila, v: fila }); }
      else { datos[k] = { ultima: sello, mins: mins }; nuevos.push(fila); }
    });
    cambios.forEach(function (c) { sh.getRange(c.fila, 1, 1, 5).setValues([c.v]); });
    if (nuevos.length) sh.getRange(sh.getLastRow() + 1, 1, nuevos.length, 5).setValues(nuevos);
    if (cambios.length || nuevos.length) CacheService.getScriptCache().remove('hs_mapa');
  } finally { lock.releaseLock(); }
}

// { clave: { h: hora habitual en minutos (mediana), n: visitas anotadas } }
function hs_mapa_() {
  const cache = CacheService.getScriptCache();
  const c = cache.get('hs_mapa');
  if (c) return JSON.parse(c);
  const datos = hs_leer_(hs_hoja_()), out = {};
  Object.keys(datos).forEach(function (k) {
    const m = datos[k].mins.filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
    if (!m.length) return;
    const med = m.length % 2 ? m[(m.length - 1) / 2] : Math.round((m[m.length / 2 - 1] + m[m.length / 2]) / 2);
    out[k] = { h: med, n: m.length };
  });
  // 6 h: solo cambia cuando hs_tick anota visitas nuevas, y ese mismo reloj lo vuelve a armar (leer la hoja tarda ~2 s)
  try { cache.put('hs_mapa', JSON.stringify(out), 21600); } catch (e) {}
  return out;
}

/* Activador cada hora (6 am – 11 pm Lima). Se instala solo desde getDashboard. */
function hs_tick() {
  const h = new Date(Date.now() + LIMA * 3600e3).getUTCHours();
  if (h < 6 || h >= 23) return;
  hs_anotar_(appsfitClientes(1, fechaLima(0), '2099-12-31'));
  hs_mapa_();   // deja el mapa listo en caché para que al abrir la app no se lea la hoja
}
function hs_instalarSiFalta_() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('HS_VER') === HS_VER) return;
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'hs_tick'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('hs_tick').timeBased().everyHours(1).create();
  p.setProperty('HS_VER', HS_VER);
}

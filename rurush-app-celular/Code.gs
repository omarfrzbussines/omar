/* RURUSH Hoy — dashboard para el celular de Omar.
   App web de Apps Script: los tokens de Apps Fit y Pipedrive viven en las
   Propiedades del script (nunca en el celular) y solo Omar puede abrirla, y SOLO en su celular:
   acceso "cualquier usuario" (para verla a pantalla completa desde rurush-hoy en GitHub Pages)
   pero doGet exige la llave (HOY_LLAVE) y el celular activado con el PIN (HOY_PIN). Si falta
   algo responde texto plano: la página de la app (y sus funciones) no se entrega. Ver hoy_verLink.

   Misma lógica que el dashboard de la extensión "RURUSH — Panel Operativo". */

const APPSFIT_BASE = 'https://webapiappsfit-cliente.azurewebsites.net';
const PIPEDRIVE_BASE = 'https://api.pipedrive.com/v1';
const LIMA = -5; // Perú no cambia de hora

const ASESORAS = {
  monica10da: 'MÓNICA', monica03: 'MÓNICA', monica: 'MÓNICA',
  laura31: 'LAURA', danna123: 'DANNA', dilan24: 'DILAN',
  omarfrz10: 'OMAR', omar: 'OMAR',
  valeria22: 'VALERIA', gustavo: 'GUSTAVO', erik: 'ERIK'
};

function doGet(e) {
  const p = (e && e.parameter) || {};
  const props = PropertiesService.getScriptProperties();
  let llave = props.getProperty('HOY_LLAVE');
  // Primera vez (o "?reenviar=1", máx. 1 por hora): el link y el PIN se mandan SOLO al correo de Omar.
  if (!llave || (p.reenviar && !CacheService.getScriptCache().get('hoy_reenvio'))) {
    CacheService.getScriptCache().put('hoy_reenvio', '1', 3600);
    hoy_enviarLink_();
    return ContentService.createTextOutput('Listo: el link de RURUSH Hoy y el PIN llegaron al correo de Omar.');
  }
  // 📲 cuadro de ventas para la PC (solo lectura, clave propia de la PC, autorizada por Omar desde su correo)
  if (p.cuadroalta) return ContentService.createTextOutput(cuadro_alta_(p.cuadroalta));
  if (p.cuadrook) return cuadro_okPagina_(p.cuadrook, p.numero);
  if (p.cuadro) {
    if (!cuadro_tokenOk_(p.cuadro)) return ContentService.createTextOutput('Link no válido.');
    if (p.estados || p.estadoOk || p.estadoError) return es_doGet_(p);
    if (p.info) return hoy_json_({ ok: true, numero: props.getProperty('CUADRO_NUMERO') || '', destinos: cuadro_destinos_() });
    // ?ver=1: se ve en Safari (Atajo del iPhone saca captura); sin ver: HTML para la PC
    if (p.ver) return HtmlService.createHtmlOutput(dv_cuadroTexto(p.noche === '1')).setTitle('RURUSH · Cuadro')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    return ContentService.createTextOutput(dv_cuadroTexto(p.noche === '1'));
  }
  if (p.k !== llave) return p.accion ? hoy_json_({ ok: false, error: 'Link no válido.' }) : ContentService.createTextOutput('Link no válido.');
  if (p.accion === 'estado') return hoy_json_({ ok: hoy_celularOk_(p.d, p.h) });
  if (p.accion === 'activar') return hoy_json_(hoy_activar_(p.d, p.h, p.pin, p.modelo));
  if (!hoy_celularOk_(p.d, p.h)) return ContentService.createTextOutput('Celular no autorizado.');
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('RURUSH Hoy')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setFaviconUrl('https://em-content.zobj.net/source/apple/391/fire_1f525.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- candado: llave + un solo celular (el de Omar) ----------
   La página rurush-hoy (GitHub Pages) manda d = id guardado en el celular y h = huella del celular
   (modelo/pantalla/idioma). Si el navegador pierde el id, se reconoce por la huella. */
function hoy_json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function hoy_celularOk_(d, h) {
  const props = PropertiesService.getScriptProperties();
  const c = JSON.parse(props.getProperty('HOY_CEL') || 'null');
  if (!c) return false;
  if (d && c.id === d) return true;
  if (h && c.huella === h && /^[a-z0-9]{16,}$/.test(String(d || ''))) {
    c.id = d; props.setProperty('HOY_CEL', JSON.stringify(c));
    return true;
  }
  return false;
}
function hoy_activar_(d, h, pin, modelo) {
  if (!/^[a-z0-9]{16,}$/.test(String(d || ''))) return { ok: false, error: 'No se pudo identificar este celular.' };
  const cache = CacheService.getScriptCache(), fallos = Number(cache.get('hoy_pinfail') || 0);
  if (fallos >= 5) return { ok: false, error: 'Demasiados intentos. Espera 15 minutos.' };
  const props = PropertiesService.getScriptProperties(), PIN = props.getProperty('HOY_PIN');
  if (!PIN || String(pin || '').trim() !== PIN) { cache.put('hoy_pinfail', String(fallos + 1), 900); return { ok: false, error: 'PIN incorrecto.' }; }
  props.setProperty('HOY_CEL', JSON.stringify({ id: d, huella: String(h || ''), modelo: String(modelo || '').slice(0, 80),
    desde: Utilities.formatDate(new Date(), 'America/Lima', 'dd/MM/yyyy HH:mm') }));
  return { ok: true };
}

function hoy_crearLlave_() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('HOY_LLAVE')) p.setProperty('HOY_LLAVE', Utilities.getUuid().replace(/-/g, '').slice(0, 24));
  if (!p.getProperty('HOY_PIN')) p.setProperty('HOY_PIN', String(Math.floor(100000 + Math.random() * 900000)));
  return p;
}
function hoy_enviarLink_() {
  const p = hoy_crearLlave_();
  const link = 'https://omarfrzbussines.github.io/omar/rurush-hoy/?k=' + p.getProperty('HOY_LLAVE');
  MailApp.sendEmail(DV_CORREO, '🔐 RURUSH Hoy: tu link y PIN',
    'Link de RURUSH Hoy (pantalla completa):\n' + link + '\n\nPIN para activar tu celular: ' + p.getProperty('HOY_PIN') +
    '\n\n1) Abre el link en Safari del celular.\n2) Compartir → Agregar a pantalla de inicio.\n3) Abre el ícono y escribe el PIN.\n\n' +
    'Solo funciona en el celular que actives. No compartas este correo.');
}

/** Ejecutar desde el editor: crea la llave y el PIN si no existen y muestra el link y el celular activado. */
function hoy_verLink() {
  const p = hoy_crearLlave_();
  Logger.log('Link (pantalla completa) → https://omarfrzbussines.github.io/omar/rurush-hoy/?k=' + p.getProperty('HOY_LLAVE'));
  Logger.log('PIN para activar tu celular → ' + p.getProperty('HOY_PIN'));
  const c = JSON.parse(p.getProperty('HOY_CEL') || 'null');
  Logger.log('Celular activado: ' + (c ? c.desde + ' · ' + c.modelo : 'ninguno todavía'));
}

/* ---------- utilidades ---------- */

const pad = (n) => String(n).padStart(2, '0');
function fechaLima(offsetDias) {
  const d = new Date(Date.now() + LIMA * 3600e3 + (offsetDias || 0) * 86400e3);
  return d.toISOString().slice(0, 10);
}
function diasEntre(desdeIso, hastaIso) {
  return Math.round((Date.parse(hastaIso + 'T00:00:00Z') - Date.parse(desdeIso + 'T00:00:00Z')) / 86400e3);
}
const tel9 = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
const asesora = (cod) => { const c = String(cod || '').trim(); return c ? (ASESORAS[c.toLowerCase()] || c.toUpperCase()) : 'SIN ASIGNAR'; };
function token(nombre) {
  const t = PropertiesService.getScriptProperties().getProperty(nombre);
  if (!t) throw new Error('Falta ' + nombre + ' en Configuración del proyecto → Propiedades del script.');
  return t.trim();
}

/* ---------- Apps Fit ---------- */

function appsfitBearer(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) { const t = cache.get('af_bearer'); if (t) return t; }
  const r = UrlFetchApp.fetch(APPSFIT_BASE + '/api/managements/auth', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ TokenEmpresa: token('APPSFIT_TOKEN') }),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('Apps Fit respondió ' + r.getResponseCode() + ' al autenticar.');
  const j = JSON.parse(r.getContentText());
  if (!j || !j.Success || !j.Item || !j.Item.Token) throw new Error('Apps Fit rechazó el TokenEmpresa.');
  cache.put('af_bearer', j.Item.Token, 6 * 3600); // máximo que permite CacheService
  return j.Item.Token;
}

// type_date 1 = por fecha de fin del plan · 2 = por fecha de inscripción.
// OJO: la lista viene en "cutomers" (typo del propio API).
function appsfitClientes(typeDate, desde, hasta, reintento) {
  let bearer = appsfitBearer(false);
  const out = [];
  let page = 1, pages = 1;
  do {
    const qs = 'page=' + page + '&type_date=' + typeDate + '&date_from=' + desde + '&date_to=' + hasta + '&with_frostbite=0';
    const r = UrlFetchApp.fetch(APPSFIT_BASE + '/api/managements/customers?' + qs, {
      headers: { Authorization: 'Bearer ' + bearer }, muteHttpExceptions: true
    });
    if (r.getResponseCode() === 401) {
      if (reintento) throw new Error('Apps Fit sigue rechazando el token.');
      appsfitBearer(true);
      return appsfitClientes(typeDate, desde, hasta, true);
    }
    if (r.getResponseCode() !== 200) throw new Error('Apps Fit respondió ' + r.getResponseCode() + '.');
    const j = JSON.parse(r.getContentText());
    const item = (j && j.Item) || {};
    Array.prototype.push.apply(out, item.cutomers || []);
    pages = (item.paging && item.paging.pages) || 1;
    page++;
  } while (page <= pages);
  return out;
}

/* ---------- Pipedrive ---------- */

function pd(path) {
  // "Dirección no disponible" / timeouts son cortes de red pasajeros de Google: se reintenta 2 veces
  let r;
  for (let i = 0; ; i++) {
    try {
      r = UrlFetchApp.fetch(PIPEDRIVE_BASE + path, { headers: { 'x-api-token': token('PIPEDRIVE_TOKEN') }, muteHttpExceptions: true });
      if (r.getResponseCode() >= 500 && i < 2) { Utilities.sleep(800 * (i + 1)); continue; }
      break;
    } catch (e) {
      if (i >= 2) throw new Error('Pipedrive no respondió (corte de red). Toca 🔄 en un momento.');
      Utilities.sleep(800 * (i + 1));
    }
  }
  let j = null;
  try { j = JSON.parse(r.getContentText()); } catch (e) { /* sin JSON */ }
  if (r.getResponseCode() !== 200 || (j && j.success === false)) {
    if (r.getResponseCode() === 401) throw new Error('Pipedrive rechazó el token.');
    throw new Error((j && j.error) || ('Pipedrive respondió ' + r.getResponseCode() + '.'));
  }
  return j;
}

// Actividades tipo reunión con fecha Lima entre desde y hasta (inclusive).
// Pipedrive guarda fecha/hora en UTC y end_date es exclusivo: se pide margen y se filtra.
function actividades(desde, hasta) {
  const out = [];
  let start = 0;
  const ini = new Date(Date.parse(desde + 'T12:00:00Z') - 86400e3).toISOString().slice(0, 10);
  const fin = new Date(Date.parse(hasta + 'T12:00:00Z') + 2 * 86400e3).toISOString().slice(0, 10);
  for (;;) {
    const j = pd('/activities?type=meeting&user_id=0&limit=500&start=' + start + '&start_date=' + ini + '&end_date=' + fin);
    const personas = (j.related_objects && j.related_objects.person) || {};
    (j.data || []).forEach(function (a) {
      if (!a.due_date) return;
      let fecha = a.due_date, hora = '';
      if (a.due_time) {
        const l = new Date(Date.parse(a.due_date + 'T' + a.due_time.slice(0, 5) + ':00Z') + LIMA * 3600e3);
        fecha = l.toISOString().slice(0, 10);
        hora = pad(l.getUTCHours()) + ':' + pad(l.getUTCMinutes());
      }
      if (fecha < desde || fecha > hasta) return;
      const p = personas[a.person_id] || {};
      const tel = ((p.phone || []).map(function (x) { return tel9(x.value); }).filter(String))[0] || '';
      out.push({
        id: a.id, asunto: a.subject || '', persona: a.person_name || p.name || '(sin nombre)',
        hecha: !!a.done, fecha: fecha, hora: hora, tel: tel, asesora: asesoraDeAsunto(a.subject)
      });
    });
    const pg = j.additional_data && j.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  return out.sort(function (x, y) { return (x.fecha + x.hora).localeCompare(y.fecha + y.hora); });
}

// Asunto "FP <ASESORA> <VÍA>" o "FP REACT <ASESORA>": de ahí sale la asesora.
function asesoraDeAsunto(asunto) {
  const t = String(asunto || '').trim().split(/\s+/);
  if (!t.length || !/^(FP|RETOMA)$/i.test(t[0])) return '';
  const n = /^REACT$/i.test(t[1] || '') ? t[2] : t[1];
  return (n || '').toUpperCase();
}
const esFP = (a) => /^\s*(FP\b|FREE\s*PASS)/i.test(a.asunto);

/* ---------- dashboard ---------- */

// Ingresos de DATOS_ORIGEN_<MES> por asesora: { ASESORA: { t: total, c: { categoría: monto } } }.
// mes = true → todo el mes de "iso"; si no, solo ese día. Sin la fila TOTAL DÍA.
const HOY_CATS = ['Referidos', 'Redes', 'Cerca/visitó', 'Cobros', 'Renovaciones', 'Ampliaciones'];
// Todo el mes de una vez y en caché: { "yyyy-MM-dd": { ASESORA: { t, c } } }. El mes en curso se
// guarda 2 min (y 🔄 lo renueva); los meses pasados, 1 h. Así cambiar de día es instantáneo.
function hoy_ingresosMes_(ym, forzar) {
  const cache = CacheService.getScriptCache(), key = 'ing_' + ym;
  if (!forzar) { const c = cache.get(key); if (c) return JSON.parse(c); }
  const r = Sheets.Spreadsheets.Values.batchGet(DV_ID, {
    ranges: ["'DATOS_ORIGEN_" + MESES[Number(ym.slice(5, 7)) - 1] + "'!C1:J800"], valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const out = {};
  (r.valueRanges[0].values || []).forEach(function (f) {
    if (typeof f[0] !== 'number') return;
    const fecha = dv_serialAIso(f[0]);
    if (fecha.slice(0, 7) !== ym) return;
    const n = dv_nom(f[1]);
    if (!n || n === 'TOTAL DIA') return;
    for (let c = 2; c <= 7; c++) {
      const m = dv_num(f[c]);
      if (!m) continue;
      const dia = out[fecha] || (out[fecha] = {}), x = dia[n] || (dia[n] = { t: 0, c: {} });
      x.t += m; x.c[HOY_CATS[c - 2]] = (x.c[HOY_CATS[c - 2]] || 0) + m;
    }
  });
  try { cache.put(key, JSON.stringify(out), ym === fechaLima(0).slice(0, 7) ? 120 : 3600); } catch (e) {}
  return out;
}
function hoy_ingresos_(iso, mes, forzar) {
  const porDia = hoy_ingresosMes_(iso.slice(0, 7), forzar);
  if (!mes) return porDia[iso] || {};
  const out = {};
  Object.keys(porDia).forEach(function (d) {
    Object.keys(porDia[d]).forEach(function (n) {
      const x = out[n] || (out[n] = { t: 0, c: {} }), y = porDia[d][n];
      x.t += y.t;
      Object.keys(y.c).forEach(function (c) { x.c[c] = (x.c[c] || 0) + y.c[c]; });
    });
  });
  return out;
}
/** Desde el celular: ingresos de un día ("yyyy-MM-dd") o de su mes completo. */
function getIngresos(iso, mes) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) throw new Error('Fecha no válida.');
  try { return { fecha: iso, mes: !!mes, datos: hoy_ingresos_(iso, !!mes) }; }
  catch (e) { throw new Error('No encontré la hoja DATOS_ORIGEN_' + MESES[Number(iso.slice(5, 7)) - 1] + '.'); }
}

function getDashboard(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) {
    const c = cache.get('dash');
    if (c) return JSON.parse(c);
  }
  const hoy = fechaLima(0), ayer = fechaLima(-1), manana = fechaLima(1), en7 = fechaLima(7);
  const res = { fecha: hoy, generado: Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm'), errores: [] };

  try {
    const crudos = appsfitClientes(1, hoy, '2099-12-31');
    // 🕐 hora habitual de cada socio (Horas.gs): se anota la visita nueva y se lee su mediana
    let horas = {};
    try { hs_instalarSiFalta_(); hs_anotar_(crudos); horas = hs_mapa_(); } catch (e) { res.errores.push('Horas de visita: ' + e.message); }
    const activos = crudos.map(function (c) {
      const ua = c.UltimaAsistencia ? String(c.UltimaAsistencia).slice(0, 10) : null;
      const hv = horas[hs_clave_(c)], uv = hs_visita_(c.UltimaAsistencia);
      const fin = String(c.FechaFin || '').slice(0, 10);
      return {
        nombre: ((c.Nombres || '') + ' ' + (c.Apellidos || '')).trim(),
        tel: tel9(c.Celular) || tel9(c.Telefono),
        asesora: asesora(c.Vendedor),
        plan: c.desTiempoPaquete || '',
        vence: fin,
        diasVence: fin ? diasEntre(hoy, fin) : null,
        sinVenir: ua ? diasEntre(ua, hoy) : null,
        saldo: (Number(c.Costo) || 0) - (Number(c.Pago) || 0),
        hora: hv ? hv.h : (uv ? uv.min : null),   // minutos desde 00:00
        horaN: hv ? hv.n : 0
      };
    });
    res.socios = activos;   // el filtro por asesora se hace en el celular

    const inscritos = appsfitClientes(2, hoy, hoy);
    res.inscritosHoy = inscritos.map(function (c) {
      return { nombre: ((c.Nombres || '') + ' ' + (c.Apellidos || '')).trim(), asesora: asesora(c.Vendedor),
               pago: Number(c.Pago) || 0, plan: c.desTiempoPaquete || '', tel: tel9(c.Celular) };
    });
  } catch (e) {
    res.errores.push('Apps Fit: ' + e.message);
  }

  const pdAse = pd_asesorasSiFalta_(); if (pdAse) res.errores.push(pdAse);
  try {
    const acts = actividades(ayer, manana).filter(esFP);
    res.fpHoy = acts.filter(function (a) { return a.fecha === hoy; });
    res.noShowsAyer = acts.filter(function (a) { return a.fecha === ayer && !a.hecha && a.hora; });
    res.fpManana = acts.filter(function (a) { return a.fecha === manana; });
  } catch (e) {
    res.errores.push('Pipedrive: ' + e.message);
  }

  // Venta de hoy: la misma fuente que el cuadro diario (DATOS_ORIGEN), no el "Pago" de Apps Fit
  // (que queda en 0 cuando el pago no se registró allí).
  try { res.ingresosHoy = hoy_ingresos_(hoy, false, forzar); } catch (e) { res.errores.push('Ventas (DATOS_ORIGEN): ' + e.message); }

  try { cache.put('dash', JSON.stringify(res), 300); } catch (e) { /* >100 KB: sin caché */ }
  return res;
}

// Ejecutar a mano desde el editor para comprobar la conexión.
function probarConexion() {
  const out = {};
  try { appsfitBearer(true); out.appsfit = 'OK'; } catch (e) { out.appsfit = 'ERROR: ' + e.message; }
  try { out.pipedrive = 'OK — ' + pd('/users/me').data.name; } catch (e) { out.pipedrive = 'ERROR: ' + e.message; }
  Logger.log(JSON.stringify(out));
  return out;
}

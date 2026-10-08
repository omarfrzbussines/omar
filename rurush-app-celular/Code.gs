/* RURUSH Hoy — dashboard para el celular de Omar.
   App web de Apps Script: los tokens de Apps Fit y Pipedrive viven en las
   Propiedades del script (nunca en el celular) y solo Omar puede abrirla
   (appsscript.json → access: MYSELF).

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

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('RURUSH Hoy')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setFaviconUrl('https://em-content.zobj.net/source/apple/391/fire_1f525.png');
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
  const r = UrlFetchApp.fetch(PIPEDRIVE_BASE + path, {
    headers: { 'x-api-token': token('PIPEDRIVE_TOKEN') }, muteHttpExceptions: true
  });
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

function getDashboard(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) {
    const c = cache.get('dash');
    if (c) return JSON.parse(c);
  }
  const hoy = fechaLima(0), ayer = fechaLima(-1), manana = fechaLima(1), en7 = fechaLima(7);
  const res = { fecha: hoy, generado: Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm'), errores: [] };

  try {
    const activos = appsfitClientes(1, hoy, '2099-12-31').map(function (c) {
      const ua = c.UltimaAsistencia ? String(c.UltimaAsistencia).slice(0, 10) : null;
      const fin = String(c.FechaFin || '').slice(0, 10);
      return {
        nombre: ((c.Nombres || '') + ' ' + (c.Apellidos || '')).trim(),
        tel: tel9(c.Celular) || tel9(c.Telefono),
        asesora: asesora(c.Vendedor),
        plan: c.desTiempoPaquete || '',
        vence: fin,
        diasVence: fin ? diasEntre(hoy, fin) : null,
        sinVenir: ua ? diasEntre(ua, hoy) : null,
        saldo: (Number(c.Costo) || 0) - (Number(c.Pago) || 0)
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

  try {
    const acts = actividades(ayer, manana).filter(esFP);
    res.fpHoy = acts.filter(function (a) { return a.fecha === hoy; });
    res.noShowsAyer = acts.filter(function (a) { return a.fecha === ayer && !a.hecha && a.hora; });
    res.fpManana = acts.filter(function (a) { return a.fecha === manana; });
  } catch (e) {
    res.errores.push('Pipedrive: ' + e.message);
  }

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

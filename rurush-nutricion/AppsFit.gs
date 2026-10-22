/* RURUSH Nutrición — socios desde AppsFit en vivo.
   Cada hora (af_instalar crea el activador) baja la lista de socios de AppsFit y la guarda en la pestaña oculta
   "AF SOCIOS" de esta misma hoja. La app de Diego y las reservas buscan en esa copia (rápido).
   Si AppsFit falla, se usa la última copia buena; si no hay copia, la hoja '3. BASE DE SOCIOS' como respaldo.
   Propiedad del script: APPSFIT_TOKEN (la misma clave que usan inasistencias y la app del celular). */

const AF_URL = 'https://webapiappsfit-cliente.azurewebsites.net';
const AF_HOJA = 'AF SOCIOS';
const AF_COLS = ['CÓDIGO', 'NOMBRE', 'CELULAR', 'DNI', 'PLAN', 'INICIO', 'FIN', 'ASESORA'];

function af_token_() {
  const clave = nu_props().getProperty('APPSFIT_TOKEN');
  if (!clave) throw new Error('Falta APPSFIT_TOKEN en Propiedades del script.');
  const r = UrlFetchApp.fetch(AF_URL + '/api/managements/auth', { method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ TokenEmpresa: clave }), muteHttpExceptions: true });
  const tok = r.getResponseCode() === 200 && ((JSON.parse(r.getContentText()).Item || {}).Token);
  if (!tok) throw new Error('AppsFit rechazó la clave (HTTP ' + r.getResponseCode() + ').');
  return tok;
}
function af_primero_(c, campos) { for (let i = 0; i < campos.length; i++) if (c[campos[i]] != null && String(c[campos[i]]).trim()) return String(c[campos[i]]).trim(); return ''; }

// todos los socios de AppsFit, uno por código (el registro con la fecha de fin más reciente)
function af_socios_() {
  const bearer = af_token_(), todos = [];
  for (let page = 1; page <= 100; page++) {
    const r = UrlFetchApp.fetch(AF_URL + '/api/managements/customers?page=' + page + '&date_from=2020-01-01&date_to=2099-12-31&type_date=2&with_frostbite=0',
      { headers: { Authorization: 'Bearer ' + bearer }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('AppsFit no respondió la lista de socios (HTTP ' + r.getResponseCode() + ').');
    const item = JSON.parse(r.getContentText()).Item || {};
    Array.prototype.push.apply(todos, item.cutomers || item.customers || []);   // «cutomers»: así lo escribe AppsFit
    if (!item.paging || page >= item.paging.pages) break;
  }
  const mejor = {};
  todos.forEach((c) => { const k = c.CodigoSocio; if (k != null && (!mejor[k] || String(c.FechaFin || '') > String(mejor[k].FechaFin || ''))) mejor[k] = c; });
  return Object.keys(mejor).map((k) => {
    const c = mejor[k];
    return {
      cod: String(k), nombre: (af_primero_(c, ['Nombres']) + ' ' + af_primero_(c, ['Apellidos'])).trim(),
      tel: nu_tel(af_primero_(c, ['Celular', 'Telefono'])),
      dni: af_primero_(c, ['NumeroDocumento', 'NroDocumento', 'Documento', 'Dni', 'DNI']).replace(/\D/g, ''),
      plan: af_primero_(c, ['Membresia', 'NombreMembresia', 'Plan', 'NombrePlan', 'Paquete']),
      ini: String(c.FechaInicio || '').slice(0, 10), fin: String(c.FechaFin || '').slice(0, 10),
      asesora: af_primero_(c, ['Vendedor'])
    };
  }).filter((s) => s.nombre && !/PRUEBA|USUARIO CLIENTE/i.test(s.nombre));
}

/* ⏰ Cada hora: baja AppsFit y guarda la copia. Si falla, deja la copia anterior y anota el error. */
function af_actualizar() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(AF_HOJA);
  try {
    const s = af_socios_();
    if (s.length < 50) throw new Error('AppsFit devolvió solo ' + s.length + ' socios: no se reemplaza la copia.');
    if (!sh) { sh = ss.insertSheet(AF_HOJA); sh.hideSheet(); }
    const filas = s.map((x) => [x.cod, x.nombre, x.tel, x.dni, x.plan, x.ini, x.fin, x.asesora]);
    sh.clearContents();
    sh.getRange(1, 1, 1, 2).setValues([['ACTUALIZADO', new Date().toISOString()]]);
    sh.getRange(2, 1, 1, AF_COLS.length).setValues([AF_COLS]);
    sh.getRange(3, 1, filas.length, AF_COLS.length).setNumberFormat('@').setValues(filas);
    CacheService.getScriptCache().remove('nu_base3_' + nu_hoy());
    nu_props().setProperty('AF_ULTIMO', new Date().toISOString() + ' · ' + filas.length + ' socios · OK');
    return filas.length;
  } catch (e) {
    nu_props().setProperty('AF_ULTIMO', new Date().toISOString() + ' · ERROR: ' + e.message);
    throw e;
  }
}

// copia guardada de AppsFit (si tiene menos de 26 h); null si no hay → se usa la hoja BASE DE SOCIOS
function af_copia_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(AF_HOJA);
  if (!sh || sh.getLastRow() < 3) return null;
  const cuando = Date.parse(String(sh.getRange(1, 2).getValue()));
  if (!(Date.now() - cuando < 26 * 3600e3)) return null;
  return sh.getRange(3, 1, sh.getLastRow() - 2, AF_COLS.length).getDisplayValues();
}

/* Ejecutar UNA vez desde el editor: prueba la clave, baja los socios y crea el activador de cada hora. */
function af_instalar() {
  const n = af_actualizar();
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'af_actualizar').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('af_actualizar').timeBased().everyHours(1).create();
  const hoy = nu_hoy(), act = af_copia_().filter((r) => r[6] >= hoy);
  Logger.log('AppsFit OK: ' + n + ' socios guardados · ' + act.length + ' con plan vigente · se actualizará cada hora.');
  const muestra = af_socios_()[0]; Logger.log('Ejemplo: ' + JSON.stringify(muestra));
}
/* Para revisar qué campos manda AppsFit (no guarda nada). */
function af_probar() {
  const r = UrlFetchApp.fetch(AF_URL + '/api/managements/customers?page=1&date_from=2020-01-01&date_to=2099-12-31&type_date=2&with_frostbite=0',
    { headers: { Authorization: 'Bearer ' + af_token_() }, muteHttpExceptions: true });
  const it = JSON.parse(r.getContentText()).Item || {}, c = (it.cutomers || it.customers || [])[0] || {};
  Logger.log('Páginas: ' + JSON.stringify(it.paging) + '\nCampos: ' + Object.keys(c).join(', '));
}

/* RURUSH Historias IG — programa historias ORGÁNICAS de Instagram (no publicidad) desde una carpeta de Drive.
   Subes la imagen/video a la carpeta → aparece una fila en la hoja HISTORIAS → pones FECHA y HORA → sale sola.
   Cada 10 min un reloj revisa la carpeta y publica las que ya tocan (API oficial de Instagram, cuenta Empresa).
   Necesita en Propiedades del script: META_TOKEN, IG_USER_ID y CARPETA_ID (los guarda configurarUnaVez). */

const IG_V = 'v21.0';
const HOJA = 'HISTORIAS';
const ENCABEZADO = ['ARCHIVO', 'FECHA', 'HORA', 'ESTADO', 'DETALLE', 'ID (no tocar)', 'CONTENEDOR (no tocar)'];
const COL = { ARCHIVO: 1, FECHA: 2, HORA: 3, ESTADO: 4, DETALLE: 5, ID: 6, CONT: 7 };
const EST = { PROC: 'PROCESANDO ⏳', OK: 'PUBLICADA ✅', ERR: 'ERROR ❌', VENC: 'VENCIDA ⚠️' };
const MAX_ATRASO_H = 12;   // si el reloj llega más tarde que esto, no la publica (evita sacar historias viejas por error)

/* ---------- Menú ---------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📲 Historias IG')
    .addItem('Revisar carpeta ahora', 'sincronizarCarpeta')
    .addItem('Publicar YA la fila seleccionada', 'publicarSeleccionada')
    .addItem('Publicar las que ya tocan', 'publicarPendientes')
    .addSeparator()
    .addItem('Ver cómo queda la fila seleccionada (sin publicar)', 'probarAjuste')
    .addItem('Probar conexión con Instagram', 'probarConexion')
    .addItem('Activar programación automática', 'activarReloj')
    .addToUi();
}

/* ---------- Reloj (cada 10 min) ---------- */

function activarReloj() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'cicloAutomatico')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('cicloAutomatico').timeBased().everyMinutes(10).create();
  avisar_('Listo: cada 10 minutos reviso la carpeta y publico las historias que ya tocan.');
}

function cicloAutomatico() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;   // otra corrida sigue trabajando
  try {
    sincronizarCarpeta(true);
    publicarPendientes(true);
    try { compartirParaWhatsApp_(); } catch (e) { console.warn('WhatsApp: ' + e.message); }
  } finally {
    lock.releaseLock();
  }
}

/* ---------- 📲 Estados de WhatsApp ----------
   La extensión Rurush Difusiones publica estas mismas historias como estado de WhatsApp (columna H
   WHATSAPP; "NO" = no publicar). Para que pueda bajar la imagen, el archivo queda visible con el
   link desde 24 h antes de su hora (igual que ya pasa al publicarla en Instagram). */
function compartirParaWhatsApp_() {
  const hoja = hoja_(), n = hoja.getLastRow() - 1;
  if (n < 1) return;
  const wa = hoja.getRange(2, 8, n, 1).getDisplayValues();
  const ahora = Date.now();
  filas_(hoja).forEach((f, i) => {
    if (!f.id || /^\s*NO\s*$/i.test(wa[i][0])) return;
    const c = cuando_(f.fecha, f.hora);
    if (!c || c.getTime() - ahora > 24 * 3600e3 || ahora - c.getTime() > MAX_ATRASO_H * 3600e3) return;
    try {
      const a = DriveApp.getFileById(f.id);
      if (a.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) a.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) { console.warn('No pude compartir ' + f.archivo + ': ' + e.message); }
  });
}

/* ---------- Carpeta → hoja ---------- */

// Agrega a la hoja los archivos nuevos de la carpeta. Si el nombre empieza con "2026-10-15 07-30 …" llena fecha y hora solo.
function sincronizarCarpeta(silencioso) {
  const hoja = hoja_();
  const vistos = {};
  filas_(hoja).forEach((f) => { vistos[f.id] = true; });
  const nuevas = [];
  const it = carpeta_().getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const tipo = f.getMimeType();
    if (vistos[f.getId()] || (tipo.indexOf('image/') !== 0 && tipo.indexOf('video/') !== 0)) continue;
    const m = f.getName().match(/^(\d{4}-\d{2}-\d{2})[ _](\d{1,2})[-.:h]?(\d{2})/);
    nuevas.push([f.getName(), m ? m[1] : '', m ? ('0' + m[2]).slice(-2) + ':' + m[3] : '', '', '', f.getId(), '']);
  }
  if (nuevas.length) hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, ENCABEZADO.length).setValues(nuevas);
  if (!silencioso) avisar_(nuevas.length ? nuevas.length + ' archivo(s) nuevo(s). Ponles FECHA y HORA.' : 'No hay archivos nuevos en la carpeta.');
}

/* ---------- Publicar ---------- */

function publicarPendientes(silencioso) {
  const hoja = hoja_();
  const ahora = Date.now();
  let hechas = 0;
  filas_(hoja).forEach((f) => {
    if (f.estado === EST.OK || f.estado === EST.VENC || f.estado === EST.ERR || !f.id) return;
    if (f.estado === EST.PROC && f.cont) {
      if (terminar_(hoja, f)) hechas++;
      return;
    }
    const cuando = cuando_(f.fecha, f.hora);
    if (!cuando || cuando.getTime() > ahora) return;
    if (ahora - cuando.getTime() > MAX_ATRASO_H * 3600e3) {
      return marcar_(hoja, f.fila, EST.VENC, 'Pasaron más de ' + MAX_ATRASO_H + ' h de la hora programada. Cambia la fecha/hora y borra el ESTADO para reintentar.');
    }
    if (publicar_(hoja, f)) hechas++;
  });
  if (!silencioso) avisar_(hechas ? hechas + ' historia(s) publicada(s).' : 'No había historias para publicar ahora.');
}

function publicarSeleccionada() {
  const hoja = hoja_();
  const fila = hoja.getActiveRange().getRow();
  const f = filas_(hoja).filter((x) => x.fila === fila)[0];
  if (!f || !f.id) return avisar_('Selecciona una fila con archivo.');
  if (f.estado === EST.OK) return avisar_('Esa historia ya está publicada.');
  avisar_(publicar_(hoja, f) ? '✅ Publicada.' : 'Mira la columna DETALLE de esa fila.');
}

// Crea el contenedor de la historia y, si Instagram ya lo procesó, lo publica.
function publicar_(hoja, f) {
  try {
    const archivo = DriveApp.getFileById(f.id);
    const media = mediaPublica_(archivo);
    let cont = null;
    let ultimoError = '';
    for (let i = 0; i < media.urls.length && !cont; i++) {
      const params = { media_type: 'STORIES' };
      params[media.video ? 'video_url' : 'image_url'] = media.urls[i];
      try {
        const c = graph_('post', prop_('IG_USER_ID') + '/media', params).id;
        if (esperar_(c, media.video ? 150 : 40) !== 'ERROR') cont = c;
        else ultimoError = 'Instagram no pudo leer el archivo desde Drive.';
      } catch (e) {
        ultimoError = e.message;
      }
    }
    if (!cont) throw new Error(ultimoError);
    hoja.getRange(f.fila, COL.CONT).setValue(cont);
    if (media.copia) hoja.getRange(f.fila, COL.DETALLE).setValue('Ajustada a 9:16');
    f.cont = cont;
    return terminar_(hoja, f);
  } catch (e) {
    return fallo_(hoja, f, e);
  }
}

// Publica un contenedor ya creado; si Instagram sigue procesando (videos), lo deja para la siguiente vuelta del reloj.
function terminar_(hoja, f) {
  try {
    const st = esperar_(f.cont, 20);
    if (st === 'IN_PROGRESS') {
      marcar_(hoja, f.fila, EST.PROC, 'Instagram está procesando el video, sale en la próxima vuelta.');
      return false;
    }
    if (st !== 'FINISHED') throw new Error('Instagram rechazó el archivo (' + st + '). Revisa formato: 9:16, video ≤ 60 s.');
    const pub = graph_('post', prop_('IG_USER_ID') + '/media_publish', { creation_id: f.cont });
    marcar_(hoja, f.fila, EST.OK, 'Publicada ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm') + ' · id ' + pub.id);
    guardarPublicada_(f.id);
    return true;
  } catch (e) {
    return fallo_(hoja, f, e);
  }
}

function fallo_(hoja, f, e) {
  marcar_(hoja, f.fila, EST.ERR, e.message + ' — corrige y borra el ESTADO para reintentar.');
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '❌ Historia IG no publicada: ' + f.archivo,
      'La historia "' + f.archivo + '" (fila ' + f.fila + ') no se publicó.\n\nMotivo: ' + e.message + '\n\n' + hoja.getParent().getUrl());
  } catch (err) { /* sin correo no pasa nada */ }
  return false;
}

// Espera a que Instagram procese el contenedor (máx. "segundos"). Devuelve FINISHED, IN_PROGRESS, ERROR, EXPIRED…
function esperar_(cont, segundos) {
  const fin = Date.now() + segundos * 1000;
  for (;;) {
    const st = graph_('get', cont, { fields: 'status_code' }).status_code;
    if (st !== 'IN_PROGRESS' || Date.now() > fin) return st;
    Utilities.sleep(5000);
  }
}

/* ---------- Drive ---------- */

// Arma la versión 9:16 de la fila seleccionada (o de la primera pendiente) y la deja en _jpg como "PRUEBA …", sin publicar.
function probarAjuste() {
  const hoja = hoja_();
  let fila = 0;
  try { fila = hoja.getActiveRange().getRow(); } catch (e) { /* desde el editor no hay selección */ }
  const todas = filas_(hoja).filter((x) => x.id && x.estado !== EST.OK);
  const f = todas.filter((x) => x.fila === fila)[0] || todas[0];
  if (!f) return avisar_('No hay historias pendientes para probar.');
  const archivo = DriveApp.getFileById(f.id);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  try {
    const jpg = subcarpeta_('_jpg').createFile(lienzo916_(archivo).setName('PRUEBA ' + archivo.getName().replace(/\.[^.]+$/, '') + '.jpg'));
    avisar_('Lista la prueba de "' + f.archivo + '": ' + jpg.getUrl());
  } finally {
    archivo.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  }
}

// Instagram descarga el archivo desde una URL pública: se comparte "cualquiera con el enlace" solo hasta publicarse.
// Imágenes: se arma una copia JPG vertical 9:16 (ver lienzo916_) y esa es la que se manda.
function mediaPublica_(archivo) {
  const video = archivo.getMimeType().indexOf('video/') === 0;
  let f = archivo;
  if (!video) {
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const nombre = archivo.getName().replace(/\.[^.]+$/, '') + '.jpg';
    f = subcarpeta_('_jpg').createFile(lienzo916_(archivo).setName(nombre));
  }
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = f.getId();
  const urls = video
    ? ['https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t',
       'https://drive.google.com/uc?export=download&id=' + id]
    : ['https://lh3.googleusercontent.com/d/' + id + '=w1080-rj',
       'https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t'];
  return { video: video, urls: urls, copia: !video };
}

// Instagram hace zoom y recorta los costados de lo que no es 9:16. Para que se vea completa,
// la imagen se centra sobre fondo negro en una copia de la plantilla 9:16 y se exporta como JPG.
// (La API de Slides no deja crear ni cambiar el tamaño de página: por eso se copia una plantilla
// que ya es 9:16, "_plantilla 9x16 (no borrar)" en la carpeta; plantilla_9x16.pptx del repo la recrea.)
const PLANTILLA = '_plantilla 9x16 (no borrar)';

function lienzo916_(archivo) {
  const auth = { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } };
  // versión achicada que entrega Google (los PNG de diseño pesan +10 MB)
  const img = UrlFetchApp.fetch('https://lh3.googleusercontent.com/d/' + archivo.getId() + '=w1600-rj').getBlob();
  const it = carpeta_().getFilesByName(PLANTILLA);
  if (!it.hasNext()) throw new Error('Falta "' + PLANTILLA + '" en la carpeta (súbela de nuevo: plantilla_9x16.pptx del repo).');
  const id = it.next().makeCopy('tmp historia IG', subcarpeta_('_jpg')).getId();
  try {
    const ps = Slides.Presentations.get(id, { fields: 'pageSize' }).pageSize;
    const W = ps.width.magnitude / 12700, H = ps.height.magnitude / 12700;   // EMU → puntos
    if (Math.abs(W / H - 9 / 16) > 0.01) throw new Error('La plantilla no es 9:16 (' + Math.round(W) + '×' + Math.round(H) + ' pt).');
    const doc = SlidesApp.openById(id);
    const sl = doc.getSlides()[0];
    sl.getPageElements().forEach((e) => e.remove());
    sl.getBackground().setSolidFill('#000000');
    const im = sl.insertImage(img);
    // Si el diseño ya es (casi) 9:16 no hace falta lienzo: se manda la imagen original a 1080 de ancho,
    // más nítida que la miniatura de Slides (máx. 1600 px por el lado largo → 900×1600).
    if (Math.abs(im.getWidth() / im.getHeight() - 9 / 16) < 0.02) {
      return UrlFetchApp.fetch('https://lh3.googleusercontent.com/d/' + archivo.getId() + '=w1080-rj').getBlob().getAs('image/jpeg');
    }
    const r = Math.min(W / im.getWidth(), H / im.getHeight());
    im.setWidth(im.getWidth() * r).setHeight(im.getHeight() * r);
    im.setLeft((W - im.getWidth()) / 2).setTop((H - im.getHeight()) / 2);
    const slideId = sl.getObjectId();
    doc.saveAndClose();
    const th = Slides.Presentations.Pages.getThumbnail(id, slideId,
      { 'thumbnailProperties.thumbnailSize': 'LARGE', 'thumbnailProperties.mimeType': 'PNG' });
    if (th.width >= th.height) throw new Error('La imagen salió horizontal (' + th.width + '×' + th.height + '); no se publica.');
    return UrlFetchApp.fetch(th.contentUrl, auth).getBlob().getAs('image/jpeg');
  } finally {
    DriveApp.getFileById(id).setTrashed(true);
  }
}

// Ya publicada: se vuelve privada y se mueve a PUBLICADAS (la copia JPG, si hubo, se borra).
function guardarPublicada_(id) {
  const archivo = DriveApp.getFileById(id);
  archivo.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
  archivo.moveTo(subcarpeta_('PUBLICADAS'));
  const jpg = subcarpeta_('_jpg').getFilesByName(archivo.getName().replace(/\.[^.]+$/, '') + '.jpg');
  while (jpg.hasNext()) jpg.next().setTrashed(true);
}

function carpeta_() { return DriveApp.getFolderById(prop_('CARPETA_ID')); }

function subcarpeta_(nombre) {
  const it = carpeta_().getFoldersByName(nombre);
  return it.hasNext() ? it.next() : carpeta_().createFolder(nombre);
}

/* ---------- Meta / Instagram ---------- */

function graph_(metodo, ruta, params) {
  const p = Object.assign({}, params, { access_token: prop_('META_TOKEN') });
  const url = 'https://graph.facebook.com/' + IG_V + '/' + ruta;
  const r = metodo === 'post'
    ? UrlFetchApp.fetch(url, { method: 'post', payload: p, muteHttpExceptions: true })
    : UrlFetchApp.fetch(url + '?' + Object.keys(p).map((k) => k + '=' + encodeURIComponent(p[k])).join('&'), { muteHttpExceptions: true });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) { /* sin JSON */ }
  if (j.error) {
    if (j.error.code === 190) throw new Error('El token de Meta venció o no es válido: genera uno nuevo y pégalo en META_TOKEN.');
    if (j.error.code === 10 || j.error.code === 200) throw new Error('Al token le falta el permiso instagram_content_publish.');
    throw new Error('Instagram: ' + (j.error.error_user_msg || j.error.message));
  }
  return j;
}

// Busca la cuenta de Instagram Empresa vinculada a las páginas del token (prefiere la que diga "rurush").
function buscarCuentaIG_() {
  const pags = (graph_('get', 'me/accounts', { fields: 'name,instagram_business_account{id,username}', limit: 100 }).data || [])
    .filter((p) => p.instagram_business_account);
  if (!pags.length) throw new Error('El token no ve ninguna página con Instagram vinculado. Revisa los permisos (ver INSTALAR.md).');
  const p = pags.filter((x) => /rurush/i.test(x.name + x.instagram_business_account.username))[0] || pags[0];
  return p.instagram_business_account;
}

function probarConexion() {
  const ig = graph_('get', prop_('IG_USER_ID'), { fields: 'username' });
  const lim = graph_('get', prop_('IG_USER_ID') + '/content_publishing_limit', { fields: 'quota_usage,config' }).data || [];
  const uso = lim[0] ? ' · usadas hoy: ' + lim[0].quota_usage + ' de ' + lim[0].config.quota_total : '';
  avisar_('✅ Conectado a @' + ig.username + uso);
}

/* ---------- Hoja ---------- */

function hoja_() {
  const ss = SpreadsheetApp.getActive();
  let h = ss.getSheetByName(HOJA);
  if (!h) {
    h = ss.insertSheet(HOJA, 0);
    h.getRange(1, 1, 1, ENCABEZADO.length).setValues([ENCABEZADO]).setFontWeight('bold').setBackground('#111').setFontColor('#fff');
    h.setFrozenRows(1);
    h.getRange('B2:B').setNumberFormat('yyyy-mm-dd')   // doble clic → calendario
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
    const horas = [];
    for (let m = 5 * 60; m < 24 * 60; m += 30) horas.push(('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + m % 60).slice(-2));
    h.getRange('C2:C').setNumberFormat('@').setHorizontalAlignment('center')   // desplegable cada 30 min (se puede escribir otra)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(horas, true).setAllowInvalid(true).build());
    h.setColumnWidth(COL.ARCHIVO, 260);
    h.setColumnWidth(COL.DETALLE, 380);
    h.hideColumns(COL.ID, 2);
  }
  return h;
}

// Fecha y hora se leen como se ven en pantalla (evita el desfase de minutos de Sheets con horas sueltas).
function filas_(hoja) {
  const n = hoja.getLastRow() - 1;
  if (n < 1) return [];
  return hoja.getRange(2, 1, n, ENCABEZADO.length).getDisplayValues().map((r, i) => ({
    fila: i + 2, archivo: r[0], fecha: r[1], hora: r[2], estado: r[3], id: r[5], cont: r[6]
  }));
}

function cuando_(fecha, hora) {
  let d = String(fecha).trim();
  const h = String(hora).trim().match(/^(\d{1,2}):(\d{2})/);
  const dmy = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) d = dmy[3] + '-' + ('0' + dmy[2]).slice(-2) + '-' + ('0' + dmy[1]).slice(-2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !h) return null;
  return Utilities.parseDate(d + ' ' + ('0' + h[1]).slice(-2) + ':' + h[2], tz_(), 'yyyy-MM-dd HH:mm');
}

function marcar_(hoja, fila, estado, detalle) {
  hoja.getRange(fila, COL.ESTADO, 1, 2).setValues([[estado, detalle]]);
}

/* ---------- Utilidades ---------- */

function prop_(nombre) {
  const v = PropertiesService.getScriptProperties().getProperty(nombre);
  if (!v) throw new Error('Falta ' + nombre + ': ejecuta configurarUnaVez (ver INSTALAR.md).');
  return v.trim();
}

function tz_() { return SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'America/Lima'; }

function avisar_(msg) {
  try { SpreadsheetApp.getActive().toast(msg, 'Historias IG', 8); } catch (e) { /* sin interfaz (reloj) */ }
  Logger.log(msg);
}

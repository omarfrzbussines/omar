/* ---------- Vista previa del calendario ----------
   Menú 📲 Historias IG → "👁️ Vista previa del mes": abre una ventana con el mes y la miniatura
   de cada historia programada en su día. Las imágenes siguen PRIVADAS: el script lee la miniatura
   con tu propia sesión de Drive y la manda a la ventana; no se comparte nada. */

const VISTA_CACHE_S = 6 * 3600;  // las miniaturas se guardan 6 h para que la ventana abra rápido

function verVistaPrevia() {
  const html = HtmlService.createHtmlOutputFromFile('VistaPrevia').setWidth(1250).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, '👁️ Vista previa de historias');
}

// Lo llama la ventana. mes: 1-12. Devuelve las historias de ese mes SIN imágenes (rápido);
// la ventana pide después cada miniatura con vistaMini().
function vistaDatos(anio, mes) {
  const pref = anio + '-' + ('0' + mes).slice(-2) + '-';
  const filas = filas_(hoja_()).filter((f) => f.id && String(f.fecha).trim().indexOf(pref) === 0);
  return {
    anio: anio, mes: mes, hoy: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'),
    historias: filas.map((f) => ({
      fila: f.fila, fecha: String(f.fecha).trim(), hora: String(f.hora).trim(),
      archivo: f.archivo, estado: f.estado, id: f.id
    })).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
  };
}

// Miniatura chica para la celda (la de Drive, sin llamadas a internet). Se guarda 6 h.
function vistaMini(id) {
  const cache = CacheService.getScriptCache();
  const clave = 'vpm_' + id;
  const g = cache.get(clave);
  if (g) return g;
  let url = '';
  try {
    const t = DriveApp.getFileById(id).getThumbnail();
    if (t) url = dataUrl_(t);
  } catch (e) { /* archivo borrado o sin permiso: la ventana muestra el nombre */ }
  if (!url) url = vistaGrande(id);
  if (url && url.length < 95000) cache.put(clave, url, VISTA_CACHE_S);   // CacheService: máx. 100 KB por clave
  return url;
}

// Versión grande para cuando haces clic (pide a Drive una miniatura de mayor tamaño).
function vistaGrande(id) {
  try {
    const auth = { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
    const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '?fields=thumbnailLink', auth);
    const link = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()).thumbnailLink : '';
    if (link) {
      const img = UrlFetchApp.fetch(link.replace(/=s\d+$/, '=s1000'), auth);
      if (img.getResponseCode() === 200) return dataUrl_(img.getBlob());
    }
  } catch (e) { /* sin versión grande */ }
  return '';
}

function dataUrl_(blob) {
  return 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

/* ---------- Vista previa del calendario ----------
   Menú 📲 Historias IG → "👁️ Vista previa del mes": abre una ventana con el mes y la miniatura
   de cada historia programada en su día. Las imágenes siguen PRIVADAS: el script lee la miniatura
   con tu propia sesión de Drive y la manda a la ventana; no se comparte nada. */

const VISTA_LADO = 400;          // ancho de la miniatura en px
const VISTA_CACHE_S = 6 * 3600;  // las miniaturas se guardan 6 h para que la ventana abra rápido

function verVistaPrevia() {
  const html = HtmlService.createHtmlOutputFromFile('VistaPrevia').setWidth(1250).setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, '👁️ Vista previa de historias');
}

// Lo llama la ventana. mes: 1-12. Devuelve las historias de ese mes con su miniatura.
function vistaDatos(anio, mes) {
  const pref = anio + '-' + ('0' + mes).slice(-2) + '-';
  const filas = filas_(hoja_()).filter((f) => f.id && String(f.fecha).trim().indexOf(pref) === 0);
  const hoy = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd');
  return {
    anio: anio, mes: mes, hoy: hoy,
    historias: filas.map((f) => ({
      fila: f.fila,
      fecha: String(f.fecha).trim(),
      hora: String(f.hora).trim(),
      archivo: f.archivo,
      estado: f.estado,
      id: f.id,
      img: miniatura_(f.id)
    })).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
  };
}

// Miniatura como data URL. Primero pide a Drive una de VISTA_LADO px; si falla, usa la miniatura chica de DriveApp.
function miniatura_(id) {
  const cache = CacheService.getScriptCache();
  const clave = 'vp_' + id;
  const guardada = cache.get(clave);
  if (guardada) return guardada;
  let url = '';
  try {
    const meta = JSON.parse(UrlFetchApp.fetch(
      'https://www.googleapis.com/drive/v3/files/' + id + '?fields=thumbnailLink',
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getContentText());
    if (meta.thumbnailLink) {
      const blob = UrlFetchApp.fetch(meta.thumbnailLink.replace(/=s\d+$/, '=s' + VISTA_LADO * 2),
        { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob();
      url = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    }
  } catch (e) { /* sigue con el plan B */ }
  if (!url) {
    try {
      const t = DriveApp.getFileById(id).getThumbnail();
      if (t) url = 'data:' + (t.getContentType() || 'image/png') + ';base64,' + Utilities.base64Encode(t.getBytes());
    } catch (e) { /* archivo borrado o sin permiso: la ventana muestra el nombre */ }
  }
  if (url && url.length < 95000) cache.put(clave, url, VISTA_CACHE_S);   // límite de CacheService: 100 KB por clave
  return url;
}

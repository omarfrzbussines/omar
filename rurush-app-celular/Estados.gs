/* 📲 Estados de WhatsApp — la extensión Rurush Difusiones publica como ESTADO las historias de la
   hoja HISTORIAS (RURUSH Historias IG) a la misma fecha y hora que en Instagram, en cada línea
   (Mónica, Laura, Principal…) donde esté abierta. Columnas agregadas al final de la hoja:
     H WHATSAPP   → "NO" = no publicar en WhatsApp · si no, se anota "MONICA ✅ 20:01 · LAURA ✅ 20:03"
     I WA DETALLE → último error por línea
   Usa la misma clave de la extensión que el cuadro de ventas (cuadro_tokenOk_). */

const ES_HOJA_ID = '110BGSWedy1z4FL7NFI-IHmPAzC0JJA-gtBORgpEPrk0';
const ES_RANGO = 'HISTORIAS!A1:J';
const ES_MAX_ATRASO_H = 12;          // igual que Instagram: no sacar historias viejas

function es_cuando_(fecha, hora) {
  let d = String(fecha || '').trim();
  const h = String(hora || '').trim().match(/^(\d{1,2}):(\d{2})/);
  const dmy = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) d = dmy[3] + '-' + pad(dmy[2]) + '-' + pad(dmy[1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !h) return null;
  return Date.parse(d + 'T' + pad(h[1]) + ':' + h[2] + ':00-05:00');
}
const es_linea_ = (l) => String(l || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
const es_hecha_ = (wa, linea) => new RegExp('(^|· )' + linea + ' ✅').test(String(wa || ''));

function es_leer_() {
  const r = Sheets.Spreadsheets.Values.get(ES_HOJA_ID, ES_RANGO);
  const v = r.values || [];
  // encabezados de las 2 columnas nuevas (solo si están vacíos)
  if (v.length && !v[0][7] && !v[0][8]) {
    Sheets.Spreadsheets.Values.update({ values: [['WHATSAPP', 'WA DETALLE']] }, ES_HOJA_ID, 'HISTORIAS!H1:I1', { valueInputOption: 'RAW' });
  }
  return v.slice(1).map(function (f, i) {
    return { fila: i + 2, archivo: f[0] || '', fecha: f[1] || '', hora: f[2] || '', id: f[5] || '', wa: f[7] || '', det: f[8] || '', copia: f[9] || '' };
  });
}

/** Lo que le toca publicar AHORA a esa línea. */
function es_pendientes_(linea) {
  linea = es_linea_(linea);
  if (!linea) throw new Error('falta la línea');
  const ahora = Date.now();
  return es_leer_().filter(function (f) {
    // la copia pública (columna J) la deja lista RURUSH Historias IG cada 10 min
    if (!f.id || !f.copia || /^\s*NO\s*$/i.test(f.wa) || es_hecha_(f.wa, linea)) return false;
    const c = es_cuando_(f.fecha, f.hora);
    return c && c <= ahora && ahora - c <= ES_MAX_ATRASO_H * 3600e3;
  }).map(function (f) {
    return { fila: f.fila, id: f.id, copia: f.copia, archivo: f.archivo, video: /\.(mp4|mov|3gp|webm)$/i.test(f.archivo), cuando: es_cuando_(f.fecha, f.hora) };
  });
}

/** La extensión avisa cómo le fue (ok o error) con una historia en su línea. */
function es_marcar_(fila, id, linea, ok, error) {
  linea = es_linea_(linea);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const f = es_leer_().filter(function (x) { return x.fila === Number(fila); })[0];
    if (!f || f.id !== id) throw new Error('la fila cambió');      // alguien movió las filas
    const hora = Utilities.formatDate(new Date(), 'America/Lima', 'dd/MM HH:mm');
    let wa = f.wa, det = f.det;
    if (ok) {
      if (!es_hecha_(wa, linea)) wa = (wa ? wa + ' · ' : '') + linea + ' ✅ ' + hora;
      det = det.split(' · ').filter(function (x) { return x && x.indexOf(linea + ':') !== 0; }).join(' · ');
    } else {
      det = det.split(' · ').filter(function (x) { return x && x.indexOf(linea + ':') !== 0; })
        .concat([linea + ': ' + String(error || 'error').replace(/ · /g, ' - ').slice(0, 160) + ' (' + hora + ')']).join(' · ');
    }
    Sheets.Spreadsheets.Values.update({ values: [[wa, det]] }, ES_HOJA_ID, 'HISTORIAS!H' + f.fila + ':I' + f.fila, { valueInputOption: 'RAW' });
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function es_doGet_(p) {
  try {
    if (p.estadoOk || p.estadoError) return hoy_json_(es_marcar_(p.estadoOk || p.estadoError, p.id, p.linea, !!p.estadoOk, p.error));
    return hoy_json_({ ok: true, items: es_pendientes_(p.estados) });
  } catch (e) {
    return hoy_json_({ ok: false, error: e.message });
  }
}

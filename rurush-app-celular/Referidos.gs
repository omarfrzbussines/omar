/* RURUSH Hoy — 🎁 Referidos: lee la pestaña REFERIDOS de VENTAS RETENCIÓN (la misma hoja de Cobros).
   Solo lectura. Resumen (A4:E5), meta del mes por asesora (A8:H11) y registro (fila 17 en adelante:
   A # · B alumno · C celular alumno · D paquete · E referido · F asesor · G celular referido ·
   H fecha captura · I estado · J fecha contacto · K notas). */
const REF_HOJA = 'REFERIDOS';

const ref_norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
// "13/10/26", "20/10/2026" o "2026-10-13" → "2026-10" ('' si no hay fecha de captura).
function ref_mes(s) {
  const t = String(s == null ? '' : s).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  return m ? (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[2]).slice(-2) : '';
}

function getReferidos(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) { const c = cache.get('referidos'); if (c) return JSON.parse(c); }
  const q = "'" + REF_HOJA + "'!";
  const v = Sheets.Spreadsheets.Values.batchGet(COBR_ID, {
    ranges: [q + 'A5:E5', q + 'A8:H11', q + 'A17:K1004'], valueRenderOption: 'FORMATTED_VALUE'
  }).valueRanges.map(function (x) { return x.values || []; });
  const k = v[0][0] || [];
  const txt = (x) => String(x == null ? '' : x).trim();
  const res = {
    kpi: { vigentes: txt(k[0]), referidos: txt(k[1]), cobertura: txt(k[2]), contactados: txt(k[3]), convertidos: txt(k[4]) },
    metas: v[1].filter(function (f) { return txt(f[0]); }).map(function (f) {
      return { asesora: txt(f[0]), cartera: txt(f[1]), meta: txt(f[2]), obtenidos: txt(f[3]), avance: txt(f[4]),
               metaIns: txt(f[5]), conv: txt(f[6]), pctConv: txt(f[7]) };
    }),
    registro: v[2].filter(function (f) { return txt(f[4]) || txt(f[6]) || txt(f[5]); }).map(function (f) {
      return { alumno: txt(f[1]), referido: txt(f[4]), asesora: ref_norm(f[5]) || 'SIN ASIGNAR',
               tel: (txt(f[6]).replace(/\D/g, '').slice(-9)), fecha: txt(f[7]), mes: ref_mes(f[7]),
               estado: ref_norm(f[8]) || 'PENDIENTE', notas: txt(f[10]) };
    })
  };
  try { cache.put('referidos', JSON.stringify(res), 300); } catch (e) {}
  return res;
}

/* RURUSH Hoy — 📞 Llamadas: totales que arma el 📊 Dashboard de llamadas (pestaña oculta _DASH_DATOS
   de BASE DE DATOS LEADS RFC, se actualiza cada hora). Filas: mes, asesora, base, día (0=dom), hora,
   estado, llamadas, suma duración, n duración, suma timbradas, n timbradas, fecha (yyyy-MM-dd). Solo lectura. */
function getLlamadasDash(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) { const c = cache.get('llamdash'); if (c) return JSON.parse(c); }
  const v = Sheets.Spreadsheets.Values.batchGet(LEADS_ID, { ranges: ["'_DASH_DATOS'!A2:L"], valueRenderOption: 'UNFORMATTED_VALUE' })
    .valueRanges[0].values || [];
  const res = { filas: v.filter(function (f) { return f[0]; }).map(function (f) {
    return [String(f[0]), String(f[1]), String(f[2]), Number(f[3]), Number(f[4]), String(f[5]), Number(f[6]) || 0,
            Number(f[7]) || 0, Number(f[8]) || 0, Number(f[9]) || 0, Number(f[10]) || 0, String(f[11] || '')];
  }) };
  try { cache.put('llamdash', JSON.stringify(res), 600); } catch (e) {}
  return res;
}

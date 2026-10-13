/* RURUSH Hoy — 🎁 Referidos: lee la pestaña REFERIDOS de VENTAS RETENCIÓN (la misma hoja de Cobros).
   Solo lectura. Resumen (A4:E5), meta del mes por asesora (A8:H11) y registro (fila 17 en adelante:
   A # · B alumno · C celular alumno · D paquete · E referido · F asesor · G celular referido ·
   H fecha captura · I estado · J fecha contacto · K notas). */
const REF_HOJA = 'REFERIDOS';

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
    registro: v[2].filter(function (f) { return txt(f[4]) || txt(f[6]); }).map(function (f) {
      return { alumno: txt(f[1]), referido: txt(f[4]), asesora: txt(f[5]) || 'SIN ASIGNAR',
               tel: (txt(f[6]).replace(/\D/g, '').slice(-9)), fecha: txt(f[7]), estado: txt(f[8]) || 'PENDIENTE', notas: txt(f[10]) };
    })
  };
  try { cache.put('referidos', JSON.stringify(res), 300); } catch (e) {}
  return res;
}

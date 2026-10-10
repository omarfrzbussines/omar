/* RURUSH Hoy — Cuadro diario de ventas (reemplaza la tarea "$ CUADRO DIARIO VENTAS").
   Lo hace Google solo: 0 tokens, sin claves. Lee la Hoja de Reportes 2026 V2:
     - metas:     pestaña "<MES> <AÑO>", columna BF (LAURA fila 2, DANNA fila 9, MÓNICA fila 16)
     - ingresos:  pestaña "DATOS_ORIGEN_<MES>" (fecha, asesora, referidos, redes, visitó, cobros,
                  renovaciones, ampliaciones), que es donde están los montos día por día.
   Plazo de la meta: día 21 del mes (DV_PLAZO). Solo cuentan días hábiles de lunes a viernes.
   Ejecutar dv_instalar UNA vez: crea el envío de las 7:00 am (lun-vie) y manda un correo de prueba. */

const DV_ID = '1DHEBkhtGgOvSkUZDsdokVOVozHhujUF77sFUWgv9Ves';
const DV_PLAZO = 21;
const DV_META_FILA = { LAURA: 2, DANNA: 9, MONICA: 16 };   // filas de la columna BF
const DV_ASESORAS = ['DANNA', 'MONICA', 'LAURA'];
const DV_NOMBRE = { DANNA: 'DANNA', MONICA: 'MÓNICA', LAURA: 'LAURA' };
const DV_DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

/* ---------- fechas (todo en 'yyyy-MM-dd', hora Lima) ---------- */
const dv_d = (iso) => new Date(Date.parse(iso + 'T12:00:00Z'));
const dv_iso = (dt) => dt.toISOString().slice(0, 10);
const dv_mas = (iso, n) => dv_iso(new Date(dv_d(iso).getTime() + n * 86400e3));
const dv_habil = (iso) => { const w = dv_d(iso).getUTCDay(); return w > 0 && w < 6; };
function dv_habiles(desde, hasta) {          // cuenta lun-vie entre desde y hasta (inclusive)
  let n = 0;
  for (let f = desde; f <= hasta; f = dv_mas(f, 1)) if (dv_habil(f)) n++;
  return n;
}
function dv_habilAnterior(iso) { let f = dv_mas(iso, -1); while (!dv_habil(f)) f = dv_mas(f, -1); return f; }
const dv_serialAIso = (n) => dv_iso(new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400e3));
const dv_num = (v) => (typeof v === 'number' ? v : (parseFloat(String(v || '').replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0));
const dv_nom = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/* ---------- datos ---------- */
function dv_datos() {
  const hoy = fechaLima(0);
  const y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  const MES = MESES[m - 1];
  const r = Sheets.Spreadsheets.Values.batchGet(DV_ID, {
    ranges: ["'" + MES + ' ' + y + "'!BF1:BF20", "'DATOS_ORIGEN_" + MES + "'!C1:J800"],
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const bf = (r.valueRanges[0].values || []);
  const filas = (r.valueRanges[1].values || []);

  const A = {};
  DV_ASESORAS.forEach((n) => {
    const v = bf[DV_META_FILA[n] - 1];
    A[n] = { nombre: DV_NOMBRE[n], meta: v ? dv_num(v[0]) : 0, acum: 0, porDia: {} };
  });
  filas.forEach((f) => {
    if (typeof f[0] !== 'number') return;                 // encabezados y filas vacías
    const n = dv_nom(f[1]);
    if (!A[n]) return;                                    // "TOTAL DÍA", VALERIA, etc.
    const fecha = dv_serialAIso(f[0]);
    if (fecha.slice(0, 7) !== hoy.slice(0, 7) || fecha >= hoy) return;   // solo este mes, hasta ayer
    let monto = 0;
    for (let c = 2; c <= 7; c++) monto += dv_num(f[c]);
    A[n].acum += monto;
    A[n].porDia[fecha] = (A[n].porDia[fecha] || 0) + monto;
  });

  // Plazo: el 21; si ya pasó, fin de mes.
  const ini = hoy.slice(0, 8) + '01';
  let plazo = hoy.slice(0, 8) + ('0' + DV_PLAZO).slice(-2);
  if (hoy > plazo) plazo = dv_iso(new Date(Date.UTC(y, m, 0, 12)));
  const diasTot = dv_habiles(ini, plazo);
  const diasPas = hoy > ini ? dv_habiles(ini, dv_mas(hoy, -1)) : 0;
  const diasRest = Math.max(1, dv_habiles(hoy, plazo));
  const esperado = diasTot ? diasPas / diasTot : 0;

  // últimos 5 días hábiles hasta ayer
  const ayer = dv_habilAnterior(hoy);
  const ult = [ayer];
  while (ult.length < 5) ult.unshift(dv_habilAnterior(ult[0]));

  let llam = {};
  try { llam = (getEquipo(false).llamadas || {}).ayer || {}; } catch (e) { /* sin llamadas */ }

  const lista = DV_ASESORAS.map((n) => {
    const a = A[n];
    const pct = a.meta ? a.acum / a.meta : 0;
    const ritmo = esperado ? pct / esperado : 1;
    const falta = Math.max(0, a.meta - a.acum);
    return Object.assign(a, {
      pct: pct, falta: falta, metaHoy: falta / diasRest, ayer: a.porDia[ayer] || 0,
      ult: ult.map((f) => a.porDia[f] || 0),
      estado: pct >= 1 ? 'META CUMPLIDA' : ritmo >= 1 ? 'AL DÍA' : ritmo >= 0.7 ? 'EN CAMINO' : 'EN RIESGO',
      llam: llam[n] || null
    });
  }).sort((p, q) => q.pct - p.pct);

  const meta = lista.reduce((t, a) => t + a.meta, 0), acum = lista.reduce((t, a) => t + a.acum, 0);
  const gan = lista.filter((a) => a.ayer > 0).sort((p, q) => q.ayer - p.ayer)[0] || null;
  return {
    hoy: hoy, ayer: ayer, plazo: plazo, diasTot: diasTot, diasPas: diasPas, diasRest: diasRest, esperado: esperado,
    ult: ult, lista: lista, meta: meta, acum: acum, falta: Math.max(0, meta - acum),
    ganadora: gan ? { nombre: gan.nombre, monto: gan.ayer } : null
  };
}

/* ---------- HTML (sirve para el correo y para la pestaña 📈 Ventas) ---------- */
function dv_html(d) {
  const S = (v) => 'S/ ' + Math.round(v).toLocaleString('en-US');
  const P = (v) => Math.round(v * 100) + '%';
  const COL = { 'META CUMPLIDA': '#0f8a4b', 'AL DÍA': '#0f8a4b', 'EN CAMINO': '#b7791f', 'EN RIESGO': '#d03b3b' };
  const BG = { 'META CUMPLIDA': '#e3f3ea', 'AL DÍA': '#e3f3ea', 'EN CAMINO': '#fbf0d9', 'EN RIESGO': '#fae3e3' };
  const dia = (iso) => DV_DIAS[dv_d(iso).getUTCDay()] + ' ' + Number(iso.slice(8));
  const barra = (pct, col, esp) =>
    '<div style="position:relative;height:10px;background:#dcdbd6;border-radius:5px;margin:8px 0 4px">' +
    '<div style="height:10px;width:' + Math.min(100, pct * 100).toFixed(1) + '%;background:' + col + ';border-radius:5px"></div>' +
    '<div style="position:absolute;top:-4px;left:' + Math.min(100, esp * 100).toFixed(1) + '%;width:3px;height:18px;background:#24231f"></div></div>';
  const pctEq = d.meta ? d.acum / d.meta : 0;

  let h = '<div style="max-width:620px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b0b0b;background:#fcfcfb;padding:16px">' +
    '<div style="font-size:12px;letter-spacing:2px;color:#8a8984;font-weight:700">RURUSH FITNESS CLUB</div>' +
    '<div style="font-size:24px;font-weight:800;margin-top:2px">Cuadro de ventas · ' + dia(d.hoy) + '</div>' +
    '<div style="font-size:14px;color:#52514e">Plazo: ' + Number(d.plazo.slice(8)) + ' · quedan <b>' + d.diasRest + ' días hábiles</b> (lun–vie)</div>' +
    // equipo
    '<div style="background:#24231f;color:#fff;border-radius:16px;padding:16px;margin-top:14px">' +
    '<table width="100%" style="border-collapse:collapse;color:#fff"><tr>' +
    '<td style="font-size:13px;font-weight:800;letter-spacing:1px">🎯 EQUIPO</td>' +
    '<td align="right" style="font-size:26px;font-weight:800">' + S(d.acum) + ' <span style="font-size:14px;color:#c9c8c2;font-weight:600">de ' + S(d.meta) + '</span></td></tr></table>' +
    '<div style="position:relative;height:12px;background:#4a4943;border-radius:6px;margin:10px 0 8px"><div style="height:12px;width:' + Math.min(100, pctEq * 100).toFixed(1) + '%;background:#fff;border-radius:6px"></div>' +
    '<div style="position:absolute;top:-4px;left:' + Math.min(100, d.esperado * 100).toFixed(1) + '%;width:3px;height:20px;background:#f2b84b"></div></div>' +
    '<table width="100%" style="border-collapse:collapse;color:#c9c8c2;font-size:13px"><tr><td><b style="color:#fff">' + P(pctEq) + '</b> logrado · deberíamos ir en <b style="color:#fff">' + P(d.esperado) + '</b></td>' +
    '<td align="right">Faltan <b style="color:#fff;white-space:nowrap">' + S(d.falta) + '</b> → <b style="color:#fff;white-space:nowrap">' + S(d.falta / d.diasRest) + '/día</b></td></tr></table></div>';

  d.lista.forEach((a) => {
    const c = COL[a.estado];
    h += '<div style="background:#f3f2ef;border-radius:16px;padding:14px 16px;margin-top:12px">' +
      '<table width="100%" style="border-collapse:collapse"><tr><td style="font-size:20px;font-weight:800">' + a.nombre + '</td>' +
      '<td align="right"><span style="background:' + BG[a.estado] + ';color:' + c + ';font-size:12px;font-weight:800;padding:4px 10px;border-radius:99px">' + a.estado + '</span></td></tr></table>' +
      '<table width="100%" style="border-collapse:collapse;margin-top:6px"><tr>' +
      '<td style="vertical-align:top"><div style="font-size:12px;color:#52514e">Meta de HOY</div><div style="font-size:26px;font-weight:800">' + S(a.metaHoy) + '</div></td>' +
      '<td align="right" style="vertical-align:top"><div style="font-size:12px;color:#52514e">Mes</div><div style="font-size:16px;font-weight:800">' + S(a.acum) + ' <span style="font-weight:600;color:#52514e">de ' + S(a.meta) + ' · ' + P(a.pct) + '</span></div></td></tr></table>' +
      barra(a.pct, c, d.esperado) +
      '<table width="100%" style="border-collapse:separate;border-spacing:4px 0;margin-top:8px"><tr>' +
      d.ult.map((f, i) => '<td align="center" style="background:' + (a.ult[i] ? '#fff' : '#ebeae6') + ';border-radius:8px;padding:5px 0">' +
        '<div style="font-size:11px;color:#52514e">' + dia(f) + '</div><div style="font-size:14px;font-weight:800;color:' + (a.ult[i] ? '#0b0b0b' : '#9a9994') + '">' +
        (a.ult[i] ? Math.round(a.ult[i]).toLocaleString('en-US') : '–') + '</div></td>').join('') + '</tr></table>' +
      (a.llam ? '<div style="font-size:12px;color:#52514e;margin-top:8px">📞 Ayer: <b>' + a.llam.n + '</b> llamadas · <b>' + a.llam.cont + '</b> contestaron · <b>' + a.llam.agend + '</b> FP agendados</div>' : '') +
      '</div>';
  });

  if (d.ganadora) h += '<div style="background:#e3f3ea;color:#0f8a4b;border-radius:14px;padding:12px 16px;margin-top:12px;font-size:16px;font-weight:700">🏆 Ganadora de ayer (' + dia(d.ayer) + '): ' + d.ganadora.nombre + ' · ' + S(d.ganadora.monto) + '</div>';
  h += '<div style="font-size:11px;color:#9a9994;margin-top:12px">AL DÍA = va al ritmo para llegar al ' + Number(d.plazo.slice(8)) + ' · EN CAMINO = 70–100% del ritmo · EN RIESGO = menos del 70%. ' +
    'Meta de HOY = lo que falta ÷ días hábiles que quedan. Fuente: Hoja de Reportes 2026 (DATOS_ORIGEN). Ventas hasta ayer.</div></div>';
  return h;
}

/* ---------- web (pestaña 📈 Ventas) y correo ---------- */
function getVentasDia(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) { const c = cache.get('ventasdia'); if (c) return c; }
  const html = dv_html(dv_datos());
  try { cache.put('ventasdia', html, 600); } catch (e) { /* muy grande */ }
  return html;
}

function dv_enviarCorreo() {
  const hoy = fechaLima(0);
  if (!dv_habil(hoy)) return;                     // sábado y domingo no
  const d = dv_datos();
  const resumen = d.lista.map((a) => a.nombre + ' ' + Math.round(a.pct * 100) + '%').join(' · ');
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: '📈 Ventas ' + hoy.slice(8) + '/' + hoy.slice(5, 7) + ' · equipo ' + Math.round(d.acum / Math.max(1, d.meta) * 100) + '% · ' + resumen,
    htmlBody: dv_html(d),
    name: 'RURUSH Hoy'
  });
}

/* Ejecutar UNA vez: programa el correo de lun-vie a las 7:00 am y manda uno de prueba ahora. */
function dv_instalar() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'dv_enviarCorreo')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dv_enviarCorreo').timeBased().atHour(7).nearMinute(0).everyDays(1).inTimezone('America/Lima').create();
  const d = dv_datos();
  MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), subject: '📈 PRUEBA · Cuadro de ventas', htmlBody: dv_html(d), name: 'RURUSH Hoy' });
  Logger.log('Listo: correo de prueba enviado a ' + Session.getEffectiveUser().getEmail() + '. ' +
    d.lista.map((a) => a.nombre + ' ' + Math.round(a.acum) + '/' + a.meta + ' → hoy ' + Math.round(a.metaHoy)).join(' | '));
}

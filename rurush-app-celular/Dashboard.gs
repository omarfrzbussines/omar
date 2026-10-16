/* RURUSH Hoy — Cuadro diario de ventas (reemplaza la tarea "$ CUADRO DIARIO VENTAS").
   Lo hace Google solo: 0 tokens, sin claves. Lee la Hoja de Reportes 2026 V2:
     - metas:     fijas en DV_METAS (Mónica 18,000 · Danna 11,000 · Laura 11,000)
     - ingresos:  pestaña "DATOS_ORIGEN_<MES>" (fecha, asesora, referidos, redes, visitó, cobros,
                  renovaciones, ampliaciones), que es donde están los montos día por día.
   Plazo de la meta: día 21 del mes (DV_PLAZO). Solo cuentan días hábiles de lunes a viernes.
   Ejecutar dv_instalar UNA vez: crea el envío de las 7:00 am (lun-vie) y manda un correo de prueba. */

const DV_ID = '1DHEBkhtGgOvSkUZDsdokVOVozHhujUF77sFUWgv9Ves';
const DV_PLAZO = 21;
const DV_CORREO = 'omarfrz@gmail.com';   // a quién llega el cuadro diario
const DV_METAS = { MONICA: 18000, DANNA: 11000, LAURA: 11000 };   // metas del mes (cámbialas aquí)
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
function dv_datos(hoyIso) {
  const hoy = hoyIso || fechaLima(0);
  const y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  const MES = MESES[m - 1];
  const r = Sheets.Spreadsheets.Values.batchGet(DV_ID, {
    ranges: ["'DATOS_ORIGEN_" + MES + "'!C1:J800"],
    valueRenderOption: 'UNFORMATTED_VALUE'
  });
  const filas = (r.valueRanges[0].values || []);

  const A = {};
  DV_ASESORAS.forEach((n) => {
    A[n] = { nombre: DV_NOMBRE[n], meta: DV_METAS[n], acum: 0, porDia: {} };
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

  // semana de lunes a viernes (la de hoy; el lunes, la semana pasada completa)
  const ayer = dv_habilAnterior(hoy);
  const wd = dv_d(hoy).getUTCDay();
  let lunes = dv_mas(hoy, -((wd + 6) % 7));
  if (wd === 1) lunes = dv_mas(lunes, -7);
  const ult = [0, 1, 2, 3, 4].map((i) => dv_mas(lunes, i));

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

/* ---------- HTML (sirve para el correo y para la pestaña 📈 Ventas) ----------
   Arriba: ranking por % de la meta del mes (barra + raya de dónde deberían ir hoy).
   Abajo: por asesora, lo que necesita HOY y su semana día por día:
   🟩 llegó a lo que necesitaba ese día · 🟨 vendió sin llegar · 🟥 no vendió.
   Solo tablas (sin position/flex) para que se vea igual en Gmail. */
function dv_html(d) {
  const S = (v) => 'S/ ' + Math.round(v).toLocaleString('en-US');
  const P = (v) => Math.round(v * 100) + '%';
  const dia = (iso) => DV_DIAS[dv_d(iso).getUTCDay()] + ' ' + Number(iso.slice(8));
  // barra con raya amarilla en "dónde deberían ir" hecha con celdas de tabla
  const barra = (pct, esp, col) => {
    const p = Math.min(100, Math.max(0, pct * 100)), e = Math.min(99, Math.max(0, esp * 100));
    const seg = (w, bg) => w > 0 ? '<td style="width:' + w.toFixed(1) + '%;height:10px;background:' + bg + ';font-size:0;line-height:0">&nbsp;</td>' : '';
    const cells = p <= e ? seg(p, col) + seg(e - p, '#4a4943') + seg(0.6, '#f2b84b') + seg(100 - e - 0.6, '#4a4943')
                         : seg(e, col) + seg(0.6, '#f2b84b') + seg(p - e - 0.6, col) + seg(100 - p, '#4a4943');
    return '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:5px;overflow:hidden;margin-top:5px"><tr>' + cells + '</tr></table>';
  };
  const lunes = dv_mas(d.hoy, -((dv_d(d.hoy).getUTCDay() + 6) % 7));
  d.lista.forEach((a) => {
    a.semana = 0;
    a.dias = d.ult.map((f) => {
      const v = a.porDia[f] || 0; a.semana += v;
      if (f >= d.hoy) return { f: f, v: v, c: f === d.hoy ? 'hoy' : 'fut' };
      let antes = 0; Object.keys(a.porDia).forEach((x) => { if (x < f) antes += a.porDia[x]; });
      const need = Math.max(0, a.meta - antes) / Math.max(1, dv_habiles(f, d.plazo));
      return { f: f, v: v, c: v >= need && need > 0 ? 'gano' : v > 0 ? 'algo' : 'nada' };
    });
  });
  const rank = d.lista.slice().sort((p, q) => q.pct - p.pct || q.semana - p.semana);
  const med = ['🥇', '🥈', '🥉'];
  const COL = { gano: ['#16a34a', '#ffffff'], algo: ['#facc15', '#3b2f00'], nada: ['#dc2626', '#ffffff'], hoy: ['#ffffff', '#24231f'], fut: ['#ebeae6', '#9a9994'] };
  const pctEq = d.meta ? d.acum / d.meta : 0;

  const HOY = d.noche ? 'MAÑANA' : 'HOY';
  let h = '<div style="max-width:540px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b0b0b;background:#fcfcfb;padding:16px">' +
    '<table width="100%" style="border-collapse:collapse"><tr><td><div style="font-size:11px;letter-spacing:2px;color:#8a8984;font-weight:700">RURUSH FITNESS CLUB</div>' +
    '<div style="font-size:22px;font-weight:800">' + (d.noche ? '🌙 Cierre · ' + dia(d.ayer) : 'Ventas · ' + dia(d.hoy)) + '</div></td>' +
    '<td align="right" style="font-size:12px;color:#52514e">Equipo <b style="color:#0b0b0b;font-size:16px">' + P(pctEq) + '</b> del mes<br>quedan <b>' + d.diasRest + ' días</b> al ' + Number(d.plazo.slice(8)) + '</td></tr></table>';

  h += '<div style="background:#24231f;color:#ffffff;border-radius:16px;padding:12px 16px;margin-top:10px">' +
    '<div style="font-size:12px;font-weight:800;letter-spacing:1px;color:#c9c8c2">🏆 RANKING · % DE LA META DEL MES</div>' +
    rank.map((a, i) => '<div style="margin-top:8px"><table width="100%" style="border-collapse:collapse;color:#ffffff"><tr>' +
      '<td style="font-size:18px;font-weight:800">' + (a.pct > 0 ? med[i] : '😴') + ' ' + a.nombre + '</td>' +
      '<td align="right" style="font-size:24px;font-weight:900">' + P(a.pct) + '</td></tr></table>' +
      barra(a.pct, d.esperado, a.pct >= d.esperado ? '#22c55e' : '#f87171') +
      '<table width="100%" style="border-collapse:collapse;color:#c9c8c2;font-size:12px;margin-top:3px"><tr><td>Meta del mes <b style="color:#ffffff">' + S(a.meta) + '</b></td>' +
      '<td align="right">lleva <b style="color:#ffffff">' + S(a.acum) + '</b> · faltan ' + S(a.falta) + ' · semana <b style="color:#ffffff">' + S(a.semana) + '</b></td></tr></table></div>').join('') +
    '<div style="font-size:11px;color:#a8a7a1;margin-top:8px"><span style="color:#f2b84b">┃</span> donde deberían ir ' + (d.noche ? 'mañana' : 'hoy') + ' (' + P(d.esperado) + ')' +
    (d.ult[0] !== lunes && !d.noche ? ' · semana pasada' : '') + '</div></div>';

  rank.forEach((a) => {
    h += '<div style="background:#f3f2ef;border-radius:14px;padding:8px 12px;margin-top:8px">' +
      '<table width="100%" style="border-collapse:collapse"><tr><td style="font-size:16px;font-weight:800">' + a.nombre + '</td>' +
      '<td align="right" style="font-size:12px;color:#52514e">🎯 ' + HOY + ' necesita <b style="font-size:18px;color:#0b0b0b">' + S(a.metaHoy) + '</b></td></tr></table>' +
      '<table width="100%" style="border-collapse:separate;border-spacing:4px 0;margin-top:6px"><tr>' +
      a.dias.map((x) => '<td align="center" style="width:20%;background:' + COL[x.c][0] + ';color:' + COL[x.c][1] + ';border-radius:8px;padding:4px 0' +
        (x.c === 'hoy' ? ';border:2px solid #24231f' : '') + '">' +
        '<div style="font-size:10px">' + dia(x.f) + '</div><div style="font-size:15px;font-weight:900">' +
        (x.c === 'hoy' ? (d.noche ? 'MAÑ' : 'HOY') : x.c === 'fut' ? '·' : Math.round(x.v).toLocaleString('en-US')) + '</div></td>').join('') +
      '</tr></table>' +
      (a.llam && !d.noche ? '<div style="font-size:11px;color:#52514e;margin-top:5px">📞 Ayer: <b>' + a.llam.n + '</b> llamadas · <b>' + a.llam.cont + '</b> contestaron · <b>' + a.llam.agend + '</b> FP agendados</div>' : '') +
      '</div>';
  });
  return h + '<div style="font-size:11px;color:#9a9994;margin-top:8px">🟩 llegó a su meta del día · 🟨 vendió sin llegar · 🟥 no vendió · ' +
    (d.noche ? 'incluye lo de hoy' : 'ventas hasta ayer') + '</div></div>';
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
    to: DV_CORREO,
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
  MailApp.sendEmail({ to: DV_CORREO, subject: '📈 PRUEBA · Cuadro de ventas', htmlBody: dv_html(d), name: 'RURUSH Hoy' });
  Logger.log('Listo: correo de prueba enviado a ' + DV_CORREO + '. ' +
    d.lista.map((a) => a.nombre + ' ' + Math.round(a.acum) + '/' + a.meta + ' → hoy ' + Math.round(a.metaHoy)).join(' | '));
}

/* ---------- 📲 Cuadro para WhatsApp (la PC de Omar saca la foto y lo envía) ----------
   Link de solo lectura con su propia clave (CUADRO_TOKEN): devuelve el HTML del cuadro y nada más.
   ?cuadro=<clave>          → el de la mañana (ventas hasta ayer, lo que necesitan HOY)
   ?cuadro=<clave>&noche=1  → el cierre de la noche (incluye lo de hoy, lo que necesitan MAÑANA) */
function dv_cuadroTexto(noche) {
  let d;
  if (noche) {
    let man = fechaLima(1);
    while (!dv_habil(man)) man = dv_mas(man, 1);
    // fin de mes: el cierre se hace con el mes que termina (no con el mes nuevo vacío)
    d = man.slice(0, 7) === fechaLima(0).slice(0, 7) ? dv_datos(man) : dv_datos();
    d.noche = man.slice(0, 7) === fechaLima(0).slice(0, 7);
  } else d = dv_datos();
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=540">' +
    '<style>body{margin:0;background:#fcfcfb}</style></head><body>' + dv_html(d) + '</body></html>';
}
/* La PC crea su propia clave y la pide de alta; a Omar le llega un correo con un link para autorizarla
   y escribir su número de WhatsApp. Hasta que no la autorice, la PC no ve nada. */
function cuadro_alta_(tok) {
  tok = String(tok || '');
  if (!/^[a-f0-9]{32}$/.test(tok)) return 'Clave no válida.';
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('CUADRO_TOKEN') === tok) return props.getProperty('CUADRO_NUMERO') ? 'OK' : 'FALTA_NUMERO';
  const cache = CacheService.getScriptCache();
  if (props.getProperty('CUADRO_PEND') === tok && cache.get('cuadro_alta')) return 'ESPERANDO';
  if (cache.get('cuadro_alta')) return 'ESPERANDO';
  cache.put('cuadro_alta', '1', 3600);            // máx. 1 correo por hora
  const code = Utilities.getUuid().replace(/-/g, '');
  props.setProperty('CUADRO_PEND', tok);
  props.setProperty('CUADRO_OKCODE', code);
  const url = ScriptApp.getService().getUrl() + '?cuadrook=' + code;
  MailApp.sendEmail({ to: DV_CORREO, subject: '📲 Autoriza tu PC para el cuadro de ventas por WhatsApp', name: 'RURUSH Hoy',
    htmlBody: '<p>Tu PC pidió permiso para mandarte el cuadro de ventas a tu WhatsApp (7:45 am y 8:00 pm).</p>' +
      '<p><a href="' + url + '" style="background:#e53935;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">✅ Autorizar y poner mi número</a></p>' +
      '<p style="color:#888">Si no fuiste tú, ignora este correo.</p>' });
  return 'ESPERANDO';
}
function cuadro_okPagina_(code, numero) {
  const props = PropertiesService.getScriptProperties();
  const okCode = props.getProperty('CUADRO_OKCODE');
  const page = (t) => HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font:18px -apple-system,Roboto,sans-serif;padding:24px;max-width:420px;margin:auto">' + t + '</div>').setTitle('RURUSH · Cuadro');
  if (!okCode || code !== okCode) return page('Link vencido o no válido.');
  const n = String(numero || '').replace(/\D/g, '');
  // si ya hay números (pestaña 📲 CUADRO WHATSAPP o el de antes), se autoriza sin pedir nada
  if (n.length < 9 && (cuadro_destinos_().length || props.getProperty('CUADRO_NUMERO'))) {
    props.setProperty('CUADRO_TOKEN', props.getProperty('CUADRO_PEND') || '');
    props.deleteProperty('CUADRO_OKCODE');
    return page('<h2>✅ Listo</h2><p>Quedó autorizado. El cuadro sale lun-vie a las 7:45 am y 8:00 pm a los números de la pestaña 📲 CUADRO WHATSAPP.</p>');
  }
  if (n.length < 9) {
    return page('<h2>📲 Cuadro de ventas a tu WhatsApp</h2><p>Escribe tu número de WhatsApp (a ese chat llega la foto):</p>' +
      '<form method="get" action="' + ScriptApp.getService().getUrl() + '" target="_top"><input type="hidden" name="cuadrook" value="' + code + '">' +
      '<input name="numero" inputmode="tel" placeholder="9XX XXX XXX" style="font-size:20px;padding:10px;width:100%;box-sizing:border-box">' +
      '<button style="margin-top:12px;font-size:18px;padding:12px;width:100%;background:#e53935;color:#fff;border:0;border-radius:10px">Autorizar</button></form>');
  }
  props.setProperty('CUADRO_NUMERO', n.length === 9 ? '51' + n : n);
  props.setProperty('CUADRO_TOKEN', props.getProperty('CUADRO_PEND') || '');
  props.deleteProperty('CUADRO_OKCODE');
  return page('<h2>✅ Listo</h2><p>Tu PC quedó autorizada. El cuadro te llega a tu WhatsApp lun-vie a las 7:45 am y 8:00 pm.</p>');
}

/* A quién se manda el cuadro: pestaña "📲 CUADRO WHATSAPP" de la Hoja de Reportes (columna A, desde la fila 2).
   Los números no van en el código (GitHub es público). Nunca a los números bloqueados. */
const CUADRO_BLOQUEO = ['51942853538', '51953876647'];
function cuadro_destinos_() {
  try {
    const v = Sheets.Spreadsheets.Values.get(DV_ID, "'📲 CUADRO WHATSAPP'!A2:A50").values || [];
    const out = [];
    v.forEach((f) => {
      let n = String(f[0] || '').replace(/\D/g, '');
      if (n.length === 9) n = '51' + n;
      if (/^519\d{8}$/.test(n) && CUADRO_BLOQUEO.indexOf(n) < 0 && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  } catch (e) { return []; }
}

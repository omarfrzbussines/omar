/* RURUSH Hoy — Meta Ads semanal (reemplaza fetch_ads.py + build_dashboard.py de la tarea "KPIS FB ADS SEMANAL").
   Trae de Meta la semana lun-dom, cruza con Pipedrive (leads por campaña y embudo FP → asistió → pagó)
   y guarda el historial en las Propiedades del script (una entrada por semana, sin duplicar).
   Necesita META_TOKEN en Configuración del proyecto → Propiedades del script.
   ads_backfill: ejecutar UNA vez para traer las 12 semanas anteriores (si se corta, ejecutar de nuevo). */

const ADS_CUENTA = 'act_9096570110424846';
const ADS_V = 'v21.0';
const ADS_CONV = 'onsite_conversion.messaging_conversation_started_7d';
const ADS_RECLUT = ['CONVOCATORIA', 'CV ASESOR', 'COACH'];
const ADS_FATIGA = 8;   // S/ por conversación
const ADS_PD = {
  VIDEO: 'fc33a951e60d1b49959af6eaadd44cc21b19d793',
  ASISTE: '4a4b4ffc632982a17272b2a4dd52c1840e5793c6',
  CIERRE: '33b8be2e235bd672060ee054b04372be13b53f52',
  VC: { 168: 'FOTOS EP PUB', 240: 'FOTOS EP PUB', 117: 'FOTOS EP PUB', 176: 'VIDEO NOVIEMBRE', 112: 'FOTOS PUC DIC', 164: 'FOTOS PUC DIC',
        241: 'VIVES CERCA', 246: 'RETO 12 SEMANAS', 251: 'RETO 12 SEMANAS', 252: 'RETO 12 SEMANAS', 247: 'TESTIMONIOS', 248: 'TESTIMONIOS', 249: 'TESTIMONIOS' },
  NO_AD: { 223: 'FALTA', 212: 'ESCRIBIÓ DIRECTO', 220: 'VISITÓ GYM', 121: 'MAYOR 35 AÑOS' },
  CORTO: [['FOTOS EP PUB', 'FOTOS EP PUB'], ['VIDEO NOV', 'VIDEO NOVIEMBRE'], ['FOTOS PUC DIC', 'FOTOS PUC DIC'], ['VIDEOS DIC', 'VIDEOS DIC PUB FEB'],
          ['VIVES CERCA', 'VIVES CERCA'], ['RETO 12', 'RETO 12 SEMANAS'], ['TESTIMONIO', 'TESTIMONIOS']]
};

function ads_api(params) {
  const qs = Object.keys(params).map((k) => k + '=' + encodeURIComponent(params[k])).join('&');
  const r = UrlFetchApp.fetch('https://graph.facebook.com/' + ADS_V + '/' + ADS_CUENTA + '/insights?' + qs + '&access_token=' + encodeURIComponent(token('META_TOKEN')),
    { muteHttpExceptions: true });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) { /* sin JSON */ }
  if (j.error) {
    if (j.error.code === 190) throw new Error('El token de Meta venció o no es válido: genera uno nuevo y pégalo en META_TOKEN.');
    throw new Error('Meta: ' + j.error.message);
  }
  return j.data || [];
}
const ads_conv = (row) => { const a = (row.actions || []).filter((x) => x.action_type === ADS_CONV)[0]; return a ? Math.round(Number(a.value) || 0) : 0; };
const ads_r2 = (v) => Math.round(v * 100) / 100;
const ads_corto = (n) => { const u = String(n || '').toUpperCase(); const k = ADS_PD.CORTO.filter((x) => u.indexOf(x[0]) >= 0)[0]; return k ? k[1] : null; };

// Una semana completa (lun..dom) → registro igual al de datos_ads_semanal.json
function ads_semana(lun, dom) {
  const F = 'spend,impressions,reach,clicks,ctr,cpm,actions';
  const TR = JSON.stringify({ since: lun, until: dom });
  const cur = ads_api({ level: 'account', time_range: TR, fields: F })[0];
  if (!cur) throw new Error('Meta no devolvió datos de la semana ' + lun + '.');
  const g = Number(cur.spend) || 0, c = ads_conv(cur);
  const reg = { inicio: lun, fin: dom, gasto: ads_r2(g), alcance: Number(cur.reach) || 0, clics: Number(cur.clicks) || 0, conversaciones: c,
    costo_conv: c ? ads_r2(g / c) : 0, cpm: ads_r2(Number(cur.cpm) || 0), ctr: ads_r2(Number(cur.ctr) || 0), campanas: [] };
  ads_api({ level: 'campaign', time_range: TR, fields: 'campaign_name,' + F }).forEach((r) => {
    const n = r.campaign_name || '', cc = ads_conv(r), gg = Number(r.spend) || 0;
    reg.campanas.push({ nombre: n, gasto: ads_r2(gg), conversaciones: cc, costo_conv: cc ? ads_r2(gg / cc) : 0,
      tipo: ADS_RECLUT.some((k) => n.toUpperCase().indexOf(k) >= 0) ? 'reclutamiento' : 'adquisicion' });
  });

  // Leads de la semana en Pipedrive (personas creadas, por campo "Video")
  const porCamp = {};
  let total = 0, sinDato = 0;
  for (let start = 0, vueltas = 0; vueltas < 12; vueltas++) {
    const j = pd('/persons?limit=500&start=' + start + '&sort=' + encodeURIComponent('add_time DESC'));
    let pasado = false;
    (j.data || []).some((p) => {
      const at = String(p.add_time || '').slice(0, 10);
      if (at < lun) { pasado = true; return true; }
      if (at <= dom) {
        total++;
        const cn = ADS_PD.VC[String(p[ADS_PD.VIDEO] || '')];
        if (cn) porCamp[cn] = (porCamp[cn] || 0) + 1; else sinDato++;
      }
      return false;
    });
    const pg = j.additional_data && j.additional_data.pagination;
    if (pasado || !pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  const etiq = Object.keys(porCamp).reduce((t, k) => t + porCamp[k], 0);
  reg.leads = total; reg.leads_etiq = etiq; reg.leads_sd = sinDato; reg.cpl = etiq ? ads_r2(g / etiq) : 0;
  reg.campanas.forEach((cx) => { const cs = ads_corto(cx.nombre); cx.leads = cs ? (porCamp[cs] || 0) : 0; cx.cpl = cx.leads ? ads_r2(cx.gasto / cx.leads) : 0; });

  // Embudo FP → asistió → pagó, por origen (una persona = un teléfono)
  const acts = [];
  for (let start = 0, vueltas = 0; vueltas < 10; vueltas++) {
    const j = pd('/activities?type=meeting&user_id=0&limit=500&start=' + start + '&start_date=' + dv_mas(lun, -1) + '&end_date=' + dv_mas(dom, 2));
    (j.data || []).forEach((a) => {
      if (/^FP/.test(String(a.subject || '').toUpperCase().trim()) && a.due_date >= lun && a.due_date <= dom) acts.push(a);
    });
    const pg = j.additional_data && j.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  const pidDe = (a) => (a.person_id && a.person_id.value != null ? a.person_id.value : a.person_id);
  const hechas = {};
  acts.forEach((a) => { if (a.done && pidDe(a)) hechas[pidDe(a)] = 1; });
  const P = sm_personas(acts.map(pidDe).filter(Boolean));
  const porTel = {};
  Object.keys(P).forEach((pid) => {
    const p = P[pid] || {};
    const tel = tel9(((p.phone || []).filter((x) => x.value)[0] || {}).value) || 'np_' + pid;
    (porTel[tel] = porTel[tel] || []).push({ pid: pid, p: p });
  });
  const E = {};
  let tFp = 0, tAs = 0, tCi = 0;
  Object.keys(porTel).forEach((tel) => {
    let vid = null, asiste = false, cierre = false;
    porTel[tel].forEach((x) => {
      const v = x.p[ADS_PD.VIDEO];
      if (v && !vid) vid = String(v);
      if (/^(SÍ|SI|YES|47)$/i.test(String(x.p[ADS_PD.ASISTE] || '').trim())) asiste = true;
      if (/^(SÍ|SI|YES|136)$/i.test(String(x.p[ADS_PD.CIERRE] || '').trim())) cierre = true;
      if (hechas[x.pid]) asiste = true;
    });
    if (cierre) asiste = true;
    const key = (vid && (ADS_PD.VC[vid] || ADS_PD.NO_AD[vid] || vid)) || 'SIN ETIQUETA';
    const e = E[key] || (E[key] = { nombre: key, fp: 0, asiste: 0, cierre: 0, gasto: 0 });
    e.fp++; tFp++;
    if (asiste) { e.asiste++; tAs++; }
    if (cierre) { e.cierre++; tCi++; }
  });
  const gastoAdq = reg.campanas.filter((x) => x.tipo === 'adquisicion').reduce((t, x) => t + x.gasto, 0);
  const vals = Object.keys(ADS_PD.VC).map((k) => ADS_PD.VC[k]);
  const origen = Object.keys(E).map((k) => E[k]).sort((a, b) => b.cierre - a.cierre || b.fp - a.fp);
  origen.forEach((o) => {
    o.es_ad = vals.indexOf(o.nombre) >= 0;
    const cx = reg.campanas.filter((x) => ads_corto(x.nombre) === o.nombre)[0];
    if (cx) o.gasto = cx.gasto;
  });
  reg.embudo = { total_fp: tFp, asistieron: tAs, cerraron: tCi, gasto_adq: ads_r2(gastoAdq), cpi_global: tCi ? Math.round(gastoAdq / tCi) : 0, por_origen: origen.slice(0, 14) };
  return reg;
}

/* ---------- historial (Propiedades del script: ADS|<lunes>) ---------- */

function ads_guardar(reg) {
  let s = JSON.stringify(reg);
  if (s.length > 8500) { reg.campanas = reg.campanas.sort((a, b) => b.gasto - a.gasto).slice(0, 15); reg.embudo.por_origen = reg.embudo.por_origen.slice(0, 8); s = JSON.stringify(reg); }
  PropertiesService.getScriptProperties().setProperty('ADS|' + reg.inicio, s);
}
function ads_historial() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(p).filter((k) => /^ADS\|/.test(k)).sort().map((k) => JSON.parse(p[k]));
}
// Trae (o re-trae) la semana y devuelve { reg, prev, hist } para el informe.
function ads_actualizar(lun, dom) {
  ads_guardar(ads_semana(lun, dom));
  const hist = ads_historial().filter((r) => r.inicio <= lun);
  return { reg: hist[hist.length - 1], prev: hist.length > 1 ? hist[hist.length - 2] : null, hist: hist.slice(-8) };
}
function ads_backfill() {
  const t0 = Date.now(), hoy = fechaLima(0), dw = dv_d(hoy).getUTCDay();
  let lun = dv_mas(hoy, -(dw === 0 ? 7 : dw) - 6);
  const ya = {};
  ads_historial().forEach((r) => { ya[r.inicio] = 1; });
  const hechas = [];
  for (let k = 0; k < 13; k++, lun = dv_mas(lun, -7)) {
    if (ya[lun]) continue;
    if (Date.now() - t0 > 4.5 * 60e3) { Logger.log('Se acabó el tiempo: ejecuta ads_backfill otra vez para seguir.'); break; }
    try { ads_guardar(ads_semana(lun, dv_mas(lun, 6))); hechas.push(lun); } catch (e) { Logger.log(lun + ': ' + e.message); }
  }
  Logger.log('Semanas nuevas: ' + (hechas.join(', ') || 'ninguna') + ' · total guardadas: ' + ads_historial().length);
}

/* ---------- HTML (sección del informe semanal) ---------- */

function ads_html(A) {
  const r = A.reg, pr = A.prev;
  if (!r) return '';
  const S = (v) => 'S/ ' + (Math.round((v || 0) * 100) / 100).toLocaleString('en-US');
  const N = (v) => Math.round(v || 0).toLocaleString('en-US');
  const ch = (a, b) => (b ? (a - b) / b * 100 : null);
  const flecha = (a, b, menosEsMejor) => {
    const p = ch(a, b);
    if (p == null || Math.abs(p) < 0.5) return '<span style="color:#8a8984">–</span>';
    const bien = menosEsMejor ? p < 0 : p > 0;
    return '<span style="color:' + (bien ? '#0f8a4b' : '#d03b3b') + '">' + (p > 0 ? '▲' : '▼') + ' ' + Math.abs(Math.round(p)) + '%</span>';
  };
  const k = (t, v, f) => '<td style="background:#fff;border-radius:10px;padding:8px;vertical-align:top"><div style="font-size:11px;color:#8a8984;font-weight:700">' + t +
    '</div><div style="font-size:17px;font-weight:800">' + v + '</div><div style="font-size:12px">' + f + '</div></td>';
  const box = (t, body, bg) => '<div style="background:' + (bg || '#f3f2ef') + ';border-radius:16px;padding:14px 16px;margin-top:12px">' +
    (t ? '<div style="font-size:13px;font-weight:800;letter-spacing:1px;color:#52514e;margin-bottom:8px">' + t + '</div>' : '') + body + '</div>';
  const e = r.embudo || {}, pe = pr && pr.embudo;

  let h = '<div style="font-size:20px;font-weight:800;margin-top:22px">📣 Meta Ads · ' + sm_lab(r.inicio) + ' – ' + sm_lab(r.fin) + '</div>';
  h += box('', '<table width="100%" style="border-collapse:separate;border-spacing:6px">' +
    '<tr>' + k('Gasto', S(r.gasto), flecha(r.gasto, pr && pr.gasto, false)) + k('Conversaciones', N(r.conversaciones), flecha(r.conversaciones, pr && pr.conversaciones, false)) +
    k('Costo / conv', S(r.costo_conv), flecha(r.costo_conv, pr && pr.costo_conv, true)) + '</tr>' +
    '<tr>' + k('Alcance', N(r.alcance), flecha(r.alcance, pr && pr.alcance, false)) + k('CTR', (r.ctr || 0).toFixed(2) + '%', flecha(r.ctr, pr && pr.ctr, false)) +
    k('CPM', S(r.cpm), flecha(r.cpm, pr && pr.cpm, true)) + '</tr>' +
    '<tr>' + k('Leads Pipedrive', N(r.leads_etiq) + ' <span style="font-size:12px;color:#8a8984">+' + N(r.leads_sd) + ' s/dato</span>', flecha(r.leads_etiq, pr && pr.leads_etiq, false)) +
    k('CPL', r.cpl ? S(r.cpl) : '–', flecha(r.cpl, pr && pr.cpl, true)) +
    k('Costo / inscrito', e.cpi_global ? S(e.cpi_global) : '–', flecha(e.cpi_global, pe && pe.cpi_global, true)) + '</tr></table>');

  // diagnóstico por reglas (lo que antes escribía la IA)
  const dg = [];
  if (pr && pr.costo_conv) {
    const dc = ch(r.costo_conv, pr.costo_conv), dcpm = ch(r.cpm, pr.cpm), dctr = ch(r.ctr, pr.ctr);
    const cpc = (x) => (x.clics ? x.conversaciones / x.clics : null);
    const dcc = cpc(r) != null && cpc(pr) ? ch(cpc(r), cpc(pr)) : null;
    if (dc > 5) {
      if (dcpm != null && dcpm >= 5) dg.push('💸 El costo/conv subió ' + Math.round(dc) + '% sobre todo por la <b>subasta</b> (CPM +' + Math.round(dcpm) + '%): mostrar el anuncio salió más caro, no es culpa del creativo.');
      if ((dctr != null && dctr <= -5) || (dcc != null && dcc <= -5)) dg.push('🎨 Además el <b>anuncio convence menos</b> (CTR ' + Math.round(dctr || 0) + '%' + (dcc != null ? ', conversaciones por clic ' + Math.round(dcc) + '%' : '') + '): señal de creativo cansado u oferta floja → rotar creativo.');
      if (!dg.length) dg.push('📈 El costo/conv subió ' + Math.round(dc) + '% sin un culpable claro (CPM y CTR casi iguales): revisar segmentación y horarios.');
    } else if (dc < -5) dg.push('✅ El costo/conv bajó ' + Math.round(-dc) + '% vs la semana anterior: sostener presupuesto y creativos ganadores.');
    else dg.push('➖ Costo/conv estable (' + (dc > 0 ? '+' : '') + Math.round(dc) + '%).');
  }
  const adq = (r.campanas || []).filter((c) => c.tipo !== 'reclutamiento' && c.conversaciones > 0).sort((a, b) => a.costo_conv - b.costo_conv);
  if (adq.length) dg.push('🥇 Escalar <b>' + adq[0].nombre + '</b>: la más barata (' + S(adq[0].costo_conv) + '/conv).');
  if (adq.length > 1) dg.push('🔻 Revisar <b>' + adq[adq.length - 1].nombre + '</b>: la más cara (' + S(adq[adq.length - 1].costo_conv) + '/conv).');
  const fat = adq.filter((c) => c.costo_conv > ADS_FATIGA);
  if (fat.length) dg.push('🚩 Fatiga (más de ' + S(ADS_FATIGA) + '/conv): ' + fat.map((c) => '<b>' + c.nombre + '</b> ' + S(c.costo_conv)).join(', ') + '.');
  if (e.cerraron && pe && pe.cpi_global && e.cpi_global > pe.cpi_global * 1.2) dg.push('⚠️ El costo por inscrito real subió de ' + S(pe.cpi_global) + ' a ' + S(e.cpi_global) + ': mirar el embudo, no solo las conversaciones.');
  dg.push('🎯 Optimizar por costo por <b>SOCIO</b>: VIVES CERCA y EDITA VIDEO traen socios; VIDEO ERES MAMÁ infla conversaciones sin socios.');
  h += box('🧭 DIAGNÓSTICO', dg.map((x) => '<div style="font-size:14px;padding:3px 0">' + x + '</div>').join(''), '#eef3fb');

  // campañas
  const camp = (r.campanas || []).slice().sort((a, b) => (a.tipo === 'reclutamiento') - (b.tipo === 'reclutamiento') || a.costo_conv - b.costo_conv);
  const mx = Math.max.apply(null, camp.map((c) => c.costo_conv).concat([1]));
  if (camp.length) h += box('📊 COSTO POR CONVERSACIÓN · CAMPAÑAS', camp.map((c) => {
    const rec = c.tipo === 'reclutamiento';
    const col = rec ? '#bdbcb6' : (adq[0] && c.nombre === adq[0].nombre ? '#0f8a4b' : (adq.length > 1 && c.nombre === adq[adq.length - 1].nombre ? '#d03b3b' : '#e08a8a'));
    return '<div style="padding:5px 0;border-bottom:1px solid #e3e2dd"><div style="font-size:13px"><b>' + c.nombre + '</b>' + (rec ? ' <span style="font-size:10px;color:#8a8984">RECLUT.</span>' : '') +
      '<span style="float:right">' + S(c.gasto) + ' · ' + N(c.conversaciones) + ' conv' + (c.leads ? ' · ' + c.leads + ' leads' : '') + '</span></div>' +
      '<table width="100%" style="border-collapse:collapse"><tr><td><div style="height:8px;width:' + Math.max(2, c.costo_conv / mx * 100).toFixed(0) + '%;background:' + col + ';border-radius:4px"></div></td>' +
      '<td align="right" width="80" style="font-size:13px;font-weight:800">' + S(c.costo_conv) + '</td></tr></table></div>';
  }).join(''));

  // embudo real
  if (e.total_fp) h += box('🎟️ EMBUDO REAL: FP → ASISTIÓ → PAGÓ',
    '<div style="font-size:14px;margin-bottom:6px"><b>' + e.total_fp + '</b> FP → <b>' + e.asistieron + '</b> asistieron (' + sm_pct(e.asistieron, e.total_fp) + '%) → <b>' + e.cerraron + '</b> pagaron (' + sm_pct(e.cerraron, e.total_fp) + '%)</div>' +
    '<table width="100%" style="border-collapse:collapse">' +
    '<tr><td style="font-size:11px;color:#8a8984;font-weight:700">Origen</td><td align="right" style="font-size:11px;color:#8a8984;font-weight:700">FP</td><td align="right" style="font-size:11px;color:#8a8984;font-weight:700">Asist.</td><td align="right" style="font-size:11px;color:#8a8984;font-weight:700">Pago</td><td align="right" style="font-size:11px;color:#8a8984;font-weight:700">S/ por inscrito</td></tr>' +
    e.por_origen.map((o) => '<tr><td style="font-size:13px;padding:3px 0;border-bottom:1px solid #e3e2dd">' + o.nombre + '</td><td align="right" style="font-size:13px;border-bottom:1px solid #e3e2dd">' + o.fp +
      '</td><td align="right" style="font-size:13px;border-bottom:1px solid #e3e2dd">' + o.asiste + '</td><td align="right" style="font-size:13px;border-bottom:1px solid #e3e2dd">' + o.cierre +
      '</td><td align="right" style="font-size:13px;font-weight:800;border-bottom:1px solid #e3e2dd">' + (o.cierre && o.gasto ? S(Math.round(o.gasto / o.cierre)) : '–') + '</td></tr>').join('') + '</table>');

  // tendencia
  const H = A.hist || [];
  if (H.length > 1) {
    const mc = Math.max.apply(null, H.map((x) => x.costo_conv).concat([1]));
    h += box('📉 TENDENCIA COSTO / CONVERSACIÓN (y costo por inscrito)', H.map((x) =>
      '<table width="100%" style="border-collapse:collapse;margin:2px 0"><tr><td width="90" style="font-size:12px;color:#52514e">' + sm_lab(x.inicio) + '</td>' +
      '<td><div style="height:10px;width:' + Math.max(2, x.costo_conv / mc * 100).toFixed(0) + '%;background:' + (x === r ? '#d03b3b' : '#e08a8a') + ';border-radius:5px"></div></td>' +
      '<td align="right" width="70" style="font-size:12px;font-weight:800">' + S(x.costo_conv) + '</td>' +
      '<td align="right" width="80" style="font-size:12px;color:#0f8a4b">' + (x.embudo && x.embudo.cpi_global ? S(x.embudo.cpi_global) + '/insc' : '') + '</td></tr></table>').join(''));
  }
  return h;
}

// Ejecutar a mano para probar solo Meta (sin mandar correo).
function ads_probar() {
  const hoy = fechaLima(0), dw = dv_d(hoy).getUTCDay(), dom = dv_mas(hoy, -(dw === 0 ? 7 : dw));
  const r = ads_semana(dv_mas(dom, -6), dom);
  Logger.log('OK ' + r.inicio + '..' + r.fin + ' | gasto S/' + r.gasto + ' | conv ' + r.conversaciones + ' | costo/conv S/' + r.costo_conv +
    ' | leads ' + r.leads_etiq + ' | FP ' + r.embudo.total_fp + '>' + r.embudo.asistieron + '>' + r.embudo.cerraron);
}

/* RURUSH Hoy — Informe semanal (reemplaza las tareas de Cowork "KPIS INFORME SEMANAL" y "KPIS FB ADS SEMANAL").
   Lo hace Google solo: 0 tokens, sin tu PC. Cada lunes 7:15 am llega un correo con la semana pasada (lun-dom):
     - ventas por asesora (DATOS_ORIGEN), meta del mes (DV_METAS de Dashboard.gs) y semana anterior
     - embudo Free Pass, agendamiento y cierres (pestaña "<MES> <AÑO>" de la Hoja de Reportes)
     - canal, % cierre por coach y horas que más convierten (Pipedrive)
     - socios que vencieron y por renovar (ACTUALIZAR BASE DIARIA), retención de uso (Apps Fit)
     - llamadas por asesora (BASE DE DATOS LEADS) y Meta Ads (Ads.gs)
   Ejecutar sm_instalar UNA vez: programa el lunes 7:15 y manda un correo de prueba. */

const SM_BASE_ID = '1uM0zdslIvTDRmB6ikKycTjFDy0rOz9dfn8jLB60adaI';   // ACTUALIZAR BASE DIARIA
const SM_RET_META = 0.85;
const SM_PD = {
  ASESORA: '7de502a12cd072ed8904fc783228913fa16a0e29', ASESORA_MAP: { 131: 'MONICA', 183: 'LAURA', 243: 'DANNA' },
  CIERRE: '33b8be2e235bd672060ee054b04372be13b53f52', CIERRE_SI: '136',
  COACH: '9e850eece75b5e1d9ed9b4e61e8643a57e1d4b70',
  COACH_MAP: { 150: 'JOSUE', 151: 'JOSE', 152: 'JHONATHAN', 153: 'LEO', 154: 'JOAQUIN', 155: 'PAUL', 156: 'JHORSSON', 157: 'BRANDON',
               166: 'SEBASTIAN', 178: 'BRAYAN', 179: 'GABRIEL', 215: 'VICTOR', 242: 'MIRKO', 260: 'LENNIE', 271: 'SIN COACH FP' }
};
const SM_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/* ---------- utilidades ---------- */

// "dany, vasquez" / "Ana Ana" → "Dany Vasquez" / "Ana"
function sm_nombre(v) {
  const w = String(v || '').replace(/,/g, ' ').trim().toLowerCase().split(/\s+/).filter(String)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const o = [];
  w.forEach((x) => { if (!o.length || o[o.length - 1] !== x) o.push(x); });
  const h = o.length / 2;
  if (o.length % 2 === 0 && o.slice(0, h).join(' ') === o.slice(h).join(' ')) o.length = h;
  return o.slice(0, 3).join(' ');
}
// asesora a partir del código de vendedor (danna123, LAURA31, monica10da…)
function sm_ase(v) {
  const s = dv_nom(v).toLowerCase();
  if (/laura/.test(s)) return 'LAURA';
  if (/monica/.test(s)) return 'MONICA';
  if (/danna|dilan|liam/.test(s)) return 'DANNA';
  if (/valeria/.test(s)) return 'VALERIA';
  return s ? 'OTROS' : 'SIN ASESORA';
}
// "09/11/2026" o "05/10/2026 05:56 p. m." → "2026-11-09"
function sm_fecha(v) {
  const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}
const sm_lab = (iso) => Number(iso.slice(8)) + ' ' + SM_MES[Number(iso.slice(5, 7)) - 1];
const sm_dias = (lun, dom) => { const o = [lun]; while (o[o.length - 1] < dom) o.push(dv_mas(o[o.length - 1], 1)); return o; };
const sm_pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

// Personas de Pipedrive en paralelo (lotes de 40, con un reintento si Pipedrive pide calma).
function sm_personas(ids) {
  const tok = token('PIPEDRIVE_TOKEN'), out = {};
  ids = ids.filter((x, i) => x && ids.indexOf(x) === i);
  for (let i = 0; i < ids.length; i += 40) {
    let lote = ids.slice(i, i + 40);
    for (let intento = 0; intento < 3 && lote.length; intento++) {
      if (intento) Utilities.sleep(2000);
      const rs = UrlFetchApp.fetchAll(lote.map((id) => ({
        url: PIPEDRIVE_BASE + '/persons/' + id, headers: { 'x-api-token': tok }, muteHttpExceptions: true })));
      const repetir = [];
      rs.forEach((r, k) => {
        if (r.getResponseCode() === 429) { repetir.push(lote[k]); return; }
        try { out[lote[k]] = JSON.parse(r.getContentText()).data || {}; } catch (e) { out[lote[k]] = {}; }
      });
      lote = repetir;
    }
    Utilities.sleep(300);
  }
  return out;
}
// Reuniones de Pipedrive con hora Lima (Pipedrive guarda UTC y end_date es exclusivo: se pide margen).
function sm_reuniones(desde, hasta) {
  const ini = dv_mas(desde, -1), fin = dv_mas(hasta, 2), out = [];
  for (let start = 0, vueltas = 0; vueltas < 40; vueltas++) {
    const j = pd('/activities?type=meeting&user_id=0&limit=500&start=' + start + '&start_date=' + ini + '&end_date=' + fin);
    (j.data || []).forEach((a) => {
      if (!a.due_date || !/^\s*(FP\b|FREE\s*PASS)/i.test(a.subject || '')) return;
      const l = new Date(Date.parse(a.due_date + 'T' + (a.due_time || '05:00').slice(0, 5) + ':00Z') + LIMA * 3600e3);
      const fecha = l.toISOString().slice(0, 10);
      if (fecha < desde || fecha > hasta) return;
      out.push({ pid: a.person_id && a.person_id.value != null ? a.person_id.value : a.person_id, asunto: a.subject || '',
                 hecha: !!a.done, fecha: fecha, hora: l.getUTCHours() });
    });
    const pg = j.additional_data && j.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  return out;
}

/* ---------- datos ---------- */

function sm_datos() {
  const hoy = fechaLima(0);
  const dw = dv_d(hoy).getUTCDay();
  const dom = dv_mas(hoy, -(dw === 0 ? 7 : dw)), lun = dv_mas(dom, -6);
  const lunAnt = dv_mas(lun, -7), domAnt = dv_mas(lun, -1);
  const mesIso = dom.slice(0, 7), y = Number(dom.slice(0, 4)), m = Number(dom.slice(5, 7));
  const res = { hoy: hoy, lun: lun, dom: dom, errores: [] };
  const dias = sm_dias(lun, dom);

  /* 1) Hoja de Reportes: DATOS_ORIGEN (montos) + pestaña del mes (agendamiento, cierres, FP) */
  const meses = [];
  [lunAnt, lun, dom].forEach((f) => { const k = f.slice(0, 7); if (meses.indexOf(k) < 0) meses.push(k); });
  const tabMes = (k) => MESES[Number(k.slice(5)) - 1];
  const rangos = meses.map((k) => "'DATOS_ORIGEN_" + tabMes(k) + "'!C1:J800");
  const mesesSem = [lun.slice(0, 7), dom.slice(0, 7)].filter((k, i, a) => a.indexOf(k) === i);
  mesesSem.forEach((k) => rangos.push("'" + tabMes(k) + ' ' + k.slice(0, 4) + "'!X1:BF260"));
  let vr = [];
  try {
    vr = Sheets.Spreadsheets.Values.batchGet(DV_ID, { ranges: rangos, valueRenderOption: 'UNFORMATTED_VALUE' }).valueRanges || [];
  } catch (e) {
    // si falta alguna pestaña (cambio de año, etc.) se lee una por una
    vr = rangos.map((r) => { try { return Sheets.Spreadsheets.Values.get(DV_ID, r, { valueRenderOption: 'UNFORMATTED_VALUE' }); } catch (x) { return {}; } });
  }

  const A = {};
  DV_ASESORAS.forEach((n) => { A[n] = { nombre: DV_NOMBRE[n], meta: DV_METAS[n], nuevos: 0, fidel: 0, sem: 0, ant: 0, acum: 0, porDia: {} }; });
  meses.forEach((k, i) => {
    ((vr[i] && vr[i].values) || []).forEach((f) => {
      if (typeof f[0] !== 'number') return;
      const a = A[dv_nom(f[1])];
      if (!a) return;
      const fecha = dv_serialAIso(f[0]);
      if (fecha.slice(0, 7) !== k) return;                 // cada pestaña solo aporta su mes
      const nu = dv_num(f[2]) + dv_num(f[3]) + dv_num(f[4]), fi = dv_num(f[5]) + dv_num(f[6]) + dv_num(f[7]);
      if (fecha >= lun && fecha <= dom) { a.nuevos += nu; a.fidel += fi; a.sem += nu + fi; a.porDia[fecha] = (a.porDia[fecha] || 0) + nu + fi; }
      if (fecha >= lunAnt && fecha <= domAnt) a.ant += nu + fi;
      if (fecha.slice(0, 7) === mesIso && fecha <= dom) a.acum += nu + fi;
    });
  });
  const ini = mesIso + '-01';
  let plazo = mesIso + '-' + ('0' + DV_PLAZO).slice(-2);
  if (dom > plazo) plazo = dv_iso(new Date(Date.UTC(y, m, 0, 12)));
  const diasTot = dv_habiles(ini, plazo);
  res.esperado = diasTot ? Math.min(1, dv_habiles(ini, dom < plazo ? dom : plazo) / diasTot) : 1;
  res.plazo = plazo;
  res.dias = dias;
  res.lista = DV_ASESORAS.map((n) => {
    const a = A[n], pct = a.meta ? a.acum / a.meta : 0, ritmo = res.esperado ? pct / res.esperado : 1;
    a.pct = pct;
    a.estado = pct >= 1 ? 'META CUMPLIDA' : ritmo >= 1 ? 'AL DÍA' : ritmo >= 0.7 ? 'EN CAMINO' : 'EN RIESGO';
    a.ult = dias.map((f) => a.porDia[f] || 0);
    return a;
  }).sort((p, q) => q.sem - p.sem);
  const sum = (k) => res.lista.reduce((t, a) => t + a[k], 0);
  res.tot = { sem: sum('sem'), nuevos: sum('nuevos'), fidel: sum('fidel'), ant: sum('ant'), acum: sum('acum'), meta: sum('meta') };

  // bloques de la pestaña del mes: se ubican por sus títulos (no por número de fila)
  const G = { ag: {}, ci: {}, fpP: 0, fpA: 0, nutC: 0, nutA: 0, ret: null, planes: null };
  DV_ASESORAS.forEach((n) => { G.ag[n] = { APC: 0, APV: 0, APL: 0 }; G.ci[n] = { pres: 0, cerro: 0 }; });
  mesesSem.forEach((k, i) => {
    const F = (vr[meses.length + i] && vr[meses.length + i].values) || [];
    const col = (iso) => Number(iso.slice(8)) + 1;                 // X=0, Y=1, Z=día 1
    const enSem = dias.filter((f) => f.slice(0, 7) === k);
    const sumaFila = (r) => enSem.reduce((t, f) => t + dv_num((F[r] || [])[col(f)]), 0);
    let seccion = '';
    const visto = {};
    F.forEach((f, r) => {
      const x = dv_nom(f[0]), yy = dv_nom(f[1]);
      if (x) seccion = x;
      if (DV_ASESORAS.indexOf(yy) >= 0 && Number(f[2]) === 1 && !visto[seccion + yy]) {
        visto[seccion + yy] = 1;
        if (seccion === 'AGENDAMIENTO') { G.ag[yy].APC += sumaFila(r + 1); G.ag[yy].APV += sumaFila(r + 2); G.ag[yy].APL += sumaFila(r + 3); }
        if (seccion === 'CIERRES') { G.ci[yy].pres += sumaFila(r + 1); G.ci[yy].cerro += sumaFila(r + 3); }
      }
      if (yy === 'FP PROGRAM') G.fpP += sumaFila(r);
      if (yy === 'FP ASISTIO') G.fpA += sumaFila(r);
      if (yy === 'EVALUACION Y DIETAS') { G.nutC += sumaFila(r + 1); G.nutA += sumaFila(r + 2); }
      if (k === mesIso && yy === 'PLAN ACTIVO') G.planes = dv_num(f[34]);
      if (k === mesIso && yy === '% RETENCION') G.ret = typeof f[34] === 'number' ? f[34] : dv_num(f[34]) / 100;
    });
  });
  G.cerro = DV_ASESORAS.reduce((t, n) => t + G.ci[n].cerro, 0);
  G.pres = DV_ASESORAS.reduce((t, n) => t + G.ci[n].pres, 0);
  res.hoja = G;

  /* 2) Pipedrive: canal, coach y horas (mes en curso hasta el domingo) */
  try {
    const acts = sm_reuniones(lun < ini ? lun : ini, dom);
    const porP = {};
    acts.forEach((a) => { if (a.pid) (porP[a.pid] = porP[a.pid] || []).push(a); });
    const P = sm_personas(Object.keys(porP));
    const canal = { APC: { ag: 0, pa: 0, ins: 0 }, APV: { ag: 0, pa: 0, ins: 0 }, APL: { ag: 0, pa: 0, ins: 0 } };
    const coach = {}, hPa = {}, hIn = {};
    Object.keys(porP).forEach((pid) => {
      const lst = porP[pid].filter((a) => a.fecha.slice(0, 7) === mesIso);
      if (!lst.length) return;
      const p = P[pid] || {};
      const ins = String(p[SM_PD.CIERRE] || '') === SM_PD.CIERRE_SI;
      const hechas = lst.filter((a) => a.hecha);
      const rep = (hechas.length ? hechas : lst).slice().sort((a, b) => (a.fecha + ('0' + a.hora).slice(-2)).localeCompare(b.fecha + ('0' + b.hora).slice(-2))).pop();
      const c = (rep.asunto.toUpperCase().match(/\b(APC|APV|APL)\b/) || [])[1];
      if (c) { canal[c].ag++; if (rep.hecha) canal[c].pa++; if (ins) canal[c].ins++; }
      if (hechas.length) {
        hPa[rep.hora] = (hPa[rep.hora] || 0) + 1;
        if (ins) hIn[rep.hora] = (hIn[rep.hora] || 0) + 1;
        const co = SM_PD.COACH_MAP[String(p[SM_PD.COACH] || '')] || 'SIN COACH FP';
        const s = coach[co] || (coach[co] = { fp: 0, cierres: 0 });
        s.fp++; if (ins) s.cierres++;
      }
    });
    res.canal = canal;
    res.coach = Object.keys(coach).map((k) => ({ coach: k, fp: coach[k].fp, cierres: coach[k].cierres, pct: sm_pct(coach[k].cierres, coach[k].fp) }))
      .map((c) => Object.assign(c, { score: Math.round(c.cierres * c.pct) / 100 }))
      .sort((a, b) => (a.coach === 'SIN COACH FP') - (b.coach === 'SIN COACH FP') || b.score - a.score || b.fp - a.fp);
    const top = (h) => Object.keys(h).sort((a, b) => h[b] - h[a]).slice(0, 3).map((k) => ({ h: Number(k), n: h[k] }));
    res.horas = { pasaron: top(hPa), inscritos: top(hIn) };
  } catch (e) { res.errores.push('Pipedrive: ' + e.message); }

  /* 3) Socios: vencieron la semana pasada y vencen en 10-30 días (ACTUALIZAR BASE DIARIA) */
  try {
    const B = Sheets.Spreadsheets.Values.get(SM_BASE_ID, "'ACTUALIZAR BASE DIARIA'!A3:M4000").values || [];
    const ult = {};
    B.forEach((f) => { const fin = sm_fecha(f[9]); if (fin && (!ult[f[0]] || fin > ult[f[0]])) ult[f[0]] = fin; });
    const fila = (f, fin) => {
      const ua = sm_fecha(f[10]);
      return { nombre: sm_nombre(f[1]), fin: fin, ase: sm_ase(f[12]), plan: String(f[7] || ''), sinVenir: ua ? diasEntre(ua, hoy) : null };
    };
    const venc = [], reno = [], visto = {};
    B.forEach((f) => {
      const fin = sm_fecha(f[9]);
      if (fin >= lun && fin <= dom && !visto[f[0]]) { visto[f[0]] = 1; const x = fila(f, fin); x.renovo = ult[f[0]] > dom; venc.push(x); }
      if (fin && fin === ult[f[0]]) { const d = diasEntre(hoy, fin); if (d >= 10 && d <= 30 && !visto['r' + f[0]]) { visto['r' + f[0]] = 1; const x = fila(f, fin); x.faltan = d; reno.push(x); } }
    });
    const orden = (a, b) => (b.sinVenir == null ? -1 : b.sinVenir) - (a.sinVenir == null ? -1 : a.sinVenir);
    res.vencidos = venc.sort(orden);
    res.renovar = reno.sort(orden);
  } catch (e) { res.errores.push('Base diaria: ' + e.message); }

  /* 4) Retención de uso (Apps Fit): socios activos que vinieron la semana pasada */
  try {
    const best = {};
    appsfitClientes(1, hoy, '2099-12-31').forEach((c) => {
      const k = c.CodigoSocio || c.Celular; const ff = String(c.FechaFin || '');
      if (k && (!best[k] || ff > String(best[k].FechaFin || ''))) best[k] = c;
    });
    const R = {};
    Object.keys(best).forEach((k) => {
      const c = best[k], a = sm_ase(c.Vendedor), r = R[a] || (R[a] = { activos: 0, vinieron: 0, no: [] });
      const ua = c.UltimaAsistencia ? String(c.UltimaAsistencia).slice(0, 10) : '';
      r.activos++;
      if (ua >= lun && ua <= dom) r.vinieron++;
      else r.no.push({ nombre: sm_nombre((c.Nombres || '') + ' ' + (c.Apellidos || '')), dias: ua ? diasEntre(ua, hoy) : null });
    });
    const tot = { activos: 0, vinieron: 0 };
    Object.keys(R).forEach((a) => { tot.activos += R[a].activos; tot.vinieron += R[a].vinieron; R[a].no.sort((p, q) => (q.dias == null ? 9999 : q.dias) - (p.dias == null ? 9999 : p.dias)); R[a].no = R[a].no.slice(0, 3); });
    res.retencion = { porAse: R, tot: tot };
  } catch (e) { res.errores.push('Apps Fit: ' + e.message); }

  /* 5) Llamadas de la semana pasada (pestañas de la BASE DE DATOS LEADS) */
  try { res.llamadas = (getEquipo(true).llamadas || {}).semAnt || {}; } catch (e) { res.errores.push('Llamadas: ' + e.message); }

  /* 6) Meta Ads */
  try { res.ads = ads_actualizar(lun, dom); } catch (e) { res.errores.push('Meta Ads: ' + e.message); }
  return res;
}

/* ---------- HTML (correo y pestaña 🗓️ Semana) ---------- */

function sm_html(d) {
  const S = (v) => 'S/ ' + Math.round(v || 0).toLocaleString('en-US');
  const COL = { 'META CUMPLIDA': '#0f8a4b', 'AL DÍA': '#0f8a4b', 'EN CAMINO': '#b7791f', 'EN RIESGO': '#d03b3b' };
  const BG = { 'META CUMPLIDA': '#e3f3ea', 'AL DÍA': '#e3f3ea', 'EN CAMINO': '#fbf0d9', 'EN RIESGO': '#fae3e3' };
  const card = (t, body, color) => '<div style="background:' + (color || '#f3f2ef') + ';border-radius:16px;padding:14px 16px;margin-top:12px">' +
    (t ? '<div style="font-size:13px;font-weight:800;letter-spacing:1px;color:#52514e;margin-bottom:8px">' + t + '</div>' : '') + body + '</div>';
  const fila = (cells, bold) => '<tr>' + cells.map((c, i) => '<td' + (i ? ' align="right"' : '') + ' style="padding:5px 4px;border-bottom:1px solid #e3e2dd;font-size:14px' + (bold ? ';font-weight:800' : '') + '">' + c + '</td>').join('') + '</tr>';
  const tabla = (head, rows) => '<table width="100%" style="border-collapse:collapse">' +
    '<tr>' + head.map((c, i) => '<td' + (i ? ' align="right"' : '') + ' style="font-size:11px;color:#8a8984;font-weight:700;padding:0 4px 4px">' + c + '</td>').join('') + '</tr>' + rows.join('') + '</table>';
  const dif = (a, b) => (b ? (a >= b ? '<span style="color:#0f8a4b">▲ ' : '<span style="color:#d03b3b">▼ ') + Math.abs(Math.round((a - b) / b * 100)) + '%</span>' : '');
  const hr = (h) => (h % 12 || 12) + (h < 12 ? 'am' : 'pm');
  const T = d.tot, G = d.hoja;
  const pctMes = T.meta ? T.acum / T.meta : 0;

  let h = '<div style="max-width:640px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b0b0b;background:#fcfcfb;padding:16px">' +
    '<div style="font-size:12px;letter-spacing:2px;color:#8a8984;font-weight:700">RURUSH FITNESS CLUB · INFORME SEMANAL</div>' +
    '<div style="font-size:24px;font-weight:800;margin-top:2px">Semana ' + sm_lab(d.lun) + ' – ' + sm_lab(d.dom) + '</div>';

  // equipo
  h += '<div style="background:#24231f;color:#fff;border-radius:16px;padding:16px;margin-top:14px">' +
    '<table width="100%" style="border-collapse:collapse;color:#fff"><tr><td style="font-size:13px;font-weight:800;letter-spacing:1px">💰 VENTA DE LA SEMANA</td>' +
    '<td align="right" style="font-size:26px;font-weight:800">' + S(T.sem) + '</td></tr></table>' +
    '<div style="font-size:13px;color:#c9c8c2;margin-top:4px">Nuevos <b style="color:#fff">' + S(T.nuevos) + '</b> · Fidelización <b style="color:#fff">' + S(T.fidel) + '</b> · vs semana anterior ' + (T.ant ? dif(T.sem, T.ant).replace('#0f8a4b', '#7ee2a8').replace('#d03b3b', '#ff9a9a') + ' (' + S(T.ant) + ')' : '–') + '</div>' +
    '<div style="position:relative;height:12px;background:#4a4943;border-radius:6px;margin:12px 0 8px"><div style="height:12px;width:' + Math.min(100, pctMes * 100).toFixed(1) + '%;background:#fff;border-radius:6px"></div>' +
    '<div style="position:absolute;top:-4px;left:' + Math.min(100, d.esperado * 100).toFixed(1) + '%;width:3px;height:20px;background:#f2b84b"></div></div>' +
    '<div style="font-size:13px;color:#c9c8c2">Mes: <b style="color:#fff">' + S(T.acum) + '</b> de ' + S(T.meta) + ' · <b style="color:#fff">' + Math.round(pctMes * 100) + '%</b> · deberíamos ir en <b style="color:#fff">' + Math.round(d.esperado * 100) + '%</b> (plazo ' + sm_lab(d.plazo) + ')</div></div>';

  // por asesora
  h += card('👩‍💼 POR ASESORA', d.lista.map((a) => {
    const ll = d.llamadas && d.llamadas[a.nombre === 'MÓNICA' ? 'MONICA' : a.nombre];
    return '<div style="padding:8px 0;border-bottom:1px solid #e3e2dd">' +
      '<table width="100%" style="border-collapse:collapse"><tr><td style="font-size:17px;font-weight:800">' + a.nombre + '</td>' +
      '<td align="right"><span style="background:' + BG[a.estado] + ';color:' + COL[a.estado] + ';font-size:11px;font-weight:800;padding:3px 9px;border-radius:99px">' + a.estado + '</span></td></tr></table>' +
      '<div style="font-size:14px;margin-top:3px">Semana <b>' + S(a.sem) + '</b> ' + dif(a.sem, a.ant) + ' · nuevos ' + S(a.nuevos) + ' · fidel. ' + S(a.fidel) + '</div>' +
      '<div style="font-size:13px;color:#52514e">Mes ' + S(a.acum) + ' de ' + S(a.meta) + ' (' + Math.round(a.pct * 100) + '%) · ' +
      'agendó ' + (G.ag[dv_nom(a.nombre)] ? (G.ag[dv_nom(a.nombre)].APC + G.ag[dv_nom(a.nombre)].APV + G.ag[dv_nom(a.nombre)].APL) : 0) + ' FP · cerró ' +
      (G.ci[dv_nom(a.nombre)] ? G.ci[dv_nom(a.nombre)].cerro + '/' + G.ci[dv_nom(a.nombre)].pres : '–') + '</div>' +
      (ll ? '<div style="font-size:13px;color:#52514e">📞 ' + ll.n + ' llamadas · ' + ll.cont + ' contestaron · ' + ll.agend + ' agendados</div>' : '') +
      (a.sem === 0 ? '<div style="font-size:13px;color:#d03b3b;font-weight:700">⚠️ Sin ventas esta semana</div>' : '') + '</div>';
  }).join(''));

  // embudo
  const fpNo = G.fpP - G.fpA;
  h += card('🎟️ FREE PASS DE LA SEMANA', tabla(['', 'Cantidad', '%'], [
    fila(['Programados', G.fpP, '']),
    fila(['Asistieron', G.fpA, sm_pct(G.fpA, G.fpP) + '%']),
    fila(['Se inscribieron', G.cerro, sm_pct(G.cerro, G.fpA) + '% de los que vinieron'], true)
  ]) + '<div style="font-size:13px;color:#52514e;margin-top:6px">' + fpNo + ' no vinieron · Nutrición: ' + G.nutA + ' de ' + G.nutC + ' citas asistieron</div>');

  // canal / coach / horas
  if (d.canal) {
    const C = d.canal;
    h += card('📍 CANAL DEL FREE PASS (mes)', tabla(['Canal', 'Agendaron', 'Vinieron', 'Inscritos'],
      [['Chat', 'APC'], ['Visita', 'APV'], ['Llamada', 'APL']].map((x) => fila([x[0], C[x[1]].ag, C[x[1]].pa + ' (' + sm_pct(C[x[1]].pa, C[x[1]].ag) + '%)', C[x[1]].ins]))));
  }
  if (d.coach && d.coach.length) {
    const reales = d.coach.filter((c) => c.coach !== 'SIN COACH FP' && c.fp >= 2);
    const mejor = reales.slice().sort((a, b) => b.pct - a.pct)[0], peor = reales.slice().sort((a, b) => a.pct - b.pct)[0];
    h += card('🏋️ CIERRE POR COACH (mes · solo FP que vinieron)', tabla(['Coach', 'FP', 'Cierres', '% cierre'],
      d.coach.map((c) => fila([c.coach + (mejor && c.coach === mejor.coach ? ' 🥇' : '') + (peor && peor !== mejor && c.coach === peor.coach ? ' 🔻' : ''), c.fp, c.cierres, c.pct + '%'])))
      + '<div style="font-size:11px;color:#8a8984;margin-top:4px">Con menos de 2 FP no se marca mejor/peor (muestra chica).</div>');
  }
  if (d.horas && d.horas.pasaron.length) {
    h += card('⏰ HORAS QUE MÁS RINDEN (mes)', '<div style="font-size:14px">Más clases: ' + d.horas.pasaron.map((x) => '<b>' + hr(x.h) + '</b> (' + x.n + ')').join(' · ') + '</div>' +
      (d.horas.inscritos.length ? '<div style="font-size:14px;margin-top:4px">Más inscritos: ' + d.horas.inscritos.map((x) => '<b>' + hr(x.h) + '</b> (' + x.n + ')').join(' · ') + '</div>' : ''));
  }

  // socios
  if (d.vencidos) {
    const ren = d.vencidos.filter((x) => x.renovo).length;
    const lista = (arr, extra) => arr.slice(0, 8).map((x) => '<div style="font-size:13px;padding:2px 0">' + (x.renovo ? '✅ ' : (x.sinVenir != null && x.sinVenir > 14 ? '🔴 ' : '🟡 ')) +
      '<b>' + x.nombre + '</b> · ' + (DV_NOMBRE[x.ase] || x.ase) + ' · ' + extra(x) + ' · ' + (x.sinVenir == null ? 'sin dato' : x.sinVenir === 0 ? 'vino hoy' : x.sinVenir + ' días sin venir') + '</div>').join('') +
      (arr.length > 8 ? '<div style="font-size:12px;color:#8a8984">… y ' + (arr.length - 8) + ' más</div>' : '');
    h += card('📅 SOCIOS QUE VENCIERON (' + d.vencidos.length + ' · ' + ren + ' ya renovaron)', lista(d.vencidos, (x) => 'venció ' + sm_lab(x.fin)) || '<div style="font-size:13px">Nadie venció esta semana.</div>');
    h += card('🔁 POR RENOVAR EN 10-30 DÍAS (' + d.renovar.length + ')', lista(d.renovar, (x) => 'vence ' + sm_lab(x.fin)) || '<div style="font-size:13px">Nadie en ese rango.</div>');
  }

  // retención
  if (d.retencion) {
    const R = d.retencion, pg = sm_pct(R.tot.vinieron, R.tot.activos);
    h += card('🔥 RETENCIÓN DE USO (vinieron la semana pasada · meta ' + Math.round(SM_RET_META * 100) + '%)',
      '<div style="font-size:15px;margin-bottom:6px">Global: <b style="color:' + (pg >= SM_RET_META * 100 ? '#0f8a4b' : '#d03b3b') + '">' + pg + '%</b> (' + R.tot.vinieron + ' de ' + R.tot.activos + ' activos)</div>' +
      tabla(['Asesora', 'Activos', 'Vinieron', '%'], ['MONICA', 'LAURA', 'DANNA'].filter((a) => R.porAse[a]).map((a) => {
        const r = R.porAse[a], p = sm_pct(r.vinieron, r.activos);
        return fila([DV_NOMBRE[a], r.activos, r.vinieron, '<b style="color:' + (p >= SM_RET_META * 100 ? '#0f8a4b' : '#d03b3b') + '">' + p + '%</b>']);
      })) +
      ['MONICA', 'LAURA', 'DANNA'].filter((a) => R.porAse[a] && R.porAse[a].no.length).map((a) =>
        '<div style="font-size:12px;color:#52514e;margin-top:4px">' + DV_NOMBRE[a] + ' – llamar: ' + R.porAse[a].no.map((x) => x.nombre + ' (' + (x.dias == null ? 'nunca' : x.dias + 'd') + ')').join(', ') + '</div>').join(''));
  }

  // Meta Ads
  if (d.ads) h += ads_html(d.ads);

  // recomendaciones por reglas
  const rec = [];
  const cero = d.lista.filter((a) => a.sem === 0).map((a) => a.nombre);
  if (cero.length) rec.push('🔴 <b>' + cero.join(', ') + '</b> no vendió esta semana: revisar su lista de FP y llamadas del lunes.');
  const riesgo = d.lista.filter((a) => a.estado === 'EN RIESGO').map((a) => a.nombre);
  if (riesgo.length) rec.push('⚠️ En riesgo de meta: <b>' + riesgo.join(', ') + '</b>. Faltan ' + S(Math.max(0, T.meta - T.acum)) + ' para el equipo.');
  if (G.fpP && G.fpA / G.fpP < 0.5) rec.push('🎟️ Solo vino el ' + sm_pct(G.fpA, G.fpP) + '% de los FP: reforzar el recordatorio 2h antes y confirmar por llamada.');
  if (G.fpA && G.cerro / G.fpA < 0.5) rec.push('💳 Se inscribió el ' + sm_pct(G.cerro, G.fpA) + '% de los que vinieron: revisar el cierre en la clase (coach + asesora).');
  if (d.renovar && d.renovar.length) rec.push('🔁 ' + d.renovar.length + ' socios vencen en 10-30 días: empezar por los que menos vienen (🔴).');
  if (d.retencion && d.retencion.tot.activos && d.retencion.tot.vinieron / d.retencion.tot.activos < SM_RET_META) rec.push('🔥 Retención bajo la meta: llamar a los que llevan más días sin venir.');
  if (rec.length) h += card('✅ QUÉ HACER ESTA SEMANA', rec.map((x) => '<div style="font-size:14px;padding:3px 0">' + x + '</div>').join(''), '#e3f3ea');

  if (d.errores.length) h += card('⚠️ NO SE PUDO LEER', d.errores.map((e) => '<div style="font-size:13px">' + e + '</div>').join(''), '#fae3e3');
  h += '<div style="font-size:11px;color:#9a9994;margin-top:12px">Semana = lunes a domingo. Ventas: DATOS_ORIGEN. Metas: Mónica 18k · Danna 11k · Laura 11k (Dashboard.gs). ' +
    'Embudo y cierres: pestaña del mes de la Hoja de Reportes. Canal, coach y horas: Pipedrive. Retención: Apps Fit. Generado ' + Utilities.formatDate(new Date(), 'America/Lima', 'dd/MM HH:mm') + '.</div></div>';
  return h;
}

/* ---------- guardar / web / correo ---------- */

// El HTML se guarda en partes (cada Propiedad admite ~9 KB) para que la pestaña lo muestre sin recalcular.
function sm_guardar(html) {
  const pr = PropertiesService.getScriptProperties();
  Object.keys(pr.getProperties()).filter((k) => /^SM_HTML_/.test(k)).forEach((k) => pr.deleteProperty(k));
  const o = {};
  for (let i = 0, n = 0; i < html.length; i += 8000, n++) o['SM_HTML_' + n] = html.slice(i, i + 8000);
  pr.setProperties(o);
}
function getSemanal(forzar) {
  if (!forzar) {
    const p = PropertiesService.getScriptProperties().getProperties();
    const ks = Object.keys(p).filter((k) => /^SM_HTML_/.test(k)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)));
    if (ks.length) return ks.map((k) => p[k]).join('');
  }
  const html = sm_html(sm_datos());
  sm_guardar(html);
  return html;
}

function sm_enviarCorreo(prueba) {
  const d = sm_datos();
  const html = sm_html(d);
  sm_guardar(html);
  MailApp.sendEmail({
    to: DV_CORREO,
    subject: (prueba === true ? '📊 PRUEBA · ' : '📊 ') + 'Semana ' + sm_lab(d.lun) + '–' + sm_lab(d.dom) + ' · ' + 'S/ ' + Math.round(d.tot.sem).toLocaleString('en-US') +
      ' · mes ' + Math.round(d.tot.acum / Math.max(1, d.tot.meta) * 100) + '% de la meta',
    htmlBody: html,
    name: 'RURUSH Hoy'
  });
  return d;
}

/* Ejecutar UNA vez: programa el correo de los lunes 7:15 am y manda uno de prueba ahora. */
function sm_instalar() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sm_enviarCorreo')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sm_enviarCorreo').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).nearMinute(15).inTimezone('America/Lima').create();
  const d = sm_enviarCorreo(true);
  Logger.log('Listo: informe de prueba enviado a ' + DV_CORREO + '. Semana ' + d.lun + '..' + d.dom + ' · venta S/ ' + Math.round(d.tot.sem) +
    ' · FP ' + d.hoja.fpP + '>' + d.hoja.fpA + '>' + d.hoja.cerro + (d.errores.length ? ' · ERRORES: ' + d.errores.join(' | ') : ' · sin errores'));
}

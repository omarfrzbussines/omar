/* 📊 EMBUDO — pestaña de la app Free Pass (solo el link de OMAR). Solo LEE Pipedrive.
   Embudo 14 "EMBUDO RURUSH 2026": 71 NUEVO LEAD · 72 CONTACTADO · 73 CLASE AGENDADA · 89 NO VINO ·
   74 VINO A CLASE · 75 EN DECISIÓN · 76 EMPEZÓ PLAN, más ganados (won) y perdidos (lost).
   Los tratos los mueve el bot del servidor cada 30 min; aquí no se mueve nada.

   Llamadas a Pipedrive (pocas):
   - /pipelines/14/deals?status=all_not_deleted, paginado de 500 → en caché 10 min (todo el embudo).
   - Responsable y celular de las personas: /api/v2/persons?ids=… de 100 en 100 → en caché 6 h por persona.
   - Si a alguien le falta RESPONSABLE: la asesora del asunto del FP (FP DANNA APC → DANNA).
   - El resultado de cada periodo también queda en caché 10 min. */

const EMB_PIPE = 14;
const EMB_NIVEL = { 71: 0, 72: 1, 73: 2, 89: 2, 74: 3, 75: 3, 76: 4 };   // hasta dónde llegó (2 = agendó, 3 = vino, 4 = inscrito)
const EMB_DECISION = 75, EMB_NO_VINO = 89, EMB_EMPEZO = 76;
const EMB_CAMPO_RESP = 'bd19132d49c01541250d77ca078154015e4d7e63';      // campo de persona RESPONSABLE
const EMB_V2 = 'https://api.pipedrive.com/api/v2';
const EMB_ASESORAS = ['BOT', 'DANNA', 'LAURA', 'CIELO', 'MONICA', 'OMAR', 'DILAN'];   // del asunto del FP solo se aceptan estos nombres
const EMB_SEG = 600;                                                      // 10 min

// "2026-10-23 18:43:57" (UTC) → ms
const emb_ms_ = (t) => (t ? Date.parse(String(t).replace(' ', 'T') + 'Z') : 0);
const emb_diaLima_ = (ms) => new Date(ms + LIMA * 3600e3).toISOString().slice(0, 10);

/** Todo el embudo 14 (campos justos), 10 min en caché.
    OJO: /v1/pipelines/14/deals solo devuelve los ABIERTOS (ignora status): por eso se usa /api/v2/deals,
    que sí trae abiertos + ganados + perdidos. Y como una persona puede tener varios tratos en el embudo
    (duplicados), se deja UNO por persona: ganado > perdido > el abierto más avanzado. */
const EMB_ORDEN = { 71: 1, 72: 2, 73: 3, 89: 4, 74: 5, 75: 6, 76: 7 };
function emb_tratos_() {
  const c = hoy_cacheGet_('fpEmbTratos2');
  if (c) return c;
  const todos = [];
  let cursor = '';
  for (let v = 0; v < 40; v++) {
    const r = UrlFetchApp.fetch(EMB_V2 + '/deals?pipeline_id=' + EMB_PIPE + '&status=open,won,lost&limit=500' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
      { muteHttpExceptions: true, headers: { 'x-api-token': token('PIPEDRIVE_TOKEN') } });
    const j = JSON.parse(r.getContentText() || '{}');
    if (r.getResponseCode() >= 300 || j.success === false) throw new Error((j && j.error) || 'Pipedrive respondió ' + r.getResponseCode() + '.');
    (j.data || []).forEach(function (d) {
      if (d.is_deleted) return;
      const add = Date.parse(d.add_time) || 0;
      todos.push({ id: d.id, add: add, st: d.stage_id, est: d.status, pid: d.person_id || null, nom: d.title || '', cambio: Date.parse(d.stage_change_time) || add, fp: '' });
    });
    cursor = j.additional_data && j.additional_data.next_cursor;
    if (!cursor) break;
  }
  // uno por persona
  const peso = (d) => (d.est === 'won' ? 100 : d.est === 'lost' ? 50 : 0) + (EMB_ORDEN[d.st] || 0);
  const porPersona = {}, sueltos = [];
  todos.forEach(function (d) {
    if (!d.pid) return sueltos.push(d);
    const y = porPersona[d.pid];
    if (!y) { porPersona[d.pid] = Object.assign({ primero: d.add }, d); return; }
    const primero = Math.min(y.primero, d.add);   // el lead nació con su primer trato
    if (peso(d) > peso(y) || (peso(d) === peso(y) && d.add > y.add)) porPersona[d.pid] = Object.assign({}, d, { primero: primero });
    else y.primero = primero;
  });
  const out = Object.keys(porPersona).map(function (k) { const d = porPersona[k]; d.add = d.primero; delete d.primero; return d; }).concat(sueltos);
  try { hoy_cachePut_('fpEmbTratos2', out, EMB_SEG); } catch (e) {}
  return out;
}

/** Opciones del campo RESPONSABLE (id → nombre), 6 h en caché. */
function emb_respOps_() {
  const cache = CacheService.getScriptCache(), c = cache.get('fpEmbResp');
  if (c) return JSON.parse(c);
  const f = (fp_pd_('get', '/personFields?limit=500') || []).filter(function (x) { return x.key === EMB_CAMPO_RESP; })[0];
  const o = {}; ((f && f.options) || []).forEach(function (x) { o[String(x.id)] = String(x.label).toUpperCase().trim(); });
  cache.put('fpEmbResp', JSON.stringify(o), 21600);
  return o;
}

/** Responsable y celular de cada persona: de 100 en 100 (v2). Todas las personas van en UNA entrada
    comprimida de la caché (6 h): con miles de personas, guardarlas una por una hacía que la caché las fuera botando. */
function emb_personas_(pids) {
  pids = pids.filter(function (x, i, z) { return x && z.indexOf(x) === i; });
  const guardado = hoy_cacheGet_('fpEmbPers2') || {}, out = {}, faltan = [];
  pids.forEach(function (i) { if (guardado[i]) out[i] = guardado[i]; else faltan.push(i); });
  if (!faltan.length) return out;
  const ops = emb_respOps_(), tk = token('PIPEDRIVE_TOKEN');
  for (let k = 0; k < faltan.length; k += 1000) {
    const grupos = [];
    for (let g = k; g < Math.min(k + 1000, faltan.length); g += 100) grupos.push(faltan.slice(g, g + 100));
    const rs = UrlFetchApp.fetchAll(grupos.map(function (ids) {
      return { url: EMB_V2 + '/persons?limit=100&ids=' + ids.join(','), headers: { 'x-api-token': tk }, muteHttpExceptions: true };
    }));
    rs.forEach(function (r, n) {
      let data = [];
      try { data = JSON.parse(r.getContentText()).data || []; } catch (e) {}
      const vistos = {};
      data.forEach(function (p) {
        const cf = p.custom_fields || {}, rv = cf[EMB_CAMPO_RESP];
        const rid = rv && typeof rv === 'object' ? rv.id : rv;
        const tel = ((p.phones || []).map(function (x) { return String(x.value || '').replace(/\D/g, ''); }).filter(String))[0] || '';
        out[p.id] = guardado[p.id] = { r: rid != null ? (ops[String(rid)] || '') : '', t: tel, n: String(p.name || '') };
        vistos[p.id] = 1;
      });
      grupos[n].forEach(function (i) { if (!vistos[i] && !out[i]) out[i] = guardado[i] = { r: '', t: '' }; });   // borrada o sin acceso
    });
  }
  try { hoy_cachePut_('fpEmbPers2', guardado, 21600); } catch (e) {}
  return out;
}

// nombre de asesora "limpio" (sin tilde, DANA → DANNA); '' si no es una asesora conocida
function emb_ok_(n) {
  n = String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  if (n === 'DANA') n = 'DANNA';
  return EMB_ASESORAS.indexOf(n) >= 0 ? n : '';
}
const emb_dias_ = (d, ahora) => Math.max(0, Math.floor((ahora - d.cambio) / 864e5));

/** Números de un periodo para TODAS las asesoras (10 min en caché). Cada quien ve después solo lo suyo. */
function emb_periodo_(desde, hasta) {
  const clave = 'fpEmb3_' + desde + '_' + hasta;
  const c = hoy_cacheGet_(clave);
  if (c) return c;
  const hoy = fechaLima(0), todos = emb_tratos_(), ahora = Date.now();
  const del = todos.filter(function (d) { const f = emb_diaLima_(d.add); return f >= desde && f <= hasta; });
  const decision = todos.filter(function (d) { return d.st === EMB_DECISION && d.est === 'open'; });
  const per = emb_personas_(del.concat(decision).map(function (d) { return d.pid; }));

  // sin RESPONSABLE → asesora del asunto del FP (próxima actividad del trato, o el FP del periodo)
  let fpDe = null;
  const aseDe = function (d) {
    const p = per[d.pid] || {};
    if (p.r) return emb_ok_(p.r) || p.r;
    if (emb_ok_(d.fp)) return emb_ok_(d.fp);
    if (!fpDe) {
      fpDe = {};
      try {
        fp_acts_('meeting', desde, fp_mas_(hoy, 14)).forEach(function (a) {
          const n = emb_ok_(asesoraDeAsunto(a.asunto));
          if (a.personId && /^\s*FP\b/i.test(a.asunto) && n) fpDe[a.personId] = n;
        });
      } catch (e) {}
    }
    return fpDe[d.pid] || 'SIN ASESORA';
  };

  const nuevo = () => ({ leads: 0, agend: 0, vino: 0, insc: 0, noVino: 0, perdidos: 0 });
  const tot = nuevo(), porAse = {};
  del.forEach(function (d) {
    const ganado = d.est === 'won', insc = ganado || (d.est === 'open' && d.st === EMB_EMPEZO);
    const nivel = insc ? 4 : (EMB_NIVEL[d.st] != null ? EMB_NIVEL[d.st] : 0);
    const ase = aseDe(d);
    [tot, porAse[ase] = porAse[ase] || nuevo()].forEach(function (x) {
      x.leads++;
      if (nivel >= 2) x.agend++;
      if (nivel >= 3) x.vino++;
      if (insc) x.insc++;
      if (d.st === EMB_NO_VINO && !ganado) x.noVino++;
      if (d.est === 'lost') x.perdidos++;
    });
  });
  const lista = decision.map(function (d) {
    const p = per[d.pid] || {};
    return { nombre: p.n || d.nom, tel: p.t || '', ase: emb_ok_(p.r) || p.r || emb_ok_(d.fp) || '', dias: emb_dias_(d, ahora) };
  }).sort(function (a, b) { return b.dias - a.dias; });
  const res = { desde: desde, hasta: hasta, total: tot, porAse: porAse, decision: lista, hora: Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm') };
  try { hoy_cachePut_(clave, res, EMB_SEG); } catch (e) {}
  return res;
}

/** Pestaña 📊 Embudo: tratos CREADOS entre desde y hasta (add_time, hora Perú).
    Omar ve todo; cada asesora ve SOLO lo suyo + el ranking del equipo. */
function fp_embudo(llave, pc, desde, hasta) {
  const quien = fp_quien_(llave, pc), esOmar = quien === 'OMAR';
  const hoy = fechaLima(0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) throw new Error('Elige las fechas.');
  if (hasta > hoy) hasta = hoy;
  if (desde > hasta) throw new Error('La fecha inicial es posterior a la final.');
  if (Date.parse(hasta) - Date.parse(desde) > 186 * 864e5) throw new Error('Máximo 6 meses por consulta.');
  const P = emb_periodo_(desde, hasta), yo = emb_ok_(quien) || quien;
  const vacio = { leads: 0, agend: 0, vino: 0, insc: 0, noVino: 0, perdidos: 0 };
  const ranking = Object.keys(P.porAse).filter(function (k) { return k !== 'SIN ASESORA' && k !== 'OMAR'; })
    .map(function (k) { const x = P.porAse[k]; return { nombre: k, agend: x.agend, vino: x.vino, insc: x.insc, yo: k === yo }; })
    .sort(function (x, y) { return y.insc - x.insc || y.vino - x.vino || y.agend - x.agend; });
  const dec = esOmar ? P.decision : P.decision.filter(function (x) { return x.ase === yo; });
  return {
    desde: P.desde, hasta: P.hasta, hora: P.hora, esOmar: esOmar, yo: yo,
    total: esOmar ? P.total : (P.porAse[yo] || vacio),
    asesoras: esOmar ? Object.keys(P.porAse).map(function (k) { return Object.assign({ nombre: k }, P.porAse[k]); })
      .sort(function (x, y) { return y.insc - x.insc || y.vino - x.vino || y.agend - x.agend || y.leads - x.leads; }) : [],
    ranking: ranking,
    decision: { n: dec.length, lista: dec.slice(0, 30) }
  };
}

/** 🗂️ Tablero: tratos ABIERTOS por etapa. Asesora = solo los suyos; Omar = todos o la asesora que elija.
    Por columna: cuántos hay y las 15 tarjetas más urgentes (hasta Clase agendada: los más nuevos primero; de No vino en adelante: los más atascados). */
const EMB_PLAZO = { 71: 1, 72: 3, 73: 7, 89: 2, 74: 2, 75: 5 };   // días en la etapa antes de marcarla atrasada
const EMB_COLS = [[71, 'Nuevo lead'], [72, 'Contactado'], [73, 'Clase agendada'], [89, 'No vino (reagendar)'], [74, 'Vino a clase'], [75, 'En decisión'], [76, 'Empezó plan']];
function fp_tablero(llave, pc, filtro) {
  const quien = fp_quien_(llave, pc), esOmar = quien === 'OMAR';
  const ver = esOmar ? (emb_ok_(filtro) || (filtro === 'SIN ASESORA' ? 'SIN ASESORA' : '')) : (emb_ok_(quien) || quien);
  const clave = 'fpTab3_' + (ver || 'TODAS');
  const c = hoy_cacheGet_(clave);
  if (c) return Object.assign(c, { esOmar: esOmar });
  const ahora = Date.now(), abiertos = emb_tratos_().filter(function (d) { return d.est === 'open' && EMB_NIVEL[d.st] != null; });
  const per = emb_personas_(abiertos.map(function (d) { return d.pid; }));
  const aseDe = (d) => { const p = per[d.pid] || {}; return emb_ok_(p.r) || p.r || emb_ok_(d.fp) || 'SIN ASESORA'; };
  const mios = ver ? abiertos.filter(function (d) { return aseDe(d) === ver; }) : abiertos;
  const cols = EMB_COLS.map(function (col) {
    const l = mios.filter(function (d) { return d.st === col[0]; }).map(function (d) {
      const p = per[d.pid] || {};
      return { nombre: p.n || d.nom, tel: p.t || '', telM: fp_mascara_(p.t), dias: emb_dias_(d, ahora), ase: aseDe(d) };
    });
    const frescos = [71, 72, 73].indexOf(col[0]) >= 0;   // antes de la clase: lo más nuevo está más caliente
    l.sort(function (a, b) { return frescos ? a.dias - b.dias : b.dias - a.dias; });
    const plazo = EMB_PLAZO[col[0]];
    return { id: col[0], nombre: col[1], n: l.length, plazo: plazo == null ? null : plazo,
      tarde: plazo == null ? 0 : l.filter(function (x) { return x.dias > plazo; }).length, cards: l.slice(0, 15) };
  });
  const res = { ver: ver, cols: cols, total: mios.length,
    tarde: cols.reduce(function (t, c) { return t + c.tarde; }, 0),
    sinAse: mios.filter(function (d) { return aseDe(d) === 'SIN ASESORA'; }).length,
    hora: Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm') };
  try { hoy_cachePut_(clave, res, EMB_SEG); } catch (e) {}
  return Object.assign(res, { esOmar: esOmar });
}

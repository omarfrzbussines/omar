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

/** Todo el embudo 14 (campos justos), 10 min en caché. */
function emb_tratos_() {
  const c = hoy_cacheGet_('fpEmbTratos');
  if (c) return c;
  const out = [];
  for (let start = 0, v = 0; v < 40; v++) {
    const r = UrlFetchApp.fetch(PIPEDRIVE_BASE + '/pipelines/' + EMB_PIPE + '/deals?status=all_not_deleted&limit=500&start=' + start,
      { muteHttpExceptions: true, headers: { 'x-api-token': token('PIPEDRIVE_TOKEN') } });
    const j = JSON.parse(r.getContentText() || '{}');
    if (r.getResponseCode() >= 300 || j.success === false) throw new Error((j && j.error) || 'Pipedrive respondió ' + r.getResponseCode() + '.');
    (j.data || []).forEach(function (d) {
      const pid = d.person_id && typeof d.person_id === 'object' ? d.person_id.value : d.person_id;
      out.push({ id: d.id, add: emb_ms_(d.add_time), st: d.stage_id, est: d.status, pid: pid || null,
        nom: d.person_name || d.title || '', cambio: emb_ms_(d.stage_change_time) || emb_ms_(d.add_time),
        fp: /^\s*FP\b/i.test(d.next_activity_subject || '') ? asesoraDeAsunto(d.next_activity_subject) : '' });
    });
    const pg = j.additional_data && j.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  try { hoy_cachePut_('fpEmbTratos', out, EMB_SEG); } catch (e) {}
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

/** Responsable y celular de cada persona: de 100 en 100 (v2), 6 h en caché por persona. */
function emb_personas_(pids) {
  const cache = CacheService.getScriptCache(), out = {}, faltan = [];
  pids = pids.filter(function (x, i, z) { return x && z.indexOf(x) === i; });
  for (let k = 0; k < pids.length; k += 500) {
    const lote = pids.slice(k, k + 500), ya = cache.getAll(lote.map(function (i) { return 'fpEmbP' + i; }));
    lote.forEach(function (i) { const v = ya['fpEmbP' + i]; if (v) out[i] = JSON.parse(v); else faltan.push(i); });
  }
  if (!faltan.length) return out;
  const ops = emb_respOps_(), tk = token('PIPEDRIVE_TOKEN');
  for (let k = 0; k < faltan.length; k += 1000) {
    const grupos = [];
    for (let g = k; g < Math.min(k + 1000, faltan.length); g += 100) grupos.push(faltan.slice(g, g + 100));
    const rs = UrlFetchApp.fetchAll(grupos.map(function (ids) {
      return { url: EMB_V2 + '/persons?limit=100&ids=' + ids.join(','), headers: { 'x-api-token': tk }, muteHttpExceptions: true };
    }));
    const guardar = {};
    rs.forEach(function (r, n) {
      let data = [];
      try { data = JSON.parse(r.getContentText()).data || []; } catch (e) {}
      const vistos = {};
      data.forEach(function (p) {
        const cf = p.custom_fields || {}, rv = cf[EMB_CAMPO_RESP];
        const rid = rv && typeof rv === 'object' ? rv.id : rv;
        const tel = ((p.phones || []).map(function (x) { return String(x.value || '').replace(/\D/g, ''); }).filter(String))[0] || '';
        out[p.id] = { r: rid != null ? (ops[String(rid)] || '') : '', t: tel };
        guardar['fpEmbP' + p.id] = JSON.stringify(out[p.id]);
        vistos[p.id] = 1;
      });
      grupos[n].forEach(function (i) { if (!vistos[i] && !out[i]) out[i] = { r: '', t: '' }; });   // borrada o sin acceso
    });
    try { cache.putAll(guardar, 21600); } catch (e) {}
  }
  return out;
}

/** Pestaña 📊 Embudo: tratos CREADOS entre desde y hasta (add_time, hora Perú). */
function fp_embudo(llave, pc, desde, hasta) {
  if (fp_quien_(llave, pc) !== 'OMAR') throw new Error('Solo Omar ve el embudo.');
  const hoy = fechaLima(0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) throw new Error('Elige las fechas.');
  if (hasta > hoy) hasta = hoy;
  if (desde > hasta) throw new Error('La fecha inicial es posterior a la final.');
  if (Date.parse(hasta) - Date.parse(desde) > 186 * 864e5) throw new Error('Máximo 6 meses por consulta.');
  const clave = 'fpEmb_' + desde + '_' + hasta;
  const c = hoy_cacheGet_(clave);
  if (c) return c;

  const todos = emb_tratos_(), ahora = Date.now();
  const del = todos.filter(function (d) { const f = emb_diaLima_(d.add); return f >= desde && f <= hasta; });
  const decision = todos.filter(function (d) { return d.st === EMB_DECISION && d.est === 'open'; });
  const per = emb_personas_(del.concat(decision).map(function (d) { return d.pid; }));

  // sin RESPONSABLE → asesora del asunto del FP (próxima actividad del trato, o el FP del periodo)
  let fpDe = null;
  const aseDe = function (d) {
    const p = per[d.pid] || {};
    if (p.r) return p.r;
    const ok = (n) => { n = String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); if (n === 'DANA') n = 'DANNA'; return EMB_ASESORAS.indexOf(n) >= 0 ? n : ''; };
    if (ok(d.fp)) return ok(d.fp);
    if (!fpDe) {
      fpDe = {};
      try {
        fp_acts_('meeting', desde, fp_mas_(hoy, 14)).forEach(function (a) {
          if (a.personId && /^\s*FP\b/i.test(a.asunto) && ok(asesoraDeAsunto(a.asunto))) fpDe[a.personId] = ok(asesoraDeAsunto(a.asunto));
        });
      } catch (e) {}
    }
    return fpDe[d.pid] || 'SIN ASESORA';
  };

  const nuevo = () => ({ leads: 0, agend: 0, vino: 0, insc: 0 });
  const tot = Object.assign(nuevo(), { noVino: 0, perdidos: 0 }), porAse = {};
  del.forEach(function (d) {
    const ganado = d.est === 'won', insc = ganado || (d.est === 'open' && d.st === EMB_EMPEZO);
    const nivel = insc ? 4 : (EMB_NIVEL[d.st] != null ? EMB_NIVEL[d.st] : 0);
    const ase = aseDe(d), fil = [tot, porAse[ase] = porAse[ase] || nuevo()];
    fil.forEach(function (x) {
      x.leads++;
      if (nivel >= 2) x.agend++;
      if (nivel >= 3) x.vino++;
      if (insc) x.insc++;
    });
    if (d.st === EMB_NO_VINO && !ganado) tot.noVino++;
    if (d.est === 'lost') tot.perdidos++;
  });

  const lista = decision.map(function (d) {
    const p = per[d.pid] || {};
    return { nombre: d.nom, tel: p.t || '', ase: p.r || d.fp || '', dias: Math.max(0, Math.floor((ahora - d.cambio) / 864e5)) };
  }).sort(function (a, b) { return b.dias - a.dias; });

  const res = {
    desde: desde, hasta: hasta, total: tot,
    asesoras: Object.keys(porAse).map(function (k) { return Object.assign({ nombre: k }, porAse[k]); })
      .sort(function (x, y) { return y.insc - x.insc || y.vino - x.vino || y.agend - x.agend || y.leads - x.leads; }),
    decision: { n: lista.length, lista: lista.slice(0, 30) },
    hora: Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm')
  };
  try { hoy_cachePut_(clave, res, EMB_SEG); } catch (e) {}
  return res;
}

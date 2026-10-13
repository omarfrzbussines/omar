/* RURUSH — Pipedrive al día con AppsFit (corre solo cada noche, 0 tokens).
   Fuente de verdad: la hoja '3. BASE DE SOCIOS' (copia de AppsFit) del archivo VENTAS RETENCIÓN 2026 V2 (NU_BASE_ID).
   Por cada socio busca su ficha en Pipedrive (celular y DNI) y corrige SOLO lo seguro:
     - organización: plan vigente → ALUMNOS ACTIVOS; plan vencido → ALUMNOS INACTIVOS ACTUALIZADO
     - DNI vacío en Pipedrive → el de AppsFit
     - nombre que no es real (@usuario, +51…, emojis, una sola palabra) → el de AppsFit
   No toca fichas cuando el celular lo comparten familiares, cuando dos socios apuntan a la misma ficha
   ni cuando hay varias fichas posibles: eso va a la pestaña '🔗 PIPEDRIVE' para que lo revise una persona.
   ss_revisar() = solo muestra lo que haría.  ss_aplicar() = lo hace.  ss_instalar() = programa ss_aplicar a las 11 pm. */

const SS_ORG_ACT = 2467;            // ALUMNOS ACTIVOS
const SS_ORG_ACT2 = 2475;           // ALUMNOS ACTIVO (duplicada, se va vaciando)
const SS_ORG_INACT = 2500;          // ALUMNOS INACTIVOS ACTUALIZADO
const SS_DNI = '7628cddc6b7d5d642ae68842913c53591a50ca02';
const SS_TAB = '🔗 PIPEDRIVE';
const SS_URL = 'https://rurushfitnessclub.pipedrive.com/person/';

function ss_revisar() { return ss_correr_(false); }
function ss_aplicar() { return ss_correr_(true); }
function ss_instalar() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === 'ss_aplicar').forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('ss_aplicar').timeBased().atHour(23).everyDays(1).inTimezone('America/Lima').create();
  Logger.log('Listo: ss_aplicar correrá todos los días a las 11 pm.');
}

/* ---------- utilidades ---------- */
function ss_hoyLima() { return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); }
function ss_fecha(v) {               // "26/8/2026" | "2026-08-30" → "2026-08-26"
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + nu_pad(m[2]) + '-' + nu_pad(m[1]) : '';
}
function ss_dni(v) { const t = String(v || '').replace(/\D/g, '').replace(/^0+/, ''); return t.length >= 6 && t.length <= 8 ? t : ''; }
function ss_palabras(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-zñ]+/).filter((w) => w.length > 2);
}
function ss_parecidos(a, b) { const x = ss_palabras(a); return ss_palabras(b).some((w) => x.indexOf(w) >= 0); }
function ss_raro(n) { n = String(n || '').trim(); return /^[@+\W]/.test(n) || n.split(/\s+/).length < 2 || /[^\w\s.,'\-áéíóúñüÁÉÍÓÚÑÜ]/.test(n); }
function ss_titulo(n) { return String(n).replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()); }
// varias llamadas a Pipedrive en paralelo, en tandas (respeta el límite de la API)
function ss_lote(reqs) {
  const tok = nu_props().getProperty('PIPEDRIVE_TOKEN'), out = [];
  for (let i = 0; i < reqs.length; i += 15) {
    const tanda = reqs.slice(i, i + 15).map((r) => Object.assign({ url: 'https://api.pipedrive.com/v1' + r.path, headers: { 'x-api-token': tok }, muteHttpExceptions: true }, r.opt || {}));
    UrlFetchApp.fetchAll(tanda).forEach((res) => { let j = {}; try { j = JSON.parse(res.getContentText()); } catch (e) { /* vacío */ } out.push(res.getResponseCode() < 300 && j.success !== false ? j : { error: res.getResponseCode() }); });
    Utilities.sleep(900);
  }
  return out;
}

/* ---------- el cruce ---------- */
function ss_correr_(aplicar) {
  const hoy = ss_hoyLima();
  const filas = Sheets.Spreadsheets.Values.get(NU_BASE_ID, "'3. BASE DE SOCIOS'!B6:T1001").values || [];
  const socios = filas.filter((r) => r[1] && String(r[1]).trim()).map((r) => ({
    cod: r[0], nombre: String(r[1]).trim(), cel: nu_tel(r[2]), celRaw: String(r[2] || ''), dni: ss_dni(r[3]), fin: ss_fecha(r[7]), asesora: r[11] || ''
  }));
  socios.forEach((s) => { s.vig = !!s.fin && s.fin >= hoy; });
  const uso = {}; socios.forEach((s) => { if (s.cel) uso[s.cel] = (uso[s.cel] || 0) + 1; });

  // 1) candidatas por celular y por DNI
  const busq = [];
  socios.forEach((s, i) => {
    if (s.cel) busq.push({ i: i, path: '/persons/search?limit=10&exact_match=false&fields=phone&term=' + s.cel });
    if (s.dni) busq.push({ i: i, path: '/persons/search?limit=10&fields=custom_fields&term=' + s.dni });
  });
  const ids = {};
  ss_lote(busq).forEach((j, k) => {
    (((j.data || {}).items) || []).forEach((it) => { (socios[busq[k].i].cands = socios[busq[k].i].cands || {})[it.item.id] = 1; ids[it.item.id] = 1; });
  });
  // 2) detalle de cada ficha candidata + todas las de las organizaciones de activos
  const P = {};
  const ficha = (p) => ({ id: p.id, name: p.name || '', dni: ss_dni(p[SS_DNI]), org: p.org_id && p.org_id.value ? Number(p.org_id.value) : 0,
                          tels: (p.phone || []).map((x) => nu_tel(x.value)).filter(String) });
  [SS_ORG_ACT, SS_ORG_ACT2].forEach((org) => {
    for (let start = 0, v = 0; v < 20; v++) {
      const j = nu_pd('/organizations/' + org + '/persons?limit=500&start=' + start);
      (j.data || []).forEach((p) => { P[p.id] = ficha(p); });
      const pg = j.additional_data && j.additional_data.pagination;
      if (!pg || !pg.more_items_in_collection) break; start = pg.next_start;
    }
  });
  const faltan = Object.keys(ids).filter((id) => !P[id]);
  ss_lote(faltan.map((id) => ({ path: '/persons/' + id }))).forEach((j) => { if (j.data) P[j.data.id] = ficha(j.data); });
  socios.forEach((s) => {
    s.pd = Object.keys(s.cands || {}).map((id) => P[id]).filter(Boolean)
      .filter((r) => (s.cel && r.tels.indexOf(s.cel) >= 0) || (s.dni && r.dni === s.dni));
  });

  // 3) qué ficha es de cada socio (si no hay certeza, no se toca)
  const deQuien = (s) => {
    if (!s.pd.length) return null;
    const porDni = s.pd.filter((r) => s.dni && r.dni === s.dni); if (porDni.length === 1) return porDni[0];
    const sim = s.pd.filter((r) => ss_parecidos(r.name, s.nombre)); if (sim.length === 1) return sim[0];
    if (s.pd.length === 1 && s.cel && uso[s.cel] === 1 && !(s.pd[0].dni && s.dni && s.pd[0].dni !== s.dni)) return s.pd[0];
    return null;
  };
  const asign = {}, vigIds = {}, revisar = [];
  socios.forEach((s) => {
    const r = deQuien(s);
    if (!s.cel) revisar.push(['Celular mal escrito en AppsFit', s, '', s.celRaw]);
    if (!s.pd.length) { if (s.vig) revisar.push(['Socio vigente sin ficha en Pipedrive', s, '', '']); return; }
    if (s.pd.length > 1) revisar.push(['Varias fichas: fusionar en Pipedrive', s, s.pd[0].id, s.pd.map((x) => x.name + ' (' + x.id + ')').join(' · ')]);
    if (!r) { if (s.pd.length === 1) revisar.push(['No es seguro que la ficha sea suya (celular de familia u otro DNI)', s, s.pd[0].id, s.pd[0].name]); return; }
    (asign[r.id] = asign[r.id] || []).push(s);
    if (s.vig) vigIds[r.id] = 1;
  });
  const cambios = [];
  Object.keys(asign).forEach((id) => {
    const r = P[id], ss = asign[id];
    if (ss.length > 1 && new Set(ss.map((s) => s.dni)).size > 1) { revisar.push(['Dos socios distintos usan la misma ficha', ss[0], r.id, ss.map((s) => s.nombre).join(' · ')]); return; }
    const s = ss.reduce((a, b) => ((a.fin || '') >= (b.fin || '') ? a : b));
    const ch = {}, por = [];
    if (s.vig && r.org !== SS_ORG_ACT) { ch.org_id = SS_ORG_ACT; por.push('→ ALUMNOS ACTIVOS'); }
    if (!s.vig && (r.org === SS_ORG_ACT || r.org === SS_ORG_ACT2) && !vigIds[r.id]) { ch.org_id = SS_ORG_INACT; por.push('→ ALUMNOS INACTIVOS'); }
    if (s.dni && !r.dni) { ch[SS_DNI] = Number(s.dni); por.push('DNI ' + s.dni); }
    if (ss_raro(r.name) && s.cel && uso[s.cel] === 1) { ch.name = ss_titulo(s.nombre); por.push('nombre "' + r.name + '" → "' + ch.name + '"'); }
    if (por.length) cambios.push({ id: r.id, ch: ch, por: por, s: s, antes: r.name });
  });
  // fichas en organizaciones de activos que no aparecen en AppsFit: no se mueven, solo se cuentan
  const enBase = {}; socios.forEach((s) => s.pd.forEach((r) => { enBase[r.id] = 1; }));
  const huerfanas = Object.keys(P).filter((id) => (P[id].org === SS_ORG_ACT || P[id].org === SS_ORG_ACT2) && !enBase[id]);

  // 4) aplicar
  let errores = 0;
  if (aplicar && cambios.length) {
    ss_lote(cambios.map((c) => ({ path: '/persons/' + c.id, opt: { method: 'put', contentType: 'application/json', payload: JSON.stringify(c.ch) } })))
      .forEach((j, k) => { cambios[k].ok = !j.error; if (j.error) errores++; });
  }

  // 5) informe en la pestaña 🔗 PIPEDRIVE
  const stamp = Utilities.formatDate(new Date(), 'America/Lima', 'dd/MM/yyyy HH:mm');
  const tab = [[(aplicar ? 'Corrección automática' : 'Vista previa (no se cambió nada)') + ' · ' + stamp,
                '', '', '', ''],
    ['Socios en AppsFit: ' + socios.length + ' · vigentes: ' + socios.filter((s) => s.vig).length + ' · fichas corregidas: ' + (aplicar ? cambios.length - errores : 0) + (aplicar ? '' : ' (se corregirían ' + cambios.length + ')') +
     ' · por revisar: ' + revisar.length + ' · en ALUMNOS ACTIVOS pero no están en AppsFit: ' + huerfanas.length, '', '', '', ''],
    ['', '', '', '', ''],
    ['QUÉ', 'SOCIO (APPSFIT)', 'ASESORA', 'FICHA PIPEDRIVE', 'DETALLE']];
  revisar.forEach((x) => tab.push(['🔎 ' + x[0], x[1].nombre, x[1].asesora, x[2] ? '=HYPERLINK("' + SS_URL + x[2] + '";"' + x[2] + '")' : '', x[3]]));
  cambios.forEach((c) => tab.push([(aplicar ? (c.ok ? '✅ Corregido' : '❌ No se pudo corregir') : '✏️ Se corregiría'), c.s.nombre, c.s.asesora,
    '=HYPERLINK("' + SS_URL + c.id + '";"' + c.id + '")', c.por.join(' · ')]));
  ss_escribir_(tab);
  Logger.log(tab[1][0]);
  return { cambios: cambios.length, errores: errores, revisar: revisar.length, huerfanas: huerfanas.length };
}

function ss_escribir_(filas) {
  const meta = Sheets.Spreadsheets.get(NU_BASE_ID, { fields: 'sheets.properties' });
  if (!meta.sheets.some((s) => s.properties.title === SS_TAB)) {
    Sheets.Spreadsheets.batchUpdate({ requests: [{ addSheet: { properties: { title: SS_TAB, gridProperties: { frozenRowCount: 4 } } } }] }, NU_BASE_ID);
  }
  Sheets.Spreadsheets.Values.clear({}, NU_BASE_ID, "'" + SS_TAB + "'!A1:E5000");
  Sheets.Spreadsheets.Values.update({ values: filas }, NU_BASE_ID, "'" + SS_TAB + "'!A1", { valueInputOption: 'USER_ENTERED' });
}

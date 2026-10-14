/* RURUSH Nutrición — "cerebro" del seguimiento de nutrición (reemplaza la tarea de Cowork "Seguimiento nutricion wa 1130").
   Vive en la hoja NUTRICION RURUSH 2026 (Extensiones → Apps Script). 0 tokens.
   - Mantiene al día la pestaña SEGUIMIENTO WHATSAPP (días sin nutri + socios activos nuevos).
   - Arma la lista del día: no-shows, socios en pausa, 20 invitaciones nuevas y chats por revisar.
   - Agenda la cita en Pipedrive con Diego (revisando que el horario esté libre) cuando el socio confirma.
   - Guarda en la hoja lo que hizo la extensión (estado, respuesta, intentos, fecha de contacto).
   La extensión Rurush FP (módulo "Nutrición: seguimiento 11:30") lo llama por el link de la app web + ?k=LLAVE.
   Propiedades del script: PIPEDRIVE_TOKEN y NU_LLAVE (la crea nu_instalar). */

const NU_HOJA = 'SEGUIMIENTO WHATSAPP';
const NU_REAGENDAR_GID = 2001171119;                        // pestaña REAGENDAR NUTRICIÓN (E=DNI, P=person_id)
const NU_BASE_ID = '1j6Js9ToQUJ96yCUmMKh5jmEAebfNSzlpYs5ItSEDuUI'; // BASE DE SOCIOS y PAUSAS
const NU_DIEGO = 17073823;                                  // usuario de Diego en Pipedrive
const NU_HORAS = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30'];
const NU_DIAS_DIEGO = [2, 3];                               // martes y miércoles
const NU_MAX_NUEVOS = 20;
const NU_MAX_ALTAS = 30;                                    // socios nuevos que se agregan a la hoja por día
const NU_NUNCA = ['990454254'];                             // vencidos que no se contactan
const NU_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const NU_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const NU_DIR = 'Av. Larco 1164, Víctor Larco, al costado de Mass';
// columnas de SEGUIMIENTO WHATSAPP (1 = A)
const C = { NOMBRE: 1, TEL: 2, ESTADO: 3, MOTIVO: 4, DSN: 5, DSV: 6, OPA: 7, OPB: 8, RESP: 10, CITA: 11, ULT: 12, INT: 13, PID: 14, DNI: 15 };

/* ---------- utilidades ---------- */
const nu_props = () => PropertiesService.getScriptProperties();
const nu_pad = (n) => String(n).padStart(2, '0');
function nu_hoy() { return new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); }
const nu_d = (iso) => new Date(Date.parse(iso + 'T12:00:00Z'));
const nu_mas = (iso, n) => new Date(nu_d(iso).getTime() + n * 86400e3).toISOString().slice(0, 10);
const nu_dow = (iso) => nu_d(iso).getUTCDay();
const nu_lab = (iso) => NU_DIAS[nu_dow(iso)] + ' ' + Number(iso.slice(8)) + ' ' + NU_MES[Number(iso.slice(5, 7)) - 1];
const nu_ddmm = (iso) => iso.slice(8) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
function nu_horaTxt(hhmm) {
  const h = Number(hhmm.slice(0, 2)), m = hhmm.slice(3);
  return ((h + 11) % 12 + 1) + (m === '00' ? '' : ':' + m) + (h >= 12 ? ' pm' : ' am');
}
function nu_tel(v) {
  let t = String(v || '').replace(/\D/g, '');
  if (t.indexOf('5151') === 0) t = t.slice(4);
  else if (t.indexOf('51') === 0 && t.length === 11) t = t.slice(2);
  if (/^(\d)\1{7,}/.test(t.slice(1)) || /^9(12345678|87654321|00000000)$/.test(t)) return '';   // 999999999, 911111111…: números de relleno
  return /^9\d{8}$/.test(t) ? t : '';
}
// ¿dos nombres son de la misma persona? (comparten una palabra de 3+ letras, sin tildes; un nombre sin letras no se compara)
function nu_mismoNombre(a, b) {
  const w = (x) => nu_sinTildes(x).split(/\s+/).filter((p) => p.length >= 3);
  const A = w(a), Bw = w(b);
  return !A.length || !Bw.length || A.some((p) => Bw.some((q) => p === q || (p.length >= 4 && q.length >= 4 && (p.indexOf(q) >= 0 || q.indexOf(p) >= 0))));   // @jhordylara ~ Jhordy Lara
}
function nu_nombre(v) {
  const w = String(v || '').replace(/,/g, ' ').trim().split(/\s+/)[0] || '';
  return /^[a-záéíóúñü]{2,}$/i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
}
function nu_iso(v) {   // "13/10/2026" o Date → "2026-10-13"
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Lima', 'yyyy-MM-dd');
  const iso = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);   // la base de AppsFit trae algunas fechas como 2026-11-01
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  const m = String(v || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + nu_pad(m[2]) + '-' + nu_pad(m[1]) : '';
}
// próximos martes y miércoles a partir de mañana (o de `desde`)
function nu_opciones(desde) {
  const o = [];
  for (let d = nu_mas(desde || nu_hoy(), 1); o.length < 2; d = nu_mas(d, 1)) if (NU_DIAS_DIEGO.indexOf(nu_dow(d)) >= 0) o.push(d);
  return o;
}

/* ---------- Pipedrive ---------- */
function nu_pd(path, opt) {
  const r = UrlFetchApp.fetch('https://api.pipedrive.com/v1' + path, Object.assign({
    headers: { 'x-api-token': nu_props().getProperty('PIPEDRIVE_TOKEN') }, muteHttpExceptions: true
  }, opt || {}));
  const j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() >= 300 || j.success === false) throw new Error('Pipedrive ' + path.split('?')[0] + ': ' + (j.error || r.getResponseCode()));
  return j;
}
// actividad de Pipedrive → cita de nutrición con fecha/hora Lima (null si no es de nutrición)
function nu_cita(a) {
  if (!a || !a.due_date || a.type !== 'deadline') return null;
  if (!/nutri/i.test(a.subject || '')) return null;          // solo citas de nutrición (no Free Pass / FP)
  const t = (a.due_time || '05:00').slice(0, 5);
  const l = new Date(Date.parse(a.due_date + 'T' + t + ':00Z') - 5 * 3600e3);
  const pid = a.person_id && a.person_id.value != null ? a.person_id.value : a.person_id;
  return { id: a.id, pid: pid ? String(pid) : '', fecha: l.toISOString().slice(0, 10), hora: nu_pad(l.getUTCHours()) + ':' + nu_pad(l.getUTCMinutes()),
           ms: l.getTime() + 5 * 3600e3, asunto: a.subject || '', nombre: a.person_name || '', done: !!a.done };
}
// varias lecturas a Pipedrive EN PARALELO (una sola espera en vez de una por llamada)
function nu_pdAll(paths) {
  const tk = nu_props().getProperty('PIPEDRIVE_TOKEN');
  return UrlFetchApp.fetchAll(paths.map((p) => ({ url: 'https://api.pipedrive.com/v1' + p, headers: { 'x-api-token': tk }, muteHttpExceptions: true })))
    .map((r, i) => {
      const j = JSON.parse(r.getContentText() || '{}');
      if (r.getResponseCode() >= 300 || j.success === false) throw new Error('Pipedrive ' + paths[i].split('?')[0] + ': ' + (j.error || r.getResponseCode()));
      return j;
    });
}
// socios con membresía vigente en AppsFit (hoja '3. BASE DE SOCIOS'). Guardado 6 h (la base se actualiza una vez al día).
// { fin: { celular: 'yyyy-MM-dd' vencimiento }, nom: [[nombre sin tildes, celular], ...] }
function nu_base() {
  const c = CacheService.getScriptCache(), k = 'nu_base3_' + nu_hoy();
  const g = c.get(k); if (g) return JSON.parse(g);
  const fin = {}, nom = [], hoy = nu_hoy();
  (Sheets.Spreadsheets.Values.get(NU_BASE_ID, "'3. BASE DE SOCIOS'!B6:I1000").values || []).forEach((r) => {
    const t = nu_tel(r[2]), f = nu_iso(r[7]);
    if (!t || !(f >= hoy)) return;
    if (!fin[t] || f > fin[t]) fin[t] = f;
    nom.push([nu_sinTildes(r[1]), t, String(r[0] || '').trim()]);   // [nombre, celular, código AppsFit]
  });
  const o = { fin: fin, nom: nom };
  try { c.put(k, JSON.stringify(o), 21600); } catch (e) { /* muy grande para el caché: se relee la próxima vez */ }
  return o;
}
function nu_vigentes() { return nu_base().fin; }
function nu_sinTildes(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñ0-9 ]/g, ' '); }
// fichas de Pipedrive de los socios VIGENTES cuyo nombre en AppsFit contiene todas las palabras buscadas
// (con apellidos comunes Pipedrive devuelve solo 30 de cientos y los activos pueden quedar fuera)
function nu_buscarVigentes(q, yaTels) {
  const cod = String(q || '').trim().replace(/^#/, '');
  const pal = nu_sinTildes(q).split(/\s+/).filter((w) => w.length >= 2);
  if (!pal.length && !/^\d{1,4}$/.test(cod)) return [];
  const tels = nu_base().nom.filter((x) => /^\d{1,4}$/.test(cod) ? x[2] === cod : pal.every((w) => x[0].indexOf(w) >= 0)).map((x) => x[1])
    .filter((t, i, l) => l.indexOf(t) === i && !(yaTels && yaTels[t])).slice(0, 6);   // solo los que Pipedrive no trajo
  if (!tels.length) return [];
  const out = [];
  nu_pdAll(tels.map((t) => '/persons/search?limit=5&fields=phone&term=' + t)).forEach((j, i) =>
    (((j.data || {}).items) || []).filter((it) => (it.item.phones || []).map(nu_tel).indexOf(tels[i]) >= 0).forEach((it) => out.push(it)));
  return out;
}
// orden de búsqueda: 0 vigente en AppsFit · 1 organización ALUMNOS ACTIVOS en Pipedrive · 2 sin dato · 3 INACTIVO
function nu_nivel(tels, org, vig) {
  if (tels.some((t) => vig[t])) return 0;
  org = String(org || '');
  return /INACTIV/i.test(org) ? 3 : (/ACTIV/i.test(org) ? 1 : 2);
}
// resultados de /persons/search: solo los del mejor nivel de coincidencia
function nu_mejores(items) {
  const top = items.reduce((m, it) => Math.max(m, it.result_score || 0), 0);
  return items.filter((it) => (it.result_score || 0) >= top * 0.5);
}
// citas (pendientes y hechas) entre dos fechas, con las dos consultas en paralelo
function nu_citasRango(desde, hasta) {
  const q = '/activities?type=deadline&user_id=0&limit=500&start=0&start_date=' + nu_mas(desde, -1) + '&end_date=' + nu_mas(hasta, 2) + '&done=';
  const js = nu_pdAll([q + '0', q + '1']);
  if (js.some((j) => j.additional_data && j.additional_data.pagination && j.additional_data.pagination.more_items_in_collection))
    return nu_citas(desde, hasta, false).concat(nu_citas(desde, hasta, true));   // muchas: se pagina normal
  const out = [];
  js.forEach((j) => (j.data || []).forEach((a) => { const c = nu_cita(a); if (c && c.fecha >= desde && c.fecha <= hasta) out.push(c); }));
  return out;
}
// citas de nutrición de UNA persona (una sola llamada, sin recorrer toda la agenda)
function nu_citasDe(pid) {
  return (nu_pd('/persons/' + pid + '/activities?limit=500').data || []).map(nu_cita).filter(Boolean);
}
// citas de nutrición (type=deadline) con fecha/hora Lima entre desde y hasta
function nu_citas(desde, hasta, hechas) {
  const out = [];
  for (let start = 0, v = 0; v < 40; v++) {
    const j = nu_pd('/activities?type=deadline&user_id=0&limit=500&start=' + start + '&done=' + (hechas ? 1 : 0) +
      '&start_date=' + nu_mas(desde, -1) + '&end_date=' + nu_mas(hasta, 2));
    (j.data || []).forEach((a) => { const c = nu_cita(a); if (c && c.fecha >= desde && c.fecha <= hasta) out.push(c); });
    const pg = j.additional_data && j.additional_data.pagination;
    if (!pg || !pg.more_items_in_collection) break;
    start = pg.next_start;
  }
  return out;
}

/* ---------- hoja ---------- */
function nu_hoja() { return SpreadsheetApp.getActive().getSheetByName(NU_HOJA); }
function nu_filas(sh) {
  const n = Math.max(0, sh.getLastRow() - 1);
  if (!n) return [];
  return sh.getRange(2, 1, n, 15).getValues().map((r, i) => ({
    fila: i + 2, nombre: String(r[0]).trim(), tel: nu_tel(r[1]), estado: String(r[2]).trim().toLowerCase(), motivo: r[3],
    ult: nu_iso(r[11]), intentos: Number(r[12]) || 0, pid: String(r[13]).trim(), dni: String(r[14]).trim(),
    opA: String(r[6]), opB: String(r[7])
  })).filter((s) => s.nombre);
}
function nu_pausas() {
  const v = Sheets.Spreadsheets.Values.get(NU_BASE_ID, 'PAUSAS!A2:F1000').values || [];
  const m = {};
  v.forEach((r) => {
    const tel = nu_tel(r[2]), vuelve = nu_iso(r[4]);
    if (tel && vuelve && /activa/i.test(String(r[5] || '')) && (!m[tel] || vuelve > m[tel])) m[tel] = vuelve;
  });
  return m;
}

/* Sincroniza la hoja: col E (días sin nutri) para todos y agrega hasta 30 socios activos nuevos ("por enviar").
   La col F es una fórmula (IMPORTRANGE): nunca se escribe. */
function nu_sync() {
  const hoy = nu_hoy(), sh = nu_hoja(), filas = nu_filas(sh);
  const ultima = {};
  nu_citas(nu_mas(hoy, -365), hoy, true).forEach((c) => { if (c.pid && (!ultima[c.pid] || c.fecha > ultima[c.pid])) ultima[c.pid] = c.fecha; });
  const dsn = (pid) => (pid && ultima[pid] ? Math.round((nu_d(hoy) - nu_d(ultima[pid])) / 86400e3) : null);
  if (filas.length) {                                      // col E en una sola escritura
    const n = sh.getLastRow() - 1, colE = sh.getRange(2, C.DSN, n, 1).getValues();
    filas.forEach((s) => { const d = dsn(s.pid); if (d != null) colE[s.fila - 2][0] = d; });
    sh.getRange(2, C.DSN, n, 1).setValues(colE);
  }

  // socios activos que todavía no están en la hoja
  const base = Sheets.Spreadsheets.Values.get(NU_BASE_ID, "'3. BASE DE SOCIOS'!B6:S1000").values || [];
  const enHoja = {}; filas.forEach((s) => { if (s.dni) enHoja[s.dni] = 1; if (s.tel) enHoja['t' + s.tel] = 1; });
  const reag = SpreadsheetApp.getActive().getSheets().filter((x) => x.getSheetId() === NU_REAGENDAR_GID)[0];
  const pidPorDni = {};
  if (reag && reag.getLastRow() > 1) reag.getRange(2, 5, reag.getLastRow() - 1, 12).getValues().forEach((r) => { if (r[0] && r[11]) pidPorDni[String(r[0]).trim()] = String(r[11]).trim(); });
  const nuevos = [];
  base.forEach((r) => {
    if (nuevos.length >= NU_MAX_ALTAS) return;
    const estado = String(r[9] || '').toUpperCase(), dni = String(r[3] || '').trim(), tel = nu_tel(r[2]);
    // solo socios con plan: los códigos RE## / FP## son referidos o free pass cargados a mano, y SIN FECHA no tiene plan
    if (!/^\d+$/.test(String(r[0] || '').trim()) || /SIN FECHA/.test(estado)) return;
    if (!estado || /VENCIDO/.test(estado) || !tel || enHoja[dni] || enHoja['t' + tel] || NU_NUNCA.indexOf(tel) >= 0) return;
    let pid = (dni && pidPorDni[dni]) || '';
    if (!pid) { try { const it = (nu_pd('/persons/search?fields=phone&limit=1&term=' + tel).data || {}).items || []; pid = it.length ? String(it[0].item.id) : ''; } catch (e) { /* sin pid */ } }
    const d = dsn(pid);
    if (d != null && d < 30) return;                       // al día: no hace falta invitar
    enHoja['t' + tel] = 1;
    nuevos.push([String(r[1] || '').trim(), tel, 'por enviar', d == null ? 'NUNCA PASÓ' : '+30 DÍAS', d == null ? '' : d]);
    nuevos[nuevos.length - 1].pid = pid; nuevos[nuevos.length - 1].dni = dni;
  });
  if (nuevos.length) {
    const ini = sh.getLastRow() + 1;
    sh.getRange(ini, 1, nuevos.length, 5).setValues(nuevos.map((x) => x.slice(0, 5)));
    sh.getRange(ini, C.INT, nuevos.length, 3).setValues(nuevos.map((x) => [0, x.pid, x.dni]));
  }
  nu_props().setProperty('NU_SYNC', hoy);
  return { actualizados: filas.length, agregados: nuevos.length };
}

/* ---------- plan del día (lo pide la extensión) ---------- */
function nu_plan() {
  const hoy = nu_hoy();
  const sync = nu_props().getProperty('NU_SYNC') === hoy ? null : nu_sync();
  const filas = nu_filas(nu_hoja());
  const porPid = {}; filas.forEach((s) => { if (s.pid) porPid[s.pid] = s; });
  const pausas = nu_pausas();
  const [a, b] = nu_opciones(hoy);
  const usados = {};
  const job = (s, tipo, texto, extra) => Object.assign({ fila: s.fila, nombre: s.nombre, tel: s.tel, tipo: tipo, texto: texto }, extra || {});
  const plan = { hoy: hoy, sync: sync, opciones: [a, b], noshows: [], pausas: [], nuevos: [], revisar: [], fueraHoja: [] };

  // 1) no-shows de los últimos 7 días sin otra cita en los próximos 60
  const pasadas = nu_citas(nu_mas(hoy, -7), hoy, false).filter((c) => c.ms < Date.now() - 30 * 60e3);
  if (pasadas.length) {
    const futuras = {}; nu_citas(hoy, nu_mas(hoy, 60), false).filter((c) => c.ms > Date.now()).forEach((c) => { futuras[c.pid] = 1; });
    const evaluado = {};   // si ya fue evaluado después (sin cita u otro día), no es no-show
    nu_citas(nu_mas(hoy, -7), hoy, true).forEach((c) => { if (c.pid && (!evaluado[c.pid] || c.fecha > evaluado[c.pid])) evaluado[c.pid] = c.fecha; });
    pasadas.forEach((c) => {
      if (!c.pid || futuras[c.pid] || usados[c.pid] || (evaluado[c.pid] && evaluado[c.pid] >= c.fecha)) return;
      usados[c.pid] = 1;
      const s = porPid[c.pid];
      if (!s) { plan.fueraHoja.push(c.nombre + ' (person_id ' + c.pid + ', cita ' + nu_lab(c.fecha) + ' ' + nu_horaTxt(c.hora) + ')'); return; }
      if (!s.tel || s.ult === hoy) return;
      const n = nu_nombre(s.nombre);
      plan.noshows.push(job(s, 'noshow', 'Hola' + (n ? ' ' + n : '') + '! 😊 Vimos que no pudiste asistir a tu evaluación nutricional con Diego — sin problema, te reagendamos cuando gustes 💪\n\n' +
        '¿Te acomoda mejor:\n• ' + nu_lab(a) + ' — mañana (8-11am) o tarde (5-8pm)?\n• ' + nu_lab(b) + ' — mañana (8-11am) o tarde (5-8pm)?\n\n¿Cuál te queda mejor? 😊',
        { resp: 'No asistió ' + c.fecha.slice(8) + '/' + c.fecha.slice(5, 7) + ' ' + c.hora + '. Reagendo enviado ' + hoy.slice(8) + '/' + hoy.slice(5, 7) + '.' }));
    });
  }
  // 2) "por enviar": en pausa (sin tope) o tanda nueva (máx 20, un mensaje por teléfono)
  const telVisto = {};
  filas.forEach((s) => {
    if (s.estado !== 'por enviar' || !s.tel || NU_NUNCA.indexOf(s.tel) >= 0 || telVisto[s.tel] || (s.pid && usados[s.pid])) return;
    telVisto[s.tel] = 1;
    const n = nu_nombre(s.nombre);
    const vuelve = pausas[s.tel];
    if (vuelve && vuelve > hoy) {
      const [pa, pb] = nu_opciones(vuelve);
      plan.pausas.push(job(s, 'pausa', 'Hola' + (n ? ' ' + n : '') + '! 🥗 Vi que tienes una pausa activa — sin problema, cuando regreses coordinamos tu evaluación nutricional con Diego 💪 Te propongo:\n' +
        '• ' + nu_lab(pa) + ' — ¿mañana (8-11am) o tarde (5-8pm)?\n• ' + nu_lab(pb) + ' — ¿mañana (8-11am) o tarde (5-8pm)?\n¿Cuál te queda mejor cuando vuelvas? 😊',
        { resp: 'En pausa, regresa ' + vuelve.slice(8) + '/' + vuelve.slice(5, 7) + '. Opciones: ' + nu_lab(pa) + ' / ' + nu_lab(pb), opA: nu_lab(pa), opB: nu_lab(pb) }));
    } else if (plan.nuevos.length < NU_MAX_NUEVOS) {
      plan.nuevos.push(job(s, 'nuevo', 'Hola' + (n ? ' ' + n : '') + '! 😊 Te escribo de RURUSH para agendar tu evaluación nutricional con nuestro nutricionista Diego 🥗 ' +
        '¿Te viene mejor el ' + nu_lab(a) + ' o el ' + nu_lab(b) + '? Mañana (8-11am) o tarde (5-8pm). Solo toma 30 min y es sin costo para ti como socio/a 💪',
        { opA: nu_lab(a), opB: nu_lab(b) }));
    }
  });
  // 3) chats a revisar (no se tocan los contactados hoy)
  filas.forEach((s) => {
    if (['enviado', 'por confirmar', 'no asistió', 'no asistio'].indexOf(s.estado) < 0 || !s.tel || s.ult === hoy || (s.pid && usados[s.pid])) return;
    plan.revisar.push({ fila: s.fila, nombre: s.nombre, tel: s.tel, estado: s.estado, intentos: s.intentos, ult: s.ult, pid: s.pid });
  });
  return plan;
}

/* ---------- agendar con Diego ---------- */
function nu_libres(fecha) {
  const ocupadas = {};
  nu_citas(fecha, fecha, false).concat(nu_citas(fecha, fecha, true)).forEach((c) => { ocupadas[c.hora] = 1; });
  const ahora = Date.now();
  return NU_HORAS.filter((h) => !ocupadas[h] && Date.parse(fecha + 'T' + h + ':00Z') + 5 * 3600e3 > ahora + 2 * 3600e3);
}
// devuelve { ok:true, fecha, hora } | { ok:false, motivo:'ocupado', libres:[...] } | { ok:true, yaTenia:true, fecha, hora }
function nu_agendar(q) {
  const fecha = String(q.fecha || ''), hora = String(q.hora || ''), pid = String(q.pid || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || NU_DIAS_DIEGO.indexOf(nu_dow(fecha)) < 0) return { ok: false, motivo: 'dia', libres: [] };
  if (!pid) return { ok: false, motivo: 'sin person_id' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ya = nu_citas(nu_hoy(), nu_mas(nu_hoy(), 60), false).filter((c) => c.pid === pid && c.ms > Date.now())[0];
    if (ya) return { ok: true, yaTenia: true, fecha: ya.fecha, hora: ya.hora };
    const libres = nu_libres(fecha);
    if (!hora || libres.indexOf(hora) < 0) return { ok: false, motivo: hora ? 'ocupado' : 'sin hora', libres: libres };
    const utc = new Date(Date.parse(fecha + 'T' + hora + ':00Z') + 5 * 3600e3);
    nu_pd('/activities', { method: 'post', contentType: 'application/json', payload: JSON.stringify({
      subject: 'Evaluación nutricional', type: 'deadline', person_id: Number(pid), user_id: NU_DIEGO,
      due_date: utc.toISOString().slice(0, 10), due_time: utc.toISOString().slice(11, 16), duration: '00:30' }) });
    return { ok: true, fecha: fecha, hora: hora };
  } finally { lock.releaseLock(); }
}

/* ---------- guardar resultados de la extensión ---------- */
function nu_guardar(lista) {
  const sh = nu_hoja(), hoy = nu_ddmm(nu_hoy());
  (lista || []).forEach((x) => {
    const f = Number(x.fila);
    if (!(f >= 2)) return;
    if (x.estado) sh.getRange(f, C.ESTADO).setValue(x.estado);
    if (x.resp) sh.getRange(f, C.RESP).setValue(x.resp);
    if (x.cita) sh.getRange(f, C.CITA).setValue(x.cita);
    if (x.opA) sh.getRange(f, C.OPA, 1, 2).setValues([[x.opA, x.opB || '']]);
    if (x.intentos != null) sh.getRange(f, C.INT).setValue(x.intentos);
    if (x.contacto) sh.getRange(f, C.ULT).setValue(hoy);
  });
  return { ok: true, guardados: (lista || []).length };
}

/* ---------- app web (la llama la extensión) ---------- */
function nu_resp(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function nu_ok(e) { const k = nu_props().getProperty('NU_LLAVE'); return k && e && e.parameter && e.parameter.k === k; }
function doGet(e) {
  if (e && e.parameter && e.parameter.app === 'diego') return dg_pagina();   // App de Diego (AppDiego.gs), protegida con PIN
  if (e && e.parameter && e.parameter.app === 'reservas') return rv_pagina(); // Reservas de las asesoras (AppReservas.gs), con su propio PIN
  if (!nu_ok(e)) return nu_resp({ ok: false, error: 'llave' });
  try {
    if (e.parameter.accion === 'plan') return nu_resp(Object.assign({ ok: true }, nu_plan()));
    if (e.parameter.accion === 'libres') return nu_resp({ ok: true, libres: nu_libres(e.parameter.fecha) });
    return nu_resp({ ok: true, pong: nu_hoy() });
  } catch (err) { return nu_resp({ ok: false, error: err.message }); }
}
function doPost(e) {
  if (!nu_ok(e)) return nu_resp({ ok: false, error: 'llave' });
  try {
    const q = JSON.parse(e.postData.contents || '{}');
    if (e.parameter.accion === 'agendar') return nu_resp(nu_agendar(q));
    if (e.parameter.accion === 'guardar') return nu_resp(nu_guardar(q.lista));
    return nu_resp({ ok: false, error: 'accion' });
  } catch (err) { return nu_resp({ ok: false, error: err.message }); }
}

/* Ejecutar UNA vez: crea la llave, prueba Pipedrive y la hoja, y muestra el plan de hoy (sin enviar nada). */
function nu_instalar() {
  if (!nu_props().getProperty('PIPEDRIVE_TOKEN')) throw new Error('Primero agrega PIPEDRIVE_TOKEN en Configuración del proyecto → Propiedades del script.');
  if (!nu_props().getProperty('NU_LLAVE')) nu_props().setProperty('NU_LLAVE', Utilities.getUuid().replace(/-/g, ''));
  const p = nu_plan();
  Logger.log('LLAVE para la extensión: ' + nu_props().getProperty('NU_LLAVE'));
  Logger.log('Sync: ' + JSON.stringify(p.sync) + ' · no-shows ' + p.noshows.length + ' · en pausa ' + p.pausas.length +
    ' · nuevos ' + p.nuevos.length + ' · por revisar ' + p.revisar.length + ' · fuera de hoja ' + p.fueraHoja.length);
  Logger.log('Horas libres de Diego el ' + p.opciones[0] + ': ' + nu_libres(p.opciones[0]).join(', '));
}

/* RURUSH Hoy — pestaña 👥 Equipo.
   Venta por asesora (Sheet VENTAS 2026, pestaña del mes) y llamadas por asesora
   (Sheet BASE DE DATOS LEADS RFC, pestaña 2026). Solo lee: no escribe en ningún Sheet (openById exige el permiso completo de Sheets). */

const VENTAS_ID = '1P1FSx8BrKtCnM2E2wBqwG5-T9dcByOfW-Go8aKER4L0';
const LEADS_ID = '1DzlEgYAdV02TAtR78zweTI0G-n-RwJwWgfwTqIILoJg';
// Todas las pestañas de llamadas (mismo formato de columnas por llamada).
const LEADS_PESTANAS = ['2026', 'FP 2026 NI', '2025', 'FPS 2025', 'FPS NA 2026', 'DIARIO 🔥', 'EXAL2025', 'INACTIVOS', 'INASISTENCIAS', 'ACTIVOS', '2024'];
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const NO_CONTESTA = { 'NO CONTESTO': 1, 'APAGADO': 1 };
let EQ_T = {};   // cronómetro por partes (se ve en el registro de instalarEquipo)

function getEquipo(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) {
    const c = cache.get('equipo');
    if (c) return JSON.parse(c);
  }
  const t0 = Date.now();
  EQ_T = {};
  const res = { generado: Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm'), errores: [] };
  try { res.ventas = eq_ventas(); } catch (e) { res.errores.push('Ventas: ' + e.message); }
  const t1 = Date.now();
  try { res.llamadas = eq_llamadas(); } catch (e) { res.errores.push('Llamadas: ' + e.message); }
  res.seg = Math.round((Date.now() - t0) / 100) / 10;
  res.segVentas = Math.round((t1 - t0) / 100) / 10;
  res.t = EQ_T;
  // 25 min: el activador lo recalcula cada 10 min, así el celular nunca espera.
  try { cache.put('equipo', JSON.stringify(res), 1500); } catch (e) { /* >100 KB: sin caché */ }
  return res;
}

/* Activador: recalcula Equipo cada 10 min entre 7am y 10pm (hora Lima) y lo deja en caché.
   Ejecutar instalarEquipo UNA vez desde el editor. */
function eq_precalentar() {
  const h = new Date(Date.now() + LIMA * 3600e3).getUTCHours();
  if (h < 7 || h >= 22) return;
  getEquipo(true);
}
function instalarEquipo() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'eq_precalentar')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('eq_precalentar').timeBased().everyMinutes(10).create();
  const r = getEquipo(true);
  Logger.log('Activador listo. Tardó ' + r.seg + ' s (ventas ' + r.segVentas + ' s). Llamadas: ' + JSON.stringify(r.t) + '. Errores: ' + JSON.stringify(r.errores));
}

/* ---------- utilidades ---------- */

const eq_txt = (v) => String(v == null ? '' : v).trim();
const eq_nombre = (v) => eq_txt(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/\s+/)[0] || '';

// Montos: número directo, o texto tipo "S/.2.267,5" / "989".
function eq_num(v) {
  if (typeof v === 'number') return v;
  let s = eq_txt(v).replace(/S\/\.?/i, '').replace(/\s/g, '');
  if (!s) return 0;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // 8.264 = ocho mil
  const n = parseFloat(s.replace(/[^\d.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Fecha → 'yyyy-MM-dd'. Acepta Date o texto d/m/aa(aa).
function eq_iso(v) {
  if (v instanceof Date) return new Date(v.getTime() + LIMA * 3600e3).toISOString().slice(0, 10);
  const m = eq_txt(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (!m) return '';
  const a = m[3].length === 2 ? '20' + m[3] : m[3];
  return a + '-' + pad(m[2]) + '-' + pad(m[1]);
}

// "7:47 pm" (o la hora que el Sheet ya convirtió a Date) → minutos del día.
function eq_min(v) {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const m = eq_txt(v).toLowerCase().match(/^(\d{1,2}):(\d{2})\s*([ap])?/);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3] === 'p') h += 12; else if (!m[3]) h = Number(m[1]);
  return h * 60 + Number(m[2]);
}
// "1:25" (m:ss) → segundos. El Sheet suele convertir "1:25" en hora (1 h 25 min):
// se lee igual, horas = minutos y minutos = segundos.
function eq_seg(v) {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  if (typeof v === 'number') return v > 0 && v < 1 ? Math.round(v * 1440) : null;
  const m = eq_txt(v).match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/* ---------- ventas ---------- */

function eq_ventas() {
  const hoy = fechaLima(0), mes = Number(hoy.slice(5, 7)) - 1;
  const ss = SpreadsheetApp.openById(VENTAS_ID);
  const quiero = [MESES[mes]].concat(mes === 8 ? ['SETIEMBRE'] : []);
  const hoja = ss.getSheets().filter((s) => quiero.indexOf(s.getName().trim().toUpperCase()) >= 0)[0];
  if (!hoja) throw new Error('No encuentro la pestaña ' + MESES[mes] + ' en VENTAS 2026.');
  const v = hoja.getDataRange().getValues();

  // Totales de arriba: "META TOTAL", "AVANCE TOTAL" y "FALTA" con su valor a la derecha.
  const tot = {};
  for (let r = 0; r < Math.min(7, v.length); r++) {
    for (let c = 0; c < v[r].length; c++) {
      const k = eq_txt(v[r][c]).toUpperCase();
      if (k !== 'META TOTAL' && k !== 'AVANCE TOTAL' && k !== 'FALTA') continue;
      for (let d = c + 1; d < v[r].length; d++) if (eq_txt(v[r][d]) !== '') { tot[k] = eq_num(v[r][d]); break; }
    }
  }

  // Bloques: fila con "VENTAS" en J y el nombre en B (los bloques sin nombre se ignoran).
  // Fila siguiente: N ticket promedio, P meta, S nuevos, T fidelización, U avance, V falta.
  const asesoras = [];
  for (let r = 0; r < v.length - 1; r++) {
    if (eq_txt(v[r][9]).toUpperCase() !== 'VENTAS') continue;
    const nombre = eq_txt(v[r][1]);
    if (!nombre) continue;
    const s = v[r + 1];
    const a = {
      nombre: nombre.toUpperCase(), ticket: eq_num(s[13]), meta: eq_num(s[15]),
      nuevos: eq_num(s[18]), fidel: eq_num(s[19]), avance: eq_num(s[20]), falta: eq_num(s[21]),
      hoy: 0, ventas: 0
    };
    // Detalle: desde la fila "COD" hasta "TOTAL" (col Q). D fecha, C alumno, R total.
    let f = r + 1;
    while (f < v.length && eq_txt(v[f][1]).toUpperCase() !== 'COD') f++;
    for (f++; f < v.length; f++) {
      if (eq_txt(v[f][16]).toUpperCase() === 'TOTAL' || eq_txt(v[f][9]).toUpperCase() === 'VENTAS') break;
      const monto = eq_num(v[f][17]);
      if (!eq_txt(v[f][2]) || !monto) continue;
      a.ventas++;
      if (eq_iso(v[f][3]) === hoy) a.hoy += monto;
    }
    asesoras.push(a);
  }

  const suma = (k) => asesoras.reduce((t, a) => t + a[k], 0);
  const meta = tot['META TOTAL'] || suma('meta');
  const avance = tot['AVANCE TOTAL'] != null ? tot['AVANCE TOTAL'] : suma('avance');
  return {
    mes: hoja.getName().trim(), meta: meta, avance: avance,
    falta: tot['FALTA'] != null ? tot['FALTA'] : Math.max(meta - avance, 0),
    hoy: suma('hoy'), ventas: suma('ventas'),
    asesoras: asesoras.sort((x, y) => y.meta - x.meta || y.avance - x.avance)
  };
}

/* ---------- llamadas ---------- */

// Columnas de cada llamada, leídas de los encabezados de la fila 2.
function eq_estructura(enc) {
  const bloques = [];
  enc.forEach((h, c) => {
    const k = eq_txt(h).toUpperCase();
    if (k === 'ASESOR') bloques.push({ asesor: c, timbrada: -1, duracion: -1, fecha: -1, hora: -1, estado: -1, obs: -1 });
    const b = bloques[bloques.length - 1];
    if (!b) return;
    if (k === 'TIMBRADA') b.timbrada = c;
    else if (k === 'DURACION' || k === 'DURACIÓN') b.duracion = c;
    else if (k === 'FECHA' && b.fecha < 0) b.fecha = c;
    else if (k === 'HORA' && b.hora < 0) b.hora = c;
    else if (k === 'ESTADO') b.estado = c;
    else if (k === 'OBSERVACION' || k === 'OBSERVACIÓN') b.obs = c;
  });
  return bloques.filter((b) => b.fecha >= 0 && b.estado >= 0);
}

// Índice de columna (0 = A) → letra.
function eq_col(n) { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; }
// Rango A1 de una pestaña: filas desde/hasta (hasta null = hasta el final), columnas 0-based.
function eq_rango(tab, desde, hasta, c1, c2) {
  const a = c1 == null ? '' : eq_col(c1), b = c2 == null ? '' : eq_col(c2);
  return "'" + tab + "'!" + a + desde + ':' + b + (hasta == null ? '' : hasta);
}
// Varias lecturas en una sola llamada a la API de Sheets (valores como se ven en el Sheet).
function eq_leer(rangos) {
  const r = Sheets.Spreadsheets.Values.batchGet(LEADS_ID, { ranges: rangos, valueRenderOption: 'FORMATTED_VALUE' });
  return (r.valueRanges || []).map((v) => v.values || []);
}

function eq_llamadas() {
  const hoy = fechaLima(0);
  const d = new Date(Date.parse(hoy + 'T12:00:00Z'));
  const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
  const mes = hoy.slice(0, 8) + '01';
  // semana pasada completa (lun-dom), para el informe semanal de los lunes
  const lunesAnt = new Date(Date.parse(lunes + 'T12:00:00Z') - 7 * 86400e3).toISOString().slice(0, 10);
  const desdeMin = lunesAnt < mes ? lunesAnt : mes;
  // día hábil anterior (lun-vie), para el cuadro de ventas de las 7 am
  let ay = new Date(d.getTime() - 86400e3);
  while (ay.getUTCDay() === 0 || ay.getUTCDay() === 6) ay = new Date(ay.getTime() - 86400e3);
  const ayer = ay.toISOString().slice(0, 10);

  const T = EQ_T; let t = Date.now();
  const lap = (k) => { const n = Date.now(); T[k] = Math.round((n - t) / 100) / 10; t = n; };
  // Se lee con la API de Sheets (servicio avanzado "Sheets"): devuelve los valores ya
  // calculados. SpreadsheetApp espera a que el Sheet recalcule y tardaba 6-15 s por columna.
  // Son 3 consultas en total para TODAS las pestañas.

  // 0) Encabezados (fila 2) de todas las pestañas.
  const encs = eq_leer(LEADS_PESTANAS.map((tab) => eq_rango(tab, 2, 2)));
  const tabs = LEADS_PESTANAS.map((tab, i) => {
    const enc = (encs[i] && encs[i][0]) || [];
    const colNum = enc.findIndex((h) => eq_txt(h).toUpperCase() === 'NUMERO');
    return { tab: tab, bloques: eq_estructura(enc), colNum: colNum >= 0 ? colNum : 3 };
  }).filter((x) => x.bloques.length);
  if (!tabs.length) throw new Error('No encuentro las columnas de las llamadas en la fila 2.');
  lap('abrir');

  // 1) NÚMERO + columnas FECHA de todas las pestañas (una consulta): filas con llamadas del mes.
  const rangos = [];
  tabs.forEach((x) => {
    x.desde = rangos.length;
    [x.colNum].concat(x.bloques.map((b) => b.fecha)).forEach((c) => rangos.push(eq_rango(x.tab, 3, null, c, c)));
  });
  const datos = eq_leer(rangos);
  const tramos = []; // { x, ini, fin } (índices de fila desde la fila 3)
  tabs.forEach((x) => {
    const cols = datos.slice(x.desde, x.desde + 1 + x.bloques.length);
    let ultima = cols[0].length;
    while (ultima > 0 && eq_txt((cols[0][ultima - 1] || [])[0]) === '') ultima--;
    const conLlamada = new Array(ultima).fill(false);
    cols.slice(1).forEach((col) => {
      for (let i = 0; i < ultima; i++) {
        if (conLlamada[i] || !col[i]) continue;
        const f = eq_iso(col[i][0]);
        if (f && f >= desdeMin && f <= hoy) conLlamada[i] = true;
      }
    });
    // 2) Tramos de filas seguidas (se unen si hay menos de 40 filas entre ellas).
    let u = null;
    conLlamada.forEach((ok, i) => {
      if (!ok) return;
      if (u && i - u.fin <= 40) u.fin = i; else { u = { x: x, ini: i, fin: i }; tramos.push(u); }
    });
    x.maxCol = Math.max.apply(null, x.bloques.map((b) => Math.max(b.asesor, b.timbrada, b.duracion, b.fecha, b.hora, b.estado, b.obs)));
  });
  lap('fechas');

  const P = { hoy: {}, ayer: {}, semana: {}, mes: {}, semAnt: {} };
  const minutosHoy = {};
  const nueva = () => ({ n: 0, wa: 0, cont: 0, agend: 0, durSum: 0, durN: 0, timbSum: 0, timbN: 0, manual: 0, bases: {} });

  const procesar = (f, x) => {
    x.bloques.forEach((b) => {
      const estado = eq_txt(f[b.estado]).toUpperCase();
      if (!estado) return;
      const fecha = eq_iso(f[b.fecha]);
      if (!fecha || fecha < desdeMin || fecha > hoy) return;
      const ase = eq_nombre(f[b.asesor]) || 'SIN ASESORA';
      const dur = b.duracion >= 0 ? eq_seg(f[b.duracion]) : null;
      const timb = b.timbrada >= 0 ? Number(eq_txt(f[b.timbrada])) || 0 : 0;
      const wa = b.obs >= 0 && /^📲\s*WA/.test(eq_txt(f[b.obs]));
      const periodos = (fecha >= mes ? ['mes'] : []).concat(fecha < lunes && fecha >= lunesAnt ? ['semAnt'] : [], fecha >= lunes ? ['semana'] : [], fecha === hoy ? ['hoy'] : [], fecha === ayer ? ['ayer'] : []);
      periodos.forEach((p) => {
        const s = P[p][ase] || (P[p][ase] = nueva());
        s.n++;
        s.bases[x.tab] = (s.bases[x.tab] || 0) + 1;
        if (wa) s.wa++;
        if (!NO_CONTESTA[estado]) s.cont++;
        if (estado === 'AGENDADO') s.agend++;
        if (dur != null) { s.durSum += dur; s.durN++; } else s.manual++;
        if (timb) { s.timbSum += timb; s.timbN++; }
      });
      if (fecha === hoy) {
        const m = b.hora >= 0 ? eq_min(f[b.hora]) : null;
        if (m != null) (minutosHoy[ase] = minutosHoy[ase] || []).push(m);
      }
    });
  };
  // 3) Solo esas filas completas, de todas las pestañas (una consulta).
  let leidas = 0;
  if (tramos.length) {
    eq_leer(tramos.map((tr) => eq_rango(tr.x.tab, 3 + tr.ini, 3 + tr.fin, 0, tr.x.maxCol))).forEach((filas, k) => {
      const tr = tramos[k], n = tr.fin - tr.ini + 1;
      leidas += n;
      for (let i = 0; i < n; i++) procesar(filas[i] || [], tr.x);
    });
  }
  T.filas = leidas; T.tramos = tramos.length; T.pestanas = tabs.length;
  lap('leer');

  // Hoy: primera/última llamada, hueco más largo sin llamar y ráfagas (≥3 en el mismo minuto).
  Object.keys(minutosHoy).forEach((ase) => {
    const ms = minutosHoy[ase].sort((a, b) => a - b);
    const s = P.hoy[ase];
    s.primera = ms[0]; s.ultima = ms[ms.length - 1];
    s.hueco = 0;
    for (let i = 1; i < ms.length; i++) {
      if (ms[i] - ms[i - 1] > s.hueco) { s.hueco = ms[i] - ms[i - 1]; s.huecoDesde = ms[i - 1]; }
    }
    const porMin = {};
    ms.forEach((m) => { porMin[m] = (porMin[m] || 0) + 1; });
    s.rafagas = Object.keys(porMin).filter((m) => porMin[m] >= 3).map((m) => ({ min: Number(m), n: porMin[m] }));
  });
  return P;
}

// Ejecutar a mano desde el editor para probar.
function probarEquipo() {
  const r = getEquipo(true);
  Logger.log(JSON.stringify(r).slice(0, 3000));
  return r;
}

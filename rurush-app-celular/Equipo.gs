/* RURUSH Hoy — pestaña 👥 Equipo.
   Venta por asesora (Sheet VENTAS 2026, pestaña del mes) y llamadas por asesora
   (Sheet BASE DE DATOS LEADS RFC, pestaña 2026). Solo lee: no escribe en ningún Sheet (openById exige el permiso completo de Sheets). */

const VENTAS_ID = '1P1FSx8BrKtCnM2E2wBqwG5-T9dcByOfW-Go8aKER4L0';
const LEADS_ID = '1DzlEgYAdV02TAtR78zweTI0G-n-RwJwWgfwTqIILoJg';
const LEADS_PESTANA = '2026';
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

function eq_llamadas() {
  const hoy = fechaLima(0);
  const d = new Date(Date.parse(hoy + 'T12:00:00Z'));
  const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400e3).toISOString().slice(0, 10);
  const mes = hoy.slice(0, 8) + '01';

  const T = EQ_T; let t = Date.now();
  const lap = (k) => { const n = Date.now(); T[k] = Math.round((n - t) / 100) / 10; t = n; };
  const sh = SpreadsheetApp.openById(LEADS_ID).getSheetByName(LEADS_PESTANA);
  if (!sh) throw new Error('No encuentro la pestaña ' + LEADS_PESTANA + '.');
  const enc = sh.getRange(2, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  const bloques = eq_estructura(enc);
  if (!bloques.length) throw new Error('No encuentro las columnas de las llamadas en la fila 2.');
  lap('abrir');

  // Última fila con NÚMERO (otras columnas vienen prellenadas hasta muy abajo).
  const colNum = enc.findIndex((h) => eq_txt(h).toUpperCase() === 'NUMERO') + 1 || 4;
  const nums = sh.getRange(3, colNum, Math.max(sh.getLastRow() - 2, 1), 1).getValues();
  let ultima = nums.length;
  while (ultima > 0 && eq_txt(nums[ultima - 1][0]) === '') ultima--;
  if (!ultima) return { hoy: {}, semana: {}, mes: {} };
  lap('numeros');

  // 1) Solo las columnas FECHA: qué filas tienen alguna llamada de este mes.
  const conLlamada = new Array(ultima).fill(false);
  bloques.forEach((b) => {
    sh.getRange(3, b.fecha + 1, ultima, 1).getValues().forEach((r, i) => {
      if (conLlamada[i]) return;
      const f = eq_iso(r[0]);
      if (f && f >= mes && f <= hoy) conLlamada[i] = true;
    });
  });
  lap('fechas');

  // 2) Tramos de filas seguidas (se unen si hay menos de 40 filas entre ellas).
  const tramos = [];
  conLlamada.forEach((ok, i) => {
    if (!ok) return;
    const u = tramos[tramos.length - 1];
    if (u && i - u[1] <= 40) u[1] = i; else tramos.push([i, i]);
  });
  const maxCol = Math.max.apply(null, bloques.map((b) => Math.max(b.asesor, b.timbrada, b.duracion, b.fecha, b.hora, b.estado, b.obs))) + 1;

  const P = { hoy: {}, semana: {}, mes: {} };
  const minutosHoy = {};
  const nueva = () => ({ n: 0, wa: 0, cont: 0, agend: 0, durSum: 0, durN: 0, timbSum: 0, timbN: 0, manual: 0 });

  const procesar = (f) => {
    bloques.forEach((b) => {
      const estado = eq_txt(f[b.estado]).toUpperCase();
      if (!estado) return;
      const fecha = eq_iso(f[b.fecha]);
      if (!fecha || fecha < mes || fecha > hoy) return;
      const ase = eq_nombre(f[b.asesor]) || 'SIN ASESORA';
      const dur = b.duracion >= 0 ? eq_seg(f[b.duracion]) : null;
      const timb = b.timbrada >= 0 ? Number(eq_txt(f[b.timbrada])) || 0 : 0;
      const wa = b.obs >= 0 && /^📲\s*WA/.test(eq_txt(f[b.obs]));
      const periodos = ['mes'].concat(fecha >= lunes ? ['semana'] : [], fecha === hoy ? ['hoy'] : []);
      periodos.forEach((p) => {
        const s = P[p][ase] || (P[p][ase] = nueva());
        s.n++;
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
  // 3) Solo esas filas completas.
  let leidas = 0;
  tramos.forEach((tr) => {
    const n = tr[1] - tr[0] + 1;
    leidas += n;
    sh.getRange(3 + tr[0], 1, n, maxCol).getValues().forEach(procesar);
  });
  T.filas = leidas; T.tramos = tramos.length;
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

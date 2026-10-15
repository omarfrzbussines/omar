/* RURUSH Llamadas — app del celular para que Mónica, Danna y Laura llamen
   desde la base del Sheet "BASE DE DATOS LEADS RFC" y registren el resultado.

   Escribe en el MISMO Sheet y con los MISMOS valores del desplegable, así la hoja
   RESUMEN se sigue llenando sola.

   Acceso: cada asesora abre su link con una llave propia (?k=...). La app corre
   como Omar (que es quien tiene permiso sobre el Sheet); sin llave válida no
   muestra nada. Para quitarle el acceso a alguien: crearLlaves() de nuevo. */

const SHEET_ID = '1DzlEgYAdV02TAtR78zweTI0G-n-RwJwWgfwTqIILoJg';
const ASESORAS = ['MONICA', 'DANNA', 'LAURA'];
const ESTADOS = ['CONTESTO', 'NO CONTESTO', 'CORTO', 'APAGADO', 'AGENDADO', 'CLIENTE', 'DESCARTADO', 'Otra Ciudad'];
const CERRADOS = ['CLIENTE', 'DESCARTADO', 'AGENDADO', 'Otra Ciudad'];   // ya no se vuelven a llamar
const TZ = 'America/Lima';
const TAM_COLA = 30;
const RESERVA_SEG = 30 * 60;   // una persona servida a una asesora no le sale a otra por 30 min

/* Columnas de cada base (índice 0 = columna A). Fila 1 y 2 son encabezados.
   En 2026 la 1ª llamada tiene HORA y FECHA/HORA del FP, pero no OBSERVACIÓN:
   la observación de la 1ª llamada se guarda como nota en la celda ESTADO. */
const BASES = {
  '2026': {
    hoja: '2026', primeraFila: 3, cols: 31,
    dia: 0, origen: 1, nombre: 2, numero: 3,
    rondas: [
      { asesor: 4, fecha: 6, estado: 8, hora: 7, fpFecha: 9, fpHora: 10 },
      { asesor: 11, fecha: 12, estado: 13, obs: 14 },
      { asesor: 15, fecha: 16, estado: 17, obs: 18 },
      { asesor: 19, fecha: 20, estado: 21, obs: 22 },
      { asesor: 23, fecha: 24, estado: 25, obs: 26 },
      { asesor: 27, fecha: 28, estado: 29, obs: 30 }
    ]
  }
};

const HORAS = (() => {
  const out = [];
  for (let m = 6 * 60; m <= 22 * 60 + 30; m += 30) {
    const h = Math.floor(m / 60), mi = m % 60, h12 = ((h + 11) % 12) + 1;
    out.push(`${h12}:${mi ? '30' : '00'} ${h < 12 ? 'am' : 'pm'}`);
  }
  return out;
})();

/* ---------- acceso ---------- */

function asesoraDeLlave(k) {
  const llaves = JSON.parse(PropertiesService.getScriptProperties().getProperty('LLAVES') || '{}');
  const a = llaves[String(k || '')];
  if (!a) throw new Error('Link no válido. Pídele a Omar tu link de acceso.');
  return a;
}

// Ejecutar UNA vez después de publicar (y cada vez que quieras cambiar los links).
// Deja en el registro el link de cada asesora para mandárselo por WhatsApp.
function crearLlaves() {
  const llaves = {};
  const url = ScriptApp.getService().getUrl();
  ASESORAS.forEach(function (a) {
    const k = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    llaves[k] = a;
    Logger.log(a + ' → ' + url + '?k=' + k);
  });
  PropertiesService.getScriptProperties().setProperty('LLAVES', JSON.stringify(llaves));
}

function doGet(e) {
  const k = (e && e.parameter && e.parameter.k) || '';
  let asesora;
  try { asesora = asesoraDeLlave(k); } catch (err) {
    return HtmlService.createHtmlOutput('<p style="font:18px sans-serif;padding:24px">' + err.message + '</p>')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  const t = HtmlService.createTemplateFromFile('Llamadas');
  t.asesora = asesora;
  t.llave = k;
  return t.evaluate()
    .setTitle('RURUSH Llamadas · ' + asesora)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setFaviconUrl('https://em-content.zobj.net/source/apple/391/telephone-receiver_1f4de.png');
}

/* ---------- utilidades ---------- */

const tel9 = (v) => { const d = String(v || '').replace(/\.0$/, '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
const dia = (v) => (v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : '');
const diaCorto = (v) => (v instanceof Date ? Utilities.formatDate(v, TZ, 'dd/MM') : String(v || ''));
const hoyStr = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
function hoyFecha() { const p = hoyStr().split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function horaActual() {
  const n = new Date();
  const h = Number(Utilities.formatDate(n, TZ, 'H')), m = Number(Utilities.formatDate(n, TZ, 'm'));
  const t = Math.min(Math.max(h * 60 + (m < 30 ? 0 : 30), 6 * 60), 22 * 60 + 30);
  return HORAS[(t - 6 * 60) / 30];
}

function hoja(base) {
  const b = BASES[base];
  if (!b) throw new Error('Base desconocida: ' + base);
  return { b: b, sh: SpreadsheetApp.openById(SHEET_ID).getSheetByName(b.hoja) };
}

// Las rondas ya hechas de una fila (con nota de la 1ª como observación)
function rondasDe(b, fila, nota1) {
  const out = [];
  b.rondas.forEach(function (r, i) {
    const asesor = String(fila[r.asesor] || '').trim(), estado = String(fila[r.estado] || '').trim();
    if (!asesor && !estado) return;
    out.push({
      n: i + 1, asesor: asesor, estado: estado,
      fecha: diaCorto(fila[r.fecha]), fechaIso: dia(fila[r.fecha]),
      obs: r.obs != null ? String(fila[r.obs] || '') : (i === 0 ? nota1 || '' : '')
    });
  });
  return out;
}
function siguienteRonda(b, fila) {
  for (let i = 0; i < b.rondas.length; i++) {
    const r = b.rondas[i];
    if (!String(fila[r.asesor] || '').trim() && !String(fila[r.estado] || '').trim()) return i;
  }
  return -1;
}

/* ---------- cola de llamadas ---------- */

function getCola(llave, base, excluir) {
  const t0 = Date.now();
  const asesora = asesoraDeLlave(llave);
  const yaTengo = {};
  (excluir || []).forEach(function (f) { yaTengo[f] = true; });
  const { b, sh } = hoja(base || '2026');
  const ultima = sh.getLastRow();
  const n = ultima - b.primeraFila + 1;
  if (n <= 0) return { asesora: asesora, cola: [], hoy: {} };
  const datos = sh.getRange(b.primeraFila, 1, n, b.cols).getValues();
  const notas = sh.getRange(b.primeraFila, b.rondas[0].estado + 1, n, 1).getNotes();
  const hoy = hoyStr();
  const cache = CacheService.getScriptCache();

  const nuevos = [], seguimiento = [], mias = {};
  ESTADOS.forEach(function (e) { mias[e] = 0; });

  datos.forEach(function (fila, i) {
    const num = tel9(fila[b.numero]);
    const rondas = rondasDe(b, fila, notas[i][0]);
    // conteo de lo que hizo hoy esta asesora (para su marcador)
    rondas.forEach(function (r) { if (r.asesor === asesora && r.fechaIso === hoy && mias[r.estado] != null) mias[r.estado]++; });
    if (!num || yaTengo[b.primeraFila + i]) return;
    const sig = siguienteRonda(b, fila);
    if (sig < 0) return;                                   // ya tiene las 6 llamadas
    const ult = rondas[rondas.length - 1];
    if (ult && CERRADOS.indexOf(ult.estado) >= 0) return;   // cerrado
    if (ult && ult.fechaIso === hoy) return;                // ya lo llamaron hoy
    // si el último que llamó es otra asesora activa, es de ella
    if (ult && ult.asesor && ult.asesor !== asesora && ASESORAS.indexOf(ult.asesor) >= 0) return;
    const item = {
      fila: b.primeraFila + i, numero: num, nombre: String(fila[b.nombre] || '').trim(),
      dia: diaCorto(fila[b.dia]), diaIso: dia(fila[b.dia]), origen: String(fila[b.origen] || ''),
      ronda: sig + 1, rondas: rondas, ultFecha: ult ? ult.fechaIso : ''
    };
    (rondas.length ? seguimiento : nuevos).push(item);
  });

  // primero los nuevos (los más recientes arriba), después los seguimientos más antiguos
  nuevos.sort(function (a, c) { return c.diaIso.localeCompare(a.diaIso); });
  seguimiento.sort(function (a, c) { return a.ultFecha.localeCompare(c.ultFecha); });
  const reservas = cache.getAll(nuevos.concat(seguimiento).slice(0, 400).map(function (x) { return 'r' + base + x.fila; }));
  const cola = nuevos.concat(seguimiento)
    .filter(function (x) { const r = reservas['r' + base + x.fila]; return !r || r === asesora; })
    .slice(0, TAM_COLA);
  const res = {};
  cola.forEach(function (x) { res['r' + base + x.fila] = asesora; });
  if (cola.length) cache.putAll(res, RESERVA_SEG);

  return {
    asesora: asesora, base: base, cola: cola, hoy: mias, estados: ESTADOS, horas: HORAS,
    pendientes: { nuevos: nuevos.length, seguimiento: seguimiento.length },
    ms: Date.now() - t0
  };
}

/* ---------- guardar el resultado ---------- */

function guardar(llave, base, filaN, numero, estado, obs, fpFecha, fpHora) {
  const asesora = asesoraDeLlave(llave);
  if (ESTADOS.indexOf(estado) < 0) throw new Error('Estado no válido.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { b, sh } = hoja(base || '2026');
    const fila = sh.getRange(filaN, 1, 1, b.cols).getValues()[0];
    // protección: si alguien ordenó o movió filas, el número ya no coincide
    if (tel9(fila[b.numero]) !== tel9(numero)) {
      throw new Error('La fila cambió en el Sheet (alguien ordenó o insertó filas). Toca 🔄 para recargar la cola.');
    }
    const i = siguienteRonda(b, fila);
    if (i < 0) throw new Error('Esta persona ya tiene las 6 llamadas.');
    const r = b.rondas[i];
    const set = (col, v) => sh.getRange(filaN, col + 1).setValue(v);
    set(r.asesor, asesora);
    set(r.fecha, hoyFecha());
    if (r.hora != null) set(r.hora, horaActual());
    set(r.estado, estado);
    const nota = String(obs || '').trim();
    if (nota) {
      if (r.obs != null) set(r.obs, nota);
      else sh.getRange(filaN, r.estado + 1).setNote(nota + ' — ' + asesora + ' ' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm'));
    }
    if (estado === 'AGENDADO' && r.fpFecha != null && fpFecha) {
      const p = String(fpFecha).split('-').map(Number);
      set(r.fpFecha, new Date(p[0], p[1] - 1, p[2]));
      if (fpHora && HORAS.indexOf(fpHora) >= 0) set(r.fpHora, fpHora);
    }
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove('r' + base + filaN);
    return { ok: true, ronda: i + 1 };
  } finally {
    lock.releaseLock();
  }
}

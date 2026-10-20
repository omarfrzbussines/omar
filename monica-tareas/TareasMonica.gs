/**
 * Tareas Mónica — crea Tareas de Google (con check) en la cuenta del gym
 * a partir del Sheet "RURUSH — Tareas Mónica".
 *
 * - PENDIENTES: cada fila nueva se crea como tarea. Cuando Mónica la marca
 *   como completada, el script escribe "Hecha" y la hora en el Sheet.
 * - DIARIAS: tareas que se repiten. Cada día que toca, se copian a PENDIENTES.
 *
 * Se instala en la cuenta rurushfitclub@gmail.com (ver README.md).
 */

const SHEET_ID = '1BxF5s3iYkSIr9in1lWthgx83yHWlyin2VIHtAxRKhUE';
const LISTA = '@default';
const LETRA_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S']; // índice de getDay()

/** Corre cada 10 minutos: crea las diarias de hoy, crea tareas nuevas y revisa las completadas. */
function sincronizar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const tz = ss.getSpreadsheetTimeZone();
    generarDiarias_(ss, tz);

    const hoja = ss.getSheetByName('PENDIENTES');
    const ultima = hoja.getLastRow();
    if (ultima < 2) return;
    const rango = hoja.getRange(2, 1, ultima - 1, 7);
    const vals = rango.getValues();
    const horas = rango.getDisplayValues(); // la hora tal como se ve, sin líos de zona horaria

    vals.forEach(function (r, i) {
      const fila = i + 2;
      if (!r[0]) return;
      const id = String(r[6] || '');
      if (!id) {
        const tarea = { title: titulo_(r[0], horas[i][2]), notes: String(r[3] || '') };
        if (r[1] instanceof Date) tarea.due = Utilities.formatDate(r[1], tz, 'yyyy-MM-dd') + 'T00:00:00.000Z';
        const creada = Tasks.Tasks.insert(tarea, LISTA);
        hoja.getRange(fila, 5).setValue('Enviada');
        hoja.getRange(fila, 7).setValue(creada.id);
      } else if (r[4] === 'Enviada') {
        let t = null;
        try { t = Tasks.Tasks.get(LISTA, id); } catch (e) {}
        if (!t || t.deleted) {
          hoja.getRange(fila, 5).setValue('Borrada');
        } else if (t.status === 'completed') {
          hoja.getRange(fila, 5, 1, 2).setValues([['Hecha', new Date(t.completed)]]);
        }
      }
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/** Copia a PENDIENTES las tareas de DIARIAS que tocan hoy (una sola vez por día). */
function generarDiarias_(ss, tz) {
  const hoja = ss.getSheetByName('DIARIAS');
  const ultima = hoja.getLastRow();
  if (ultima < 2) return;
  const ahora = new Date();
  const hoyISO = Utilities.formatDate(ahora, tz, 'yyyy-MM-dd');
  const letra = LETRA_DIA[Number(Utilities.formatDate(ahora, tz, 'u')) % 7]; // u: 1 = lunes … 7 = domingo
  const hoy = Utilities.parseDate(hoyISO, tz, 'yyyy-MM-dd');
  const rango = hoja.getRange(2, 1, ultima - 1, 5);
  const vals = rango.getValues();
  const horas = rango.getDisplayValues();
  const nuevas = [];

  vals.forEach(function (r, i) {
    if (!r[0]) return;
    const dias = String(r[2] || '').toUpperCase().split(/[\s,;]+/);
    if (dias.indexOf('TODOS') === -1 && dias.indexOf(letra) === -1) return;
    if (r[4] instanceof Date && Utilities.formatDate(r[4], tz, 'yyyy-MM-dd') === hoyISO) return;
    nuevas.push([r[0], hoy, horas[i][1], r[3], '', '', '']);
    hoja.getRange(i + 2, 5).setValue(hoy);
  });

  if (nuevas.length) {
    const pend = ss.getSheetByName('PENDIENTES');
    pend.getRange(pend.getLastRow() + 1, 1, nuevas.length, 7).setValues(nuevas);
    SpreadsheetApp.flush();
  }
}

function titulo_(tarea, hora) {
  hora = String(hora || '').trim();
  return (hora ? hora + ' · ' : '') + String(tarea).trim();
}

/** Ejecutar UNA vez: programa sincronizar cada 10 minutos y lo corre ahora. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(10).create();
  sincronizar();
}

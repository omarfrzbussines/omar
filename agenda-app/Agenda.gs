/**
 * Agenda Omar — web app para el celular conectada al Sheet
 * "RURUSH — Tablero de Tareas 2026".
 *
 * Lee y escribe directo en la pestaña TAREAS. Al completar una tarea
 * la pasa a la pestaña HECHAS, igual que se hace a mano.
 */

const SPREADSHEET_ID = '11QQUNxxRKVwmLi-x0jqdGduVBmC3fCcG8VPNdUItO6c';
const HOJA_TAREAS = 'TAREAS';
const HOJA_HECHAS = 'HECHAS';
const NUM_COLS = 7; // TAREA, RESPONSABLE, ÁREA, PRIORIDAD, ESTADO, FECHA LÍMITE, NOTAS
const RANGO_ESTADO = { 'En proceso': 1, 'Pendiente': 2, 'Idea': 3, 'Hecho': 4 };

function doGet() {
  return HtmlService.createHtmlOutputFromFile('AgendaApp')
    .setTitle('Agenda Omar')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('mobile-web-app-capable', 'yes');
}

/** Devuelve todas las tareas de TAREAS y las listas para los formularios. */
function getData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const hoja = ss.getSheetByName(HOJA_TAREAS);
  const tz = ss.getSpreadsheetTimeZone();
  const ultima = hoja.getLastRow();
  const tareas = [];

  if (ultima >= 2) {
    hoja.getRange(2, 1, ultima - 1, NUM_COLS).getValues().forEach(function (r, i) {
      if (!r[0]) return;
      tareas.push({
        row: i + 2,
        titulo: String(r[0]),
        responsable: String(r[1] || ''),
        area: String(r[2] || ''),
        prioridad: String(r[3] || ''),
        estado: String(r[4] || ''),
        fecha: r[5] instanceof Date ? Utilities.formatDate(r[5], tz, 'yyyy-MM-dd') : '',
        notas: String(r[6] || '')
      });
    });
  }

  const hoy = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return {
    tareas: tareas,
    hoy: hoy,
    eventos: eventosCalendar_(tz, hoy),
    personas: listaValidacion_(hoja, 2, ['Omar', 'Mónica', 'Dana', 'Brian', 'POR ASIGNAR']),
    areas: listaValidacion_(hoja, 3, ['Dirección', 'Ventas', 'Entrenamiento', 'Marketing', 'Administración', 'Rápida', 'Personal'])
  };
}

/** Marca la tarea como Hecho, la copia a HECHAS con la fecha de hoy y la borra de TAREAS. */
function completarTarea(row, titulo) {
  return conBloqueo_(function (ss, hoja, tz) {
    const fila = buscarFila_(hoja, row, titulo);
    const valores = hoja.getRange(fila, 1, 1, NUM_COLS).getValues()[0];
    valores[4] = 'Hecho';
    valores[5] = fechaDesdeISO_(Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), tz);
    ss.getSheetByName(HOJA_HECHAS).appendRow(valores);
    hoja.deleteRow(fila);
  });
}

/**
 * Pasa a HECHAS todas las filas de TAREAS con estado "Hecho" y las borra de TAREAS.
 * Corre sola cada noche (ver instalarArchivoAutomatico) para las tareas que se
 * marcan como hechas directo en el Sheet. Conserva la fecha que tenía la tarea.
 */
function archivarHechas() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const hoja = ss.getSheetByName(HOJA_TAREAS);
    const ultima = hoja.getLastRow();
    if (ultima < 2) return 0;
    const vals = hoja.getRange(2, 1, ultima - 1, NUM_COLS).getValues();
    const filas = [];
    const copiar = [];
    vals.forEach(function (r, i) {
      if (r[0] && String(r[4]).trim() === 'Hecho') {
        filas.push(i + 2);
        copiar.push(r);
      }
    });
    if (!copiar.length) return 0;
    const hechas = ss.getSheetByName(HOJA_HECHAS);
    hechas.getRange(hechas.getLastRow() + 1, 1, copiar.length, NUM_COLS).setValues(copiar);
    // De abajo hacia arriba para que no se corran las filas.
    for (let i = filas.length - 1; i >= 0; i--) hoja.deleteRow(filas[i]);
    SpreadsheetApp.flush();
    return copiar.length;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ejecutar UNA vez desde el editor: programa archivarHechas todos los días a las 11 pm.
 * Si se ejecuta de nuevo, reemplaza el programa anterior en vez de duplicarlo.
 */
function instalarArchivoAutomatico() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'archivarHechas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('archivarHechas').timeBased().everyDays(1).atHour(23).create();
}

/** Agrega una tarea nueva en su lugar según estado y fecha. */
function agregarTarea(t) {
  return conBloqueo_(function (ss, hoja, tz) {
    if (!t || !String(t.titulo || '').trim()) throw new Error('La tarea no tiene texto');
    const fecha = t.fecha ? fechaDesdeISO_(t.fecha, tz) : '';
    const valores = [
      String(t.titulo).trim(),
      t.responsable || 'Omar',
      t.area || 'Rápida',
      t.prioridad || 'Media',
      'Pendiente',
      fecha,
      t.notas || ''
    ];
    const pos = posicionOrdenada_(hoja, 'Pendiente', fecha, null);
    hoja.insertRowBefore(pos);
    copiarFormato_(hoja, pos);
    hoja.getRange(pos, 1, 1, NUM_COLS).setValues([valores]);
  });
}

/**
 * Cambia fecha, prioridad, responsable o estado de una tarea
 * y la mueve a su lugar para que la lista siga ordenada.
 */
function actualizarTarea(row, titulo, cambios) {
  return conBloqueo_(function (ss, hoja, tz) {
    const fila = buscarFila_(hoja, row, titulo);
    if ('responsable' in cambios) hoja.getRange(fila, 2).setValue(cambios.responsable);
    if ('prioridad' in cambios) hoja.getRange(fila, 4).setValue(cambios.prioridad);
    if ('estado' in cambios) hoja.getRange(fila, 5).setValue(cambios.estado);
    if ('fecha' in cambios) hoja.getRange(fila, 6).setValue(cambios.fecha ? fechaDesdeISO_(cambios.fecha, tz) : '');

    const fecha = hoja.getRange(fila, 6).getValue();
    const estado = hoja.getRange(fila, 5).getValue();
    const destino = posicionOrdenada_(hoja, estado, fecha, fila);
    if (destino !== fila && destino !== fila + 1) {
      hoja.moveRows(hoja.getRange(fila, 1), destino);
    }
  });
}

/**
 * Eventos del Google Calendar principal desde hoy hasta 7 días después.
 * Solo se leen: la app nunca crea ni cambia eventos.
 * Devuelve null si la app todavía no tiene permiso de Calendar.
 */
function eventosCalendar_(tz, hoyISO) {
  try {
    const inicio = Utilities.parseDate(hoyISO, tz, 'yyyy-MM-dd');
    const fin = new Date(inicio.getTime() + 8 * 24 * 60 * 60 * 1000);
    return CalendarApp.getDefaultCalendar().getEvents(inicio, fin).map(function (e) {
      const todoElDia = e.isAllDayEvent();
      return {
        titulo: e.getTitle() || '(Sin título)',
        fecha: Utilities.formatDate(e.getStartTime(), tz, 'yyyy-MM-dd'),
        inicio: todoElDia ? '' : Utilities.formatDate(e.getStartTime(), tz, 'HH:mm'),
        fin: todoElDia ? '' : Utilities.formatDate(e.getEndTime(), tz, 'HH:mm'),
        todoElDia: todoElDia,
        lugar: e.getLocation() || ''
      };
    });
  } catch (err) {
    return null;
  }
}

// ---------- Ayudantes ----------

function conBloqueo_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    fn(ss, ss.getSheetByName(HOJA_TAREAS), ss.getSpreadsheetTimeZone());
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return getData();
}

/** Confirma que la fila sigue teniendo esa tarea; si se movió, la busca por el texto. */
function buscarFila_(hoja, row, titulo) {
  if (row >= 2 && row <= hoja.getLastRow() && hoja.getRange(row, 1).getValue() === titulo) return row;
  const ultima = hoja.getLastRow();
  if (ultima >= 2) {
    const col = hoja.getRange(2, 1, ultima - 1, 1).getValues();
    for (let i = 0; i < col.length; i++) {
      if (col[i][0] === titulo) return i + 2;
    }
  }
  throw new Error('No encontré la tarea "' + titulo + '". Actualiza la app y vuelve a intentar.');
}

/**
 * Fila donde debe ir una tarea para respetar el orden de la lista:
 * En proceso, Pendiente, Idea, Hecho; y dentro de cada grupo por fecha (sin fecha al final).
 */
function posicionOrdenada_(hoja, estado, fecha, excluir) {
  const clave = claveOrden_(estado, fecha);
  const ultima = hoja.getLastRow();
  if (ultima < 2) return 2;
  const vals = hoja.getRange(2, 1, ultima - 1, 6).getValues();
  for (let i = 0; i < vals.length; i++) {
    const fila = i + 2;
    if (fila === excluir) continue;
    if (!vals[i][0]) return fila;
    const otra = claveOrden_(vals[i][4], vals[i][5]);
    if (otra[0] > clave[0] || (otra[0] === clave[0] && otra[1] > clave[1])) return fila;
  }
  return ultima + 1;
}

function claveOrden_(estado, fecha) {
  return [RANGO_ESTADO[estado] || 2, fecha instanceof Date ? fecha.getTime() : Infinity];
}

function copiarFormato_(hoja, fila) {
  const ref = fila > 2 ? fila - 1 : fila + 1;
  if (ref < 2 || ref > hoja.getMaxRows()) return;
  const origen = hoja.getRange(ref, 1, 1, NUM_COLS);
  const destino = hoja.getRange(fila, 1, 1, NUM_COLS);
  origen.copyTo(destino, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  origen.copyTo(destino, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
}

function fechaDesdeISO_(iso, tz) {
  return Utilities.parseDate(iso, tz, 'yyyy-MM-dd');
}

function listaValidacion_(hoja, col, porDefecto) {
  try {
    const regla = hoja.getRange(2, col).getDataValidation();
    const valores = regla && regla.getCriteriaValues()[0];
    if (Array.isArray(valores) && valores.length) return valores.map(String);
  } catch (e) {}
  return porDefecto;
}

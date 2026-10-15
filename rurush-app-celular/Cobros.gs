/* RURUSH Hoy → pestaña 💰 Cobros (solo lectura).
   Lee la pestaña "2. COLA RENOVAR" del Sheet VENTAS RETENCIÓN 2026 V2: los mismos cobros que las
   asesoras ven y marcan en la app RURUSH Llamadas.
   K = asesor · N = monto · O = RENOVADO? ("SÍ" = cobrado) · S = fecha de cobro · V = días sin asistir.
   Cuenta igual que el cuadro DASHBOARD POR ASESOR del Sheet: fila 8 hasta el final, S con fecha. */

const COBR_ID = '1j6Js9ToQUJ96yCUmMKh5jmEAebfNSzlpYs5ItSEDuUI';
const COBR_HOJA = '2. COLA RENOVAR';
const COBR_HEADER = 7;
// índices desde la columna B
const COBR = { cod: 0, nombre: 1, cel: 2, plan: 3, asesor: 9, monto: 12, renovado: 13, fecha: 17, notas: 18, diasSA: 20 };
const COBR_ANCHO = 21;   // B..V

const cobrNorm = (s) => String(s == null ? '' : s).trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Fecha real de la celda (Date o serial de Sheets) → "yyyy-MM-dd". Texto no cuenta, igual que en el cuadro.
function cobrIso(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Lima', 'yyyy-MM-dd');
  if (typeof v === 'number' && v > 40000 && v < 60000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  return '';
}

function cobrLeer() {
  if (typeof Sheets !== 'undefined') {
    const r = Sheets.Spreadsheets.Values.get(COBR_ID, `'${COBR_HOJA}'!B${COBR_HEADER}:V`,
      { valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
    return r.values || [];
  }
  const hoja = SpreadsheetApp.openById(COBR_ID).getSheetByName(COBR_HOJA);
  return hoja.getRange(COBR_HEADER, 2, hoja.getLastRow() - COBR_HEADER + 1, COBR_ANCHO).getValues();
}

/** Todos los cobros con fecha (pendientes y cobrados). El celular filtra por mes y asesora. */
function getCobros() {
  const t0 = Date.now();
  const v = cobrLeer();
  const t = v[0] || [];
  if (cobrNorm(t[COBR.cod]) !== 'COD' || cobrNorm(t[COBR.asesor]) !== 'ASESOR' || cobrNorm(t[COBR.fecha]) !== 'FECHA COBRO')
    throw new Error(`La pestaña '${COBR_HOJA}' cambió de columnas (se esperaba B=Cod, K=ASESOR, S=FECHA COBRO).`);
  const hoy = fechaLima(0);
  const lista = [];
  for (let i = 1; i < v.length; i++) {
    const f = v[i];
    if (!String(f[COBR.cod] == null ? '' : f[COBR.cod]).trim()) continue;
    const monto = typeof f[COBR.monto] === 'number' ? f[COBR.monto] : 0;
    const fecha = cobrIso(f[COBR.fecha]);
    if (!fecha || !(monto > 0)) continue;
    const sa = f[COBR.diasSA];
    lista.push({
      fila: COBR_HEADER + i, codigo: String(f[COBR.cod]).trim(), nombre: String(f[COBR.nombre] || '').trim(),
      tel: tel9(f[COBR.cel]), plan: String(f[COBR.plan] || '').trim(), asesora: String(f[COBR.asesor] || '').trim() || 'SIN ASIGNAR',
      monto: monto, fecha: fecha, dias: diasEntre(hoy, fecha), cobrado: cobrNorm(f[COBR.renovado]) === 'SI',
      notas: String(f[COBR.notas] || '').trim(), diasSA: sa === '' || sa == null || !isFinite(Number(sa)) ? null : Math.round(Number(sa))
    });
  }
  lista.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila - b.fila);
  return { hoy: hoy, lista: lista, generado: Utilities.formatDate(new Date(), 'America/Lima', 'HH:mm'), seg: ((Date.now() - t0) / 1000).toFixed(1) };
}

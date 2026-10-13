/* RURUSH Nutrición — App de Diego (consulta en PC, sin Claude).
   Se abre con el link de la app web de este proyecto + ?app=diego  (ej. .../exec?app=diego).
   Lee y escribe la pestaña CONTROL NUTRICIÓN y Pipedrive, con las mismas reglas que Nutricion.gs:
   solo martes y miércoles (NU_DIAS_DIEGO), solo las horas de NU_HORAS, nunca para hoy y sin choques.
   Propiedades del script: PIPEDRIVE_TOKEN (ya existe) y DIEGO_PIN (clave de 4-6 números para Diego).
   Las filas se buscan por act_id (col L), nunca por número de fila. */

const DG_HOJA = 'CONTROL NUTRICIÓN';
const DG_SHEET_ID = '1TCaxgkM0CLnDr4b_gdK4wQH6rugpSiwuulIspkRhnIg';
const DG_REAG = 'REAGENDAR NUTRICIÓN';
const DG_PRIMERA_FILA = 3;
// columnas de CONTROL NUTRICIÓN (1 = A)
const K = { FECHA: 1, HORA: 2, SOCIO: 3, TEL: 4, ESTADO: 5, HECHO: 6, INBODY: 7, OBS: 8, PFECHA: 9, PHORA: 10,
            AGENDAR: 11, ACT: 12, PID: 13, NOTA: 14, NOTA_IB: 15, PACT: 16 };
const DG_NCOL = 16;

/* ---------- entrada ---------- */
function dg_pagina() {
  return HtmlService.createTemplateFromFile('AppDiegoUI').evaluate()
    .setTitle('Nutrición Rurush')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function dg_pin(pin) {
  const p = nu_props().getProperty('DIEGO_PIN');
  if (!p) throw new Error('Falta configurar la clave: en Apps Script → Configuración del proyecto → Propiedades del script, agrega DIEGO_PIN.');
  if (String(pin || '') !== p) throw new Error('PIN');
}
function dg_lock(fn) {
  const l = LockService.getScriptLock();
  if (!l.tryLock(25000)) throw new Error('Otra persona está guardando en este momento. Vuelve a intentar en unos segundos.');
  try { return fn(); } finally { l.releaseLock(); }
}

/* ---------- fechas y horas (Lima = UTC-5, sin horario de verano) ---------- */
function dg_hhmm(t) {               // "8:00", "17:30", "5:30 pm" → "08:00" / "17:30"
  const m = String(t || '').match(/(\d{1,2}):(\d{2})\s*([ap])?/i);
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3] && /p/i.test(m[3]) && h < 12) h += 12;
  if (m[3] && /a/i.test(m[3]) && h === 12) h = 0;
  return nu_pad(h) + ':' + m[2];
}
// fecha y hora de Lima → due_date / due_time en UTC para Pipedrive (19:30 Lima = 00:30 del día siguiente en UTC)
function dg_utc(fecha, hora) {
  const u = new Date(Date.parse(fecha + 'T' + hora + ':00Z') + 5 * 3600e3).toISOString();
  return { due_date: u.slice(0, 10), due_time: u.slice(11, 16) };
}
function dg_ahora() {               // { fecha: 'yyyy-MM-dd', hora: 'HH:mm' } en Lima
  const l = new Date(Date.now() - 5 * 3600e3).toISOString();
  return { fecha: l.slice(0, 10), hora: l.slice(11, 16) };
}
function dg_sello() { const a = dg_ahora(); return a.fecha.slice(8) + '/' + a.fecha.slice(5, 7) + ' ' + a.hora; }

/* ---------- hoja ---------- */
function dg_hoja() { return SpreadsheetApp.getActive().getSheetByName(DG_HOJA); }   // el script vive en la hoja: sin permisos nuevos
function dg_leer(sh) {
  const n = sh.getLastRow() - DG_PRIMERA_FILA + 1;
  if (n <= 0) return [];
  const rg = sh.getRange(DG_PRIMERA_FILA, 1, n, DG_NCOL);
  const v = rg.getValues(), d = rg.getDisplayValues();
  return v.map((r, i) => ({
    fila: i + DG_PRIMERA_FILA,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(d[i][0]) ? d[i][0] : nu_iso(r[0]),
    hora: dg_hhmm(d[i][1]), socio: String(r[2] || '').trim(), tel: String(d[i][3] || '').trim(),
    estado: String(r[4] || ''), hecho: r[5] === true, inbody: r[6] === true, obs: String(r[7] || '').trim(),
    pfecha: /^\d{4}-\d{2}-\d{2}$/.test(d[i][8]) ? d[i][8] : (d[i][8] ? 'invalida:' + d[i][8] : ''),
    phora: dg_hhmm(d[i][9]), agendar: r[10] === true, act: String(r[11] || '').trim(), pid: String(r[12] || '').trim(),
    nota: String(r[13] || '').trim(), notaIb: String(r[14] || '').trim(), pact: String(r[15] || '').trim()
  })).filter((x) => x.socio);
}
function dg_fila(sh, act) {
  const f = dg_leer(sh).filter((x) => x.act === String(act))[0];
  if (!f) throw new Error('No encontré esa cita en la hoja (actividad ' + act + '). Actualiza la lista: quizá alguien la movió o la borró.');
  return f;
}
function dg_set(sh, fila, col, valor) { sh.getRange(fila, col).setValue(valor); }
function dg_obsMas(f, txt) { return (f.obs ? f.obs + ' · ' : '') + txt; }
// agrega una fila con el formato y las casillas de la última fila
function dg_nuevaFila(sh, datos) {
  const ult = sh.getLastRow(), nueva = ult + 1;
  if (ult >= DG_PRIMERA_FILA) {
    const src = sh.getRange(ult, 1, 1, DG_NCOL), dst = sh.getRange(nueva, 1, 1, DG_NCOL);
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    src.copyTo(dst, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
  }
  const fila = new Array(DG_NCOL).fill('');
  Object.keys(datos).forEach((k) => { fila[K[k] - 1] = datos[k]; });
  sh.getRange(nueva, 1, 1, DG_NCOL).setValues([fila]);
  return nueva;
}

/* ---------- Pipedrive ---------- */
function dg_nota(pid, html) {
  if (!pid) return '';
  const j = nu_pd('/notes', { method: 'post', contentType: 'application/json', payload: JSON.stringify({ person_id: Number(pid), content: html }) });
  return j.data ? String(j.data.id) : '';
}
function dg_act(id, cambios) {
  nu_pd('/activities/' + id, { method: 'put', contentType: 'application/json', payload: JSON.stringify(cambios) });
}
function dg_sinTilde(s) { return String(s || '').replace(/[<>&]/g, ''); }

/* Reglas para poner una cita: martes/miércoles, desde mañana, hora de la lista y hora libre.
   `excepto` = act_id que se está moviendo (su propio horario no cuenta como ocupado). */
function dg_validarCita(fecha, hora, pid, excepto) {
  const hoy = nu_hoy();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Elige una fecha.');
  if (fecha <= hoy) throw new Error('Hoy no se agenda: elige una fecha desde mañana.');
  if (NU_DIAS_DIEGO.indexOf(nu_dow(fecha)) < 0) throw new Error('Diego atiende solo martes y miércoles. El ' + nu_lab(fecha) + ' no hay consulta.');
  if (NU_HORAS.indexOf(hora) < 0) throw new Error('Elige una hora de la lista (8:00 a 10:30 am o 5:00 a 7:30 pm).');
  const citas = nu_citas(fecha, fecha, false).concat(nu_citas(fecha, fecha, true));
  const choque = citas.filter((c) => c.hora === hora && String(c.id) !== String(excepto))[0];
  if (choque) throw new Error('Esa hora ya está ocupada (' + (choque.nombre || choque.asunto) + '). Libres ese día: ' + dg_libresTxt(fecha, excepto));
  if (pid) {
    const otra = nu_citas(hoy, nu_mas(hoy, 90), false).filter((c) => c.pid === String(pid) && String(c.id) !== String(excepto) && c.ms > Date.now())[0];
    if (otra) throw new Error('Este socio ya tiene una cita el ' + nu_lab(otra.fecha) + ' a las ' + nu_horaTxt(otra.hora) + '. Reagenda esa en lugar de crear otra.');
  }
}
function dg_libresLista(fecha, excepto) {
  const ocup = {};
  nu_citas(fecha, fecha, false).concat(nu_citas(fecha, fecha, true)).forEach((c) => { if (String(c.id) !== String(excepto)) ocup[c.hora] = 1; });
  return NU_HORAS.filter((h) => !ocup[h]);
}
function dg_libresTxt(fecha, excepto) { const l = dg_libresLista(fecha, excepto); return l.length ? l.map(nu_horaTxt).join(', ') : 'ninguna'; }

// crea la cita en Pipedrive y su fila PENDIENTE en la hoja; devuelve el act_id
function dg_crearCita(sh, pid, nombre, tel, fecha, hora, nota) {
  const due = dg_utc(fecha, hora);
  const j = nu_pd('/activities', { method: 'post', contentType: 'application/json', payload: JSON.stringify({
    subject: 'Nutrición — ' + nombre, type: 'deadline', person_id: pid ? Number(pid) : undefined, user_id: NU_DIEGO,
    due_date: due.due_date, due_time: due.due_time, duration: '00:30' }) });
  const act = String(j.data.id);
  dg_nuevaFila(sh, { FECHA: fecha, HORA: hora, SOCIO: nombre, TEL: tel || '', ESTADO: 'PENDIENTE', HECHO: false, INBODY: false,
                     OBS: nota || '', AGENDAR: false, ACT: Number(act), PID: pid ? Number(pid) : '' });
  return act;
}

/* ================= funciones que llama la app ================= */

function dg_datos(pin) {
  dg_pin(pin);
  const sh = dg_hoja(), filas = dg_leer(sh);
  const tels = {};
  const rg = sh.getParent().getSheetByName(DG_REAG);
  if (rg && rg.getLastRow() > 1) rg.getRange(2, 1, rg.getLastRow() - 1, 16).getDisplayValues().forEach((r) => {
    const pid = String(r[15] || '').trim(), t = nu_tel(r[3]);
    if (pid && t && !tels[pid]) tels[pid] = t;
  });
  return { hoy: nu_hoy(), ahora: dg_ahora().hora, horas: NU_HORAS, dias: NU_DIAS_DIEGO, filas: filas, tels: tels,
           hojaUrl: 'https://docs.google.com/spreadsheets/d/' + DG_SHEET_ID + '/edit#gid=' + sh.getSheetId() };
}

function dg_libres(pin, fecha, excepto) {
  dg_pin(pin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) return { libres: [], motivo: 'Elige una fecha.' };
  if (fecha <= nu_hoy()) return { libres: [], motivo: 'Hoy no se agenda: elige una fecha desde mañana.' };
  if (NU_DIAS_DIEGO.indexOf(nu_dow(fecha)) < 0) return { libres: [], motivo: 'Ese día no hay consulta (solo martes y miércoles).' };
  return { libres: dg_libresLista(fecha, excepto), motivo: '' };
}

/* ✅ Asistió: observación obligatoria, nota en Pipedrive, cita hecha y (opcional) próxima cita */
function dg_asistio(pin, q) {
  dg_pin(pin);
  const obs = String(q.obs || '').trim();
  if (obs.length < 3) throw new Error('Escribe la observación de la evaluación (por ejemplo "-1.5 kg de grasa").');
  return dg_lock(() => {
    const sh = dg_hoja(), f = dg_fila(sh, q.act);
    if (f.hecho) throw new Error(f.socio + ' ya estaba marcado como evaluado.');
    if (f.fecha > nu_hoy()) throw new Error('Esta cita es del ' + nu_lab(f.fecha) + '. Si ' + f.socio + ' vino hoy sin esperar su fecha, usa "Sin cita" y luego cancela esta.');
    if (q.prox && q.prox.fecha) dg_validarCita(q.prox.fecha, q.prox.hora, f.pid, f.act);   // validar antes de tocar nada
    const nota = dg_nota(f.pid, '<b>🥗 Evaluación nutricional ' + nu_ddmm(f.fecha) + '</b><br>' + dg_sinTilde(obs) +
      (q.inbody ? '<br>📄 InBody subido a Drive.' : '') + '<br><i>Registrado por Diego desde la app.</i>');
    try { dg_act(f.act, { done: 1 }); } catch (e) { /* la nota ya quedó; la actividad se puede cerrar luego */ }
    dg_set(sh, f.fila, K.HECHO, true);
    dg_set(sh, f.fila, K.INBODY, !!q.inbody);
    dg_set(sh, f.fila, K.OBS, obs);
    dg_set(sh, f.fila, K.NOTA, nota ? Number(nota) : '');
    dg_set(sh, f.fila, K.ESTADO, 'HECHO ✓ + nota · ' + dg_sello());
    let prox = null;
    if (q.prox && q.prox.fecha) prox = dg_proxima_(sh, f, q.prox.fecha, q.prox.hora);
    return { ok: true, msg: f.socio + ' quedó evaluado' + (prox ? ' · próxima cita ' + nu_lab(q.prox.fecha) + ' ' + nu_horaTxt(q.prox.hora) : '') };
  });
}
function dg_proxima_(sh, f, fecha, hora) {
  const act = dg_crearCita(sh, f.pid, f.socio.replace(/^Nutrición — /, ''), f.tel, fecha, hora, 'Control (viene de la evaluación del ' + nu_ddmm(f.fecha) + ')');
  dg_set(sh, f.fila, K.PFECHA, fecha);
  dg_set(sh, f.fila, K.PHORA, nu_horaTxt(hora).replace(/^(\d+) /, '$1:00 '));
  dg_set(sh, f.fila, K.AGENDAR, true);
  dg_set(sh, f.fila, K.PACT, Number(act));
  return act;
}

/* 📅 Agendar la próxima cita de alguien que ya fue evaluado */
function dg_agendarProxima(pin, q) {
  dg_pin(pin);
  return dg_lock(() => {
    const sh = dg_hoja(), f = dg_fila(sh, q.act);
    if (!f.hecho) throw new Error('Primero marca la evaluación de ' + f.socio + ' como hecha.');
    if (f.agendar && f.pact) throw new Error(f.socio + ' ya tiene su próxima cita agendada.');
    dg_validarCita(q.fecha, q.hora, f.pid, null);
    dg_proxima_(sh, f, q.fecha, q.hora);
    return { ok: true, msg: 'Próxima cita de ' + f.socio + ': ' + nu_lab(q.fecha) + ' ' + nu_horaTxt(q.hora) };
  });
}

/* ❌ No vino: la actividad queda PENDIENTE en Pipedrive a propósito, así el seguimiento de las 11:30
   (nu_plan) la detecta como no-show y le manda el mensaje para reagendar. */
function dg_noVino(pin, q) {
  dg_pin(pin);
  return dg_lock(() => {
    const sh = dg_hoja(), f = dg_fila(sh, q.act);
    if (f.hecho) throw new Error(f.socio + ' figura como evaluado. Si fue un error, usa "Deshacer evaluación" primero.');
    if (f.fecha > nu_hoy()) throw new Error('La cita de ' + f.socio + ' todavía no llega. Si avisó que no vendrá, usa Reagendar o Cancelar.');
    dg_set(sh, f.fila, K.ESTADO, 'NO VINO · ' + dg_sello());
    dg_set(sh, f.fila, K.OBS, dg_obsMas(f, 'No vino' + (q.nota ? ': ' + q.nota : '')));
    if (f.pid) dg_nota(f.pid, '❌ No asistió a su evaluación nutricional del ' + nu_ddmm(f.fecha) + ' ' + nu_horaTxt(f.hora) + (q.nota ? '. ' + dg_sinTilde(q.nota) : '') + '.');
    return { ok: true, msg: f.socio + ' marcado como no vino. El seguimiento de las 11:30 le escribirá para reagendar.' };
  });
}

/* 🔁 Reagendar: mueve la MISMA cita (misma actividad de Pipedrive, misma fila) */
function dg_reagendar(pin, q) {
  dg_pin(pin);
  return dg_lock(() => {
    const sh = dg_hoja(), f = dg_fila(sh, q.act);
    if (f.hecho) throw new Error(f.socio + ' ya fue evaluado. Para su siguiente control usa "Agendar próxima".');
    if (q.fecha === f.fecha && q.hora === f.hora) throw new Error('Es la misma fecha y hora que ya tenía.');
    dg_validarCita(q.fecha, q.hora, f.pid, f.act);
    dg_act(f.act, Object.assign(dg_utc(q.fecha, q.hora), { done: 0 }));
    dg_set(sh, f.fila, K.FECHA, q.fecha);
    dg_set(sh, f.fila, K.HORA, q.hora);
    dg_set(sh, f.fila, K.ESTADO, 'PENDIENTE');
    dg_set(sh, f.fila, K.OBS, dg_obsMas(f, 'Reagendada de ' + nu_ddmm(f.fecha) + ' ' + nu_horaTxt(f.hora || '00:00') + (q.motivo ? ' (' + q.motivo + ')' : '')));
    return { ok: true, msg: f.socio + ' pasó al ' + nu_lab(q.fecha) + ' ' + nu_horaTxt(q.hora) };
  });
}

/* 🚫 Cancelar o marcar duplicado: la fila se conserva (historial); la actividad se cierra con el motivo en el asunto */
function dg_cancelar(pin, q) {
  dg_pin(pin);
  const tipo = q.tipo === 'duplicado' ? 'DUPLICADO' : 'CANCELADA';
  if (tipo === 'CANCELADA' && String(q.motivo || '').trim().length < 3) throw new Error('Escribe por qué se cancela (por ejemplo "viajó", "ya no quiere").');
  return dg_lock(() => {
    const sh = dg_hoja(), f = dg_fila(sh, q.act);
    if (f.hecho) throw new Error(f.socio + ' ya fue evaluado: no se puede cancelar una cita hecha.');
    try { dg_act(f.act, { done: 1, subject: tipo + ' — ' + f.socio }); } catch (e) { /* si ya no existe en Pipedrive, igual se marca en la hoja */ }
    dg_set(sh, f.fila, K.ESTADO, tipo + ' · ' + dg_sello());
    dg_set(sh, f.fila, K.OBS, dg_obsMas(f, tipo === 'DUPLICADO' ? 'DUPLICADO – no marcar' : 'Cancelada: ' + q.motivo));
    return { ok: true, msg: 'Cita de ' + f.socio + ' ' + (tipo === 'DUPLICADO' ? 'marcada como duplicado' : 'cancelada') + '.' };
  });
}

/* ↩ Deshacer: vuelve una cita a PENDIENTE (si se marcó HECHO o NO VINO por error) */
function dg_deshacer(pin, q) {
  dg_pin(pin);
  return dg_lock(() => {
    const sh = dg_hoja(), f = dg_fila(sh, q.act);
    if (f.hecho) {
      [f.nota, f.notaIb].forEach((n) => { if (n) try { nu_pd('/notes/' + n, { method: 'delete' }); } catch (e) { /* ya borrada */ } });
      try { dg_act(f.act, { done: 0 }); } catch (e) { /* sin actividad */ }
      dg_set(sh, f.fila, K.HECHO, false);
      dg_set(sh, f.fila, K.INBODY, false);
      dg_set(sh, f.fila, K.NOTA, '');
      dg_set(sh, f.fila, K.NOTA_IB, '');
    } else if (!/^(NO VINO|CANCELADA|DUPLICADO)/.test(f.estado)) {
      throw new Error('No hay nada que deshacer en esta cita.');
    } else if (/^(CANCELADA|DUPLICADO)/.test(f.estado)) {
      try { dg_act(f.act, { done: 0, subject: 'Nutrición — ' + f.socio }); } catch (e) { /* sin actividad */ }
    }
    dg_set(sh, f.fila, K.ESTADO, 'PENDIENTE');
    dg_set(sh, f.fila, K.OBS, dg_obsMas(f, 'Corregido ' + dg_sello()));
    const aviso = f.pact ? ' Ojo: su próxima cita (actividad ' + f.pact + ') sigue agendada; cancélala aparte si no corresponde.' : '';
    return { ok: true, msg: f.socio + ' volvió a pendiente.' + aviso };
  });
}

/* 🔎 Buscar socio en Pipedrive (para "Sin cita") */
function dg_buscar(pin, q) {
  dg_pin(pin);
  q = String(q || '').trim();
  if (q.length < 3) return [];
  const tel = nu_tel(q);
  const j = nu_pd('/persons/search?limit=8&fields=' + (tel ? 'phone' : 'name') + '&term=' + encodeURIComponent(tel || q));
  return ((j.data || {}).items || []).map((it) => ({
    pid: String(it.item.id), nombre: it.item.name,
    tels: (it.item.phones || []).map(nu_tel).filter(String).slice(0, 3)
  })).filter((p) => p.tels.length <= 3);   // fichas con muchos teléfonos son fichas mezcladas: no se ofrecen
}

/* 🚶 Sin cita: el socio llegó sin reserva y Diego ya lo evaluó */
function dg_sinCita(pin, q) {
  dg_pin(pin);
  const nombre = String(q.nombre || '').trim(), obs = String(q.obs || '').trim();
  let tel = nu_tel(q.tel);
  if (!q.pid && nombre.length < 5) throw new Error('Escribe nombre y apellido del socio.');
  if (!q.pid && !tel) throw new Error('Escribe el celular del socio (9 dígitos, empieza con 9): así no se crea una ficha repetida.');
  if (obs.length < 3) throw new Error('Escribe la observación de la evaluación.');
  return dg_lock(() => {
    const sh = dg_hoja(), ah = dg_ahora();
    let pid = q.pid ? String(q.pid) : '';
    if (!pid) {   // antes de crear, buscar por celular para no duplicar
      const hit = (((nu_pd('/persons/search?limit=1&fields=phone&term=' + tel).data || {}).items) || [])[0];
      pid = hit ? String(hit.item.id) : String(nu_pd('/persons', { method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ name: nombre, phone: [{ value: '+51' + tel, primary: true }] }) }).data.id);
    }
    const p = nu_pd('/persons/' + pid).data;
    const nom = nombre || p.name;
    if (!tel) tel = ((p.phone || []).map((x) => nu_tel(x.value)).filter(String)[0]) || '';
    if (q.prox && q.prox.fecha) dg_validarCita(q.prox.fecha, q.prox.hora, pid, null);
    const due = dg_utc(ah.fecha, ah.hora.slice(0, 3) + (Number(ah.hora.slice(3)) < 30 ? '00' : '30'));
    const act = String(nu_pd('/activities', { method: 'post', contentType: 'application/json', payload: JSON.stringify({
      subject: 'Nutrición — ' + nom, type: 'deadline', person_id: Number(pid), user_id: NU_DIEGO, done: 1,
      due_date: due.due_date, due_time: due.due_time, duration: '00:30' }) }).data.id);
    const nota = dg_nota(pid, '<b>🥗 Evaluación nutricional ' + nu_ddmm(ah.fecha) + ' (sin cita)</b><br>' + dg_sinTilde(obs) +
      (q.inbody ? '<br>📄 InBody subido a Drive.' : '') + '<br><i>Registrado por Diego desde la app.</i>');
    const fila = dg_nuevaFila(sh, { FECHA: ah.fecha, HORA: ah.hora, SOCIO: nom, TEL: tel, ESTADO: 'HECHO ✓ + nota · ' + dg_sello(),
      HECHO: true, INBODY: !!q.inbody, OBS: obs, AGENDAR: false, ACT: Number(act), PID: Number(pid), NOTA: nota ? Number(nota) : '' });
    if (q.prox && q.prox.fecha) dg_proxima_(sh, dg_fila(sh, act), q.prox.fecha, q.prox.hora);
    return { ok: true, fila: fila, msg: nom + ' registrado sin cita' + (q.prox && q.prox.fecha ? ' · próxima ' + nu_lab(q.prox.fecha) + ' ' + nu_horaTxt(q.prox.hora) : '') };
  });
}

/* Ejecutar una vez desde el editor para probar sin tocar nada: lee la hoja y muestra horas libres. */
function dg_probar() {
  const sh = dg_hoja(), filas = dg_leer(sh), hoy = nu_hoy();
  Logger.log('Filas leídas: ' + filas.length + ' · citas de hoy: ' + filas.filter((x) => x.fecha === hoy).length);
  const [a] = nu_opciones(hoy);
  Logger.log('Horas libres el ' + nu_lab(a) + ': ' + dg_libresTxt(a));
  Logger.log('PIN configurado: ' + (nu_props().getProperty('DIEGO_PIN') ? 'sí' : 'NO — agrega DIEGO_PIN en Propiedades del script'));
}

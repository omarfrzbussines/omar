/* RURUSH Nutrición — Reservas de las asesoras (reemplaza el formulario de Pipedrive).
   Se abre con el link de la app web + ?app=reservas. Clave propia: propiedad del script RESERVAS_PIN.
   La asesora escribe el CELULAR → ve la ficha del socio en Pipedrive (nombre, DNI, organización, citas).
   Si no existe, la crea con nombre y celular (y DNI si lo tiene). No se pide correo: la cita se pega
   a la ficha por person_id, así nunca cae en la ficha de Omar (el error del formulario de reserva).
   Usa las mismas reglas que la app de Diego (AppDiego.gs): martes/miércoles, NU_HORAS, nunca hoy, sin choques,
   un socio no puede tener dos citas futuras. Cada cita se anota también en CONTROL NUTRICIÓN. */

const RV_DNI = '7628cddc6b7d5d642ae68842913c53591a50ca02';   // campo DNI de la persona en Pipedrive
const RV_SEMANAS = 4;                                        // cuántas semanas hacia adelante se pueden reservar

function rv_pagina() {
  return HtmlService.createTemplateFromFile('AppReservasUI').evaluate()
    .setTitle('Reservas Nutrición · Rurush')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function rv_pin(pin) {
  const p = nu_props().getProperty('RESERVAS_PIN');
  if (!p) throw new Error('Falta configurar la clave: en Apps Script → Configuración del proyecto → Propiedades del script, agrega RESERVAS_PIN.');
  if (String(pin || '') !== p) throw new Error('PIN');
}
function rv_nombreOk(n) {
  return n.split(/\s+/).filter((w) => w.length >= 2).length >= 2 && !/^(socio|cliente|nuevo|nueva|prueba|test)\b/i.test(n);
}
function rv_titulo(n) { return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()); }

// ficha completa de una persona: lo que la asesora necesita ver antes de agendar
function rv_ficha(pid) {
  const p = nu_pd('/persons/' + pid).data;
  const tels = (p.phone || []).map((x) => nu_tel(x.value)).filter(String);
  const hoy = nu_hoy();
  const prox = nu_citas(hoy, nu_mas(hoy, 120), false).filter((c) => c.pid === String(pid) && c.ms > Date.now())
    .sort((a, b) => a.ms - b.ms)[0] || null;
  let ultima = '', evaluaciones = 0;
  try {
    const acts = (nu_pd('/persons/' + pid + '/activities?done=1&limit=100').data || [])
      .filter((a) => a.type === 'deadline' && /nutri/i.test(a.subject || '') && !/^(DUPLICADO|CANCELADA|NO VINO|PRUEBA)/i.test(a.subject || ''));
    evaluaciones = acts.length;
    ultima = acts.map((a) => a.due_date).sort().pop() || '';
  } catch (e) { /* sin historial */ }
  const org = p.org_name || (p.org_id && p.org_id.name) || '';
  return {
    pid: String(p.id), nombre: p.name, dni: String(p[RV_DNI] || ''), org: org,
    estado: /INACTIV/i.test(org) ? 'inactivo' : (/ACTIV/i.test(org) ? 'activo' : ''),
    tels: tels.slice(0, 4), mezclada: tels.length > 3,
    prox: prox ? { act: String(prox.id), fecha: prox.fecha, hora: prox.hora } : null,
    ultima: ultima, evaluaciones: evaluaciones,
    url: 'https://rurushfitnessclub.pipedrive.com/person/' + p.id
  };
}

/* ================= funciones que llama la pantalla ================= */

function rv_inicio(pin) {
  rv_pin(pin);
  const fechas = [];
  for (let f = nu_mas(nu_hoy(), 1); f <= nu_mas(nu_hoy(), RV_SEMANAS * 7); f = nu_mas(f, 1))
    if (NU_DIAS_DIEGO.indexOf(nu_dow(f)) >= 0) fechas.push(f);
  return { hoy: nu_hoy(), fechas: fechas, horas: NU_HORAS };
}

// 1) buscar por celular: devuelve las fichas que tienen ese número
function rv_buscarTel(pin, t) {
  rv_pin(pin);
  const tel = nu_tel(t);
  if (!tel) throw new Error('Escribe el celular de 9 dígitos (empieza con 9).');
  const items = ((nu_pd('/persons/search?limit=10&fields=phone&term=' + tel).data || {}).items) || [];
  const pids = items.filter((it) => (it.item.phones || []).map(nu_tel).indexOf(tel) >= 0).map((it) => String(it.item.id));
  return { tel: tel, fichas: pids.slice(0, 5).map(rv_ficha) };
}

// 2) si el celular no está: buscar por nombre o DNI para no crear una ficha repetida
function rv_parecidos(pin, nombre, dni) {
  rv_pin(pin);
  const out = {}, add = (it) => { if (!out[it.item.id]) out[it.item.id] = { pid: String(it.item.id), nombre: it.item.name,
    tels: (it.item.phones || []).map(nu_tel).filter(String).slice(0, 3) }; };
  dni = String(dni || '').replace(/\D/g, '');
  if (dni.length >= 8) (((nu_pd('/persons/search?limit=5&exact_match=true&fields=custom_fields&term=' + dni).data || {}).items) || []).forEach(add);
  nombre = String(nombre || '').trim();
  if (nombre.length >= 5) (((nu_pd('/persons/search?limit=8&fields=name&term=' + encodeURIComponent(nombre)).data || {}).items) || []).forEach(add);
  return Object.keys(out).map((k) => out[k]).slice(0, 8);
}

function rv_ver(pin, pid) { rv_pin(pin); return rv_ficha(pid); }

function rv_libres(pin, fecha) {
  rv_pin(pin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) || fecha <= nu_hoy() || NU_DIAS_DIEGO.indexOf(nu_dow(fecha)) < 0) return [];
  return dg_libresLista(fecha, null);
}

/* 3) agendar. q = { pid?, nombre, tel, dni?, fecha, hora, asesora, nota?, mover? }
   - con pid: usa esa ficha (y le agrega el celular si no lo tenía)
   - sin pid: vuelve a buscar por celular; si no hay, crea la ficha con nombre + celular (+ DNI)
   - mover: act_id de la cita futura que ya tenía → se reagenda esa misma cita en lugar de crear otra */
function rv_agendar(pin, q) {
  rv_pin(pin);
  const asesora = String(q.asesora || '').trim(), tel = nu_tel(q.tel), nota = String(q.nota || '').trim();
  const dni = String(q.dni || '').replace(/\D/g, '');
  if (asesora.length < 2) throw new Error('Escribe tu nombre (asesora que agenda).');
  if (!tel) throw new Error('Escribe el celular del socio (9 dígitos, empieza con 9).');
  if (dni && !/^\d{8,9}$/.test(dni)) throw new Error('El DNI debe tener 8 números (o 9 si es carnet de extranjería). Si no lo tienes, déjalo vacío.');
  const fecha = String(q.fecha || ''), hora = String(q.hora || '');

  if (q.mover) {   // ya tenía cita: se mueve la misma
    const sh = dg_hoja();
    dg_traerCitas_(sh);
    let r;
    if (dg_leer(sh).some((x) => x.act === String(q.mover))) {
      r = dg_reagendar_({ act: q.mover, fecha: fecha, hora: hora, motivo: 'pidió cambio · ' + asesora });
    } else {   // cita lejana que aún no está en la hoja: se mueve solo en Pipedrive (la hoja la trae cuando falten 14 días)
      r = dg_lock(() => { dg_validarCita(fecha, hora, q.pid || null, q.mover); dg_act(q.mover, Object.assign(dg_utc(fecha, hora), { done: 0 }));
        return { ok: true, msg: 'Cita movida al ' + nu_lab(fecha) + ' ' + nu_horaTxt(hora) }; });
    }
    try { nu_pd('/activities/' + q.mover, { method: 'put', contentType: 'application/json',
      payload: JSON.stringify({ note: 'Reagendada por ' + dg_sinTilde(asesora) + ' desde Reservas (' + dg_sello() + ').' + (nota ? '<br>' + dg_sinTilde(nota) : '') }) }); } catch (e) { /* la nota es opcional */ }
    return Object.assign(r, { fecha: fecha, hora: hora, nombre: q.nombre || '' });
  }

  return dg_lock(() => {
    let pid = q.pid ? String(q.pid) : '', creada = false, nombre;
    if (!pid) {
      nombre = rv_titulo(q.nombre);
      if (!rv_nombreOk(nombre)) throw new Error('Escribe nombre y apellido reales del socio (no "Socio" ni "Cliente").');
      const hit = ((((nu_pd('/persons/search?limit=10&fields=phone&term=' + tel).data || {}).items) || [])
        .filter((it) => (it.item.phones || []).map(nu_tel).indexOf(tel) >= 0))[0];
      if (hit) pid = String(hit.item.id);
    }
    // validar ANTES de crear nada
    dg_validarCita(fecha, hora, pid || null, null);
    if (!pid) {
      const body = { name: nombre, phone: [{ value: '+51' + tel, primary: true, label: 'mobile' }] };
      if (dni) body[RV_DNI] = dni;
      pid = String(nu_pd('/persons', { method: 'post', contentType: 'application/json', payload: JSON.stringify(body) }).data.id);
      creada = true;
    } else {
      const p = nu_pd('/persons/' + pid).data;
      nombre = p.name;
      const tiene = (p.phone || []).map((x) => nu_tel(x.value)).filter(String);
      const cambios = {};
      if (tiene.indexOf(tel) < 0 && tiene.length < 3)
        cambios.phone = (p.phone || []).filter((x) => x.value).map((x) => ({ value: x.value, primary: x.primary, label: x.label }))
          .concat([{ value: '+51' + tel, primary: !tiene.length, label: 'mobile' }]);
      if (dni && !p[RV_DNI]) cambios[RV_DNI] = dni;
      if (Object.keys(cambios).length) nu_pd('/persons/' + pid, { method: 'put', contentType: 'application/json', payload: JSON.stringify(cambios) });
    }
    const sh = dg_hoja();
    const act = dg_crearCita(sh, pid, nombre, tel, fecha, hora, 'Agendó ' + asesora + (nota ? ' · ' + nota : ''), {
      subject: nombre + ' / EVALUACIÓN NUTRICIONAL',
      note: 'Agendada por <b>' + dg_sinTilde(asesora) + '</b> desde Reservas (' + dg_sello() + ') · cel ' + tel +
            (nota ? '<br>' + dg_sinTilde(nota) : '') + (creada ? '<br>Ficha nueva creada al agendar.' : '')
    });
    return { ok: true, act: act, pid: pid, nombre: nombre, fecha: fecha, hora: hora, creada: creada,
             msg: nombre + ' agendado el ' + nu_lab(fecha) + ' a las ' + nu_horaTxt(hora) + (creada ? ' (ficha nueva)' : '') };
  });
}

/* Ejecutar una vez desde el editor: prueba la búsqueda sin escribir nada. */
function rv_probar() {
  Logger.log('PIN de reservas configurado: ' + (nu_props().getProperty('RESERVAS_PIN') ? 'sí' : 'NO — agrega RESERVAS_PIN en Propiedades del script'));
  const [f] = nu_opciones(nu_hoy());
  Logger.log('Horas libres el ' + nu_lab(f) + ': ' + dg_libresTxt(f));
}

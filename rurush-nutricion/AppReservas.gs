/* RURUSH Nutrición — Reservas de las asesoras (reemplaza el formulario de Pipedrive).
   Se abre con el link de la app web + ?app=reservas. Sin clave: solo abre con la cuenta de Google del gimnasio.
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
// Sin clave: la app web solo abre con la cuenta de Google del gimnasio (rurushfitclub), esa es la protección.
function rv_pin(pin) { }
function rv_nombreOk(n) {
  return n.split(/\s+/).filter((w) => w.length >= 2).length >= 2 && !/^(socio|cliente|nuevo|nueva|prueba|test)\b/i.test(n);
}
function rv_titulo(n) { return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()); }

// fichas completas (lo que la asesora ve antes de agendar). Todas las lecturas van en paralelo:
// 2 por persona (datos + actividades) en una sola espera, sin recorrer la agenda completa.
function rv_fichas(pids) {
  if (!pids.length) return [];
  let vig = {}; try { vig = nu_vigentes(); } catch (e) { /* sin la base de AppsFit */ }
  const js = nu_pdAll(pids.reduce((l, id) => l.concat(['/persons/' + id, '/persons/' + id + '/activities?limit=500']), []));
  return pids.map((id, i) => {
    const p = js[2 * i].data, citas = (js[2 * i + 1].data || []).map(nu_cita).filter(Boolean);
    const tels = (p.phone || []).map((x) => nu_tel(x.value)).filter((t, k, l) => t && l.indexOf(t) === k);
    const prox = citas.filter((c) => !c.done && c.ms > Date.now() && !/^(DUPLICADO|CANCELADA|PRUEBA)/i.test(c.asunto)).sort((a, b) => a.ms - b.ms)[0] || null;
    const hechas = citas.filter((c) => c.done && !/^(DUPLICADO|CANCELADA|NO VINO|PRUEBA)/i.test(c.asunto));
    const org = p.org_name || (p.org_id && p.org_id.name) || '';
    return {
      pid: String(p.id), nombre: p.name, dni: String(p[RV_DNI] || ''), org: org,
      estado: tels.some((t) => vig[t]) ? 'activo' : (/INACTIV/i.test(org) ? 'inactivo' : (/ACTIV/i.test(org) ? 'activo' : '')),
      vence: tels.map((t) => vig[t]).filter(Boolean).sort().pop() || '',
      tels: tels.slice(0, 4), mezclada: tels.length > 3,
      prox: prox ? { act: String(prox.id), fecha: prox.fecha, hora: prox.hora } : null,
      ultima: hechas.map((c) => c.fecha).sort().pop() || '', evaluaciones: hechas.length,
      url: 'https://rurushfitnessclub.pipedrive.com/person/' + p.id
    };
  });
}
// horas libres de varios días con UNA sola lectura de la agenda
function rv_libresDe(fechas) {
  const out = {};
  if (!fechas.length) return out;
  const ocup = {};
  nu_citasRango(fechas[0], fechas[fechas.length - 1]).forEach((c) => { ocup[c.fecha + ' ' + c.hora] = 1; });
  fechas.forEach((f) => { out[f] = NU_HORAS.filter((h) => !ocup[f + ' ' + h]); });
  return out;
}

/* ================= funciones que llama la pantalla ================= */

function rv_inicio(pin) {
  rv_pin(pin);
  const fechas = [];
  for (let f = nu_mas(nu_hoy(), 1); f <= nu_mas(nu_hoy(), RV_SEMANAS * 7); f = nu_mas(f, 1))
    if (NU_DIAS_DIEGO.indexOf(nu_dow(f)) >= 0) fechas.push(f);
  let libres = null;
  try { libres = rv_libresDe(fechas); } catch (e) { /* si Pipedrive tarda, la pantalla las pide día por día */ }
  return { hoy: nu_hoy(), fechas: fechas, horas: NU_HORAS, libres: libres };
}

// 1) buscar por CELULAR, DNI o NOMBRE (una sola casilla; se detecta qué escribió la asesora)
function rv_buscar(pin, q) {
  rv_pin(pin);
  q = String(q || '').trim();
  const tel = nu_tel(q), num = q.replace(/[\s.-]/g, '');
  let modo, pids;
  if (tel) {
    modo = 'tel';
    const items = ((nu_pd('/persons/search?limit=10&fields=phone&term=' + tel).data || {}).items) || [];
    pids = items.filter((it) => (it.item.phones || []).map(nu_tel).indexOf(tel) >= 0).map((it) => String(it.item.id));
  } else if (/^\d{8,9}$/.test(num)) {
    modo = 'dni';
    const items = ((nu_pd('/persons/search?limit=5&exact_match=true&fields=custom_fields&term=' + num).data || {}).items) || [];
    pids = items.map((it) => String(it.item.id));
  } else if (q.replace(/[^a-záéíóúñü]/gi, '').length >= 3) {
    modo = 'nombre';
    const base = nu_mejores(((nu_pd('/persons/search?limit=30&fields=name&term=' + encodeURIComponent(q)).data || {}).items) || []), yaTels = {};
    base.forEach((it) => (it.item.phones || []).forEach((p) => { const t = nu_tel(p); if (t) yaTels[t] = 1; }));
    let extra = []; try { extra = nu_buscarVigentes(q, yaTels); } catch (e) { /* sin la base de AppsFit */ }
    const ya = {};
    const items = extra.concat(base)
      .filter((it) => !ya[it.item.id] && (ya[it.item.id] = 1));
    let vig = {}; try { vig = nu_vigentes(); } catch (e) { /* sin la base se ordena por organización */ }
    const niv = (it) => nu_nivel((it.item.phones || []).map(nu_tel).filter(String), it.item.organization && it.item.organization.name, vig);
    pids = items.map((it) => [niv(it), String(it.item.id)]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);   // activos primero
  } else {
    throw new Error('Escribe el celular (9 dígitos), el DNI (8 números) o el nombre y apellido.');
  }
  return { modo: modo, q: q, tel: tel, dni: modo === 'dni' ? num : '', fichas: rv_fichas(pids.slice(0, 12)) };
}
function rv_buscarTel(pin, t) { return rv_buscar(pin, t); }

// 2) si el celular no está: buscar por nombre o DNI para no crear una ficha repetida
function rv_parecidos(pin, nombre, dni) {
  rv_pin(pin);
  const out = {}, add = (it) => { if (!out[it.item.id]) out[it.item.id] = { pid: String(it.item.id), nombre: it.item.name,
    tels: (it.item.phones || []).map(nu_tel).filter(String).slice(0, 3) }; };
  dni = String(dni || '').replace(/\D/g, ''); nombre = String(nombre || '').trim();
  const qs = [];
  if (dni.length >= 8) qs.push('/persons/search?limit=5&exact_match=true&fields=custom_fields&term=' + dni);
  if (nombre.length >= 5) qs.push('/persons/search?limit=8&fields=name&term=' + encodeURIComponent(nombre));
  nu_pdAll(qs).forEach((j) => (((j.data || {}).items) || []).forEach(add));
  return Object.keys(out).map((k) => out[k]).slice(0, 8);
}

function rv_ver(pin, pid) { rv_pin(pin); return rv_fichas([String(pid)])[0]; }

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
  const [f] = nu_opciones(nu_hoy());
  Logger.log('Horas libres el ' + nu_lab(f) + ': ' + dg_libresTxt(f));
}

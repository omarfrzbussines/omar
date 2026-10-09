// Panel lateral: lista de postulantes → ficha → entrevista guiada → guardar en el Sheet.
const $app = document.getElementById('app');
const $titulo = document.getElementById('titulo');
const $atras = document.getElementById('atras');
const $aviso = document.getElementById('aviso');
const $equipoBtn = document.getElementById('equipoBtn');

const st = {
  cfg: null,
  estados: [],
  cands: [],
  vista: 'lista',
  filtro: 'activos',
  q: '',
  sel: null,          // fila del postulante abierto
  tab: 'resumen',
  ronda: 1,
  borrador: null,     // { puntajes: {actitud: 7.5…}, notasFinal, estado, inicio }
  msg: { fecha: '', hora: '' },
  guardando: false,
  primeraCarga: true,
  yo: null,           // { nombre, rol } del celular / PC que está usando la app
  equipo: null,
  invitacion: null
};

// ---------- utilidades ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v || '').replace(',', '.')); return isNaN(n) ? null : n; };
const fmt = n => n == null ? '—' : String(Math.round(n * 10) / 10).replace('.', ',');
const primerNombre = d => (String(d.nombre || '').trim().split(/\s+/)[0] || '').replace(/^./, c => c.toUpperCase()).replace(/(?<=.)./g, c => c.toLowerCase());
const cand = () => st.cands.find(c => c.fila === st.sel);
const nombreDe = c => String(c.d.nombre || '').trim() || (c.d.email ? c.d.email : `(sin nombre · fila ${c.fila})`);

function toast(t, ms = 2500) {
  const el = document.getElementById('toast');
  el.textContent = t; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, ms);
}
function aviso(t) { $aviso.hidden = !t; $aviso.textContent = t || ''; }

function telefono(d) {
  let n = String(d.wa || '').replace(/\D/g, '');
  if (n.length === 9 && n[0] === '9') n = '51' + n;
  return n.length >= 10 ? n : '';
}
function linkWa(d, texto) {
  const n = telefono(d);
  return n ? `https://wa.me/${n}${texto ? '?text=' + encodeURIComponent(texto) : ''}` : '';
}
function claseEstado(e) {
  if (/contratado/i.test(e)) return 'est-contratado';
  if (/descartado|no va/i.test(e)) return 'est-descartado';
  if (/hecha|realizada|pre-aprobado/i.test(e)) return 'est-hecha';
  if (/agendada/i.test(e)) return 'est-agendada';
  return '';
}

// ---------- agenda ----------
const fechaCita = ag => new Date(`${ag.fecha}T${ag.hora}`);
const diaISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const agendada = c => c.ag && c.ag.estado === 'Agendada';
// Pasó más de 1 hora desde la cita y nadie marcó si vino.
const porConfirmar = c => agendada(c) && fechaCita(c.ag).getTime() < Date.now() - 60 * 60000;
const esHoy = c => agendada(c) && c.ag.fecha === diaISO(new Date()) && !porConfirmar(c);
const proxima = c => agendada(c) && !porConfirmar(c);
function horaTxt(ag) {
  return fechaCita(ag).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function citaTxt(ag) {
  const f = fechaCita(ag), hoy = new Date(), man = new Date(); man.setDate(hoy.getDate() + 1);
  const dia = ag.fecha === diaISO(hoy) ? 'hoy' : ag.fecha === diaISO(man) ? 'mañana'
    : f.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  return `${ag.ronda} · ${dia} ${horaTxt(ag)}`;
}

// ---------- confirmación (sirve igual en Chrome y en el celular) ----------
function confirmar(texto, si = 'Sí', no = 'Cancelar') {
  return new Promise(res => {
    const fondo = document.createElement('div');
    fondo.className = 'modal';
    fondo.innerHTML = `<div class="modal-caja"><p>${esc(texto)}</p>
      <div class="acciones"><button class="sec" data-r="0">${esc(no)}</button><button data-r="1">${esc(si)}</button></div></div>`;
    fondo.addEventListener('click', e => {
      const b = e.target.closest('[data-r]');
      if (!b && e.target !== fondo) return;
      e.stopPropagation();
      fondo.remove(); res(!!(b && b.dataset.r === '1'));
    });
    document.body.appendChild(fondo);
  });
}

// El acceso al Sheet y al almacenamiento local lo pone la plataforma:
// plataforma.js (extensión de Chrome) o el Apps Script (app del celular).
const api = (metodo, datos) => PLAT.api(metodo, datos);

async function cargar() {
  st.cfg = await PLAT.config();
  if (PLAT.faltaConfig(st.cfg)) {
    $app.innerHTML = `<div class="caja"><h3>Falta configurar</h3><p>Pega la URL del Apps Script y activa esta PC con una invitación en Opciones.</p>
      <button data-accion="opciones">Abrir opciones</button></div>`;
    return;
  }
  aviso('');
  try {
    const j = await api('GET', { a: 'lista' });
    st.yo = j.yo || null;
    $equipoBtn.hidden = !(st.yo && st.yo.rol === 'admin');
    st.estados = j.estados || [];
    st.cands = j.cands.map(c => ({ ...c, flags: evaluar(c.d) }));
    if (st.primeraCarga) {
      st.primeraCarga = false;
      if (st.cands.some(porConfirmar)) st.filtro = 'vino';
      else if (st.cands.some(esHoy)) st.filtro = 'hoy';
    }
    PLAT.guardarLocal('cache', { estados: st.estados, cands: j.cands });
  } catch (e) {
    // Acceso quitado o clave inválida: se borra todo lo guardado en este equipo y se bloquea.
    if (e.message === 'NO_AUTORIZADO') { PLAT.borrarLocal('cache'); return PLAT.sinAcceso(); }
    const cache = await PLAT.leerLocal('cache');
    if (cache) {
      st.estados = cache.estados; st.cands = cache.cands.map(c => ({ ...c, flags: evaluar(c.d) }));
      aviso('Sin conexión con el Sheet (' + e.message + '). Mostrando la última copia; no se puede guardar.');
    } else {
      $app.innerHTML = `<div class="caja"><h3>No se pudo leer el Sheet</h3><p>${esc(e.message)}</p><button data-accion="opciones">Revisar opciones</button></div>`;
      return;
    }
  }
  pintar();
}

async function guardar(cambios, okTxt) {
  const c = cand();
  if (!c || st.guardando) return false;
  st.guardando = true; pintar();
  try {
    const j = await api('POST', { a: 'guardar', fila: c.fila, huella: c.huella, ...cambios });
    Object.assign(c, j.cand, { flags: evaluar(j.cand.d) });
    toast([okTxt || '✔ Guardado en el Sheet', ...(j.avisos || []).map(a => '⚠ ' + a)].join('\n'), j.avisos && j.avisos.length ? 8000 : 2500);
    return true;
  } catch (e) {
    if (e.message === 'NO_AUTORIZADO') { PLAT.borrarLocal('cache'); PLAT.sinAcceso(); return false; }
    toast('✖ ' + e.message, 6000);
    return false;
  } finally {
    st.guardando = false; pintar();
  }
}

// ---------- borrador de entrevista (sobrevive si se cierra el panel) ----------
const claveBorrador = () => `borrador:${cand().huella}:${st.ronda}`;
async function abrirBorrador() {
  const c = cand();
  const k = claveBorrador();
  const guardado = await PLAT.leerLocal(k);
  if (guardado) { st.borrador = guardado; return; }
  const puntajes = {};
  CRITERIOS.forEach(cr => { const v = num(c.d[cr.id + 'E' + st.ronda]); if (v != null) puntajes[cr.id] = v; });
  // notasFinalBase = lo que decía el Sheet al empezar (para no pisar cambios de otra persona).
  st.borrador = { puntajes, notasFinal: c.d.notasFinal || '', notasFinalBase: c.d.notasFinal || '', estado: '', inicio: null };
}
function persistirBorrador() { PLAT.guardarLocal(claveBorrador(), st.borrador); }
function borrarBorrador() { PLAT.borrarLocal(claveBorrador()); }

// ---------- vistas ----------
function pintar() {
  $atras.hidden = st.vista === 'lista';
  if (st.vista === 'equipo') { $titulo.textContent = '👥 Equipo'; return pintarEquipo(); }
  if (st.vista === 'lista') { $titulo.textContent = '🎯 Entrevistas'; pintarLista(); }
  else { $titulo.textContent = nombreDe(cand()); pintarFicha(); }
}

function enFiltro(c) {
  const e = c.d.estado || '';
  if (st.filtro === 'todos') return true;
  if (st.filtro === 'activos') return !ESTADOS_CERRADOS.test(e);
  if (st.filtro === 'hoy') return esHoy(c);
  if (st.filtro === 'vino') return porConfirmar(c);
  if (st.filtro === 'agenda') return proxima(c);
  if (st.filtro === '(sin estado)') return !e;
  return e === st.filtro;
}

function pintarLista() {
  const q = st.q.toLowerCase();
  const conteo = {};
  st.cands.forEach(c => { const e = c.d.estado || '(sin estado)'; conteo[e] = (conteo[e] || 0) + 1; });
  const orden = [...st.estados, ...Object.keys(conteo).filter(e => !st.estados.includes(e))].filter(e => conteo[e]);
  const nHoy = st.cands.filter(esHoy).length, nVino = st.cands.filter(porConfirmar).length, nAg = st.cands.filter(proxima).length;
  const chips = [
    ...(nVino ? [['vino', '⏰ ¿Vino?', nVino]] : []),
    ...(nHoy || st.filtro === 'hoy' ? [['hoy', '📅 Hoy', nHoy]] : []),
    ...(nAg ? [['agenda', '🗓 Agenda', nAg]] : []),
    ['activos', 'Activos', st.cands.filter(c => !ESTADOS_CERRADOS.test(c.d.estado || '')).length],
    ['todos', 'Todos', st.cands.length],
    ...orden.map(e => [e, e, conteo[e]])
  ];
  const lista = st.cands
    .filter(enFiltro)
    .filter(c => !q || [c.d.nombre, c.d.email, c.d.wa, c.d.notas, c.d.ciudad].join(' ').toLowerCase().includes(q))
    .sort(['hoy', 'vino', 'agenda'].includes(st.filtro)
      ? (a, b) => fechaCita(a.ag) - fechaCita(b.ag)
      : (a, b) => b.fila - a.fila);

  // El buscador no se vuelve a crear al escribir: así el teclado del celular no se cierra ni pierde letras.
  if (!document.getElementById('q')) {
    $app.innerHTML = `<input id="q" class="buscar" type="search" placeholder="🔎 Buscar nombre, celular, nota…" value="${esc(st.q)}">
      <div id="chips" class="chips"></div><div id="resultados"></div>`;
  }
  document.getElementById('chips').innerHTML = chips.map(([v, t, n]) => `<button class="chip ${st.filtro === v ? 'activo' : ''}" data-accion="filtro" data-v="${esc(v)}">${esc(t)} · ${n}</button>`).join('');
  document.getElementById('resultados').innerHTML = lista.length ? lista.map(tarjeta).join('') : '<p class="vacio">Nadie en este filtro.</p>';
}

function tarjeta(c) {
  const d = c.d;
  const pf = num(d.pf);
  const alertas = c.flags.filter(f => f.t === 'alerta').length;
  return `<div class="tarjeta" data-accion="abrir" data-fila="${c.fila}">
    <div class="fila1">
      <span class="punto ${semaforo(c.flags)}" title="${alertas} alerta(s) del formulario"></span>
      <span class="nom">${esc(nombreDe(c))}</span>
      ${pf != null ? `<span class="nota">${fmt(pf)}</span>` : ''}
      ${d.estado ? `<span class="pill ${claseEstado(d.estado)}">${esc(d.estado)}</span>` : ''}
    </div>
    <div class="sub">${esc([d.edad && d.edad + ' años', d.ciudad, d.marca && d.marca.split(' ')[0]].filter(Boolean).join(' · '))}</div>
    ${agendada(c) ? `<div class="cita ${porConfirmar(c) ? 'tarde' : ''}">${porConfirmar(c) ? '⏰ ¿Vino? ' : '📅 '}${esc(citaTxt(c.ag))}</div>` : ''}
    ${d.notas ? `<div class="sub">📝 ${esc(d.notas)}</div>` : ''}
  </div>`;
}

function pintarFicha() {
  const c = cand();
  if (!c) { st.vista = 'lista'; return pintar(); }
  const d = c.d;
  const opciones = [...new Set([...(st.estados || []), d.estado].filter(Boolean))];
  const enlace = (href, txt) => {
    href = /^(https:\/\/|http:\/\/|tel:)/i.test(String(href || '').trim()) ? String(href).trim() : '';
    return `<a href="${esc(href || '#')}" target="_blank" class="${href ? '' : 'falta'}">${txt}</a>`;
  };
  const ig = d.ig && !/^no$/i.test(d.ig.trim()) ? `https://instagram.com/${d.ig.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}` : '';
  $app.innerHTML = `
    <div class="cabecera">
      <div class="nombre">${esc(nombreDe(c))}</div>
      <div class="sub">${esc([d.edad && d.edad + ' años', d.ciudad, d.wa].filter(Boolean).join(' · '))}</div>
      <div class="enlaces">
        ${PLAT.movil ? enlace(telefono(d) && 'tel:+' + telefono(d), '📞 Llamar') : ''}
        ${enlace(linkWa(d), '💬 WhatsApp')} ${enlace(d.cv, '📄 CV')} ${enlace(d.video, '🎥 Video')}
        ${enlace(d.certijoven, '🪪 Certijoven')} ${enlace(ig, '📷 Instagram')}
      </div>
      <div class="estado-fila">
        <select id="estadoSel" ${st.guardando ? 'disabled' : ''}>
          ${d.estado ? '' : '<option value="">(sin estado)</option>'}
          ${opciones.map(e => `<option ${e === d.estado ? 'selected' : ''}>${esc(e)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="tabs">
      ${[['resumen', '📋 Resumen'], ['entrevista', '🎤 Entrevista'], ['respuestas', '📝 Formulario'], ['mensajes', '💬 Mensajes']]
        .map(([t, n]) => `<button class="${st.tab === t ? 'activo' : ''}" data-accion="tab" data-v="${t}">${n}</button>`).join('')}
    </div>
    <div id="cuerpo"></div>`;
  const cuerpo = document.getElementById('cuerpo');
  if (st.tab === 'resumen') cuerpo.innerHTML = vistaResumen(c);
  if (st.tab === 'respuestas') cuerpo.innerHTML = vistaRespuestas(c);
  if (st.tab === 'entrevista') cuerpo.innerHTML = vistaEntrevista(c);
  if (st.tab === 'mensajes') cuerpo.innerHTML = vistaMensajes(c);
}

function vistaResumen(c) {
  const d = c.d;
  const filas = [
    ['Exp. ventas', d.tiempoVentas], ['Vendía', d.promedioVentas], ['Gimnasio', d.gimnasio],
    ['Horario', d.horario], ['Jornada', d.jornada], ['Sueldo base', d.sueldo], ['Comisión', d.comision],
    ['Se queda', d.permanencia], ['Fitness', d.fitness && d.fitness + '/5'], ['Último trabajo', d.ultimoTrabajo]
  ].filter(f => f[1]);
  const hayPuntos = CRITERIOS.some(cr => d[cr.id + 'E1'] || d[cr.id + 'E2']) || d.pf;
  return `
    ${cajaAgenda(c)}
    <div class="caja"><h3>Pre-filtro automático</h3>
      ${c.flags.length ? c.flags.map(f => `<div class="flag ${f.t}">${f.t === 'ok' ? '✔' : f.t === 'alerta' ? '⚠' : '•'} ${esc(f.txt)}</div>`).join('') : '<p class="sub">Sin datos del formulario.</p>'}
    </div>
    <div class="caja"><h3>Datos clave</h3><dl>${filas.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
    ${hayPuntos ? `<div class="caja"><h3>Puntajes</h3>
      <table class="puntos-tabla"><tr><th></th><th>E1 ${esc(d.fechaE1 || '')}</th><th>E2 ${esc(d.fechaE2 || '')}</th></tr>
      ${CRITERIOS.map(cr => `<tr><td>${cr.icono} ${cr.nombre}</td><td>${esc(d[cr.id + 'E1'] || '—')}</td><td>${esc(d[cr.id + 'E2'] || '—')}</td></tr>`).join('')}
      <tr><th>Promedio</th><th>${esc(d.pp1 || '—')}</th><th>${esc(d.pp2 || '—')}</th></tr>
      <tr><th>FINAL</th><th colspan="2">${esc(d.pf || '—')}</th></tr></table>
      ${d.notasFinal ? `<p>${esc(d.notasFinal)}</p>` : ''}</div>` : ''}
    <div class="caja"><h3>📝 Notas rápidas <span class="sub">(columna NOTAS)</span></h3>
      <textarea id="notas">${esc(d.notas)}</textarea>
      <div class="acciones"><button data-accion="guardarNotas" ${st.guardando ? 'disabled' : ''}>Guardar notas</button></div>
    </div>`;
}

function cajaAgenda(c) {
  const ag = c.ag, dis = st.guardando ? 'disabled' : '';
  if (porConfirmar(c)) {
    return `<div class="caja agenda tarde"><h3>⏰ Tenía entrevista ${esc(citaTxt(ag))} — ¿vino?</h3>
      <div class="acciones"><button class="sec" data-accion="novino" ${dis}>✖ No vino</button>
      <button data-accion="vino" data-v="${ag.ronda.slice(1)}">✔ Sí, calificar ${esc(ag.ronda)}</button></div></div>`;
  }
  if (agendada(c)) {
    return `<div class="caja agenda"><h3>📅 Entrevista ${esc(citaTxt(ag))}</h3>
      <div class="acciones"><button class="sec" data-accion="cancelarCita" ${dis}>Cancelar</button>
      <button class="sec" data-accion="tab" data-v="mensajes">Reagendar</button>
      <button data-accion="vino" data-v="${ag.ronda.slice(1)}">🎤 Empezar</button></div></div>`;
  }
  return `<div class="caja agenda">${ag ? `<div class="sub">Última cita: ${esc(citaTxt(ag))} — ${esc(ag.estado)}</div>` : ''}
    <div class="acciones"><button class="sec" data-accion="tab" data-v="mensajes">📅 Agendar entrevista</button></div></div>`;
}

const SECCIONES = [
  ['Datos', [['Correo', 'email'], ['Fecha de postulación', 'marca'], ['Edad', 'edad'], ['Ciudad / dirección', 'ciudad'], ['WhatsApp', 'wa'], ['Instagram', 'ig']]],
  ['Experiencia', [['Tiempo en ventas', 'tiempoVentas'], ['¿Vendió membresías de gym?', 'gimnasio'], ['Promedio de ventas/mes', 'promedioVentas'], ['Mejor mes', 'mejorMes'], ['Peor mes', 'peorMes'], ['Último trabajo', 'ultimoTrabajo'], ['Ventas por WhatsApp', 'whatsappVentas'], ['CRM', 'crm'], ['Tipos de venta', 'tiposVenta']]],
  ['Casos de venta', [['Caso 1 · “Lo voy a pensar”', 'caso1'], ['Caso 2 · “Está muy caro”', 'caso2'], ['Caso 3 · “Lo consulto con mi pareja”', 'caso3'], ['Cuando no logra una venta', 'reaccion']]],
  ['Condiciones', [['Horario', 'horario'], ['Jornada', 'jornada'], ['Sueldo base', 'sueldo'], ['Comisión', 'comision'], ['Metas diarias', 'metas'], ['Tiempo en Rurush', 'permanencia']]],
  ['Motivación', [['Interés fitness (1-5)', 'fitness'], ['¿Por qué Rurush?', 'porQue'], ['Visión 2-3 años', 'vision'], ['¿Por qué contratarle?', 'contratarte'], ['Algo importante', 'algoMas'], ['Referencias', 'referencias']]]
];
function vistaRespuestas(c) {
  return SECCIONES.map(([t, campos]) => `<div class="caja"><h3>${t}</h3>
    ${campos.map(([p, k]) => `<div class="qa"><div class="p">${p}</div><div class="r ${c.d[k] ? '' : 'vacia'}">${esc(c.d[k] || '(sin respuesta)')}</div></div>`).join('')}
  </div>`).join('');
}

function promedioBorrador() {
  const v = CRITERIOS.map(cr => st.borrador.puntajes[cr.id]).filter(n => n != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function recomendacion(p) {
  if (p == null) return '';
  if (p >= st.cfg.umbralAvanzar) return '✅ Recomendado avanzar';
  if (p >= st.cfg.umbralEvaluar) return '🟡 Evaluar / comparar con otros';
  return '🔴 No avanzar';
}

function vistaEntrevista(c) {
  if (!st.borrador) return '<p class="vacio">Cargando…</p>';
  const b = st.borrador;
  const p = promedioBorrador();
  const completos = CRITERIOS.filter(cr => b.puntajes[cr.id] != null).length;
  const yaHecha = c.d['fechaE' + st.ronda];
  const estadoDef = `Entrevista ${st.ronda} hecha`;
  const opciones = [...new Set([estadoDef, ...st.estados])];
  return `
    <div class="ronda">
      <div class="seg">${[1, 2].map(r => `<button class="${st.ronda === r ? 'activo' : ''}" data-accion="ronda" data-v="${r}">E${r}</button>`).join('')}</div>
      <button class="sec" data-accion="reloj">${b.inicio ? '⏱ Reiniciar' : '⏱ Iniciar'}</button>
      <span class="reloj" id="reloj"></span>
    </div>
    ${yaHecha ? `<div class="flag info">• La E${st.ronda} ya tiene fecha (${esc(yaHecha)}). Si guardas, se reemplazan sus puntajes.</div>` : ''}
    ${CRITERIOS.map(cr => {
      const v = b.puntajes[cr.id];
      const entero = v == null ? null : Math.floor(v);
      const preg = cr.preguntas(c.d).filter(Boolean);
      return `<div class="caja crit">
        <h3>${cr.icono} ${cr.nombre}<span class="val">${fmt(v)}</span></h3>
        <div class="mirar">👀 ${esc(cr.mirar)}</div>
        <details ${st.abiertos && st.abiertos[cr.id] ? 'open' : ''} data-crit="${cr.id}"><summary>Preguntas sugeridas (${preg.length})</summary>
          <ol>${preg.map(q => `<li>${esc(q)}</li>`).join('')}</ol></details>
        <div class="botones">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button class="${entero === n ? 'activo' : ''}" data-accion="punto" data-c="${cr.id}" data-v="${n}">${n}</button>`).join('')}</div>
        <div class="medio"><label><input type="checkbox" data-accion="medio" data-c="${cr.id}" ${v != null && v % 1 ? 'checked' : ''} ${v == null || v >= 10 ? 'disabled' : ''}> +½</label>
          ${v != null ? `<a href="#" data-accion="limpiar" data-c="${cr.id}">borrar</a>` : ''}</div>
      </div>`;
    }).join('')}
    <div class="caja"><h3>Comentario final <span class="sub">(columna NOTAS del final)</span></h3>
      <textarea id="notasFinal" placeholder="Ej.: Seguro al hablar, buena presencia, le falta cerrar…">${esc(b.notasFinal)}</textarea>
    </div>
    <div class="resumen-final">
      <div class="promedio"><span class="n">${fmt(p)}</span><span>${completos}/6 criterios · <span class="reco">${completos === 6 ? recomendacion(p) : 'Completa los 6 para la recomendación'}</span></span></div>
      <select id="estadoFinal">${opciones.map(e => `<option ${e === (b.estado || estadoDef) ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
      <div class="acciones">
        <button class="sec" data-accion="descartarBorrador">Descartar borrador</button>
        <button data-accion="guardarEntrevista" ${completos === 0 || st.guardando ? 'disabled' : ''}>${st.guardando ? 'Guardando…' : `💾 Guardar E${st.ronda}`}</button>
      </div>
    </div>`;
}

function textoPlantilla(pl, d) {
  const f = st.msg.fecha ? new Date(st.msg.fecha + 'T12:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }) : '[fecha]';
  const h = st.msg.hora ? new Date('2000-01-01T' + st.msg.hora).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true }) : '[hora]';
  return pl.texto
    .replaceAll('{nombre}', primerNombre(d) || '')
    .replaceAll('{firma}', st.cfg.firma)
    .replaceAll('{direccion}', DIRECCION)
    .replaceAll('{fecha}', f)
    .replaceAll('{hora}', h)
    .replaceAll('{faltan}', faltantes(d))
    .replace(/Hola  /g, 'Hola ');
}

function vistaMensajes(c) {
  const d = c.d;
  if (!telefono(d)) return '<div class="caja"><p>Este postulante no tiene un número de WhatsApp válido en el formulario.</p></div>';
  return `
    <div class="caja"><h3>Fecha y hora de la entrevista</h3>
      ${agendada(c) ? `<div class="sub">Cita actual: ${esc(citaTxt(c.ag))}</div>` : ''}
      <div class="dosc"><input type="date" id="mFecha" value="${esc(st.msg.fecha)}"><input type="time" id="mHora" value="${esc(st.msg.hora)}"></div>
    </div>
    ${PLANTILLAS.map(pl => `<div class="caja plantilla">
      <h3>${pl.titulo}</h3>
      <textarea id="pl-${pl.id}">${esc(textoPlantilla(pl, d))}</textarea>
      ${pl.pideFecha && !(st.msg.fecha && st.msg.hora) ? '<div class="flag info">• Elige fecha y hora arriba</div>' : ''}
      <div class="acciones">
        <a class="btn sec" target="_blank" href="${esc(linkWa(d, textoPlantilla(pl, d)))}" data-wa="${pl.id}">Abrir WhatsApp</a>
        ${pl.ronda ? `<a class="btn" target="_blank" href="${esc(linkWa(d, textoPlantilla(pl, d)))}" data-wa="${pl.id}" data-accion="agendar" data-ronda="${pl.ronda}">📅 ${agendada(c) ? 'Reagendar' : 'Agendar'} E${pl.ronda} y enviar</a>` : ''}
        ${pl.estado ? `<a class="btn" target="_blank" href="${esc(linkWa(d, textoPlantilla(pl, d)))}" data-wa="${pl.id}" data-accion="enviar" data-id="${pl.id}" data-estado="1">Abrir y marcar “${esc(pl.estado)}”</a>` : ''}
      </div>
    </div>`).join('')}`;
}

// ---------- equipo: quién tiene acceso (solo administrador) ----------
async function abrirEquipo() {
  st.vista = 'equipo'; st.equipo = null; st.invitacion = null; pintar();
  try { st.equipo = await api('POST', { a: 'equipo' }); } catch (e) { st.equipo = { error: e.message }; }
  pintar();
}

function pintarEquipo() {
  const eq = st.equipo;
  if (!eq) { $app.innerHTML = '<p class="vacio">Cargando…</p>'; return; }
  if (eq.error) { $app.innerHTML = `<div class="caja"><p>${esc(eq.error)}</p></div>`; return; }
  const inv = st.invitacion;
  const linkInv = inv ? `${inv.url}?invita=${inv.codigo}` : '';
  const textoInv = inv ? `Hola 👋 Este es tu acceso a la app de entrevistas de Rurush. Ábrelo EN TU CELULAR y toca "Activar". Sirve una sola vez y vence en 24 horas; no lo reenvíes:\n${linkInv}` : '';
  $app.innerHTML = `
    <div class="caja"><h3>📱 Con acceso</h3>
      ${eq.dispositivos.map(d => `<div class="disp">
        <div><b>${esc(d.nombre)}</b> ${d.rol === 'admin' ? '<span class="pill">admin</span>' : ''} ${d.yo ? '<span class="pill est-contratado">este equipo</span>' : ''}
          <div class="sub">Activado ${esc(d.creado || '')} · último uso ${esc((d.ultimo || '').replace(/(\d{4})-(\d\d)-(\d\d) (\d\d)/, '$3/$2 $4h'))}</div></div>
        ${d.yo ? '' : `<button class="sec peligro" data-accion="quitar" data-id="${d.id}" data-nombre="${esc(d.nombre)}">Quitar acceso</button>`}
      </div>`).join('')}
      ${eq.pendientes.length ? `<p class="sub" style="margin:8px 0 0">⏳ Invitaciones sin usar: ${eq.pendientes.map(p => `${esc(p.nombre)} (vence ${esc(p.vence)})`).join(', ')}</p>` : ''}
    </div>
    <div class="caja"><h3>➕ Invitar un celular</h3>
      <p class="sub">La invitación sirve <b>una sola vez</b> y vence en 24 horas. Al abrirla en el celular de la persona y tocar "Activar", solo ese celular queda con acceso. Si alguien la reenvía después, ya no sirve.</p>
      <input id="invNombre" placeholder="Nombre (ej.: Celular administradora)" maxlength="40">
      <div class="acciones"><button data-accion="invitar" ${st.guardando ? 'disabled' : ''}>Crear invitación</button></div>
      ${inv ? `<div class="flag ok" style="margin-top:8px">✔ Invitación para <b>${esc(inv.nombre)}</b> lista</div>
        <div class="acciones">
          <a class="btn" target="_blank" href="https://wa.me/?text=${encodeURIComponent(textoInv)}">💬 Enviar por WhatsApp</a>
          <button class="sec" data-accion="copiarInv" data-link="${esc(linkInv)}">📋 Copiar link</button>
        </div>` : ''}
    </div>
    <p class="sub">Si se pierde o roban un celular: aquí mismo “Quitar acceso”. Apenas lo quitas, ese celular deja de ver datos y se borra lo que tenía guardado.</p>`;
}

// ---------- reloj ----------
setInterval(() => {
  const el = document.getElementById('reloj');
  if (!el || !st.borrador || !st.borrador.inicio) { if (el) el.textContent = ''; return; }
  const s = Math.floor((Date.now() - st.borrador.inicio) / 1000);
  el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}, 1000);

// ---------- eventos ----------
async function abrir(fila) {
  st.sel = fila; st.vista = 'ficha'; st.tab = 'resumen'; st.abiertos = {};
  const c = cand();
  st.ronda = c.d.fechaE1 || c.d.fechaE2 ? 2 : 1;
  st.msg = agendada(c) ? { fecha: c.ag.fecha, hora: c.ag.hora } : { fecha: '', hora: '' };
  st.borrador = null;
  pintar();
  window.scrollTo(0, 0);
  await abrirBorrador();
  if (st.sel === fila && st.tab === 'entrevista') pintar();
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const a = el.dataset.accion;
  if (a === 'medio') return; // lo maneja 'change'
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();

  if (a === 'opciones') return PLAT.opciones();
  if (a === 'filtro') { st.filtro = el.dataset.v; return pintar(); }
  if (a === 'abrir') return abrir(Number(el.dataset.fila));
  if (a === 'tab') { st.tab = el.dataset.v; return pintar(); }

  if (a === 'guardarNotas') return guardar({ notas: document.getElementById('notas').value, notasBase: cand().d.notas || '' }, '✔ Notas guardadas');

  if (a === 'ronda') {
    st.ronda = Number(el.dataset.v); st.borrador = null; pintar();
    await abrirBorrador(); return pintar();
  }
  if (a === 'reloj') { st.borrador.inicio = Date.now(); persistirBorrador(); return pintar(); }
  if (a === 'punto') {
    const n = Number(el.dataset.v), id = el.dataset.c;
    const tieneMedio = st.borrador.puntajes[id] != null && st.borrador.puntajes[id] % 1;
    st.borrador.puntajes[id] = n < 10 && tieneMedio ? n + 0.5 : n;
    persistirBorrador(); return pintarConScroll();
  }
  if (a === 'limpiar') { delete st.borrador.puntajes[el.dataset.c]; persistirBorrador(); return pintarConScroll(); }
  if (a === 'descartarBorrador') {
    if (!(await confirmar('¿Borrar los puntajes que marcaste y volver a lo que hay en el Sheet?', 'Borrar'))) return;
    borrarBorrador(); st.borrador = null; await abrirBorrador(); return pintar();
  }
  if (a === 'guardarEntrevista') {
    const b = st.borrador;
    const faltan = CRITERIOS.filter(cr => b.puntajes[cr.id] == null).map(cr => cr.nombre);
    if (faltan.length && !(await confirmar(`Faltan: ${faltan.join(', ')}. ¿Guardar igual?`, 'Guardar igual'))) return;
    const datos = { ronda: st.ronda, puntajes: b.puntajes, estado: document.getElementById('estadoFinal').value };
    const notasSheet = cand().d.notasFinal || '';
    if (b.notasFinal.trim() !== notasSheet.trim()) {
      datos.notasFinal = b.notasFinal;
      datos.notasFinalBase = b.notasFinalBase != null ? b.notasFinalBase : notasSheet;
    }
    const okG = await guardar(datos, `✔ E${st.ronda} guardada en el Sheet`);
    if (okG) { borrarBorrador(); st.tab = 'resumen'; await abrirBorrador(); pintar(); }
    return;
  }
  if (a === 'invitar') {
    const nombre = document.getElementById('invNombre').value.trim();
    if (!nombre) return toast('Ponle un nombre al celular');
    st.guardando = true; pintar();
    try { st.invitacion = { ...(await api('POST', { a: 'invitar', nombre })), nombre }; await abrirEquipoSinBorrar(); }
    catch (err) { toast('✖ ' + err.message, 5000); }
    finally { st.guardando = false; pintar(); }
    return;
  }
  if (a === 'copiarInv') {
    try { await navigator.clipboard.writeText(el.dataset.link); toast('✔ Link copiado'); }
    catch (err) { prompt('Copia el link:', el.dataset.link); }
    return;
  }
  if (a === 'quitar') {
    if (!(await confirmar(`¿Quitar el acceso a “${el.dataset.nombre}”? Ese celular deja de ver todo al instante.`, 'Quitar acceso', 'Volver'))) return;
    try { st.equipo = await api('POST', { a: 'quitar', id: el.dataset.id }); toast('✔ Acceso quitado'); }
    catch (err) { toast('✖ ' + err.message, 5000); }
    return pintar();
  }
  if (a === 'agendar') {
    const { fecha, hora } = st.msg;
    const falta = !fecha || !hora ? 'Elige la fecha y la hora arriba'
      : new Date(`${fecha}T${hora}`).getTime() < Date.now() - 15 * 60000 ? 'Esa fecha y hora ya pasaron' : '';
    if (falta) { e.preventDefault(); return toast('✖ ' + falta, 4000); }
    // El enlace abre WhatsApp con la invitación; en paralelo se guarda la cita.
    return guardar({ agendar: { ronda: Number(el.dataset.ronda), fecha, hora } }, `✔ Agendada E${el.dataset.ronda} · en Calendar`);
  }
  if (a === 'vino') {
    st.ronda = Number(el.dataset.v); st.tab = 'entrevista'; st.borrador = null; pintar();
    await abrirBorrador(); window.scrollTo(0, 0); return pintar();
  }
  if (a === 'novino') return guardar({ agendaEstado: 'No vino' }, '✔ Marcado: no vino');
  if (a === 'cancelarCita') {
    if (!(await confirmar('¿Cancelar la entrevista? Se borra del calendario.', 'Cancelar entrevista', 'Volver'))) return;
    return guardar({ agendaEstado: 'Cancelada' }, '✔ Entrevista cancelada');
  }
  if (a === 'enviar') {
    // El enlace abre WhatsApp solo (es un <a target=_blank>); aquí solo se marca el estado.
    const pl = PLANTILLAS.find(p => p.id === el.dataset.id);
    if (el.dataset.estado) await guardar({ estado: pl.estado }, `✔ Estado: ${pl.estado}`);
  }
});

function pintarConScroll() { const y = window.scrollY; pintar(); window.scrollTo(0, y); }

document.addEventListener('toggle', e => {
  const det = e.target;
  if (det.dataset && det.dataset.crit) { st.abiertos = st.abiertos || {}; st.abiertos[det.dataset.crit] = det.open; }
}, true);

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.accion === 'medio') {
    const id = el.dataset.c, v = st.borrador.puntajes[id];
    if (v == null) return;
    st.borrador.puntajes[id] = el.checked ? Math.floor(v) + 0.5 : Math.floor(v);
    persistirBorrador(); return pintarConScroll();
  }
  if (el.id === 'estadoSel') {
    const nuevo = el.value;
    if (!(await guardar({ estado: nuevo }, `✔ Estado: ${nuevo}`))) pintar();
  }
  if (el.id === 'estadoFinal') { st.borrador.estado = el.value; persistirBorrador(); }
  if (el.id === 'mFecha' || el.id === 'mHora') {
    st.msg[el.id === 'mFecha' ? 'fecha' : 'hora'] = el.value; pintarConScroll();
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'q') { st.q = el.value; pintar(); }
  if (el.id === 'notasFinal') { st.borrador.notasFinal = el.value; persistirBorrador(); }
  if (el.id && el.id.startsWith('pl-')) {
    const id = el.id.slice(3);
    document.querySelectorAll(`[data-wa="${id}"]`).forEach(a => { a.href = linkWa(cand().d, el.value); });
  }
});

async function abrirEquipoSinBorrar() {
  try { st.equipo = await api('POST', { a: 'equipo' }); } catch (e) { /* se queda la lista anterior */ }
}

$atras.onclick = () => { st.vista = 'lista'; st.sel = null; pintar(); };
$equipoBtn.onclick = () => abrirEquipo();
document.getElementById('refrescar').onclick = async () => { toast('Leyendo el Sheet…'); await cargar(); };
const $opc = document.getElementById('opciones');
if (PLAT.opciones) $opc.onclick = () => PLAT.opciones(); else $opc.remove();
if (PLAT.alCambiarConfig) PLAT.alCambiarConfig(cargar);
if (PLAT.movil) document.body.classList.add('movil');

// Antes de leer datos, la plataforma confirma que este equipo está autorizado (o lo activa).
(PLAT.preparar ? PLAT.preparar() : Promise.resolve(true)).then(ok => { if (ok) cargar(); });

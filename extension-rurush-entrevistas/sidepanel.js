// Panel lateral: lista de postulantes → ficha → entrevista guiada → guardar en el Sheet.
const $app = document.getElementById('app');
const $titulo = document.getElementById('titulo');
const $atras = document.getElementById('atras');
const $aviso = document.getElementById('aviso');

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
  guardando: false
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

// ---------- servidor (Apps Script) ----------
async function api(metodo, datos) {
  const { url, llave } = st.cfg;
  let r;
  if (metodo === 'GET') r = await fetch(`${url}?a=${datos.a}&k=${encodeURIComponent(llave)}`);
  else r = await fetch(url, { method: 'POST', body: JSON.stringify({ ...datos, k: llave }) });
  const j = await r.json().catch(() => { throw new Error('Respuesta inválida del Apps Script (¿la URL es la de /exec?)'); });
  if (!j.ok) throw new Error(j.error || 'Error desconocido');
  return j;
}

async function cargar() {
  st.cfg = await leerConfig();
  if (!st.cfg.url || !st.cfg.llave) {
    $app.innerHTML = `<div class="caja"><h3>Falta configurar</h3><p>Pega la URL del Apps Script y la llave en Opciones (ver README).</p>
      <button data-accion="opciones">Abrir opciones</button></div>`;
    return;
  }
  aviso('');
  try {
    const j = await api('GET', { a: 'lista' });
    st.estados = j.estados || [];
    st.cands = j.cands.map(c => ({ ...c, flags: evaluar(c.d) }));
    await chrome.storage.local.set({ cache: { estados: st.estados, cands: j.cands } });
  } catch (e) {
    const { cache } = await chrome.storage.local.get('cache');
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
    toast(okTxt || '✔ Guardado en el Sheet');
    return true;
  } catch (e) {
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
  const guardado = (await chrome.storage.local.get(k))[k];
  if (guardado) { st.borrador = guardado; return; }
  const puntajes = {};
  CRITERIOS.forEach(cr => { const v = num(c.d[cr.id + 'E' + st.ronda]); if (v != null) puntajes[cr.id] = v; });
  st.borrador = { puntajes, notasFinal: c.d.notasFinal || '', estado: '', inicio: null };
}
function persistirBorrador() { chrome.storage.local.set({ [claveBorrador()]: st.borrador }); }
function borrarBorrador() { chrome.storage.local.remove(claveBorrador()); }

// ---------- vistas ----------
function pintar() {
  $atras.hidden = st.vista === 'lista';
  if (st.vista === 'lista') { $titulo.textContent = '🎯 Entrevistas'; pintarLista(); }
  else { $titulo.textContent = nombreDe(cand()); pintarFicha(); }
}

function enFiltro(c) {
  const e = c.d.estado || '';
  if (st.filtro === 'todos') return true;
  if (st.filtro === 'activos') return !ESTADOS_CERRADOS.test(e);
  if (st.filtro === '(sin estado)') return !e;
  return e === st.filtro;
}

function pintarLista() {
  const q = st.q.toLowerCase();
  const conteo = {};
  st.cands.forEach(c => { const e = c.d.estado || '(sin estado)'; conteo[e] = (conteo[e] || 0) + 1; });
  const orden = [...st.estados, ...Object.keys(conteo).filter(e => !st.estados.includes(e))].filter(e => conteo[e]);
  const chips = [
    ['activos', 'Activos', st.cands.filter(c => !ESTADOS_CERRADOS.test(c.d.estado || '')).length],
    ['todos', 'Todos', st.cands.length],
    ...orden.map(e => [e, e, conteo[e]])
  ];
  const lista = st.cands
    .filter(enFiltro)
    .filter(c => !q || [c.d.nombre, c.d.email, c.d.wa, c.d.notas, c.d.ciudad].join(' ').toLowerCase().includes(q))
    .sort((a, b) => b.fila - a.fila);

  const foco = document.activeElement && document.activeElement.id === 'q';
  $app.innerHTML = `
    <input id="q" class="buscar" placeholder="🔎 Buscar nombre, celular, nota…" value="${esc(st.q)}">
    <div class="chips">${chips.map(([v, t, n]) => `<button class="chip ${st.filtro === v ? 'activo' : ''}" data-accion="filtro" data-v="${esc(v)}">${esc(t)} · ${n}</button>`).join('')}</div>
    ${lista.length ? lista.map(tarjeta).join('') : '<p class="vacio">Nadie en este filtro.</p>'}`;
  if (foco) { const i = document.getElementById('q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
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
    ${d.notas ? `<div class="sub">📝 ${esc(d.notas)}</div>` : ''}
  </div>`;
}

function pintarFicha() {
  const c = cand();
  if (!c) { st.vista = 'lista'; return pintar(); }
  const d = c.d;
  const opciones = [...new Set([...(st.estados || []), d.estado].filter(Boolean))];
  const enlace = (href, txt) => `<a href="${esc(href || '#')}" target="_blank" class="${href ? '' : 'falta'}">${txt}</a>`;
  const ig = d.ig && !/^no$/i.test(d.ig.trim()) ? `https://instagram.com/${d.ig.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '')}` : '';
  $app.innerHTML = `
    <div class="cabecera">
      <div class="nombre">${esc(nombreDe(c))}</div>
      <div class="sub">${esc([d.edad && d.edad + ' años', d.ciudad, d.wa].filter(Boolean).join(' · '))}</div>
      <div class="enlaces">
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
      <div class="promedio"><span class="n">${fmt(p)}</span><span>${completos}/6 criterios · <span class="reco">${recomendacion(p)}</span></span></div>
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
    <div class="caja"><h3>Fecha y hora (para las plantillas que la piden)</h3>
      <div class="dosc"><input type="date" id="mFecha" value="${esc(st.msg.fecha)}"><input type="time" id="mHora" value="${esc(st.msg.hora)}"></div>
    </div>
    ${PLANTILLAS.map(pl => `<div class="caja plantilla">
      <h3>${pl.titulo}</h3>
      <textarea id="pl-${pl.id}">${esc(textoPlantilla(pl, d))}</textarea>
      <div class="acciones">
        <button class="sec" data-accion="enviar" data-id="${pl.id}">Abrir WhatsApp</button>
        ${pl.estado ? `<button data-accion="enviar" data-id="${pl.id}" data-estado="1" ${st.guardando ? 'disabled' : ''}>Abrir y marcar “${esc(pl.estado)}”</button>` : ''}
      </div>
    </div>`).join('')}`;
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
  st.ronda = c.d.fechaE1 && !c.d.fechaE2 ? 2 : 1;
  st.borrador = null;
  pintar();
  await abrirBorrador();
  window.scrollTo(0, 0);
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const a = el.dataset.accion;
  if (a === 'medio') return; // lo maneja 'change'
  if (el.tagName === 'A') e.preventDefault();

  if (a === 'opciones') return chrome.runtime.openOptionsPage();
  if (a === 'filtro') { st.filtro = el.dataset.v; return pintar(); }
  if (a === 'abrir') return abrir(Number(el.dataset.fila));
  if (a === 'tab') { st.tab = el.dataset.v; return pintar(); }

  if (a === 'guardarNotas') return guardar({ notas: document.getElementById('notas').value }, '✔ Notas guardadas');

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
    if (!confirm('¿Borrar los puntajes que marcaste y volver a lo que hay en el Sheet?')) return;
    borrarBorrador(); st.borrador = null; await abrirBorrador(); return pintar();
  }
  if (a === 'guardarEntrevista') {
    const b = st.borrador;
    const faltan = CRITERIOS.filter(cr => b.puntajes[cr.id] == null).map(cr => cr.nombre);
    if (faltan.length && !confirm(`Faltan: ${faltan.join(', ')}. ¿Guardar igual?`)) return;
    const okG = await guardar({
      ronda: st.ronda,
      puntajes: b.puntajes,
      notasFinal: b.notasFinal,
      estado: document.getElementById('estadoFinal').value
    }, `✔ E${st.ronda} guardada en el Sheet`);
    if (okG) { borrarBorrador(); st.tab = 'resumen'; await abrirBorrador(); pintar(); }
    return;
  }
  if (a === 'enviar') {
    const c = cand();
    const pl = PLANTILLAS.find(p => p.id === el.dataset.id);
    const texto = document.getElementById('pl-' + pl.id).value;
    if (pl.pideFecha && /\[(fecha|hora)\]/.test(texto) && !confirm('El mensaje todavía dice [fecha]/[hora]. ¿Abrir igual?')) return;
    window.open(linkWa(c.d, texto), '_blank');
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
});

$atras.onclick = () => { st.vista = 'lista'; st.sel = null; pintar(); };
document.getElementById('refrescar').onclick = async () => { toast('Leyendo el Sheet…'); await cargar(); };
document.getElementById('opciones').onclick = () => chrome.runtime.openOptionsPage();
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync') cargar(); });

cargar();

// Corre dentro de web.whatsapp.com: lee el chat abierto, revisa el borrador y aprieta Enviar.

const RX_PRE = /\[(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?,?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/i;

function wid() {
  try {
    const raw = (localStorage.getItem('last-wid-md') || '').replace(/"/g, '');
    return raw.split(':')[0].split('@')[0].replace(/\D/g, '') || null;
  } catch { return null; }
}

function compose() {
  return document.querySelector('#main footer div[contenteditable="true"]');
}

// Texto de un aviso de WhatsApp (ventana emergente o barra en lugar del cuadro de texto),
// p. ej. cuando limita las conversaciones nuevas. Sirve para decir el motivo en el registro.
function avisoPantalla() {
  const partes = [...document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"]')]
    .map((n) => (n.innerText || '').trim()).filter(Boolean);
  const footer = document.querySelector('#main footer');
  if (footer && !compose()) partes.push((footer.innerText || '').trim());
  return partes.join(' | ').replace(/\s+/g, ' ').slice(0, 220);
}

function invalidPopup() {
  const nodes = document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"]');
  return [...nodes].some((n) => /(no es v[aá]lido|isn.t valid|is invalid|not on whatsapp|no est[aá] en whatsapp)/i.test(n.innerText || ''));
}

// ¿El mensaje es nuestro? WhatsApp marca cada fila con data-id "true_…" (nuestro) o
// "false_…" (del contacto). Las clases .message-out/.message-in quedan de respaldo.
function esSaliente(el) {
  const id = (el.closest('[data-id]') || { getAttribute: () => '' }).getAttribute('data-id') || '';
  if (/^true_/.test(id)) return true;
  if (/^false_/.test(id)) return false;
  if (el.closest('.message-out')) return true;
  if (el.closest('.message-in')) return false;
  return false;
}

function textoDe(el) {
  const s = el.querySelector('span.selectable-text, [data-testid="selectable-text"]');
  return ((s || el).innerText || '').trim();
}

// [{out, text, date, dateAlt}] en orden cronológico (viejo → nuevo).
// date = d/m/aaaa leído como AAAA-MM-DD; dateAlt = la lectura m/d/aaaa (WhatsApp en inglés).
function readMessages() {
  const out = [];
  for (const el of document.querySelectorAll('#main [data-pre-plain-text]')) {
    const pre = el.getAttribute('data-pre-plain-text') || '';
    const m = pre.match(RX_PRE);
    let date = null, dateAlt = null;
    if (m) {
      const pad = (n) => String(n).padStart(2, '0');
      date = `${m[6]}-${pad(m[5])}-${pad(m[4])}`;
      dateAlt = `${m[6]}-${pad(m[4])}-${pad(m[5])}`;
    }
    out.push({ out: esSaliente(el), text: textoDe(el), date, dateAlt });
  }
  return out;
}

function normTexto(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9ñ]/g, '');
}

function estadoDe(fila) {
  const iconos = [...fila.querySelectorAll('[data-icon]')].map((i) => i.getAttribute('data-icon') || '');
  if (iconos.some((n) => /error|alert/i.test(n))) return 'error';
  if (iconos.some((n) => /time|clock|pending/i.test(n))) return 'pendiente';
  return 'ok';
}

// Último mensaje saliente: { text, estado: 'pendiente' (reloj) | 'error' | 'ok', total } o null.
// total = cuántos mensajes nuestros hay en pantalla (sirve para ver que apareció uno nuevo).
// Con `inicio` (texto normalizado) busca la burbuja por su texto, sin depender de las clases
// de WhatsApp, que cambian seguido.
function lastOutgoing(inicio) {
  const nuestros = [...document.querySelectorAll('#main [data-pre-plain-text]')].filter(esSaliente);
  if (inicio) {
    const main = document.querySelector('#main');
    const hits = main ? [...main.querySelectorAll('span, div')].filter((n) =>
      normTexto(n.innerText).startsWith(inicio) && ![...n.children].some((c) => normTexto(c.innerText).startsWith(inicio))) : [];
    const el = hits[hits.length - 1];
    if (el && !el.closest('footer')) {
      let fila = el;
      for (let i = 0; i < 8 && fila.parentElement; i++) {
        fila = fila.parentElement;
        if (fila.querySelector('[data-icon]')) break;
      }
      return { text: el.innerText, estado: estadoDe(fila), total: nuestros.length, porTexto: true };
    }
  }
  let el = nuestros[nuestros.length - 1];
  let fila = el && (el.closest('[data-id]') || el.closest('.message-out'));
  if (!el) {
    const outs = document.querySelectorAll('#main .message-out');
    fila = outs[outs.length - 1];
    el = fila;
  }
  if (!el) return null;
  return { text: textoDe(el), estado: estadoDe(fila || el), total: nuestros.length };
}

// Para diagnosticar cambios de WhatsApp Web: qué marcas encuentra la extensión en el chat.
function diag() {
  const q = (sel) => document.querySelectorAll(sel).length;
  return {
    pre: q('#main [data-pre-plain-text]'), dataId: q('#main [data-id]'),
    idTrue: q('#main [data-id^="true_"]'), out: q('#main .message-out'), iconos: q('#main [data-icon]'),
    textos: q('#main span.selectable-text, #main span[dir]'), filas: q('#main [role="row"]'),
  };
}

// Textos que pone WhatsApp en el chat y que NO son respuestas del contacto.
const SISTEMA = /cambi[oó] (el nombre de usuario|su n[uú]mero|de n[uú]mero|su nombre)|changed (their|the|his|her) (phone|number|username|name)|cifrad[oa]s? de extremo|end-to-end encrypted|es un contacto|is a contact|bloqueaste|desbloqueaste|blocked this contact|unblocked|mensajes temporales|disappearing messages|eliminaste este mensaje|se elimin[oó] este mensaje|this message was deleted|llamada (de voz |de video )?perdida|missed (voice|video) call|mensajes no le[ií]dos|unread messages?/i;
const FECHA_CHIP = /^(hoy|ayer|today|yesterday|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2}\/\d{1,2}\/\d{2,4})$/i;
const META = /^(editado|edited|ia)?\s*\d{1,2}:\d{2}\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/i; // «Editado9:02 a. m.», «IA8:52 a. m.»
const esSistema = (t) => SISTEMA.test(t) || FECHA_CHIP.test(String(t).trim()) || META.test(String(t).trim());

// ¿El contacto respondió después de nuestro mensaje (el que empieza con `inicio`)?
// Devuelve { nuestro: hallado, respuestas: [textos], metodo }.
function respuestas(inicio) {
  // 1) Lectura con fecha/autor (data-pre-plain-text + data-id o clases).
  const msgs = readMessages();
  if (msgs.some((m) => m.out)) {
    let idx = -1;
    msgs.forEach((m, i) => { if (m.out && normTexto(m.text).startsWith(inicio)) idx = i; });
    if (idx >= 0) {
      return { nuestro: true, metodo: 'fecha', respuestas: msgs.slice(idx + 1).filter((m) => !m.out && m.text && !esSistema(m.text)).map((m) => m.text) };
    }
  }
  // 2) Sin marcas: se ubica nuestra burbuja por su texto y se toman los textos que vienen
  //    después cuya fila NO tiene ícono de estado (✓, ✓✓, reloj): esos son del contacto.
  const main = document.querySelector('#main');
  if (!main) return { nuestro: false, respuestas: [], metodo: 'sin chat' };
  const hits = [...main.querySelectorAll('span, div')].filter((n) =>
    !n.closest('footer') && normTexto(n.innerText).startsWith(inicio)
    && ![...n.children].some((c) => normTexto(c.innerText).startsWith(inicio)));
  const nuestro = hits[hits.length - 1];
  if (!nuestro) return { nuestro: false, respuestas: [], metodo: 'texto' };
  const ESTADO = /msg-|check|time|clock|pending/i;
  const textos = [...main.querySelectorAll('span.selectable-text, span[dir], div[dir]')].filter((n) =>
    !n.closest('footer') && (nuestro.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)
    && !nuestro.contains(n) && !n.querySelector('span.selectable-text, span[dir], div[dir]'));
  // Lado de la burbuja: las del contacto van a la izquierda, las nuestras a la derecha y los avisos
  // de WhatsApp al centro. Es lo más confiable porque no depende de cómo WhatsApp arma el HTML.
  const caja = main.getBoundingClientRect();
  const lado = (n) => {
    const r = n.getBoundingClientRect();
    if (caja.width < 300 || !r.width) return null;
    const c = (r.left + r.right) / 2 - caja.left;
    return c < caja.width * 0.42 ? 'contacto' : c > caja.width * 0.58 ? 'nuestro' : 'centro';
  };
  const usarLado = lado(nuestro) === 'nuestro'; // solo si nuestra burbuja sí se ve a la derecha
  const out = [];
  for (const n of textos) {
    const t = (n.innerText || '').trim();
    if (!t || /^\d{1,2}:\d{2}/.test(t) || esSistema(t)) continue;
    const l = usarLado ? lado(n) : null;
    if (l) { if (l === 'contacto') out.push(t); continue; }
    let fila = n, propio = false;
    for (let i = 0; i < 6 && fila.parentElement && !fila.parentElement.contains(nuestro); i++) {
      fila = fila.parentElement;
      const iconos = [...fila.querySelectorAll('[data-icon]')].map((x) => x.getAttribute('data-icon') || '');
      if (iconos.length) { propio = iconos.some((x) => ESTADO.test(x)); break; }
    }
    if (!propio) out.push(t);
  }
  return { nuestro: true, metodo: 'texto', respuestas: [...new Set(out)] };
}

function clearDraft() {
  const c = compose();
  if (!c) return { ok: false };
  c.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  return { ok: !c.innerText.trim() };
}

function sendButton() {
  const footer = document.querySelector('#main footer');
  if (!footer) return null;
  const icon = footer.querySelector('span[data-icon="send"], span[data-icon="wds-ic-send-filled"]');
  if (icon) return icon.closest('button') || icon.parentElement;
  return footer.querySelector('button[aria-label="Enviar"], button[aria-label="Send"]');
}

async function clickSend() {
  const btn = sendButton();
  if (!btn) return { ok: false, error: 'no encontré el botón Enviar' };
  btn.click();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const c = compose();
    if (c && !c.innerText.trim()) return { ok: true };
  }
  return { ok: false, error: 'el mensaje quedó en el cuadro de texto' };
}

// ── Imagen: se pega en el cuadro de texto (como Ctrl+V), WhatsApp abre la vista previa
//    y se aprieta su botón Enviar. Sin texto: el texto va después, como mensaje normal.
// WhatsApp cambia el nombre del ícono seguido (send, wds-ic-send-filled, wds-ic-send…):
// se acepta cualquier ícono «send» o un botón «Enviar» fuera del cuadro de texto del chat.
const ICONO_ENVIAR = '[data-icon*="send" i], button[aria-label="Enviar"], button[aria-label="Send"], [role="button"][aria-label="Enviar"], [role="button"][aria-label="Send"]';

// Con «base» (lo que había en pantalla antes de pegar): la vista previa es lo NUEVO que apareció,
// esté donde esté (WhatsApp a veces la dibuja dentro del pie del chat). Sin base: lo de siempre.
function fotoBase() {
  return { compose: compose(), envios: new Set(document.querySelectorAll(ICONO_ENVIAR)), cerrar: new Set(document.querySelectorAll(ICONO_CERRAR)) };
}
const ICONO_CERRAR = '[data-icon="x"], [data-icon*="close" i], [data-icon="x-alt"], [aria-label="Cerrar"], [aria-label="Close"]';
const fueraDeLista = (e) => !e.closest('#side') && !e.closest('#pane-side') && e.offsetParent;
function vistaPrevia(base) {
  if (base) {
    const nuevos = [...document.querySelectorAll(ICONO_ENVIAR)].filter((i) => !base.envios.has(i) && fueraDeLista(i));
    if (!nuevos.length) return null;
    const icono = nuevos[nuevos.length - 1];
    const textos = [...document.querySelectorAll('div[contenteditable="true"]')].filter((e) => e !== base.compose && fueraDeLista(e));
    const cierres = [...document.querySelectorAll(ICONO_CERRAR)].filter((i) => !base.cerrar.has(i) && fueraDeLista(i));
    return {
      boton: icono.closest('button, [role="button"]') || icono.parentElement,
      comentario: textos[textos.length - 1] || null,
      cerrar: cierres.length ? (cierres[0].closest('button, [role="button"]') || cierres[0]) : null,
    };
  }
  const iconos = [...document.querySelectorAll(ICONO_ENVIAR)]
    .filter((i) => !i.closest('#main footer') && !i.closest('#side') && !i.closest('#pane-side') && i.offsetParent);
  if (!iconos.length) return null;
  const icono = iconos[iconos.length - 1];
  const boton = icono.closest('button, [role="button"]') || icono.parentElement;
  const textos = [...document.querySelectorAll('div[contenteditable="true"]')]
    .filter((e) => !e.closest('#main footer') && !e.closest('#side') && !e.closest('#pane-side') && e.offsetParent);
  return { boton, comentario: textos[textos.length - 1] || null };
}

async function esperar(fn, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    const r = fn();
    if (r) return r;
    await new Promise((res) => setTimeout(res, 300));
  }
  return null;
}

const salientes = () => document.querySelectorAll('#main .message-out, #main [data-id^="true_"]').length;

async function enviarImagen({ b64, mime, nombre, texto }) {
  const c = compose();
  if (!c) return { ok: false, error: 'el chat no está abierto' };
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const archivo = new File([bytes], nombre || 'promo.jpg', { type: mime || 'image/jpeg' });
  const conArchivo = () => { const dt = new DataTransfer(); dt.items.add(archivo); return dt; };

  // Con el texto ya en el cuadro, WhatsApp lo pasa como comentario de la imagen:
  // sale UN solo mensaje (imagen + texto abajo).
  const base = fotoBase();
  const vp = () => vistaPrevia(base);
  c.focus();
  c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: conArchivo(), bubbles: true, cancelable: true }));
  let metodo = 'pegar';
  let vista = await esperar(vp, 8000);
  if (!vista) {
    // plan B: soltar el archivo sobre el chat (como arrastrarlo)
    metodo = 'soltar';
    const zona = document.querySelector('#main');
    const dt = conArchivo();
    for (const t of ['dragenter', 'dragover', 'drop']) zona.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
    vista = await esperar(vp, 8000);
  }
  if (!vista) return { ok: false, error: 'no se abrió la vista previa de la imagen' };
  await new Promise((r) => setTimeout(r, 800));
  vista = vp() || vista;

  const cancelar = (error) => {
    // cerrar la vista previa con su ✕ (Escape solo no siempre la cierra)
    const v = vp();
    if (v && v.cerrar) v.cerrar.click();
    const esc = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    (vista.comentario || document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', esc));
    document.dispatchEvent(new KeyboardEvent('keydown', esc));
    return { ok: false, error, metodo };
  };
  const leer = () => normTexto(vista.comentario ? vista.comentario.innerText : '');
  if (!leer() && vista.comentario) {
    // no pasó el texto: se pega como comentario
    const dt = new DataTransfer();
    dt.setData('text/plain', texto);
    vista.comentario.focus();
    vista.comentario.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 600));
    if (!leer()) {
      // plan B: escribirlo como si se tecleara
      vista.comentario.focus();
      document.execCommand('insertText', false, texto);
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  if (leer() !== normTexto(texto)) return cancelar('el comentario de la imagen no coincide con el mensaje del Sheet');

  // clic como de mouse (WhatsApp a veces ignora un .click() solo) y, si no sale, Enter en el comentario
  const clicar = (el) => {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o));
    el.click();
  };
  clicar(vista.boton);
  let cerro = await esperar(() => !vp(), 5000);
  if (!cerro && vp() && vista.comentario) {
    const ent = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    vista.comentario.focus();
    vista.comentario.dispatchEvent(new KeyboardEvent('keydown', ent));
    cerro = await esperar(() => !vp(), 5000);
  }
  if (!cerro && vp()) { clicar(vp().boton); }
  if (!cerro) cerro = await esperar(() => !vp(), 15000);
  if (!cerro) return cancelar('la imagen no salió (la vista previa no se cerró)');
  return { ok: true, metodo };
}

// ── 📲 Estado: pestaña Estados → «＋» → Fotos y videos → vista previa → Enviar.
//    El archivo se entrega al <input type=file> de WhatsApp (sin abrir el selector de Windows).
const visible = (e) => !!(e && (e.offsetParent || e.getClientRects().length));
const clicable = (e) => (e && (e.closest('button, [role="button"], a, li, [tabindex]') || e));
function buscar(selectores, raiz = document) {
  for (const sel of selectores) {
    const e = [...raiz.querySelectorAll(sel)].find(visible);
    if (e) return clicable(e);
  }
  return null;
}
function porTexto(re) {
  const e = [...document.querySelectorAll('li, button, [role="button"], [role="menuitem"], div[aria-label], span')]
    .filter(visible).find((x) => re.test((x.getAttribute('aria-label') || x.innerText || '').trim()));
  return e ? clicable(e) : null;
}
const NAV_ESTADOS = ['[aria-label="Estados"]', '[aria-label="Estado"]', '[aria-label="Status"]', '[aria-label="Updates in Status"]',
  '[data-icon="status-outline"]', '[data-icon="status-refreshed"]', '[data-icon="status"]', '[data-icon="status-filled"]', '[data-icon="wds-ic-status"]'];
const NAV_CHATS = ['[aria-label="Chats"]', '[data-icon="chats-outline"]', '[data-icon="chats-filled"]', '[data-icon="chat"]'];
const MAS_ESTADO = ['[aria-label="Agregar estado"]', '[aria-label="Añadir estado"]', '[aria-label="Add status"]', '[aria-label="Add Status"]',
  '[aria-label="Mi estado"]', '[aria-label="My status"]', '[data-icon="status-add"]', '[data-icon="add-status"]', '[data-icon="plus-rounded"]', '[data-icon="plus"]', '[data-icon="wds-ic-add"]'];
const inputFoto = () => [...document.querySelectorAll('input[type="file"]')].reverse()
  .find((i) => /image|video|\*/.test(i.getAttribute('accept') || '*')) || null;

// Qué se ve en pantalla (para entender un fallo sin estar frente a la PC).
function pistas() {
  const v = [...document.querySelectorAll('[aria-label], [data-icon], [role="menuitem"], li')].filter(visible)
    .map((e) => e.getAttribute('aria-label') || (e.getAttribute('data-icon') ? 'icon:' + e.getAttribute('data-icon') : (e.innerText || '').trim().slice(0, 25)))
    .filter(Boolean);
  return [...new Set(v)].slice(-25).join(' | ');
}

async function subirEstado({ b64, mime, nombre, texto }) {
  let paso = 'abrir Estados';
  const volver = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true })); const c = buscar(NAV_CHATS); if (c) c.click(); };
  const falla = (error) => { const p = pistas(); volver(); return { ok: false, error: error + ' · veo: ' + p }; };
  try {
    const nav = buscar(NAV_ESTADOS);
    if (!nav) return falla('no encontré el botón Estados');
    nav.click();
    await new Promise((r) => setTimeout(r, 1500));
    paso = 'botón ＋ de estado';
    const mas = await esperar(() => buscar(MAS_ESTADO, document.querySelector('#app') || document), 8000);
    if (!mas) return falla('no encontré el ＋ para agregar estado');
    // el archivo queda esperando en la página: cuando WhatsApp pida «elegir archivo», se le entrega este
    window.postMessage({ rurush: 'archivoEstado', b64, mime, nombre }, '*');
    let entregado = false;
    const oir = (e) => { if (e.source === window && e.data && e.data.rurush === 'archivoEntregado') entregado = true; };
    window.addEventListener('message', oir);
    const antes = new Set(document.querySelectorAll('input[type="file"]'));
    mas.click();
    await new Promise((r) => setTimeout(r, 1200));
    paso = 'Fotos y videos';
    let item = null, input = null;
    if (!entregado && !vistaPrevia()) {
      // el texto exacto «Fotos y videos» (no el menú entero) y de ahí su fila clicable
      const hoja = [...document.querySelectorAll('span, div')].filter(visible)
        .find((e) => /^(fotos y v[ií]deos|photos (&|and) videos)$/i.test((e.innerText || '').trim()) && e.children.length <= 2);
      item = hoja ? (hoja.closest('li, [role="button"], [role="menuitem"], button') || hoja) : null;
      if (item) {
        input = item.querySelector('input[type="file"]');
        if (!input) {
          const r = item.getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: window, clientX: r.left + 10, clientY: r.top + 10, button: 0 };
          for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) item.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o));
          item.click();
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    if (!entregado && !vistaPrevia()) {
      // plan B: un <input type=file> que sí esté en la página
      input = input || [...document.querySelectorAll('input[type="file"]')].reverse().find((i) => !antes.has(i)) || inputFoto();
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(new File([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], nombre || 'estado.jpg', { type: mime || 'image/jpeg' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    window.removeEventListener('message', oir);
    paso = 'vista previa';
    let vista = await esperar(vistaPrevia, 15000);
    if (!vista) {
      const ins = [...document.querySelectorAll('input[type="file"]')].map((i) => i.getAttribute('accept') || '*').join(', ');
      return falla((entregado ? 'entregué la foto pero no se abrió la vista previa' : 'no se abrió la vista previa')
        + ` [opción: ${item ? item.tagName + ' «' + (item.innerText || '').trim().slice(0, 20) + '»' : 'no la hallé'} · input: ${input ? 'sí' : 'no'} · inputs en página: ${ins || 'ninguno'}]`);
    }
    await new Promise((r) => setTimeout(r, 1000));
    vista = vistaPrevia() || vista;
    if (texto && vista.comentario) {
      const t = new DataTransfer(); t.setData('text/plain', texto);
      vista.comentario.focus();
      vista.comentario.dispatchEvent(new ClipboardEvent('paste', { clipboardData: t, bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 600));
    }
    paso = 'enviar';
    vista.boton.click();
    const cerro = await esperar(() => !vistaPrevia(), 30000);
    if (!cerro) return falla('el estado no salió (la vista previa no se cerró)');
    await new Promise((r) => setTimeout(r, 2000));
    const c = buscar(NAV_CHATS); if (c) c.click();
    return { ok: true };
  } catch (e) {
    return falla(paso + ': ' + String(e && e.message || e));
  }
}

// Turno compartido entre Rurush FP y Rurush Difusiones: las dos usan la misma pestaña de
// WhatsApp Web, así que quien envía toma el turno y la otra espera. Vive en el localStorage
// de web.whatsapp.com (lo ven las dos extensiones) y vence solo si nadie lo renueva.
function turnoWA(msg) {
  const K = 'rurush_turno', ahora = Date.now();
  let t = null;
  try { t = JSON.parse(localStorage.getItem(K) || 'null'); } catch (e) {}
  if (msg.accion === 'soltar') { if (t && t.quien === msg.quien) localStorage.removeItem(K); return { ok: true }; }
  if (t && t.hasta > ahora && t.quien !== msg.quien) return { ok: false, quien: t.quien, hasta: t.hasta };
  localStorage.setItem(K, JSON.stringify({ quien: msg.quien, hasta: ahora + (msg.ms || 240000) }));
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'turno') {
    reply(turnoWA(msg));
  } else if (msg.type === 'ping') {
    reply({ loggedIn: !!document.querySelector('#pane-side'), wid: wid() });
  } else if (msg.type === 'chatState') {
    const c = compose();
    reply({
      ready: !!c,
      draft: c ? c.innerText : '',
      invalid: invalidPopup(),
      messages: c ? readMessages() : [],
      aviso: avisoPantalla(),
    });
  } else if (msg.type === 'lastOutgoing') {
    reply(lastOutgoing(msg.inicio));
  } else if (msg.type === 'respuestas') {
    reply(respuestas(msg.inicio));
  } else if (msg.type === 'diag') {
    reply(diag());
  } else if (msg.type === 'cerrarAviso') {
    // «Ahora no» / cerrar en la ventana del límite de chats nuevos
    const dlg = [...document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"]')].pop();
    let ok = false;
    if (dlg) {
      const b = [...dlg.querySelectorAll('button, [role="button"]')].find((x) => /^(ahora no|not now|cerrar|close|ok|entendido)$/i.test((x.innerText || x.getAttribute('aria-label') || '').trim()))
        || dlg.querySelector('[aria-label="Cerrar"], [aria-label="Close"], [data-icon="x"], [data-icon="close"]');
      if (b) { (b.closest('button,[role="button"]') || b).click(); ok = true; }
    }
    if (!ok) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    reply({ ok });
  } else if (msg.type === 'clearDraft') {
    reply(clearDraft());
  } else if (msg.type === 'send') {
    clickSend().then(reply);
    return true;
  } else if (msg.type === 'subirEstado') {
    subirEstado(msg).then(reply, (e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  } else if (msg.type === 'enviarImagen') {
    enviarImagen(msg).then(reply, (e) => reply({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  return false;
});

// Si una persona (o Claude) está usando WhatsApp Web, avisar para que la
// extensión no le cambie el chat en medio. Los clics de la extensión no cuentan.
let last = 0;
function marcarActividad(e) {
  if (!e.isTrusted || Date.now() - last < 30000) return;
  last = Date.now();
  // tras recargar la extensión, el script viejo queda huérfano en la pestaña: no avisar nada
  try { if (chrome.runtime && chrome.runtime.id) chrome.runtime.sendMessage({ type: 'waActivity' }).catch(() => {}); } catch (e) {}
}
window.addEventListener('keydown', marcarActividad, true);
window.addEventListener('mousedown', marcarActividad, true);

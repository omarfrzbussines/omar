// Corre dentro de web.whatsapp.com: lee el chat abierto y aprieta Enviar.
if (!window.__rurushFP) {
window.__rurushFP = true;

const RX_PRE = /\[(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?,?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/i;
const RX_PRE_ISO = /\[(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?,?\s*(\d{4})-(\d{2})-(\d{2})\]/i;
// WhatsApp Web usa el formato de fecha del navegador: en-US = m/d/aaaa, el resto d/m/aaaa
const MES_PRIMERO = /^en-US/i.test(navigator.language || '');

function wid() {
  try {
    const raw = (localStorage.getItem('last-wid-md') || '').replace(/"/g, '');
    return raw.split(':')[0].split('@')[0].replace(/\D/g, '') || null;
  } catch { return null; }
}

function compose() {
  return document.querySelector('#main footer div[contenteditable="true"]');
}

function invalidPopup() {
  const nodes = document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"]');
  return [...nodes].some((n) => /(no es v[aá]lido|isn.t valid|is invalid|not on whatsapp|no est[aá] en whatsapp)/i.test(n.innerText || ''));
}

const esSaliente = (el) => !!(el.closest('.message-out') || el.closest('[data-id^="true_"]'));

// [{out, text, date, minutes}] en orden cronológico (viejo → nuevo); date/minutes = null si no se pudo leer
function readMessages() {
  const out = [];
  const pad = (n) => String(n).padStart(2, '0');
  for (const el of document.querySelectorAll('#main [data-pre-plain-text]')) {
    const pre = (el.getAttribute('data-pre-plain-text') || '').replace(/[  ]/g, ' ');
    let date = null, minutes = null, m;
    if ((m = pre.match(RX_PRE))) {
      const [d, mo] = MES_PRIMERO ? [m[5], m[4]] : [m[4], m[5]];
      date = `${m[6]}-${pad(mo)}-${pad(d)}`;
    } else if ((m = pre.match(RX_PRE_ISO))) {
      date = `${m[4]}-${m[5]}-${m[6]}`;
    }
    if (m) {
      let h = Number(m[1]);
      if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
      minutes = h * 60 + Number(m[2]);
    }
    const text = (el.querySelector('span.selectable-text') || el).innerText || '';
    out.push({ out: esSaliente(el), text, date, minutes });
  }
  return out;
}

// ¿El chat abierto es el de este número?
// 1) esta carga de la página se abrió con send?phone=<phone> (lo anota main.js)
// 2) ningún mensaje visible pertenece a otro número
function chatEsDe(phone) {
  if (document.documentElement.dataset.rurushPhone !== phone) return false;
  for (const el of document.querySelectorAll('#main [data-id*="@c.us"]')) {
    const m = (el.getAttribute('data-id') || '').match(/_(\d+)@c\.us/);
    if (m && m[1] !== phone) return false;
  }
  return true;
}

function cabecera() {
  // solo el nombre/número (primera línea); el estado "en línea / escribiendo…" cambia solo
  const h = document.querySelector('#main header');
  return h ? ((h.innerText || '').trim().split('\n')[0] || '').slice(0, 120) : '';
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

// data-id del último mensaje saliente visible. WhatsApp no deja todos los mensajes en
// pantalla (los viejos salen del DOM al llegar uno nuevo), así que contar no basta:
// se compara también cuál es el último.
function ultimoSaliente() {
  const els = document.querySelectorAll('#main [data-id^="true_"], #main .message-out');
  const el = els[els.length - 1];
  if (!el) return '';
  const conId = el.closest('[data-id]') || el;
  return conId.getAttribute('data-id') || '';
}

function outCount() {
  return Math.max(
    document.querySelectorAll('#main .message-out').length,
    document.querySelectorAll('#main [data-id^="true_"]').length,
  );
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Pega texto en un cuadro de WhatsApp sin recargar (respeta los saltos de línea).
async function pegarTexto(el, text) {
  el.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await esperar(500);
  if (!el.innerText.trim()) document.execCommand('insertText', false, text.replace(/\n/g, ' '));
  await esperar(300);
  return !!el.innerText.trim();
}

// Cuadro de descripción (caption) de la vista previa de la imagen
function cajaCaption() {
  return [...document.querySelectorAll('div[contenteditable="true"]')]
    .filter((el) => !el.closest('#main footer') && !el.closest('#side') && el.offsetParent !== null)
    .pop() || null;
}

function botonEnviarPreview() {
  const icons = [...document.querySelectorAll('span[data-icon="send"], span[data-icon="wds-ic-send-filled"], [aria-label="Enviar"], [aria-label="Send"]')]
    .filter((el) => !el.closest('#main footer'));
  return icons.length ? (icons[0].closest('[role="button"], button') || icons[0]) : null;
}

async function esperarSalida(antes, antesId, intentos = 30) {
  for (let i = 0; i < intentos; i++) {
    await esperar(500);
    if (outCount() > antes) return true;
    const id = ultimoSaliente();
    if (id && id !== antesId) return true;
  }
  return false;
}

// Envía el recordatorio en el chat ya abierto, sin recargar:
// con imagen → una sola burbuja (imagen + texto como descripción); sin imagen → solo texto.
async function enviarRecordatorio(text, phone, header, conImagen = true) {
  const seguro = () => chatEsDe(phone) && cabecera() === header;
  const c = compose();
  if (!c) return { ok: false, error: 'chat no abierto' };
  if (!seguro()) return { ok: false, noEnviado: true, error: 'el chat abierto no es el de este número' };
  if (c.innerText.trim()) return { ok: false, noEnviado: true, error: 'hay un borrador escrito en el chat' };
  const { gpsImage } = conImagen ? await chrome.storage.local.get('gpsImage') : {};

  if (gpsImage) {
    const blob = await (await fetch(gpsImage)).blob();
    const file = new File([blob], 'como-llegar-rurush.' + (blob.type.split('/')[1] || 'jpg'), { type: blob.type });
    const dt = new DataTransfer();
    dt.items.add(file);
    const antes = outCount(), antesId = ultimoSaliente();
    c.focus();
    c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));

    let btn = null;
    for (let i = 0; i < 25 && !btn; i++) { await esperar(400); btn = botonEnviarPreview(); }
    if (btn) {
      const caja = cajaCaption();
      const conTexto = caja ? await pegarTexto(caja, text) : false;
      btn = botonEnviarPreview() || btn;
      if (!seguro()) return { ok: false, noEnviado: true, error: 'el chat cambió antes de enviar' };
      btn.click();
      if (!(await esperarSalida(antes, antesId))) return { ok: false, error: 'la imagen no apareció en el chat' };
      if (conTexto) return { ok: true, imagen: true };
      // la imagen salió sin descripción: mandar el texto aparte
      await esperar(1500);
      const r = await enviarTexto(text, seguro);
      return { ok: true, imagen: true, aviso: r.ok ? 'imagen y texto salieron por separado' : `salió la imagen, pero el texto no (${r.error})` };
    }
    // no abrió la vista previa: seguimos solo con texto
    // si quedó una vista previa abierta, no seguir: podría enviarse sola después
    if (botonEnviarPreview()) return { ok: false, noEnviado: true, error: 'quedó abierta la vista previa de la imagen' };
    const r = await enviarTexto(text, seguro);
    return { ...r, imagen: false, aviso: r.ok ? 'no se pudo adjuntar la imagen, se envió solo el texto' : undefined };
  }
  return enviarTexto(text, seguro);
}

// ───────── etiqueta de WhatsApp Business ("FREE PASS") ─────────
// Hace lo mismo que a mano: ⋮ del chat → Añadir a la lista (antes "Etiquetar chat") → marca FREE PASS → Guardar.
// Si algo no se reconoce con seguridad, NO toca nada (para no quitar una etiqueta por error).
const visible = (el) => !!el && el.offsetParent !== null;
const sinTilde = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function clic(el) {
  const o = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent('pointerdown', o));
  el.dispatchEvent(new MouseEvent('mousedown', o));
  el.dispatchEvent(new PointerEvent('pointerup', o));
  el.dispatchEvent(new MouseEvent('mouseup', o));
  el.click();
}

async function buscar(fn, ms = 4000) {
  for (let t = 0; t < ms; t += 200) {
    const x = fn();
    if (x) return x;
    await esperar(200);
  }
  return null;
}

function botonMenuChat() {
  const h = document.querySelector('#main header');
  if (!h) return null;
  const c = [...h.querySelectorAll('[aria-label], [data-icon]')].find((el) =>
    /^(men[uú]|m[aá]s opciones|menu|more options)$/i.test(el.getAttribute('aria-label') || '') ||
    /^(menu|more-refreshed|kebab)/i.test(el.getAttribute('data-icon') || ''));
  return c ? (c.closest('button, [role="button"]') || c) : null;
}

// Fuera de: lista de chats, cabecera y mensajes del chat (ahí hay textos iguales que no son
// el menú, p. ej. el botón "Añadir a la lista ▾" de la cabecera).
const fueraDeZonas = (el) => !el.closest('#side, #pane-side, #main header, #main footer, #main [role="application"]');

// Elemento visible más chico cuyo texto completo cumple el patrón.
function porTexto(rx, raiz = document) {
  const els = [...raiz.querySelectorAll('li, [role="menuitem"], [role="button"], [role="checkbox"], [role="option"], button, div, span')]
    .filter((el) => visible(el) && fueraDeZonas(el) && rx.test(sinTilde(el.innerText)));
  els.sort((a, b) => a.innerText.length - b.innerText.length || b.querySelectorAll('*').length - a.querySelectorAll('*').length);
  return els[0] || null;
}

// true / false / null (no se pudo saber)
function estaMarcada(fila) {
  const cb = fila.querySelector('[role="checkbox"], input[type="checkbox"]') || (fila.matches('[role="checkbox"], [aria-checked], [aria-selected]') ? fila : null);
  if (cb) {
    if (cb.tagName === 'INPUT') return cb.checked;
    const v = cb.getAttribute('aria-checked') || cb.getAttribute('aria-selected');
    if (v === 'true' || v === 'false') return v === 'true';
  }
  const ic = [...fila.querySelectorAll('[data-icon]')].map((x) => x.getAttribute('data-icon')).join(' ');
  if (/checkbox-checked|checkbox-on|check-box-checked|checkbox-filled/.test(ic)) return true;
  if (/checkbox-unchecked|checkbox-off|check-box-unchecked|checkbox-empty|checkbox$/.test(ic)) return false;
  return null;
}

// Cierra solo con un botón Cerrar/Cancelar visible fuera del chat. NUNCA con Escape:
// en WhatsApp Web, Escape cierra el chat abierto.
function cerrarDialogo() {
  const b = [...document.querySelectorAll('[aria-label]')].find((el) => visible(el) && fueraDeZonas(el) &&
    /^(cerrar|close|cancelar|cancel)$/i.test(el.getAttribute('aria-label') || ''));
  if (b) { clic(b.closest('button, [role="button"]') || b); return true; }
  const t = porTexto(/^(cancelar|cancel|cerrar|close)$/);
  if (t) { clic(t.closest('button, [role="button"]') || t); return true; }
  return false;
}

// Foto de lo que hay en pantalla fuera del chat (menús y ventanas), para ajustar la extensión.
function diagnostico() {
  const raices = [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"], [data-animate-modal-popup="true"], [data-animate-dropdown-item="true"]')]
    .filter(visible);
  const lineas = [];
  const ver = (el, prof) => {
    if (lineas.length > 220 || !visible(el)) return;
    const propio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 60);
    const attrs = ['role', 'aria-label', 'aria-checked', 'aria-selected', 'data-icon', 'title', 'tabindex']
      .map((a) => el.hasAttribute(a) ? `${a}=${(el.getAttribute(a) || '').slice(0, 40)}` : '').filter(Boolean).join(' ');
    if (propio || attrs || el.tagName === 'INPUT') lineas.push(`${'  '.repeat(Math.min(prof, 12))}${el.tagName.toLowerCase()} ${attrs}${propio ? ' «' + propio + '»' : ''}`);
    for (const h of el.children) ver(h, prof + 1);
  };
  if (raices.length) raices.forEach((r) => { lineas.push('— raíz —'); ver(r, 0); });
  else {
    // sin dialog/menu: lo visible fuera de las zonas del chat
    for (const el of document.querySelectorAll('#app [tabindex], #app [role], #app [aria-label]')) {
      if (lineas.length > 220) break;
      if (!visible(el) || !fueraDeZonas(el)) continue;
      lineas.push(`${el.tagName.toLowerCase()} role=${el.getAttribute('role') || ''} aria-label=${(el.getAttribute('aria-label') || '').slice(0, 40)} «${(el.innerText || '').trim().split('\n')[0].slice(0, 50)}»`);
    }
  }
  return lineas.join('\n');
}

async function etiquetarChat(nombre, phone) {
  const rastro = [];
  const falla = (error) => ({ ok: false, error, diag: `${rastro.join('\n')}\n\nPANTALLA:\n${diagnostico()}` });
  const rxEtiqueta = new RegExp('^' + sinTilde(nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*') + '$', 'i');
  if (phone && !chatEsDe(phone)) return { ok: false, error: 'el chat abierto no es el de este número' };
  if (!compose()) return { ok: false, error: 'no hay un chat abierto' };
  // Camino corto: el botón de la cabecera "Añadir a la lista ▾" (o el nombre de la lista, si ya tiene).
  const chip = botonListaCabecera();
  if (chip && rxEtiqueta.test(sinTilde(chip.innerText).replace(/\s*▾\s*$/, ''))) return { ok: true, ya: true };
  let abierta = false;
  if (chip) {
    rastro.push('cabecera: «' + chip.innerText.trim() + '»');
    clic(chip);
    abierta = !!(await buscar(() => porTexto(rxEtiqueta), 2500));
  }
  if (!abierta) {
    const menu = botonMenuChat();
    if (!menu) return falla('no encontré el menú ⋮ del chat');
    rastro.push('⋮: ' + (menu.getAttribute('aria-label') || menu.outerHTML.slice(0, 80)));
    clic(menu);
    const r = await abrirDesdeMenu(menu, rastro);
    if (r) return falla(r);
  }
  return marcarYGuardar(rxEtiqueta, nombre, rastro, falla);
}

// Botón de la cabecera del chat con las listas ("Añadir a la lista ▾" o el nombre de la lista).
function botonListaCabecera() {
  const h = document.querySelector('#main header');
  if (!h) return null;
  return [...h.querySelectorAll('button, [role="button"]')].find((b) => visible(b) && (
    /^(anadir a la lista|agregar a la lista|add to list)$/.test(sinTilde(b.innerText)) ||
    !!b.querySelector('[data-icon*="list"], [data-icon*="label"]') && (b.innerText || '').trim().length > 0)) || null;
}

async function abrirDesdeMenu(menu, rastro) {
  const rxItem = /^(anadir a la lista|agregar a la lista|add to list|etiquetar chat|label chat|etiquetar|agregar etiqueta|add label)$/;
  const item = await buscar(() => {
    const e = porTexto(rxItem);
    if (e) return e.closest('li, [role="menuitem"], [role="button"]') || e;
    // el menú a veces se dibuja dentro de la cabecera: ahí solo vale un ítem de menú (li/menuitem),
    // nunca el botón "Añadir a la lista ▾" de la cabecera
    const h = [...document.querySelectorAll('#main header li, #main header [role="menuitem"]')]
      .find((x) => visible(x) && rxItem.test(sinTilde(x.innerText)));
    return h || null;
  });
  if (!item) {
    clic(menu); // vuelve a cerrar el menú (sin Escape)
    return 'el menú ⋮ no tiene "Añadir a la lista"';
  }
  rastro.push('ítem: ' + item.tagName + ' «' + item.innerText.trim() + '»');
  clic(item);
  return null;
}

async function marcarYGuardar(rxEtiqueta, nombre, rastro, falla) {
  const texto = await buscar(() => porTexto(rxEtiqueta));
  if (!texto) { const d = falla(`no encontré "${nombre}" en la ventana de listas`); cerrarDialogo(); return d; }
  rastro.push('lista: ' + texto.tagName + ' «' + texto.innerText.trim() + '»');
  // fila = el contenedor de la lista que también tiene su casilla
  let fila = texto;
  for (let i = 0; i < 8 && fila.parentElement; i++) {
    if (estaMarcada(fila) !== null) break;
    fila = fila.parentElement;
  }
  const marcada = estaMarcada(fila);
  if (marcada === true) { cerrarDialogo(); return { ok: true, ya: true }; }
  if (marcada === null) { const d = falla('no pude saber si ya estaba en FREE PASS: no se tocó'); cerrarDialogo(); return d; }

  clic(fila.querySelector('[role="checkbox"], input[type="checkbox"]') || fila);
  await esperar(500);
  if (estaMarcada(fila) !== true) { const d = falla('no se pudo marcar FREE PASS'); cerrarDialogo(); return d; }

  const guardar = await buscar(() => {
    const b = [...document.querySelectorAll('[aria-label], [data-icon]')].find((el) => visible(el) && fueraDeZonas(el) && (
      /^(guardar|save|listo|done|hecho|aceptar|ok)$/i.test(el.getAttribute('aria-label') || '') ||
      /^(checkmark|checkmark-medium|checkmark-light|wds-ic-checkmark)/.test(el.getAttribute('data-icon') || '')));
    return b ? (b.closest('button, [role="button"]') || b) : porTexto(/^(ok|guardar|save|listo|done|hecho|aceptar)$/);
  }, 2000);
  if (!guardar) return falla('marqué FREE PASS pero no encontré el botón OK');
  rastro.push('guardar: «' + (guardar.innerText || guardar.getAttribute('aria-label') || '').trim() + '»');
  clic(guardar);
  await esperar(800);
  return { ok: true };
}

async function enviarTexto(text, seguro) {
  const c = compose();
  if (!c) return { ok: false, noEnviado: true, error: 'chat no abierto' };
  if (!(await pegarTexto(c, text))) return { ok: false, noEnviado: true, error: 'no se pudo escribir el mensaje' };
  if (!seguro()) return { ok: false, noEnviado: true, error: 'el chat cambió antes de enviar' };
  return clickSend();
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'ping') {
    reply({ loggedIn: !!document.querySelector('#pane-side, #side, [aria-label="Lista de chats"], [aria-label="Chat list"]'), wid: wid() });
  } else if (msg.type === 'chatState') {
    const c = compose();
    reply({
      ready: !!c && (!msg.phone || chatEsDe(msg.phone)),
      hasDraft: !!(c && c.innerText.trim()),
      invalid: invalidPopup(),
      header: cabecera(),
      messages: c ? readMessages() : [],
    });
  } else if (msg.type === 'prepNav') {
    document.documentElement.dataset.rurushNav = '1';
    reply({ ok: true });
  } else if (msg.type === 'etiquetar') {
    etiquetarChat(msg.nombre || 'FREE PASS', msg.phone).then(reply, (e) => reply({ ok: false, error: String(e) }));
    return true;
  } else if (msg.type === 'sendReminder') {
    enviarRecordatorio(msg.text, msg.phone, msg.header, msg.conImagen !== false).then(reply, (e) => reply({ ok: false, error: String(e) }));
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
  chrome.runtime.sendMessage({ type: 'waActivity' }).catch(() => {});
}
window.addEventListener('keydown', marcarActividad, true);
window.addEventListener('mousedown', marcarActividad, true);
}

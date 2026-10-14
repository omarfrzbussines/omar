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
  if (marcada === null) { const d = falla(`no pude saber si ya estaba en ${nombre}: no se tocó`); cerrarDialogo(); return d; }

  clic(fila.querySelector('[role="checkbox"], input[type="checkbox"]') || fila);
  await esperar(500);
  if (estaMarcada(fila) !== true) { const d = falla(`no se pudo marcar ${nombre}`); cerrarDialogo(); return d; }

  const guardar = await buscar(() => {
    const b = [...document.querySelectorAll('[aria-label], [data-icon]')].find((el) => visible(el) && fueraDeZonas(el) && (
      /^(guardar|save|listo|done|hecho|aceptar|ok)$/i.test(el.getAttribute('aria-label') || '') ||
      /^(checkmark|checkmark-medium|checkmark-light|wds-ic-checkmark)/.test(el.getAttribute('data-icon') || '')));
    return b ? (b.closest('button, [role="button"]') || b) : porTexto(/^(ok|guardar|save|listo|done|hecho|aceptar)$/);
  }, 2000);
  if (!guardar) return falla(`marqué ${nombre} pero no encontré el botón OK`);
  rastro.push('guardar: «' + (guardar.innerText || guardar.getAttribute('aria-label') || '').trim() + '»');
  clic(guardar);
  await esperar(800);
  return { ok: true };
}

// ───────── chats que llegan de anuncios (Facebook / Instagram) ─────────
// Cuando alguien escribe desde un anuncio "clic a WhatsApp", el chat muestra arriba la tarjeta
// "Anuncio de facebook · Ver detalles" con la miniatura del video. Si está:
// 1) se reconoce el video por la miniatura y se llena el campo "Video" de la persona en Pipedrive
//    (un video nuevo queda en Opciones → Videos por aprender: se elige una vez y queda aprendido);
// 2) el chat se etiqueta en WhatsApp (por defecto "FB ADS").
// El módulo "Chats de anuncios" (background) abre solo los chats de los leads nuevos de Pipedrive;
// además se revisa al toque cualquier chat que abra una persona.
const RX_ANUNCIO = /^(?:anuncio de (facebook|instagram)|(facebook|instagram) ad)$/;
const RX_DETALLES = /(ver detalles|view details)/;

// { red: 'facebook' | 'instagram', tarjeta } o null — busca la tarjeta en los mensajes cargados
function anuncioEnChat() {
  const main = document.querySelector('#main');
  if (!main) return null;
  const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = sinTilde(n.textContent);
    if (t.length > 25) continue;
    const m = t.match(RX_ANUNCIO);
    if (!m || n.parentElement.closest('#main header, #main footer')) continue;
    // la tarjeta también dice "Ver detalles": así no cuenta un mensaje que solo diga "anuncio de facebook"
    let c = n.parentElement;
    for (let i = 0; i < 6 && c && c !== main; i++, c = c.parentElement) {
      if (RX_DETALLES.test(sinTilde(c.innerText))) return { red: m[1] || m[2], tarjeta: c };
    }
  }
  return null;
}

// Miniatura del anuncio: la imagen más grande dentro de la tarjeta (o un poco más arriba).
function miniatura(tarjeta) {
  let c = tarjeta;
  for (let i = 0; i < 4 && c && c.id !== 'main'; i++, c = c.parentElement) {
    const imgs = [...c.querySelectorAll('img')].filter((im) => im.complete && im.naturalWidth >= 24 && !im.closest('.emoji, [data-plain-text]'));
    if (imgs.length) return imgs.sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];
  }
  return null;
}

// Huella de la imagen (dHash 64 bits, en hex): igual o casi igual para la misma miniatura,
// aunque llegue con otro tamaño o calidad.
function dhash(px) { // px: RGBA de 9×8
  const g = (x, y) => { const i = (y * 9 + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; };
  let hex = '';
  for (let y = 0; y < 8; y++) {
    for (let k = 0; k < 8; k += 4) {
      let v = 0;
      for (let b = 0; b < 4; b++) v = (v << 1) | (g(k + b, y) > g(k + b + 1, y) ? 1 : 0);
      hex += v.toString(16);
    }
  }
  return hex;
}
async function huella(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 9; c.height = 8;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 9, 8);
    const hash = dhash(x.getImageData(0, 0, 9, 8).data);
    const t = document.createElement('canvas');
    t.width = t.height = 72;
    t.getContext('2d').drawImage(img, 0, 0, 72, 72);
    return { hash, thumb: t.toDataURL('image/jpeg', 0.7) };
  } catch (e) {
    // imagen de otro dominio: la lee el background (tiene permiso para ese dominio)
    if (!/^https:/.test(img.src)) return null;
    return chrome.runtime.sendMessage({ type: 'huellaUrl', url: img.src }).catch(() => null);
  }
}

// Celular del chat: la cabecera (si no es un contacto guardado) o los mensajes de la persona.
function telefonoChat() {
  const h = cabecera();
  if (/^\+?[\d\s()-]+$/.test(h) && h.replace(/\D/g, '').length >= 9) return h.replace(/\D/g, '');
  for (const el of document.querySelectorAll('#main [data-id*="@c.us"]')) {
    const m = (el.getAttribute('data-id') || '').match(/_(\d{9,15})@c\.us/);
    if (m) return m[1];
  }
  return null;
}

const distancia = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
};
async function videoConocido(hash) {
  const { videosAnuncio = {} } = await chrome.storage.local.get('videosAnuncio');
  let mejor = null;
  for (const [h, v] of Object.entries(videosAnuncio)) {
    const d = distancia(h, hash);
    if (d <= 12 && (!mejor || d < mejor.d)) mejor = { ...v, d };
  }
  return mejor;
}

// Video que todavía no conoce: queda en "Videos por aprender" (Opciones). Ahí se elige una vez cuál es
// y se llena en Pipedrive a todos los leads que llegaron con esa miniatura.
async function videoPorAprender(h, datos) {
  const { videosPorAprender = {} } = await chrome.storage.local.get('videosPorAprender');
  const v = videosPorAprender[h.hash] || { thumb: h.thumb || '', leads: [], desde: new Date().toISOString() };
  if (!v.leads.some((l) => l.header === datos.header)) v.leads.push({ header: datos.header, phone: datos.phone, red: datos.red });
  videosPorAprender[h.hash] = v;
  await chrome.storage.local.set({ videosPorAprender });
  chrome.runtime.sendMessage({ type: 'videoNuevo', header: datos.header, total: v.leads.length }).catch(() => {});
}

// ───── subir hasta el inicio del chat (la tarjeta del anuncio está en el primer mensaje) ─────
function cajaMensajes() {
  let c = document.querySelector('#main [data-pre-plain-text], #main [data-id]');
  for (; c && c.id !== 'main'; c = c.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(c).overflowY) && c.scrollHeight > c.clientHeight) return c;
  }
  return null;
}
const enElInicio = () => /(cifrados de extremo a extremo|end-to-end encrypted)/i.test(document.querySelector('#main').innerText || '');

// { anuncio, arriba }: arriba = llegó al primer mensaje (si no hay tarjeta, el chat no vino de un anuncio)
async function subirHastaAnuncio(ms = 25000) {
  const box = cajaMensajes();
  if (!box) return { anuncio: anuncioEnChat(), arriba: enElInicio() };
  const t0 = Date.now();
  let alto = box.scrollHeight, quietas = 0, r = null;
  while (Date.now() - t0 < ms) {
    const a = anuncioEnChat();
    if (a) { r = { anuncio: a, arriba: false }; break; }
    if (enElInicio() && quietas >= 1) { r = { anuncio: null, arriba: true }; break; }
    box.scrollTop = 0;
    await esperar(900);
    if (box.scrollHeight === alto) { if (++quietas >= 5) { r = { anuncio: anuncioEnChat(), arriba: true }; break; } } else { quietas = 0; alto = box.scrollHeight; }
  }
  if (!r) r = { anuncio: anuncioEnChat(), arriba: false };
  if (r.anuncio) r.anuncio.tarjeta.scrollIntoView({ block: 'center' }); // para que cargue la miniatura
  await esperar(800);
  if (r.anuncio) r.anuncio = anuncioEnChat() || r.anuncio;
  return r;
}

let ocupado = false;      // la extensión está usando el chat (etiquetar / enviar)
let ultimaTecla = 0;
const revisados = new Set(); // cabeceras ya revisadas en esta carga de la página

// chatsRevisados[cabecera] = { at, anuncio: true|false, sim }: cada chat se revisa una sola vez
async function anotarRevisado(header, datos) {
  const { chatsRevisados = {} } = await chrome.storage.local.get('chatsRevisados');
  chatsRevisados[header] = { at: new Date().toISOString(), ...datos };
  const limite = Date.now() - 120 * 864e5;
  for (const k of Object.keys(chatsRevisados)) if (Date.parse(chatsRevisados[k].at) < limite) delete chatsRevisados[k];
  await chrome.storage.local.set({ chatsRevisados });
}
const yaRevisado = (x, modo) => !!x && !(x.sim && modo === 'real');

// Revisa el chat abierto. subir = si no ve la tarjeta, sube hasta el inicio a buscarla.
async function revisarAnuncio(forzar = false, subir = false) {
  const header = cabecera();
  if (!header || !compose() || ocupado) return null;
  if (!forzar && revisados.has(header)) return null;
  const { config = {}, chatsRevisados = {} } = await chrome.storage.local.get(['config', 'chatsRevisados']);
  const modo = config.fbAdsModo || 'sim';
  const sim = modo !== 'real' && !forzar;
  const etiqueta = (config.fbAdsEtiqueta || 'FB ADS').trim();
  if (!forzar && (modo === 'off' || yaRevisado(chatsRevisados[header], modo))) { revisados.add(header); return null; }
  let anuncio = anuncioEnChat(), arriba = false;
  if (!anuncio && subir) ({ anuncio, arriba } = await subirHastaAnuncio());
  if (!anuncio) {
    // solo se anota "no vino de anuncio" si se llegó al primer mensaje
    if (arriba) { revisados.add(header); await anotarRevisado(header, { anuncio: false }); }
    return { ok: false, sinAnuncio: true, arriba, error: arriba ? 'el chat no vino de un anuncio' : 'no se vio la tarjeta del anuncio (no se llegó al inicio del chat)' };
  }
  const { red } = anuncio;
  revisados.add(header);

  // 1) el video, por la miniatura
  let video = null;
  const datos = { header, red, phone: telefonoChat(), forzar };
  const img = miniatura(anuncio.tarjeta);
  const h = img ? await huella(img) : null;
  if (!h || !h.hash) {
    chrome.runtime.sendMessage({ type: 'fbVideo', ...datos, error: 'no pude leer la miniatura del anuncio' }).catch(() => {});
  } else if ((video = await videoConocido(h.hash))) {
    chrome.runtime.sendMessage({ type: 'fbVideo', ...datos, videoId: video.id, label: video.label }).catch(() => {});
  } else {
    await videoPorAprender(h, datos);
  }

  // 2) la etiqueta de WhatsApp
  if (sim) {
    chrome.runtime.sendMessage({ type: 'fbAd', header, red, sim: true, etiqueta }).catch(() => {});
    await anotarRevisado(header, { anuncio: true, red, sim: true });
    return { ok: true, sim: true, red, video: video ? video.label : 'nuevo' };
  }
  // no abrir la ventana de listas mientras la persona está escribiendo
  for (let i = 0; i < 20 && Date.now() - ultimaTecla < 3000; i++) await esperar(500);
  if (cabecera() !== header || ocupado) { revisados.delete(header); return null; }
  ocupado = true;
  let r;
  try { r = await etiquetarChat(etiqueta); } catch (e) { r = { ok: false, error: String(e) }; } finally { ocupado = false; }
  if (r.ok) await anotarRevisado(header, { anuncio: true, red });
  chrome.runtime.sendMessage({ type: 'fbAd', header, red, etiqueta, ok: r.ok, ya: r.ya, error: r.error }).catch(() => {});
  return { ...r, red, video: video ? video.label : (h ? 'nuevo: elígelo en Opciones → Videos por aprender' : 'sin miniatura') };
}

// ───── lista de chats ─────
function filasChats() {
  const pane = document.querySelector('#pane-side');
  if (!pane) return [];
  return [...pane.querySelectorAll('[role="listitem"], [role="row"]')].map((el) => {
    const t = el.querySelector('span[title]');
    const titulo = t ? t.getAttribute('title').trim() : '';
    const noLeido = !!el.querySelector('[aria-label*="no leído" i], [aria-label*="no leidos" i], [aria-label*="no leídos" i], [aria-label*="unread" i]');
    return { el, titulo, noLeido };
  }).filter((f) => f.titulo);
}

async function marcarNoLeido(titulo) {
  const f = filasChats().find((x) => x.titulo === titulo);
  if (!f) return false;
  const r = f.el.getBoundingClientRect();
  f.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, button: 2, clientX: r.left + 40, clientY: r.top + 20 }));
  const item = await buscar(() => porTexto(/^(marcar como no leido|mark as unread)$/), 2500);
  if (!item) return false;
  clic(item.closest('li, [role="menuitem"], [role="button"]') || item);
  await esperar(500);
  return true;
}

const digitos9 = (t) => String(t || '').replace(/\D/g, '').slice(-9);

// ¿La fila de este chat (por título o por celular) está como no leída? null = no está a la vista
function noLeidoDe({ titulo, phone }) {
  const f = filasChats().find((x) => (titulo && x.titulo === titulo) || (phone && digitos9(x.titulo).length === 9 && digitos9(x.titulo) === digitos9(phone)));
  return f ? f.noLeido : null;
}

// Abre un chat buscándolo por su título en la lista (para leads que solo tienen @usuario, sin número).
async function abrirPorTitulo(titulo) {
  const pane = document.querySelector('#pane-side');
  if (!pane) return { ok: false, error: 'WhatsApp Web no muestra la lista de chats' };
  pane.scrollTop = 0;
  await esperar(800);
  for (let i = 0; i < 30; i++) {
    const f = filasChats().find((x) => x.titulo.toLowerCase() === titulo.toLowerCase());
    if (f) {
      const noLeido = f.noLeido;
      clic(f.el.querySelector('span[title]') || f.el);
      if (!(await buscar(() => cabecera().toLowerCase() === titulo.toLowerCase() && compose(), 6000))) return { ok: false, error: 'el chat no abrió' };
      await esperar(1500);
      return { ok: true, noLeido };
    }
    const antes = pane.scrollTop;
    pane.scrollTop += pane.clientHeight * 0.8;
    await esperar(700);
    if (pane.scrollTop === antes) break;
  }
  return { ok: false, error: 'no está en la lista de chats' };
}

// Lee la tarjeta del anuncio del chat abierto (sube hasta el inicio si hace falta). No toca nada.
async function leerAnuncio(phone) {
  if (!compose()) return { ok: false, error: 'no hay un chat abierto' };
  if (phone && !chatEsDe(phone)) return { ok: false, error: 'el chat abierto no es el de este número' };
  const header = cabecera();
  let anuncio = anuncioEnChat(), arriba = false;
  if (!anuncio) ({ anuncio, arriba } = await subirHastaAnuncio());
  const box = cajaMensajes();
  if (!anuncio) { if (box) box.scrollTop = box.scrollHeight; return { ok: true, header, anuncio: false, arriba }; }
  const img = miniatura(anuncio.tarjeta);
  const h = img ? await huella(img) : null;
  if (box) box.scrollTop = box.scrollHeight;
  revisados.add(header); // que el revisor de chats abiertos no lo repita
  return { ok: true, header, anuncio: true, red: anuncio.red, hash: h && h.hash, thumb: h && h.thumb };
}

// Además, cuando una persona abre un chat, se revisa al toque (sin subir: no le mueve la pantalla).
let chatVisto = '', desde = 0;
setInterval(() => {
  const h = cabecera();
  if (h !== chatVisto) { chatVisto = h; desde = Date.now(); return; }
  // espera 2 s a que carguen los mensajes; prueba hasta 15 s (la tarjeta a veces aparece después)
  if (!h || ocupado || Date.now() - desde < 2000 || Date.now() - desde > 15000) return;
  if (Date.now() - ultimaHumana > 120000) return;
  revisarAnuncio().catch(() => {});
}, 1500);

async function enviarTexto(text, seguro) {
  const c = compose();
  if (!c) return { ok: false, noEnviado: true, error: 'chat no abierto' };
  if (!(await pegarTexto(c, text))) return { ok: false, noEnviado: true, error: 'no se pudo escribir el mensaje' };
  if (!seguro()) return { ok: false, noEnviado: true, error: 'el chat cambió antes de enviar' };
  return clickSend();
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
    const loggedIn = !!document.querySelector('#pane-side, #side, [aria-label="Lista de chats"], [aria-label="Chat list"]');
    // "WhatsApp está abierto en otra ventana" (otra pestaña de este Chrome, p. ej. de Difusiones): se toma aquí.
    let otraVentana = false;
    if (!loggedIn) {
      const b = [...document.querySelectorAll('button, div[role="button"]')].find((x) => /^(usar aquí|use here)$/i.test((x.textContent || '').trim()));
      if (b) { otraVentana = true; b.click(); }
    }
    const qr = !loggedIn && !!document.querySelector('canvas[aria-label], [data-ref] canvas, [data-testid="qrcode"]');
    reply({ loggedIn, wid: wid(), otraVentana, qr });
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
    ocupado = true;
    etiquetarChat(msg.nombre || 'FREE PASS', msg.phone).then(reply, (e) => reply({ ok: false, error: String(e) }))
      .finally(() => { ocupado = false; });
    return true;
  } else if (msg.type === 'leerAnuncio') {
    ocupado = true;
    leerAnuncio(msg.phone).then(reply, (e) => reply({ ok: false, error: String(e) })).finally(() => { ocupado = false; });
    return true;
  } else if (msg.type === 'abrirPorTitulo') {
    abrirPorTitulo(msg.titulo).then(reply, (e) => reply({ ok: false, error: String(e) }));
    return true;
  } else if (msg.type === 'noLeidoDe') {
    reply({ noLeido: noLeidoDe(msg) });
  } else if (msg.type === 'marcarNoLeido') {
    marcarNoLeido(msg.titulo).then((ok) => reply({ ok }), () => reply({ ok: false }));
    return true;
  } else if (msg.type === 'fbAdAhora') {
    revisarAnuncio(true, true).then((r) => reply(r || { ok: false, error: 'no hay un chat abierto' }), (e) => reply({ ok: false, error: String(e) }));
    return true;
  } else if (msg.type === 'sendReminder') {
    ocupado = true;
    enviarRecordatorio(msg.text, msg.phone, msg.header, msg.conImagen !== false).then(reply, (e) => reply({ ok: false, error: String(e) }))
      .finally(() => { ocupado = false; });
    return true;
  }
  return false;
});

// Si una persona (o Claude) está usando WhatsApp Web, avisar para que la
// extensión no le cambie el chat en medio. Los clics de la extensión no cuentan.
let last = 0, ultimaHumana = 0;
function marcarActividad(e) {
  if (!e.isTrusted) return;
  ultimaHumana = Date.now();
  if (e.type === 'keydown') ultimaTecla = Date.now();
  if (Date.now() - last < 30000) return;
  last = Date.now();
  chrome.runtime.sendMessage({ type: 'waActivity' }).catch(() => {});
}
window.addEventListener('keydown', marcarActividad, true);
window.addEventListener('mousedown', marcarActividad, true);
}

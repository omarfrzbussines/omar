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

// ¿El contacto respondió después de nuestro mensaje (el que empieza con `inicio`)?
// Devuelve { nuestro: hallado, respuestas: [textos], metodo }.
function respuestas(inicio) {
  // 1) Lectura con fecha/autor (data-pre-plain-text + data-id o clases).
  const msgs = readMessages();
  if (msgs.some((m) => m.out)) {
    let idx = -1;
    msgs.forEach((m, i) => { if (m.out && normTexto(m.text).startsWith(inicio)) idx = i; });
    if (idx >= 0) {
      return { nuestro: true, metodo: 'fecha', respuestas: msgs.slice(idx + 1).filter((m) => !m.out && m.text).map((m) => m.text) };
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
  const out = [];
  for (const n of textos) {
    const t = (n.innerText || '').trim();
    if (!t || /^\d{1,2}:\d{2}/.test(t)) continue;
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

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'ping') {
    reply({ loggedIn: !!document.querySelector('#pane-side'), wid: wid() });
  } else if (msg.type === 'chatState') {
    const c = compose();
    reply({
      ready: !!c,
      draft: c ? c.innerText : '',
      invalid: invalidPopup(),
      messages: c ? readMessages() : [],
    });
  } else if (msg.type === 'lastOutgoing') {
    reply(lastOutgoing(msg.inicio));
  } else if (msg.type === 'respuestas') {
    reply(respuestas(msg.inicio));
  } else if (msg.type === 'diag') {
    reply(diag());
  } else if (msg.type === 'clearDraft') {
    reply(clearDraft());
  } else if (msg.type === 'send') {
    clickSend().then(reply);
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

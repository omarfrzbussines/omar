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
    const text = (el.querySelector('span.selectable-text') || el).innerText || '';
    out.push({ out: !!el.closest('.message-out'), text, date, dateAlt });
  }
  return out;
}

// Estado del último mensaje saliente: 'pendiente' (reloj), 'error', 'ok' o null.
function lastOutgoing() {
  const all = document.querySelectorAll('#main .message-out');
  const el = all[all.length - 1];
  if (!el) return null;
  const textEl = el.querySelector('span.selectable-text');
  let estado = 'ok';
  if (el.querySelector('span[data-icon="msg-time"]')) estado = 'pendiente';
  if (el.querySelector('span[data-icon="msg-error"], span[data-icon="alert-icon"]')) estado = 'error';
  return { text: textEl ? textEl.innerText : '', estado };
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
    reply(lastOutgoing());
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

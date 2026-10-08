// Corre dentro de web.whatsapp.com: lee el chat abierto y aprieta Enviar.
if (!window.__rurushFP) {
window.__rurushFP = true;

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

// [{out, text, date, dateAlt, minutes}] en orden cronológico (viejo → nuevo)
function readMessages() {
  const out = [];
  for (const el of document.querySelectorAll('#main [data-pre-plain-text]')) {
    const pre = el.getAttribute('data-pre-plain-text') || '';
    const m = pre.match(RX_PRE);
    let date = null, dateAlt = null, minutes = null;
    if (m) {
      let h = Number(m[1]);
      if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
      minutes = h * 60 + Number(m[2]);
      const pad = (n) => String(n).padStart(2, '0');
      date = `${m[6]}-${pad(m[5])}-${pad(m[4])}`;    // d/m/aaaa
      dateAlt = `${m[6]}-${pad(m[4])}-${pad(m[5])}`; // m/d/aaaa (WhatsApp en inglés)
    }
    const text = (el.querySelector('span.selectable-text') || el).innerText || '';
    out.push({ out: !!el.closest('.message-out'), text, date, dateAlt, minutes });
  }
  return out;
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

function outCount() {
  return document.querySelectorAll('#main .message-out').length;
}

// Pega la imagen guardada en Opciones en el chat abierto y la envía.
async function sendImage() {
  const { gpsImage } = await chrome.storage.local.get('gpsImage');
  if (!gpsImage) return { ok: false, error: 'no hay imagen cargada' };
  const c = compose();
  if (!c) return { ok: false, error: 'chat no abierto' };
  const blob = await (await fetch(gpsImage)).blob();
  const file = new File([blob], 'como-llegar-rurush.' + (blob.type.split('/')[1] || 'jpg'), { type: blob.type });
  const dt = new DataTransfer();
  dt.items.add(file);
  const antes = outCount();
  c.focus();
  c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));

  // aparece la vista previa de la imagen con su propio botón Enviar
  let btn = null;
  for (let i = 0; i < 25 && !btn; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const icons = [...document.querySelectorAll('span[data-icon="send"], span[data-icon="wds-ic-send-filled"], [aria-label="Enviar"], [aria-label="Send"]')]
      .filter((el) => !el.closest('#main footer'));
    if (icons.length) btn = icons[0].closest('[role="button"], button') || icons[0];
  }
  if (!btn) return { ok: false, error: 'no apareció la vista previa de la imagen' };
  btn.click();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (outCount() > antes) return { ok: true };
  }
  return { ok: false, error: 'la imagen no apareció en el chat' };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'ping') {
    reply({ loggedIn: !!document.querySelector('#pane-side, #side, [aria-label="Lista de chats"], [aria-label="Chat list"]'), wid: wid() });
  } else if (msg.type === 'chatState') {
    const c = compose();
    reply({
      ready: !!c,
      hasDraft: !!(c && c.innerText.trim()),
      invalid: invalidPopup(),
      messages: c ? readMessages() : [],
    });
  } else if (msg.type === 'prepNav') {
    document.documentElement.dataset.rurushNav = '1';
    reply({ ok: true });
  } else if (msg.type === 'sendImage') {
    sendImage().then(reply, (e) => reply({ ok: false, error: String(e) }));
    return true;
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
}

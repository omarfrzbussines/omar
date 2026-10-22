/* Puente hacia el WhatsApp de verdad.
   ------------------------------------------------------------------
   Este archivo NO corre en el mundo aislado de la extensión como el resto, sino
   DENTRO de la página, junto al propio código de WhatsApp (en el manifest va con
   "world": "MAIN"). Esa es toda la diferencia, y es la que importa.

   Por qué hace falta: hasta 2026 cada mensaje llevaba el número escrito en el DOM
   y bastaba leerlo. WhatsApp migró todos los chats a un identificador anónimo
   (`@lid`) y el número desapareció de la pantalla — pero NO de WhatsApp, que lo
   necesita para enviar. Desde acá adentro se le puede preguntar.

   Comprobado el 06-oct-2026 sobre 300 chats: 261 devuelven número; el resto son
   grupos o gente que de verdad no lo comparte.

   Solo lee. No envía mensajes, no toca chats, no modifica nada. */
(() => {
  "use strict";
  if (window.__rurushPuente) return;
  window.__rurushPuente = true;

  function chatAbierto() {
    const CC = window.require("WAWebChatCollection").ChatCollection;
    const chats = CC.getModelsArray ? CC.getModelsArray() : (CC.models || []);
    return chats.find((c) => c.active) || null;
  }

  function datosDelChat() {
    try {
      if (typeof window.require !== "function") return { listo: false };
      const chat = chatAbierto();
      if (!chat) return { listo: true, hay: false };

      const id = chat.id || {};
      const esGrupo = id.server === "g.us";

      // El teléfono vive en el contacto, no en el chat: el id del chat hoy es el
      // identificador anónimo. En grupos no se pide: no tiene sentido.
      let telefono = "";
      if (!esGrupo) {
        const ct = chat.contact || {};
        const pn = ct.phoneNumber || ct.__x_phoneNumber;
        const user = pn && (typeof pn === "string" ? pn : pn.user);
        if (/^\d{9,15}$/.test(String(user || ""))) telefono = String(user);
      }

      // ¿la persona ya escribió? (para guardar el contacto solo, sin depender del DOM)
      let escribio = null;
      try {
        const msgs = chat.msgs && (chat.msgs.getModelsArray ? chat.msgs.getModelsArray() : chat.msgs.models);
        if (msgs) escribio = msgs.some((m) => m && m.id && m.id.fromMe === false);
      } catch (e) { /* sin dato: se mira la pantalla */ }

      return {
        listo: true, hay: true, esGrupo, telefono, escribio,
        titulo: String(chat.formattedTitle || (chat.contact && (chat.contact.name ||
                chat.contact.pushname)) || "")
      };
    } catch (e) {
      // Si WhatsApp cambia sus tripas, esto falla acá y el panel sigue con el
      // método viejo (abrir "Info. del contacto"). No se cae nada.
      return { listo: false, error: String((e && e.message) || e).slice(0, 120) };
    }
  }

  /* Mensajes que llegan (para guardar el contacto en Pipedrive aunque nadie abra el chat).
     Solo se activa si la extensión lo pide (interruptor en Opciones, apagado por defecto).
     Cada 8 s mira el último mensaje de cada chat: si es de la persona y llegó después de
     encender esto, avisa una vez por chat. Solo lee. */
  let llegadaDesde = 0, reloj = null;
  const visto = Object.create(null);
  function revisarLlegadas() {
    try {
      if (typeof window.require !== "function") return;
      const CC = window.require("WAWebChatCollection").ChatCollection;
      const chats = CC.getModelsArray ? CC.getModelsArray() : (CC.models || []);
      for (const chat of chats) {
        const id = chat.id || {};
        if (!/^(c\.us|lid|s\.whatsapp\.net)$/.test(String(id.server || ""))) continue;   // grupos, estados, canales
        const arr = chat.msgs && (chat.msgs.getModelsArray ? chat.msgs.getModelsArray() : chat.msgs.models);
        const ult = arr && arr[arr.length - 1];
        if (!ult || !ult.id || ult.id.fromMe !== false) continue;
        const t = Number(ult.t || 0) * 1000;
        const clave = String(id._serialized || id.user || "");
        if (!clave || t < llegadaDesde || visto[clave] >= t) continue;
        visto[clave] = t;
        const ct = chat.contact || {};
        const pn = ct.phoneNumber || ct.__x_phoneNumber;
        const tel = pn && (typeof pn === "string" ? pn : pn.user);
        if (!/^\d{9,15}$/.test(String(tel || ""))) continue;
        const nombre = String(ct.name || ct.pushname || chat.formattedTitle || "");
        window.postMessage({ rr: "rr-llegada", telefono: String(tel), nombre }, "*");
      }
    } catch (e) { /* si WhatsApp cambia sus tripas, simplemente no avisa */ }
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (d && d.rr === "rr-llegada-on") {
      if (d.on && !reloj) { llegadaDesde = Date.now() - 60000; reloj = setInterval(revisarLlegadas, 8000); }
      if (!d.on && reloj) { clearInterval(reloj); reloj = null; }
      return;
    }
    if (!d || d.rr !== "rr-pide-chat") return;
    window.postMessage({ rr: "rr-chat", id: d.id, dato: datosDelChat() }, "*");
  });
})();

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

      return {
        listo: true, hay: true, esGrupo, telefono,
        titulo: String(chat.formattedTitle || (chat.contact && (chat.contact.name ||
                chat.contact.pushname)) || "")
      };
    } catch (e) {
      // Si WhatsApp cambia sus tripas, esto falla acá y el panel sigue con el
      // método viejo (abrir "Info. del contacto"). No se cae nada.
      return { listo: false, error: String((e && e.message) || e).slice(0, 120) };
    }
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.rr !== "rr-pide-chat") return;
    window.postMessage({ rr: "rr-chat", id: d.id, dato: datosDelChat() }, "*");
  });
})();

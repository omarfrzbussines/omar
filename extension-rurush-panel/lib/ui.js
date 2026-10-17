/* RURUSH — piezas compartidas entre el panel de WhatsApp y el de Apps Fit.
   Todo lo que estaba duplicado (y ya se había desincronizado) vive aquí. */

window.RR = (() => {

  /* ---------- fechas ---------- */

  const pad = (n) => String(n).padStart(2, "0");

  // Hoy en Lima (UTC-5, Perú no cambia de hora) como YYYY-MM-DD.
  // Hacerlo con new Date() a secas corre las fechas un día después de las 7pm.
  function hoyLima(offsetDias = 0) {
    const d = new Date(Date.now() - 5 * 3600 * 1000);
    d.setUTCDate(d.getUTCDate() + offsetDias);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  // Días entre hoy (Lima) y una fecha YYYY-MM-DD. Positivo = falta, negativo = pasó.
  function diasHasta(iso) {
    if (!iso) return null;
    const a = new Date(hoyLima() + "T00:00:00Z");
    const b = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
    return Math.round((b - a) / 86400000);
  }

  const fechaCorta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

  /* ---------- texto ---------- */

  // Últimos 9 dígitos: la única forma fiable de cruzar celulares peruanos.
  function tel9(v) {
    const d = String(v || "").replace(/\D/g, "");
    return d.length >= 9 ? d.slice(-9) : "";
  }

  const normalizar = (s) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  // Obligatorio antes de meter cualquier dato externo en innerHTML: el nombre del
  // chat lo elige el propio contacto, y un lead puede ponerse un nombre con HTML.
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- hablar con el service worker ---------- */

  // Se llama "pedir" y no "enviar" a propósito: en este proyecto "enviar" es
  // mandarle un WhatsApp a un cliente, y confundir las dos cosas sale caro.
  function pedir(tipo, datos = {}, msTope = 20000) {
    const fallo = (error) => ({ ok: false, error });

    const llamada = new Promise((res) => {
      try {
        chrome.runtime.sendMessage({ tipo, datos }, (r) => {
          // Pasa al recargar la extensión: el script de la pestaña queda huérfano.
          if (chrome.runtime.lastError) {
            res(fallo("La extensión se recargó. Recarga esta página (F5)."));
          } else res(r || fallo("Sin respuesta de la extensión."));
        });
      } catch {
        res(fallo("La extensión se recargó. Recarga esta página (F5)."));
      }
    });

    // Ojo: esto no cancela la peticion, solo deja de esperarla — el servidor puede
    // haber guardado igual. Por eso el aviso NO dice "fallo": decia "no responde" y
    // la asesora volvia a darle, creando dos fichas o dos clases agendadas.
    const tope = new Promise((res) =>
      setTimeout(() => res(fallo("Se está demorando más de lo normal. PUEDE que sí se haya guardado — revísalo antes de repetirlo.")), msTope));

    return Promise.race([llamada, tope]);
  }

  /* ---------- DOM ---------- */

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstElementChild;
  }

  function toast(msg, ms = 2800) {
    document.querySelector(".rr-toast")?.remove();
    const t = el(`<div class="rr-toast">${esc(msg)}</div>`);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // Panel + pestaña lateral, idénticos en las dos páginas donde se inyecta.
  // Cada sección es plegable: con todo abierto a la vez el panel es una pared de
  // texto y cuesta encontrar lo que se busca.
  function crearPanel({ secciones }) {
    const panel = el(`
      <div id="rurush-panel">
        <div class="rr-head">
          <img src="${chrome.runtime.getURL("icons/logo-blanco.png")}" alt="">
          <b>RURUSH</b>
          <button title="Cerrar">&times;</button>
        </div>
        <div class="rr-body">
          ${secciones.map((s) => `
            <details class="rr-acc" data-sec="${s.id}"${s.abierta ? " open" : ""}>
              <summary>
                <span class="rr-flecha">▸</span>
                <span class="rr-acc-tit">${esc(s.titulo)}</span>
                <span class="rr-acc-nota" data-nota="${s.id}"></span>
              </summary>
              <div class="rr-sec" id="${s.id}"></div>
            </details>`).join("")}
        </div>
      </div>`);

    const tab = el(`<button id="rurush-tab" title="Panel RURUSH (Alt+R)">RURUSH</button>`);
    document.body.append(panel, tab);
    panel.querySelector(".rr-head button").onclick = () => alternar(panel, false);
    return { panel, tab };
  }

  // Abrir y cerrar el panel. Mientras está abierto, la página se encoge en vez de
  // quedar tapada: el chat se seguía usando debajo y estorbaba leerlo.
  function alternar(panel, abrir) {
    const nuevo = abrir === undefined ? !panel.classList.contains("abierto") : abrir;
    panel.classList.toggle("abierto", nuevo);
    document.documentElement.classList.toggle("rr-con-panel", nuevo);
    // WhatsApp recalcula su layout al redimensionar; sin este aviso la lista de
    // chats queda del ancho viejo hasta que se mueve la ventana.
    setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return nuevo;
  }

  // Resumen al costado del título, para saber qué hay dentro sin abrir la sección.
  function notaSeccion(panel, id, texto) {
    const n = panel.querySelector(`[data-nota="${id}"]`);
    if (n) n.textContent = texto || "";
  }

  function abrirSeccion(panel, id, abrir = true) {
    const d = panel.querySelector(`details[data-sec="${id}"]`);
    if (d) d.open = abrir;
  }

  // Mientras corre, el botón queda bloqueado y avisa. Sin esto, una asesora que
  // no ve respuesta vuelve a hacer clic y el cliente recibe el mensaje dos veces.
  function ocupar(boton, texto = "Enviando…") {
    if (boton.disabled) return null;
    const antes = boton.textContent;
    boton.disabled = true;
    boton.textContent = texto;
    return () => { boton.disabled = false; boton.textContent = antes; };
  }

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  return { hoyLima, diasHasta, fechaCorta, tel9, normalizar, esc, pedir, el, toast,
           crearPanel, alternar, notaSeccion, abrirSeccion, ocupar, dormir };
})();

/* RURUSH — panel dentro de WhatsApp Web.
   Muestra la ficha del socio, arma los mensajes desde las plantillas aprobadas
   y etiqueta al lead en Pipedrive sin salir del chat.

   Regla que ordena todo este archivo: antes de mandarle algo a un cliente hay que
   estar seguro de DOS cosas — que el texto es el que se quería y que el chat abierto
   sigue siendo el mismo. Cualquier duda, no se envía y se avisa. */

(() => {
  if (window.__rurushPanel) return;
  window.__rurushPanel = true;

  const { esc, pedir, el, toast, crearPanel, alternar, notaSeccion, abrirSeccion,
          ocupar, dormir, fechaCorta, hoyLima, diasHasta } = window.RR;

  /* ---------- opciones de Pipedrive ----------
     Los IDs de campo viven en background.js (PD_FIELDS) y las opciones aquí. Si se
     agrega una categoría sin su ID, el background falla a gritos en vez de fingir
     que guardó. */
  const OPC = {
    CIERRE:        [["136", "Cerró SÍ"], ["137", "Cerró NO"], ["149", "Seguimiento"]],
    // Respaldo por si Pipedrive no responde. La lista BUENA se baja de Pipedrive en
    // cargarChips(): asi, cuando entra o sale alguien del equipo, se agrega la opcion
    // en Pipedrive una vez y el panel la toma solo. Antes estaba escrita aca y por eso
    // Danna no aparecia aunque ya estuviera vendiendo.
    PRESENTO_PLAN: [["131", "Mónica"], ["183", "Laura"], ["211", "Dilan"], ["133", "Omar"]],
    ORIGEN:        [["75", "Redes"], ["76", "Vive cerca"], ["77", "Referido"],
                    ["78", "Volante"], ["134", "FP fuera"]]
  };
  /* Gente que ya no está en el equipo. Sus opciones NO se borran de Pipedrive —eso
     rompería las fichas viejas que ya las tienen— pero no tiene sentido ofrecerlas
     al etiquetar hoy. Si alguien entra o sale del equipo: se agrega la opción en
     Pipedrive (Configuración → Campos de datos → Persona → PRESENTÓ PLAN) y, si se
     va, se escribe su nombre acá. Nada más que tocar. */
  const YA_NO_ESTAN = ["GUSTAVO", "ERIK", "ALVARO", "VALERIA"];

  const ETIQUETA_GRUPO = {
    CIERRE: "Resultado del cierre",
    PRESENTO_PLAN: "Quién presentó el plan",
    ORIGEN: "Origen del lead"
  };

  /* ---------- estado ---------- */

  let ctxChat = null;      // chat abierto ahora
  let ficha = null;        // ficha de Apps Fit del chat abierto
  let personaPd = null;    // ficha de Pipedrive elegida
  let telManual = "";      // número escrito a mano cuando el contacto está guardado
  let generacion = 0;      // corta los repintados de un chat que ya se cerró
  let infoIntentada = "";  // chat al que ya se le intentó leer "Info. del contacto"

  /* El número de la persona del chat, por orden de confianza:
       1. el que WhatsApp pone en los mensajes (seguro),
       2. el que la asesora escribió a mano,
       3. el que tiene su ficha de Apps Fit.
     El 3 es el que faltaba: a un socio encontrado por nombre (los walk-in que
     WhatsApp muestra sin número) el panel le veía la ficha completa en pantalla
     pero decía "no tengo su número" y no dejaba guardarlo en Pipedrive. */
  const telDeEstaPersona = () =>
    (ctxChat?.telefono || telManual || ficha?.celular || "").replace(/\D/g, "");

  /* WhatsApp dejó de publicar el wid en el DOM (hasta 2026 cada mensaje llevaba
     data-id="false_519XXXXXXXX@c.us_…"; hoy no hay ninguno). El único sitio donde
     el número sigue estando escrito es el panel "Info. del contacto". Esto lo abre,
     lo lee y lo vuelve a cerrar.

     Va en un botón y NO automático a propósito: abrir ese panel roba el foco, y si
     la asesora está escribiendo un mensaje cuando se dispara, las teclas se le van
     a otro lado. Es un clic, y una sola vez por persona — después el número ya
     queda en Pipedrive. */
  const ROTULO = /n[úu]mero de tel[ée]fono/i;
  const TITULO_INFO = /^(info\.? del contacto|info\.? de la empresa|contact info|business info)$/i;
  const TELEFONO = /\+\s*\d[\d\s().-]{8,18}/;

  /* Devuelve el contenedor del panel "Info. del contacto" si está abierto.
     Se localiza por su título y NO por el rótulo del teléfono: WhatsApp tiene al
     menos dos diseños de ese panel — uno con la sección "Info. y número de
     teléfono" y otro donde el número va suelto bajo el nombre. Buscar el rótulo
     funcionaba solo en el primero. */
  function panelInfo() {
    const tit = [...document.querySelectorAll("h1, h2, span, div")]
      .find((n) => TITULO_INFO.test((n.textContent || "").trim()));
    if (!tit) return null;
    // Se sube hasta que el contenedor ya tenga contenido de verdad (el título solo
    // no sirve), con tope para no terminar abarcando toda la pantalla.
    let c = tit;
    for (let i = 0; i < 7 && c?.parentElement; i++) {
      c = c.parentElement;
      if ((c.innerText || "").length > 80) break;
    }
    return c;
  }

  /* Le pregunta el número al propio WhatsApp, a través del puente que corre dentro
     de la página (content/wa-interno.js).

     Es el camino bueno: WhatsApp migró los chats al identificador anónimo @lid y
     el número ya no se dibuja en ningún lado, pero por dentro lo sigue teniendo
     —lo necesita para enviar—. Así no hay que abrir ni cerrar el panel de info, no
     parpadea nada y funciona también con los contactos que solo comparten usuario.

     Si el puente no contesta (WhatsApp cambió sus tripas, o aún no cargó), devuelve
     null y el panel sigue con el método de siempre. */
  let nPedido = 0;
  /* Cuánto se le espera al puente. Medido en vivo: cuando está, contesta en 0-1 ms.
     Así que los 1500 ms del principio solo se pagaban cuando el puente NO estaba
     —por ejemplo si no se recargó WhatsApp tras actualizar la extensión— y entonces
     se pagaban en CADA chat, antes de recién empezar a buscar por el panel de info.
     Una vez que contestó una vez, 300 ms sobran; si nunca contestó, se deja de
     esperarlo y se reintenta recién al minuto, por si WhatsApp solo estaba cargando. */
  let puenteVivo = false;
  let puenteMudoDesde = 0;
  function chatDesdeWhatsApp(ms = null) {
    if (ms === null) {
      if (puenteVivo) ms = 300;
      else if (puenteMudoDesde && Date.now() - puenteMudoDesde < 60000) return Promise.resolve(null);
      else ms = 1200;
    }
    return new Promise((listo) => {
      const id = ++nPedido;
      let cerrado = false;
      const fin = (v) => {
        if (cerrado) return;
        cerrado = true;
        clearTimeout(reloj);
        window.removeEventListener("message", oir);
        listo(v);
      };
      const oir = (ev) => {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.rr !== "rr-chat" || d.id !== id) return;
        if (d.dato && d.dato.listo) { puenteVivo = true; puenteMudoDesde = 0; }
        fin(d.dato && d.dato.listo ? d.dato : null);
      };
      const reloj = setTimeout(() => {
        if (!puenteVivo) puenteMudoDesde = Date.now();
        fin(null);
      }, ms);
      window.addEventListener("message", oir);
      window.postMessage({ rr: "rr-pide-chat", id }, "*");
    });
  }

  /* ¿Hay algo a medio escribir? Se mira el CONTENIDO, no solo dónde está el cursor:
     WhatsApp enfoca la caja de mensaje cada vez que se abre un chat, así que exigir
     "caja sin foco" dejaría el automático sin dispararse nunca. Con texto a medias
     sí se respeta: ahí robar el foco le borraría el hilo a la asesora. */
  function escribiendoAlgo() {
    const a = document.activeElement;
    if (!a) return false;
    if (a.closest?.("#rurush-panel")) return true;         // está usando el panel
    if (a.isContentEditable) return (a.innerText || "").trim().length > 0;
    if (/^(input|textarea)$/i.test(a.tagName)) return !!a.value;
    return false;
  }

  // Saca el número del panel de info: primero junto al rótulo si ese diseño lo
  // tiene (es lo más preciso), y si no, el primer teléfono del panel — que en
  // ambos diseños es el del contacto, arriba del todo.
  function telDelPanel(cont) {
    const rot = [...cont.querySelectorAll("h2, h3, div, span")]
      .find((n) => { const t = (n.textContent || "").trim(); return t.length < 60 && ROTULO.test(t); });
    for (let n = rot, i = 0; n && i < 4; n = n.parentElement, i++) {
      const m = TELEFONO.exec(n.innerText || "");
      if (m) { const d = m[0].replace(/\D/g, ""); if (d.length >= 9) return d; }
    }
    const m = TELEFONO.exec(cont.innerText || "");
    if (m) { const d = m[0].replace(/\D/g, ""); if (d.length >= 9) return d; }
    return "";
  }

  /* WhatsApp dejó de publicar el wid en el DOM (hasta 2026 cada mensaje llevaba
     data-id="false_519XXXXXXXX@c.us_…"; hoy no hay ninguno). El único sitio donde
     el número sigue escrito es el panel "Info. del contacto". Esto lo abre, lo lee
     y lo vuelve a cerrar. */
  async function numeroDesdeInfo() {
    const main = document.querySelector("#main");
    const header = main?.querySelector("header");
    if (!header) return { tel: "", paso: "no encuentro el encabezado del chat" };

    // Dónde estaba el cursor antes de tocar nada, para devolverlo al terminar.
    const focoPrevio = document.activeElement;

    let loAbriYo = false;
    if (!panelInfo()) {
      // El manejador del clic no está en el <header> sino en algo de adentro. Se
      // prueban varios blancos, del más probable al más general.
      const titulo = [...header.querySelectorAll("span,div")]
        .find((n) => !n.children.length && (n.textContent || "").trim().length > 1);
      const blancos = [
        header.querySelector('[role="button"]'),
        titulo?.parentElement,
        titulo,
        header.querySelector("img")?.parentElement,
        header
      ].filter(Boolean);

      /* Un presupuesto de tiempo para TODOS los blancos juntos, no uno por cada uno.
         Antes eran 5 blancos × 8 esperas × 120 ms = hasta 4,8 segundos mirando una
         pantalla quieta antes de rendirse, y eso con el panel ya pintando "Buscando
         su información…". El cajón de info abre en 200-400 ms o no abre: si no abrió
         dentro del presupuesto, el blanco estaba mal y seguir esperando no lo
         arregla. Queda el botón 📇 para hacerlo a mano. */
      const tope = Date.now() + 1600;
      for (const b of blancos) {
        b.click();
        while (!panelInfo() && Date.now() < tope) await dormir(80);
        if (panelInfo()) { loAbriYo = true; break; }
        if (Date.now() >= tope) break;
      }
      if (!panelInfo()) return { tel: "", paso: "no logré abrir «Info. del contacto» desde acá" };
    }

    const tel = telDelPanel(panelInfo());

    if (loAbriYo) {
      // Solo se pulsa un botón cuya etiqueta diga "cerrar". Ese panel tiene debajo
      // "Vaciar chat", "Eliminar chat" y "Bloquear": nunca un clic a ciegas acá.
      const cerrar = [...document.querySelectorAll("[aria-label]")]
        .find((b) => /^(cerrar|close)/i.test(b.getAttribute("aria-label") || ""));
      cerrar?.click();
      try { focoPrevio?.focus?.(); } catch { /* si ya no existe, da igual */ }
    }
    return { tel, paso: tel ? "" : "el panel está abierto pero no vi un número dentro" };
  }

  // Pipedrive guarda los números con código de país (+51…). Si lo que tenemos son
  // los 9 dígitos sueltos, se le antepone el 51 para que la ficha nueva quede igual
  // que las demás y los enlaces a WhatsApp funcionen.
  const conPais = (t) => {
    const d = String(t || "").replace(/\D/g, "");
    return d.length === 9 ? "51" + d : d;
  };


  const { panel, tab } = crearPanel({ secciones: [
    { id: "rr-ficha",      titulo: "Contacto",  abierta: true },   // siempre a la vista
    { id: "rr-plantillas", titulo: "Plantillas" },   // lo que se toca en casi todos los chats
    { id: "rr-agendar",    titulo: "Agendar" },
    { id: "rr-crm",        titulo: "Gestión" },
    { id: "rr-datos",      titulo: "Datos del socio" }
  ] });

  const nota = (id, txt) => notaSeccion(panel, id, txt);

  // Los datos del socio cuestan una consulta a Pipedrive: se paga al abrir la
  // seccion, no en cada chat que se mira de paso.
  panel.querySelector('details[data-sec="rr-datos"]')
       .addEventListener("toggle", (e) => { if (e.target.open) cargarDatos(generacion); });

  tab.onclick = () => { if (alternar(panel)) refrescar(); };

  /* ---------- leer el chat abierto ---------- */

  function chatActual() {
    const main = document.querySelector("#main");
    if (!main) return null;

    // WhatsApp Business ya no usa span[title], así que el nombre sale del texto del
    // header. Ojo: cuando el contacto no tiene foto, WhatsApp dibuja su inicial ahí
    // y esa letra suelta aparece como primera línea ("C"), no el número.
    const header = main.querySelector("header");
    const RUIDO = /^(a[ñn]adir|en l[ií]nea|online|escribiendo|typing|ha[zs]? ?clic|click|toca aqu|últ|ultima vez|last seen)/i;
    const lineas = (header?.innerText || "").split("\n").map((x) => x.trim()).filter(Boolean);
    // Se descarta SOLO la letra suelta que WhatsApp dibuja como avatar cuando el
    // contacto no tiene foto. Antes se descartaba todo lo de 2 caracteres o menos,
    // y un lead llamado "Jo" o con un emoji por nombre terminaba saludado con el
    // subtítulo del header ("¡Hola clic!").
    const inicial = (l) => /^\p{L}$/u.test(l);
    const titulo = lineas.find((l) => !inicial(l) && !RUIDO.test(l)) || lineas[0] || "";

    // Un grupo se reconoce por el wid @g.us. El texto "N participantes" no basta:
    // en grupos chicos WhatsApp lista los nombres en vez del conteo.
    const esGrupo = !!main.querySelector('[data-id*="@g.us"]') ||
                    /\d+ (miembros|participantes)/i.test(header?.innerText || "");

    // El numero sale del wid de cualquier mensaje. @c.us y @s.whatsapp.net son
    // telefonos de verdad y se aceptan tal cual. @lid NO es un telefono: es el
    // identificador anonimo de quien solo comparte su usuario (@fulano), y meterlo
    // en Pipedrive crearia fichas con un numero inventado. Se acepta solo cuando
    // tiene forma inequivoca de celular peruano (51 + 9 + 8 digitos), porque
    // WhatsApp tambien esta migrando chats normales a ese formato.
    let telefono = "";
    const tipos = Object.create(null);            // para el diagnostico de abajo
    for (const n of main.querySelectorAll("[data-id]")) {
      const id = n.getAttribute("data-id") || "";
      const m = /(\d{9,15})@([a-z.]+)/.exec(id);
      if (!m) continue;
      tipos[m[2]] = (tipos[m[2]] || 0) + 1;
      if (telefono) continue;
      if (/^(?:c\.us|s\.whatsapp\.net)$/.test(m[2])) telefono = m[1];
      else if (m[2] === "lid" && /^519\d{8}$/.test(m[1])) telefono = m[1];
    }
    // Tercera fuente: la fila del chat en la lista de la izquierda. Estaba fuera del
    // alcance de la búsqueda —solo se miraba dentro de #main— y ahí WhatsApp deja el
    // wid aunque los mensajes no lo lleven. Se usa SOLO la fila marcada como
    // seleccionada: emparejar por nombre podría traer el número del chat de al lado
    // y escribirlo en la ficha de otra persona.
    if (!telefono) {
      const sel = document.querySelector('#pane-side [aria-selected="true"]');
      const fila = sel?.closest("[data-id]") || sel?.querySelector("[data-id]");
      const m = /(\d{9,15})@([a-z.]+)/.exec(fila?.getAttribute("data-id") || "");
      if (m) {
        tipos["lista:" + m[2]] = (tipos["lista:" + m[2]] || 0) + 1;
        if (/^(?:c\.us|s\.whatsapp\.net)$/.test(m[2])) telefono = m[1];
        else if (m[2] === "lid" && /^519\d{8}$/.test(m[1])) telefono = m[1];
      }
    }

    // Diagnóstico: cuando no encuentra número, hay que saber QUÉ hay en el DOM, no
    // solo que no encontró lo que buscaba. Reporta los atributos que WhatsApp sí
    // está poniendo, para dejar de parchear a ciegas.
    let pistas = Object.entries(tipos).map(([k, v]) => `@${k}×${v}`).join(" ");
    if (!telefono) {
      const muestra = (raiz, sel) => {
        const ns = raiz ? raiz.querySelectorAll(sel) : [];
        if (!ns.length) return "0";
        const v = String(ns[0].getAttribute(sel.slice(1, -1)) || "").slice(0, 34);
        return `${ns.length} (${v})`;
      };
      const lado = document.querySelector("#pane-side");
      pistas = [
        `main[data-id]=${muestra(main, "[data-id]")}`,
        `lado[data-id]=${muestra(lado, "[data-id]")}`,
        `sel=${lado?.querySelector('[aria-selected="true"]') ? "sí" : "no"}`
      ].join(" · ");
    }
    if (!pistas) pistas = "ninguno";
    // Segunda fuente: WhatsApp escribe "[hora, fecha] +51 999 888 777:" en cada
    // mensaje entrante cuando el contacto no esta guardado en la agenda.
    if (!telefono) {
      for (const n of main.querySelectorAll("[data-pre-plain-text]")) {
        const m = /\+\s*([\d\s]{9,20}?)\s*:/.exec(n.getAttribute("data-pre-plain-text") || "");
        const d = m ? m[1].replace(/\D/g, "") : "";
        if (d.length >= 9) { telefono = d; break; }
      }
    }
    // Ultima fuente: el propio titulo, cuando WhatsApp muestra el numero como nombre.
    if (!telefono) {
      const d = titulo.replace(/\D/g, "");
      if (d.length >= 9) telefono = d;
    }

    // Los contactos que solo comparten su usuario aparecen con el titulo "@fulano".
    // Ese texto es lo unico que los identifica: no tienen numero que sacar.
    const usuario = /^@[A-Za-z0-9._-]{2,}$/.test(titulo) ? titulo : "";

    return { titulo, telefono, esGrupo, usuario, pistas, nombre: primerNombre(titulo) };
  }

  const DIAS_SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  // "hoy" / "mañana" / "el vie 3/10". El texto va dentro del mensaje al cliente, así
  // que sale de la fecha real y no de lo que alguien teclee.
  function diaTexto(fecha) {
    const d = diasHasta(fecha);
    if (d === 0) return "hoy";
    if (d === 1) return "mañana";
    const x = new Date(fecha + "T00:00:00Z");
    return `el ${DIAS_SEMANA[x.getUTCDay()]} ${fechaCorta(fecha)}`;
  }

  // "19:00" -> "7pm". Los cupos de nutrición (8:30) no están en RURUSH_HORAS.
  function horaBonita(hhmm) {
    const m = window.RURUSH_HORAS?.find((h) => h.v === hhmm);
    if (m) return m.t;
    const [H, M] = String(hhmm).split(":").map(Number);
    if (!isFinite(H)) return String(hhmm);
    const h12 = H % 12 === 0 ? 12 : H % 12;
    return `${h12}${M ? ":" + String(M).padStart(2, "0") : ""}${H < 12 ? "am" : "pm"}`;
  }

  // ¿El lead escribió alguna vez? De la auditoría de agosto: 13 de 79 no-shows eran
  // citas de gente que nunca contestó. WhatsApp solo tiene pintados los mensajes
  // cercanos, así que esto es "no veo que haya escrito", no una certeza — por eso
  // avisa y deja agendar igual en vez de bloquear.
  function leadEscribio() {
    const main = document.querySelector("#main");
    if (!main) return true;
    if (main.querySelector(".message-in")) return true;
    return !main.querySelector(".message-out");   // chat vacío o sin cargar: no se afirma nada
  }

  function primerNombre(t) {
    if (!t || /^\+?[\d\s()-]+$/.test(t)) return "";
    return t.trim().split(/\s+/)[0].replace(/[^\p{L}]/gu, "");
  }

  // Dos chats son "el mismo" si coinciden título y número. Se compara antes de
  // enviar para no mandarle a otra persona lo que se escribió para esta.
  const mismoChat = (a, b) => !!a && !!b && a.titulo === b.titulo && a.telefono === b.telefono;

  /* ---------- escribir en la caja de WhatsApp ---------- */

  const cajaMensaje = () => document.querySelector('#main footer div[contenteditable="true"]');

  function botonEnviar() {
    const f = document.querySelector("#main footer");
    if (!f) return null;
    return f.querySelector('button[aria-label="Enviar"], button[aria-label="Send"]') ||
           f.querySelector('[data-icon*="send"]')?.closest("button") || null;
  }

  // WhatsApp normaliza saltos y caracteres invisibles: hay que comparar con la
  // misma vara de los dos lados o el envío se bloquearía siempre.
  const normTexto = (s) =>
    String(s || "").replace(/​/g, "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();

  // Nunca se escribe encima de un texto ya escrito: reemplazar desde script no es
  // fiable en WhatsApp (a veces borra, a veces no hace nada) y el riesgo es mandar
  // media plantilla pegada a lo que la asesora había tecleado.
  function insertar(texto) {
    const caja = cajaMensaje();
    if (!caja) { toast("⚠️ Abre un chat primero"); return false; }

    const actual = normTexto(caja.innerText);
    if (actual && actual !== normTexto(texto)) {
      toast("⚠️ La caja ya tiene texto. Bórralo (Ctrl+A y Suprimir) y dale Insertar otra vez.", 6000);
      return false;
    }
    // Ya está puesto: pasa al usar "Insertar" y luego "Insertar y enviar" de la
    // misma plantilla. Devolver true evita duplicar el texto.
    if (actual === normTexto(texto)) return true;

    caja.focus();
    document.execCommand("insertText", false, texto);
    caja.dispatchEvent(new InputEvent("input", { bubbles: true }));

    if (!normTexto(caja.innerText)) {
      toast("⚠️ No pude escribir en la caja. Haz clic en el chat y vuelve a intentar.", 6000);
      return false;
    }
    return true;
  }

  async function insertarYEnviar(texto, destino) {
    if (!insertar(texto)) return false;
    await dormir(450);

    // Dos guardas, y las dos importan: que el chat no haya cambiado mientras
    // tanto, y que lo que hay en la caja sea exactamente lo que queríamos.
    if (!mismoChat(chatActual(), destino)) {
      toast("⚠️ Cambiaste de chat. No envié nada — vuelve al chat correcto.", 7000);
      return false;
    }
    const caja = cajaMensaje();
    if (!caja) { toast("⚠️ Se cerró el chat. No envié nada.", 6000); return false; }
    if (normTexto(caja.innerText) !== normTexto(texto)) {
      toast("⚠️ El texto de la caja no coincide. Revísalo y envía tú.", 7000);
      return false;
    }

    const b = botonEnviar();
    if (!b) { toast("⚠️ No encontré el botón enviar — dale Enter tú.", 6000); return false; }
    b.click();
    await dormir(600);
    return true;
  }

  /* ---------- 1. ficha del contacto ---------- */

  const tarjeta = (_titulo, cuerpo, clase = "") => `<div class="rr-card ${clase}">${cuerpo}</div>`;

  async function pintarFicha(gen) {
    const cont = panel.querySelector("#rr-ficha");

    if (!ctxChat) {
      cont.innerHTML = tarjeta("Contacto", '<p class="rr-aviso">Abre un chat para ver su ficha.</p>');
      return;
    }
    if (ctxChat.esGrupo) {
      cont.innerHTML = tarjeta("Contacto",
        '<p class="rr-aviso">Es un grupo. El panel solo trabaja sobre chats individuales.</p>');
      return;
    }

    cont.innerHTML = tarjeta("Contacto", '<p class="rr-aviso">Consultando Apps Fit…</p>');

    const r = await pedir("ficha", {
      telefono: ctxChat.telefono || telManual,
      nombre: ctxChat.titulo
    });
    if (gen !== generacion) return;   // la asesora ya cambió de chat

    if (!r.ok) {
      cont.innerHTML = tarjeta("Contacto",
        `<div class="rr-nombre">${esc(ctxChat.titulo || "Sin nombre")}</div>
         <p class="rr-error">${esc(r.error)}</p>`, "lead");
      return;
    }

    ficha = r.data;

    if (!ficha) {
      cont.innerHTML = tarjeta("Contacto",
        `<div class="rr-nombre">${esc(ctxChat.titulo || "Sin nombre")}</div>
         <div id="rr-proxima"></div>
         <div class="rr-fila"><span>Teléfono</span><span>${esc(ctxChat.telefono || telManual || "—")}</span></div>
         <div class="rr-fila"><span>Estado</span><span>No es socio activo</span></div>
         <p class="rr-aviso">Es un lead, o un socio con el plan vencido.</p>
         ${ctxChat.telefono ? "" : `
           <label class="rr-lbl">WhatsApp ya no publica el número: tráelo o escríbelo</label>
           <div class="rr-btns">
             <input class="rr-input" id="rr-tel-manual" placeholder="9XXXXXXXX"
                    inputmode="numeric" value="${esc(telManual)}" style="flex:1">
             <button class="rr-btn" id="rr-buscar-tel">Buscar</button>
           </div>
           <div class="rr-btns"><button class="rr-btn sec" id="rr-traer-tel">📇 Traer número de WhatsApp</button></div>`}`, "lead");

      const btnTraer = cont.querySelector("#rr-traer-tel");
      if (btnTraer) btnTraer.onclick = async (ev) => {
        const soltar = ocupar(ev.target, "Leyendo…");
        if (!soltar) return;
        const dentro = await chatDesdeWhatsApp();
        let t = dentro && dentro.telefono, paso = "";
        if (!t) ({ tel: t, paso } = await numeroDesdeInfo());
        soltar();
        if (!t) {
          toast(`No pude traerlo: ${paso}. Ábrelo tú (clic en el nombre del contacto, arriba) y vuelve a darle a Traer.`, 9000);
          return;
        }
        telManual = t;
        toast("✅ Número traído: " + t);
        refrescar();
      };

      // El input NO entra en la detección de cambio de chat: si entrara, el panel
      // se repintaría al noveno dígito y se perdería el foco a media escritura.
      const btn = cont.querySelector("#rr-buscar-tel");
      if (btn) btn.onclick = () => {
        telManual = cont.querySelector("#rr-tel-manual").value.replace(/\D/g, "");
        refrescar();
      };
      return;
    }

    const f = ficha;
    const frio = f.temperatura?.estado === "FRÍO";
    const porVencer = f.diasRestantes !== null && f.diasRestantes <= 7;

    const vence =
      f.diasRestantes === null ? "—" :
      f.diasRestantes < 0      ? `${fechaCorta(f.fin)} · venció hace ${-f.diasRestantes}d` :
      f.diasRestantes === 0    ? `${fechaCorta(f.fin)} · VENCE HOY` :
                                 `${fechaCorta(f.fin)} · en ${f.diasRestantes}d`;

    const asistencia =
      f.diasSinAsistir === null ? "Nunca ha venido" :
      f.diasSinAsistir === 0    ? "Vino hoy" :
      f.diasSinAsistir === 1    ? "Ayer" :
                                  `hace ${f.diasSinAsistir} días`;

    // Una sola línea con qué hacer, para que no dependa de cómo lo lea cada asesora.
    let accion = "";
    if (frio && porVencer) accion = `🧊 ${f.diasSinAsistir} días sin venir y vence en ${Math.max(f.diasRestantes, 0)}d — si no vuelve antes, renueva al 11%.`;
    else if (frio)              accion = `🧊 ${f.diasSinAsistir} días sin venir — hazla volver ANTES de que venza.`;
    else if (porVencer)         accion = `⏰ Viene seguido y vence en ${Math.max(f.diasRestantes, 0)}d — momento de ofrecer la renovación.`;

    nota("rr-ficha", f.temperatura
      ? `${f.temperatura.icono} ${f.diasSinAsistir}d · vence ${fechaCorta(f.fin)}`
      : `vence ${fechaCorta(f.fin)}`);
    cont.innerHTML = tarjeta("Contacto",
      `<div class="rr-nombre">${esc(f.nombre)}</div>
       <div id="rr-proxima"></div>
       <div class="rr-fila"><span>Estado</span><span>SOCIO ACTIVO · #${esc(f.codigo)}</span></div>
       <div class="rr-fila"><span>Teléfono</span><span>${esc(telDeEstaPersona() || "—")}</span></div>
       <div class="rr-fila"><span>Plan</span><span>${esc(f.plan || "—")}</span></div>
       <div class="rr-fila"><span>Vence</span><span>${esc(vence)}</span></div>

       <div class="rr-sep"></div>

       <div class="rr-fila"><span>Clases</span><span>${f.clasesUsadas} de ${f.clasesIncluidas}${
         f.aprovecha !== null ? ` · ${f.aprovecha}%` : ""}</span></div>
       ${f.aprovecha !== null ? `<div class="rr-barra"><i style="width:${Math.min(f.aprovecha, 100)}%"></i></div>` : ""}
       <div class="rr-fila"><span>Última clase</span><span>${
         f.temperatura ? f.temperatura.icono + " " : ""}${esc(asistencia)}</span></div>
       ${f.ultimaAsistencia ? `<div class="rr-fila"><span></span><span class="rr-tenue">${esc(f.ultimaAsistencia)}</span></div>` : ""}
       ${f.porSemana !== null ? `<div class="rr-fila"><span>Ritmo</span><span>${f.porSemana} clases/semana</span></div>` : ""}

       <div class="rr-sep"></div>

       <div class="rr-fila"><span>Precio del plan</span><span>S/ ${f.costo}</span></div>

       <div class="rr-sep"></div>

       <div class="rr-fila"><span>Asesora</span><span>${esc(f.asesora)}</span></div>
       <div class="rr-fila"><span>Origen</span><span>${esc(f.origen || "—")}</span></div>
       ${accion ? `<p class="rr-tpl-nota">${esc(accion)}</p>` : ""}`,
      (frio || porVencer) ? "alerta" : "socio");
  }


  // Pipedrive ya sabe si esa persona tiene cita pendiente. Mostrarlo arriba es lo
  // que evita agendar dos veces y lo que deja contestar "¿a qué hora era?" sin salir
  // del chat. Se pinta después de consultar el CRM, por eso va en su propio hueco.
  function pintarProxima() {
    const hueco = panel.querySelector("#rr-proxima");
    if (!hueco) return;

    const p = personaPd?.proxima;
    if (!p?.fecha) { hueco.innerHTML = ""; return; }

    const d = diasHasta(p.fecha);
    const cuando = d === 0 ? "HOY" : d === 1 ? "mañana" : d < 0 ? `hace ${-d}d` : `en ${d}d`;
    const hora = p.hora ? ` a las ${horaBonita(p.hora)}` : "";

    // El background solo devuelve free pass y retomas: llamadas, tareas y nutrición
    // no llegan hasta acá. Se distinguen porque la retoma lleva su propio prefijo —
    // decirle "free pass" a la clase de un alumno que vuelve confunde al que lee.
    const que = /^\s*RETOMA\b/i.test(String(p.asunto || "")) ? "Retoma" : "Free pass";

    /* Una cita que ya pasó y sigue sin marcar ES el no-show: así lo cuenta el embudo
       (agendadas vs asistidas) y así lo lee el dashboard. Por eso NO hay botón de
       "no vino" que marque nada — marcarla la contaría como asistida y se perdería
       la tasa de asistencia, que es justo lo que hay que medir. Lo que falta no es
       un botón más, es decirlo claro y ofrecer lo único que se puede hacer:
       reagendar. */
    const noVino = d < 0;

    hueco.innerHTML =
      `<p class="rr-tpl-nota${noVino ? " rr-ambar" : ""}">` +
      (noVino
        ? `⚠️ No vino — ${esc(que)} del ${esc(fechaCorta(p.fecha))}${esc(hora)} (hace ${-d}d)`
        : `📅 ${esc(que)}: ${esc(cuando)} ${esc(fechaCorta(p.fecha))}${esc(hora)}`) +
      `</p>` +
      (p.id && d <= 0
        ? `<div class="rr-btns">
             <button class="rr-btn" id="rr-vino">✅ ${noVino ? "Sí vino" : "Vino"} — marcar asistencia</button>
             ${noVino ? '<button class="rr-btn sec" id="rr-reagendar">📅 Reagendar</button>' : ""}
           </div>`
        : "");

    const br = hueco.querySelector("#rr-reagendar");
    if (br) br.onclick = () => {
      abrirSeccion(panel, "rr-agendar");
      panel.querySelector("#rr-agendar")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      toast("Agenda la nueva fecha acá. La anterior se queda sin marcar — así cuenta como no-show.", 8000);
    };

    const bv = hueco.querySelector("#rr-vino");
    if (bv) bv.onclick = async (ev) => {
      const soltar = ocupar(ev.target, "…");
      if (!soltar) return;
      const res = await pedir("citaHecha", { actividadId: p.id, hecha: true });
      soltar();
      if (!res.ok) { toast("❌ " + res.error, 6000); return; }
      // Ya marcada deja de ser "próxima": se quita del panel como en Pipedrive.
      if (personaPd) personaPd.proxima = null;
      toast("✅ Marcada como asistida en Pipedrive");
      pintarProxima();
      pintarAgendar();
    };
  }

  /* ---------- 3. Datos del socio ----------
     Ocho campos, ni uno mas. El formulario se arma con lo que dice Pipedrive (tipo
     de campo y opciones de los desplegables), asi que renombrar una opcion alla no
     rompe nada aca. Se guardan SOLO los campos que cambiaron: si otra asesora
     edito la ficha mientras esta estaba abierta, no le pisamos su dato. */

  const DATOS_ANCHO = new Set(["OBJETIVO", "LESION"]);   // ocupan las dos columnas

  let datosCargados = null;    // id de la ficha que esta ahora en el formulario

  function pintarDatos() {
    const cont = panel.querySelector("#rr-datos");
    datosCargados = null;

    if (!ctxChat || ctxChat.esGrupo) { cont.innerHTML = ""; nota("rr-datos", ""); return; }
    if (!personaPd) {
      nota("rr-datos", "falta ficha");
      cont.innerHTML = tarjeta("", '<p class="rr-aviso">Guarda el contacto en Pipedrive para poder llenar sus datos.</p>');
      return;
    }

    // El aviso de "sin número" sale ANTES de abrir la sección: ese dato ya se sabe
    // desde la búsqueda en Pipedrive, y es lo único de acá que rompe el resto del
    // panel si falta. El conteo de campos sí espera a que se abra.
    const sinTel = !(personaPd.telefonos || []).length;
    nota("rr-datos", sinTel ? "⚠️ sin número" : "ábrelo para ver");
    cont.innerHTML = tarjeta("", sinTel
      ? '<p class="rr-aviso">⚠️ Esta ficha no tiene número. Ábrela para ponérselo — sin él no le llegan los recordatorios ni cruza con Apps Fit.</p>'
      : '<p class="rr-aviso">Abre esta sección para ver y editar sus datos.</p>');
    if (panel.querySelector('details[data-sec="rr-datos"]').open) cargarDatos(generacion);
  }

  async function cargarDatos(gen) {
    const cont = panel.querySelector("#rr-datos");
    if (!personaPd || !ctxChat || ctxChat.esGrupo) return;
    if (datosCargados === personaPd.id) return;          // ya esta pintada
    datosCargados = personaPd.id;

    cont.innerHTML = tarjeta("", '<p class="rr-aviso">Cargando sus datos…</p>');
    const r = await pedir("datosLeer", { personId: personaPd.id });
    if (gen !== generacion) return;

    if (!r.ok) {
      datosCargados = null;                              // que se pueda reintentar cerrando y abriendo
      cont.innerHTML = tarjeta("", `<p class="rr-error">${esc(r.error)}</p>`);
      return;
    }
    pintarFormDatos(cont, r.data);
  }

  /* Campos cuya lista SÍ debe poder crecer desde el panel. Distrito sí: Trujillo
     tiene más barrios de los que quepan en una lista y la gente se muda. Objetivo y
     Sexo no: son listas cerradas a propósito y dejarlas abiertas las llena de
     sinónimos que después no se pueden contar. */
  const AMPLIABLES = new Set(["DISTRITO"]);
  const ESCRIBIR = "__escribir__";

  function pintarFormDatos(cont, d) {
    const original = { ...(d.valores || {}) };
    const conDato = (v) => String(v ?? "").trim() !== "";
    const resumen = () => `${Object.values(original).filter(conDato).length}/${d.campos.length}`;

    const control = (c) => {
      const v = original[c.id] ?? "";
      if (c.tipo === "enum") {
        // Si el valor guardado ya no está entre las opciones (porque se borró o se
        // renombró en Pipedrive), el navegador marcaba "— sin dato —" y al guardar
        // CUALQUIER otro campo se llevaba este por delante. Se le agrega su propia
        // opción para que se mantenga solo.
        const conocido = c.opciones.some((o) => o.id === String(v));
        return `
        <select class="rr-select" data-campo="${c.id}">
          <option value="">— sin dato —</option>
          ${!conocido && String(v) !== "" ?
            `<option value="${esc(v)}" selected>— valor actual (ya no está en la lista) —</option>` : ""}
          ${c.opciones.map((o) =>
            `<option value="${esc(o.id)}"${String(v) === o.id ? " selected" : ""}>${esc(o.label)}</option>`).join("")}
          ${AMPLIABLES.has(c.id) ? `<option value="${ESCRIBIR}">✏️ Escribir otro…</option>` : ""}
        </select>
        ${AMPLIABLES.has(c.id) ? `
          <div class="rr-btns oculto" data-nuevo="${c.id}" style="margin-top:4px">
            <input class="rr-input" placeholder="Escribe el distrito" style="flex:1">
            <button class="rr-btn sec">Agregar</button>
          </div>` : ""}`;
      }
      // Los numericos enteros (DNI) van como texto: con type=number el navegador
      // ofrece flechitas y decimales que en un DNI no significan nada.
      const tipo = c.tipo === "date" ? "date"
                 : (c.tipo === "double" && !c.entero) ? "number" : "text";
      const extra = [
        c.tipo === "double" && !c.entero ? ' step="0.01"' : "",
        c.entero ? ' inputmode="numeric"' : "",
        c.ayuda ? ` placeholder="${esc(c.ayuda)}"` : ""
      ].join("");
      return `<input class="rr-input" data-campo="${c.id}" type="${tipo}" value="${esc(v)}"${extra}>`;
    };

    cont.innerHTML = tarjeta("",
      `<p class="rr-tpl-nota">${resumen()} campos con dato · ficha #${esc(personaPd.id)}</p>
       ${d.faltan?.length
          ? `<p class="rr-error">No encontré estos campos en Pipedrive: ${esc(d.faltan.join(", "))}</p>` : ""}
       <div class="rr-campos">
         <div class="rr-ancho">
           <label class="rr-lbl">${/^\+?[\d\s()-]+$/.test(d.nombre || "")
             ? "⚠️ Está guardada con el número — ponle su nombre:" : "Nombre"}</label>
           <input class="rr-input" id="rr-d-nombre" placeholder="Nombre y apellido"
                  value="${esc(d.nombre || "")}">
         </div>
         <div class="rr-ancho">
           <label class="rr-lbl">${d.telefono
             ? "Número de WhatsApp" : "⚠️ Sin número — no le llegan los recordatorios"}</label>
           <div class="rr-btns">
             <input class="rr-input" id="rr-d-tel" placeholder="9XXXXXXXX" inputmode="numeric"
                    value="${esc(d.telefono || telDeEstaPersona())}" style="flex:1">
             <button class="rr-btn sec" id="rr-d-traer" title="Leer el número de Info. del contacto">📇</button>
           </div>
         </div>
         ${d.campos.map((c) => `
           <div${DATOS_ANCHO.has(c.id) ? ' class="rr-ancho"' : ""}>
             <label class="rr-lbl">${esc(c.etiqueta)}</label>${control(c)}
           </div>`).join("")}
       </div>
       <div class="rr-btns"><button class="rr-btn" id="rr-datos-guardar">Guardar en Pipedrive</button></div>`);

    cont.querySelectorAll("[data-nuevo]").forEach((caja) => {
      const campo = caja.dataset.nuevo;
      const sel   = cont.querySelector(`select[data-campo="${campo}"]`);
      const input = caja.querySelector("input");
      const btn   = caja.querySelector("button");

      sel.addEventListener("change", () => {
        const escribir = sel.value === ESCRIBIR;
        caja.classList.toggle("oculto", !escribir);
        if (escribir) { sel.value = ""; input.focus(); }
      });

      btn.onclick = async (ev) => {
        const texto = input.value.trim();
        if (!texto) { toast("⚠️ Escribe el distrito primero."); return; }
        const soltar = ocupar(ev.target, "…");
        if (!soltar) return;
        const r = await pedir("opcionNueva", { campo, texto });
        soltar();
        if (!r.ok) { toast("❌ " + r.error, 6000); return; }

        // Se agrega al desplegable y se deja elegida, para que al guardar salga.
        if (!sel.querySelector(`option[value="${r.data.id}"]`)) {
          const o = document.createElement("option");
          o.value = r.data.id;
          o.textContent = r.data.label;
          sel.insertBefore(o, sel.querySelector(`option[value="${ESCRIBIR}"]`));
        }
        sel.value = r.data.id;
        input.value = "";
        caja.classList.add("oculto");
        toast(r.data.yaExistia
          ? `Ya existía como «${r.data.label}» — te la dejé elegida.`
          : `✅ «${r.data.label}» agregado. Dale a Guardar en Pipedrive.`, 6000);
      };
    });

    const notaDatos = () => nota("rr-datos",
      (cont.querySelector("#rr-d-tel")?.value || "").replace(/\D/g, "").length >= 9
        ? resumen() : "⚠️ sin número");
    notaDatos();

    cont.querySelector("#rr-d-traer").onclick = async (ev) => {
      const soltar = ocupar(ev.target, "…");
      if (!soltar) return;
      const { tel, paso } = await numeroDesdeInfo();
      soltar();
      if (!tel) { toast(`No pude traerlo: ${paso}.`, 8000); return; }
      cont.querySelector("#rr-d-tel").value = tel;
      toast("Número traído: " + tel + " — dale a Guardar.", 6000);
    };

    cont.querySelector("#rr-datos-guardar").onclick = async (ev) => {
      // Misma regla que al enviar un mensaje: si el chat cambio mientras se
      // escribia, no se escribe nada en la ficha de otra persona.
      if (!personaPd || personaPd.id !== datosCargados) {
        toast("⚠️ Cambiaste de chat. Cierra y vuelve a abrir la sección.", 6000);
        return;
      }

      const cambios = {};
      cont.querySelectorAll("[data-campo]").forEach((inp) => {
        const id = inp.dataset.campo;
        const v = String(inp.value ?? "").trim();
        if (v !== String(original[id] ?? "").trim()) cambios[id] = v;
      });

      const nom = cont.querySelector("#rr-d-nombre").value.trim();
      const tel = conPais(cont.querySelector("#rr-d-tel").value.replace(/\D/g, ""));
      const extra = {};
      if (nom !== String(d.nombre || "").trim()) extra.nombre = nom;
      if (tel !== String(d.telefono || "").replace(/\D/g, "")) extra.telefono = tel;

      const n = Object.keys(cambios).length + Object.keys(extra).length;
      if (!n) { toast("No cambiaste nada."); return; }
      if (extra.nombre === "") { toast("⚠️ El nombre no puede quedar vacío."); return; }

      const soltar = ocupar(ev.target, "Guardando…");
      if (!soltar) return;
      const res = await pedir("datosGuardar",
        { personId: personaPd.id, valores: cambios, ...extra });
      soltar();
      if (!res.ok) { toast("❌ " + res.error, 6000); return; }

      Object.assign(original, cambios);
      if (extra.nombre !== undefined) { d.nombre = extra.nombre; if (personaPd) personaPd.nombre = extra.nombre; }
      if (extra.telefono !== undefined) {
        d.telefono = extra.telefono;
        if (personaPd) personaPd.telefonos = extra.telefono ? [extra.telefono] : [];
        telManual = extra.telefono;
      }
      toast(`✅ Guardado — ${n} campo${n > 1 ? "s" : ""}`);
      notaDatos();
      if (extra.nombre !== undefined) nombrarLead();
      const cab = cont.querySelector(".rr-tpl-nota");
      if (cab) cab.textContent = `${resumen()} campos con dato · ficha #${personaPd.id}`;
    };
  }

  /* ---------- 4. agendar ----------
     Todo lo que se agenda aquí cae en Pipedrive como actividad, que es de donde
     salen después los reportes y los recordatorios. */

  function pintarAgendar() {
    const cont = panel.querySelector("#rr-agendar");
    if (!ctxChat || ctxChat.esGrupo) { cont.innerHTML = ""; nota("rr-agendar", ""); return; }
    nota("rr-agendar", personaPd ? "clase gratis · retoma · nutrición" : "falta ficha");

    if (!personaPd) {
      cont.innerHTML = tarjeta("Agendar",
        '<p class="rr-aviso">Para agendar hace falta la ficha en Pipedrive. Créala en la sección Pipedrive y vuelve a abrir el chat.</p>');
      return;
    }

    const horas = window.RURUSH_HORAS.map((h) => `<option value="${h.v}">${esc(h.t)}</option>`).join("");
    const nombreSugerido = ficha?.nombre || ctxChat.titulo || "";

    /* El formulario de "Clase gratis" y el de "Retoma" son el mismo: fecha, hora,
       quién atiende y por dónde se agendó. Se genera una sola vez con un prefijo
       distinto en los ids, para no terminar con dos copias que se desincronicen el
       día que haya que cambiar una. */
    const campos = (pre) => `
        <div class="rr-campos">
          <div><label class="rr-lbl">Fecha</label>
            <input type="date" class="rr-input" id="rr-${pre}-fecha" value="${hoyLima(1)}" min="${hoyLima()}"></div>
          <div><label class="rr-lbl">Hora</label><select class="rr-select" id="rr-${pre}-hora">${horas}</select></div>
        </div>
        <div class="rr-campos">
          <div><label class="rr-lbl">Asesora que atiende</label>
            <select class="rr-select" id="rr-${pre}-asesora">
              <option value="">Elegir…</option>
              <option>MÓNICA</option><option>LAURA</option><option>DANNA</option><option>CIELO</option><option>DILAN</option><option>OMAR</option>
            </select></div>
          <div><label class="rr-lbl">Se agendó por</label>
            <select class="rr-select" id="rr-${pre}-via">
              <option value="chat">Chat (APC)</option>
              <option value="llamada">Llamada (APL)</option>
              <option value="visita">Visita (APV)</option>
            </select></div>
        </div>
        <p class="rr-aviso" id="rr-${pre}-asunto"></p>
        <div id="rr-${pre}-aviso"></div>`;

    cont.innerHTML = tarjeta("Agendar", `
      <div class="rr-tabs">
        <button class="rr-tab activo" data-t="fp">Clase gratis</button>
        <button class="rr-tab" data-t="re">Retoma</button>
        <button class="rr-tab" data-t="nutri">Nutrición</button>
      </div>

      <div class="rr-panel-tab" data-t="fp">
        ${campos("fp")}
        <div class="rr-btns"><button class="rr-btn" id="rr-fp-crear">Agendar clase gratis</button></div>
      </div>

      <div class="rr-panel-tab oculto" data-t="re">
        ${campos("re")}
        <div class="rr-btns"><button class="rr-btn" id="rr-re-crear">Agendar retoma</button></div>
      </div>

      <div class="rr-panel-tab oculto" data-t="nutri">
        <label class="rr-lbl">Cupo con Diego (martes y miércoles)</label>
        <select class="rr-select" id="rr-nu-cupo"><option>Cargando cupos…</option></select>
        <div class="rr-btns"><button class="rr-btn" id="rr-nu-crear" disabled>Agendar nutrición</button></div>
      </div>`);

    cont.querySelectorAll(".rr-tab").forEach((b) => {
      b.onclick = () => {
        cont.querySelectorAll(".rr-tab").forEach((x) => x.classList.toggle("activo", x === b));
        cont.querySelectorAll(".rr-panel-tab").forEach((p) =>
          p.classList.toggle("oculto", p.dataset.t !== b.dataset.t));
        if (b.dataset.t === "nutri") cargarCupos(cont);
      };
    });

    /* Arma uno de los dos formularios. `tipo` decide dos cosas que SÍ cambian:
       el prefijo del asunto —FP o RETOMA, que es lo que después separa las métricas—
       y qué avisos tienen sentido. Los de "el lead no te escribió" y "se enfría a más
       de un día" son reglas de venta: a un alumno que vuelve a clases no se le aplican
       y saltarían cada vez, hasta que nadie los lea. */
    function armarAgenda(pre, tipo) {
      const esRe = tipo === "retoma";
      const prefijo = esRe ? "RETOMA" : "FP";
      const textoBoton = esRe ? "Agendar retoma" : "Agendar clase gratis";
      const q = (sufijo) => cont.querySelector(`#rr-${pre}-${sufijo}`);

      // Vista previa del asunto: es lo que después leen los reportes, así que se ve
      // antes de crear la actividad.
      const verAsunto = () => {
        const via = { chat: "APC", llamada: "APL", visita: "APV" }[q("via").value];
        const ase = q("asesora").value
          .normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
        const lejos = !esRe && q("fecha").value > hoyLima(1);
        q("asunto").innerHTML =
          `Quedará como <b>${prefijo} ${esc(ase)} ${esc(via)}</b>` +
          (lejos ? ` · <span class="rr-ambar">⚠️ es más de un día: el lead se enfría</span>` : "");
      };
      ["via", "asesora", "fecha"].forEach((k) => q(k).addEventListener("change", verAsunto));

      // Se recuerda por computadora, como en Llamadas: en la PC de Laura queda Laura
      // y deja de depender de que se acuerde de cambiarlo en cada agendamiento.
      const selAse = q("asesora");
      chrome.storage.local.get("fpAsesora").then(({ fpAsesora }) => {
        if (fpAsesora) { selAse.value = fpAsesora; verAsunto(); }
      });
      selAse.addEventListener("change", () => {
        if (selAse.value) chrome.storage.local.set({ fpAsesora: selAse.value });
      });

      verAsunto();

      // Si corrige la fecha, el aviso se vuelve a armar: si no, el segundo clic que
      // ya tenia dado le dejaria pasar una fecha nueva sin revisar.
      let avisoVisto = false;
      const limpiarAviso = () => {
        avisoVisto = false;
        q("aviso").innerHTML = "";
        q("crear").textContent = textoBoton;
      };
      q("fecha").addEventListener("change", limpiarAviso);

      q("crear").onclick = async (ev) => {
        const fecha = q("fecha").value;
        const hora  = q("hora").value;
        const quien = q("asesora").value;
        if (!fecha) { toast("⚠️ Elige la fecha."); return; }
        // Antes arrancaba en MÓNICA y nadie lo notaba: los free pass de Laura
        // quedaban escritos como "FP MONICA APC" y el reporte se los daba a Mónica.
        if (!quien) { toast("⚠️ Elige quién atiende la clase."); return; }

        // No se ofrece una hora que ya pasó: corregirlo después por chat da vergüenza.
        if (fecha === hoyLima() && hora <= horaAhora()) {
          toast("⚠️ Esa hora ya pasó. Elige una más tarde o cambia la fecha.", 6000);
          return;
        }

        const avisos = [];
        // Éste vale para los dos: agendar encima de una cita que ya existe termina
        // en dos recordatorios y una persona que no sabe a cuál ir.
        if (personaPd?.proxima && diasHasta(personaPd.proxima.fecha) >= 0)
          avisos.push(`Ya tiene una cita ${diaTexto(personaPd.proxima.fecha)}` +
                      `${personaPd.proxima.hora ? " a las " + horaBonita(personaPd.proxima.hora) : ""}. ` +
                      `Si es la misma, no la agendes otra vez.`);

        // Las dos causas de no-show que más salieron en la auditoría de agosto. Solo
        // para clase gratis: son reglas del embudo de venta.
        if (!esRe) {
          if (!leadEscribio())
            avisos.push("Este lead no te ha escrito nada en este chat. Sin respuesta no hay cita: " +
                        "13 de los 80 no-shows de agosto eran citas así.");
          if (fecha > hoyLima(1))
            avisos.push("Estás agendando a más de un día. La regla es hoy o mañana — más lejos, se enfría.");
        }

        if (avisos.length && !avisoVisto) {
          avisoVisto = true;
          q("aviso").innerHTML =
            avisos.map((a) => `<p class="rr-tpl-nota rr-ambar">⚠️ ${esc(a)}</p>`).join("") +
            `<p class="rr-tenue">Si aun así quieres agendarla, vuelve a darle al botón.</p>`;
          ev.target.textContent = esRe ? "Agendar igual" : "Agendar igual";
          return;
        }

        const soltar = ocupar(ev.target, "Agendando…");
        if (!soltar) return;
        const res = await pedir("agendarFp", {
          personId: personaPd.id,
          asesora: quien,
          via: q("via").value,
          tipo,
          fecha, hora
        });
        soltar();
        if (!res.ok) { toast("❌ " + res.error, 6000); return; }

        limpiarAviso();
        // La ficha de arriba pasa a mostrar esta cita sin tener que volver a
        // consultar Pipedrive: es el dato que acabamos de escribir nosotros.
        if (personaPd) {
          personaPd.proxima = { fecha, hora, asunto: prefijo, tipo: "meeting" };
          pintarProxima();
        }
        toast("✅ Agendada. Mándale la confirmación con la hora.", 5000);
        prepararConfirmacion(fecha, hora);
      };
    }

    armarAgenda("fp", "fp");
    armarAgenda("re", "retoma");

    cont.querySelector("#rr-nu-crear").onclick = async (ev) => {
      const sel = cont.querySelector("#rr-nu-cupo");
      if (!sel.value) return;
      const soltar = ocupar(ev.target, "Agendando…");
      if (!soltar) return;
      const [fecha, hora] = sel.value.split(" ");
      const res = await pedir("agendarNutri", { personId: personaPd.id, nombre: nombreSugerido, fecha, hora });
      soltar();
      if (res.ok) { toast("✅ Nutrición agendada con Diego"); cargarCupos(cont); }
      else toast("❌ " + res.error, 6000);
    };
  }

  // Próximos martes y miércoles, quitando los cupos que Pipedrive ya tiene tomados.
  async function cargarCupos(cont) {
    const sel = cont.querySelector("#rr-nu-cupo");
    const btn = cont.querySelector("#rr-nu-crear");
    sel.innerHTML = "<option>Cargando cupos…</option>";
    btn.disabled = true;

    const dias = proximosDiasNutri(2);
    const r = await pedir("cuposNutri", { desde: dias[0], hasta: dias[dias.length - 1] });
    // Antes, si esto fallaba se seguia con la lista vacia: los 48 cupos salian
    // libres y se agendaba encima de una cita que Diego ya tenia.
    if (!r.ok) {
      sel.innerHTML = "<option>No se pudieron leer los cupos</option>";
      toast("❌ No pude ver qué cupos están ocupados: " + r.error + ". No agendes a ciegas.", 8000);
      return;
    }
    const ocupados = new Set(r.data || []);

    const libres = [];
    for (const d of dias) {
      for (const h of window.RURUSH_NUTRI.cupos) {
        const clave = `${d} ${h}`;
        if (!ocupados.has(clave)) libres.push(clave);
      }
    }
    if (!libres.length) {
      sel.innerHTML = "<option value=''>No quedan cupos libres</option>";
      return;
    }
    sel.innerHTML = libres.map((c) => {
      const [f, h] = c.split(" ");
      return `<option value="${c}">${esc(nombreDia(f))} ${esc(fechaCorta(f))} · ${esc(hora12(h))}</option>`;
    }).join("");
    btn.disabled = false;
  }

  // Las citas de nutrición se dan para la semana siguiente, no para hoy.
  function proximosDiasNutri(semanas = 2) {
    const out = [];
    for (let i = 1; i <= semanas * 7; i++) {
      const f = hoyLima(i);
      const dow = new Date(f + "T12:00:00Z").getUTCDay();
      if (window.RURUSH_NUTRI.dias.includes(dow)) out.push(f);
    }
    return out;
  }

  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const nombreDia = (iso) => DIAS[new Date(iso + "T12:00:00Z").getUTCDay()];

  function hora12(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const ampm = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m ? `${h12}:${pad2(m)}${ampm}` : `${h12}${ampm}`;
  }
  const pad2 = (n) => String(n).padStart(2, "0");
  const horaAhora = () => {
    const d = new Date(Date.now() - 5 * 3600 * 1000);
    return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  };

  // Apenas se agenda, el panel abre la confirmación con el día y la hora ya puestos.
  // Tecleárlos de nuevo a mano era donde nacía el "mañana a las 6am" de una clase de
  // las 7pm, y cerrar la hora por escrito es la corrección #5 de la auditoría de
  // no-shows: de 79 casos revisados, 47 venían de chats donde nunca se cerró.
  function prepararConfirmacion(fecha, hora) {
    abrirSeccion(panel, "rr-plantillas");
    pintarPlantillas();                       // por si la sección aún no se había armado
    const cont = panel.querySelector("#rr-plantillas");

    const selDia = cont.querySelector("#rr-v-dia");
    if (selDia) {
      const txt = diaTexto(fecha);
      // Más allá de mañana no hay opción fija: se agrega la fecha concreta para que
      // el mensaje diga "el vie 3/10" y no una palabra que no corresponde. Se borra
      // la anterior primero, o el desplegable se va llenando de fechas viejas.
      [...selDia.options].forEach((o) => { if (o.dataset.extra) o.remove(); });
      if (!window.RURUSH_DIAS.includes(txt)) {
        const o = new Option(txt, txt);
        o.dataset.extra = "1";
        selDia.add(o);
      }
      selDia.value = txt;
    }

    const selHora = cont.querySelector("#rr-v-hora");
    const t = window.RURUSH_HORAS.find((h) => h.v === hora)?.t;
    if (selHora && t) selHora.value = t;

    const abierta = cont.querySelector('details.rr-tpl[data-id="confirmacion_cita"]');
    cont.querySelectorAll("details.rr-tpl").forEach((o) => { o.open = o === abierta; });
    actualizarCamposVisibles();
    repintarVistasPrevias();
    abierta?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* ---------- 5. plantillas ---------- */

  function pintarPlantillas() {
    const cont = panel.querySelector("#rr-plantillas");

    // Si alguien edita lib/templates.js y mete un error de sintaxis, el archivo no
    // carga y sin esta guarda el panel quedaría mudo y sin explicación.
    if (!window.RURUSH_TEMPLATES || !window.RURUSH_HORARIOS) {
      cont.innerHTML = tarjeta("Plantillas",
        '<p class="rr-error">No cargaron las plantillas. Revisa lib/templates.js y recarga la extensión.</p>');
      return;
    }

    // Ya construido: solo se refresca el nombre. Reconstruirlo entero borraría la
    // hora elegida y cerraría la plantilla que la asesora tenía abierta.
    if (cont.dataset.listo) {
      const inNombre = cont.querySelector("#rr-v-nombre");
      if (inNombre && !inNombre.dataset.tocado) inNombre.value = ctxChat?.nombre || "";
      repintarVistasPrevias();
      return;
    }

    const horas = window.RURUSH_HORARIOS.map((h) => `<option>${esc(h)}</option>`).join("");
    cont.innerHTML = `
      <div class="rr-campos" id="rr-campos">
        <div id="rr-c-nombre"><label class="rr-lbl">Nombre</label><input class="rr-input" id="rr-v-nombre"></div>
        <div id="rr-c-dia"><label class="rr-lbl">Día</label>
          <select class="rr-select" id="rr-v-dia">${
            window.RURUSH_DIAS.map((d) => `<option>${esc(d)}</option>`).join("")}</select></div>
        <div id="rr-c-hora"><label class="rr-lbl">Hora</label><select class="rr-select" id="rr-v-hora">${horas}</select></div>
        <div id="rr-c-hora2"><label class="rr-lbl">Hora 2 (doble opción)</label><select class="rr-select" id="rr-v-hora2">${horas}</select></div>
      </div>
      <div id="rr-adjuntos"></div>
      <div id="rr-tpl-sug"></div>
      <details id="rr-tpl-todas"><summary class="rr-sub-sum">Ver todas las plantillas</summary>
        <div id="rr-lista-tpl"></div></details>`;
    cont.dataset.listo = "1";

    const inNombre = cont.querySelector("#rr-v-nombre");
    inNombre.value = ctxChat?.nombre || "";
    cont.querySelector("#rr-v-dia").value = "mañana";
    inNombre.addEventListener("input", (e) => { e.target.dataset.tocado = "1"; });

    // La segunda hora sigue a la primera: ofrecer "7pm o 7am" es el pie de banana
    // clásico de la plantilla de cierre.
    const h1 = cont.querySelector("#rr-v-hora");
    const h2 = cont.querySelector("#rr-v-hora2");
    const seguir = () => {
      // En la ultima hora del dia no hay "la siguiente": se ofrece la anterior, o
      // salia "¿te reservo a las 9pm o a las 9pm?".
      const ultima = window.RURUSH_HORARIOS.length - 1;
      h2.selectedIndex = h1.selectedIndex >= ultima
        ? Math.max(ultima - 1, 0)
        : h1.selectedIndex + 1;
      // En un <select>, "input" dispara ANTES que "change", así que el repintado
      // automático usaba la Hora 2 vieja y la previa decía "¿7pm o 7pm?" aunque el
      // mensaje real saliera bien. Se repinta de nuevo ya con la hora corregida.
      repintarVistasPrevias();
    };
    seguir();
    h1.addEventListener("change", seguir);

    cont.querySelectorAll(".rr-input, .rr-select").forEach((i) =>
      i.addEventListener("input", repintarVistasPrevias));

    pintarAdjuntos(cont.querySelector("#rr-adjuntos"));

    const lista = cont.querySelector("#rr-lista-tpl");
    let grupoPrev = "";
    const nodos = new Map();     // id -> <details>, para repartirlas después

    for (const t of window.RURUSH_TEMPLATES) {
      if (t.grupo !== grupoPrev) {
        grupoPrev = t.grupo;
        lista.appendChild(el(`<h4 class="rr-sub">${esc(t.grupo)}</h4>`));
      }

      const d = el(`
        <details class="rr-tpl" data-id="${esc(t.id)}">
          <summary>${esc(t.titulo)}${t.conUbicacion ? '<span class="pill">+GPS</span>' : ""}</summary>
          <div class="rr-tpl-body">
            ${t.nota ? `<p class="rr-tpl-nota">⚠️ ${esc(t.nota)}</p>` : ""}
            <div class="rr-preview"></div>
            <div class="rr-btns">
              <button class="rr-btn sec" data-a="insertar">Solo insertar</button>
              <button class="rr-btn" data-a="enviar">Enviar ahora</button>
            </div>
          </div>
        </details>`);

      // Una plantilla abierta a la vez: con cinco desplegadas hay que scrollear para
      // encontrar los botones, y no se sabe a cuál pertenecen los campos de arriba.
      d.addEventListener("toggle", () => {
        if (d.open) cont.querySelectorAll("details.rr-tpl").forEach((o) => { if (o !== d) o.open = false; });
        actualizarCamposVisibles();
        repintarVistasPrevias();
      });

      d.querySelectorAll("button[data-a]").forEach((b) => {
        b.onclick = async () => {
          // Bloquear el botón mientras corre: sin esto, un segundo clic manda el
          // mensaje dos veces al cliente.
          const soltar = ocupar(b, b.dataset.a === "enviar" ? "Enviando…" : "…");
          if (!soltar) return;
          try { await accionPlantilla(b.dataset.a, t); }
          catch (e) { toast("❌ " + (e.message || "Falló la acción"), 6000); }
          finally { soltar(); }
        };
      });

      lista.appendChild(d);
      nodos.set(t.id, d);
    }

    repartirPlantillas(cont, nodos);
    cont._repartir = () => repartirPlantillas(cont, nodos);

    repintarVistasPrevias();
    actualizarCamposVisibles();
    nota("rr-plantillas", `${window.RURUSH_TEMPLATES.length} mensajes`);
  }

  /* Cuáles de las 9 plantillas tienen sentido AHORA, según lo que el panel ya sabe
     de la persona. Nacen todas en la lista completa; esto solo decide cuáles suben
     arriba. Con nueve a la vista, elegir cuesta más que escribir el mensaje a mano,
     que es justo lo que la extensión vino a evitar. */
  function plantillasSugeridas() {
    const ids = new Set();
    const pr = personaPd?.proxima;

    if (pr) {
      const d = diasHasta(pr.fecha);            // 0 hoy · 1 mañana · negativo ya pasó
      if (d < 0) ids.add("reagendo");           // no vino: toca reagendar
      else if (d <= 1) ids.add("recordatorio_confirma");
      else ids.add("confirmacion_cita");
    }

    if (ficha?.esSocio) {
      if (ficha.diasRestantes !== null && ficha.diasRestantes <= 7) ids.add("renovacion");
      if (ficha.diasSinAsistir !== null && ficha.diasSinAsistir > 7) ids.add("falta_socio");
    } else if (!pr) {
      // Lead sin cita agendada: lo único que toca es cerrarle una.
      ids.add("doble_opcion_momento");
      ids.add("doble_opcion_hora");
    }
    return ids;
  }

  function repartirPlantillas(cont, nodos) {
    const sug    = cont.querySelector("#rr-tpl-sug");
    const todas  = cont.querySelector("#rr-tpl-todas");
    const lista  = cont.querySelector("#rr-lista-tpl");
    if (!sug || !lista) return;

    const ids = plantillasSugeridas();
    sug.innerHTML = "";

    if (ids.size) {
      sug.appendChild(el('<h4 class="rr-sub">Para este chat</h4>'));
      for (const [id, d] of nodos) if (ids.has(id)) sug.appendChild(d);
    }

    // Las que no se sugieren vuelven a la lista completa, en su orden y su grupo.
    let grupo = "";
    lista.innerHTML = "";
    for (const t of window.RURUSH_TEMPLATES) {
      const d = nodos.get(t.id);
      if (!d || ids.has(t.id)) continue;
      if (t.grupo !== grupo) { grupo = t.grupo; lista.appendChild(el(`<h4 class="rr-sub">${esc(t.grupo)}</h4>`)); }
      lista.appendChild(d);
    }

    // Sin sugerencias no tiene sentido esconder todo detrás de un clic.
    todas.open = !ids.size;
    const sum = todas.querySelector("summary");
    if (sum) sum.textContent = ids.size
      ? `Ver las otras ${window.RURUSH_TEMPLATES.length - ids.size} plantillas`
      : "Todas las plantillas";
  }

  function pintarAdjuntos(cont) {
    const lista = window.RURUSH_ADJUNTOS || [];
    if (!lista.length) { cont.innerHTML = ""; return; }

    cont.innerHTML = `<h4 class="rr-sub">Imágenes</h4>
      <div class="rr-btns">
        ${lista.map((a) => `<button class="rr-btn sec rr-adj" data-id="${esc(a.id)}"
            title="${esc(a.nota || "")}">${esc(a.titulo)}${
            /https?:\/\//.test(a.pie || "") ? '<span class="pill">+GPS</span>' : ""
          }</button>`).join("")}
      </div>`;

    cont.querySelectorAll(".rr-adj").forEach((b) => {
      b.onclick = async () => {
        const a = lista.find((x) => x.id === b.dataset.id);
        const soltar = ocupar(b, "Cargando…");
        if (!soltar) return;
        try {
          const conPie = await pegarImagen(a.archivo, a.pie);
          toast(conPie
            ? "🖼️ Imagen + link GPS listos — revísalos y envía"
            : "🖼️ Imagen lista en el chat — revísala y envía", 5000);
        } catch (e) {
          toast("❌ " + (e.message || "No pude adjuntar la imagen"), 6000);
        } finally { soltar(); }
      };
    });
  }

  // WhatsApp no deja adjuntar por script, pero sí acepta una imagen PEGADA: se
  // arma un evento paste con el archivo y WhatsApp abre su vista previa de envío,
  // igual que si la hubieras pegado con Ctrl+V. El envío lo da la persona.
  async function pegarImagen(ruta, pie) {
    const caja = cajaMensaje();
    if (!caja) throw new Error("Abre un chat primero");

    const r = await fetch(chrome.runtime.getURL(ruta));
    if (!r.ok) throw new Error("No encontré el archivo " + ruta);
    const blob = await r.blob();
    const file = new File([blob], ruta.split("/").pop(), { type: blob.type || "image/jpeg" });

    const dt = new DataTransfer();
    dt.items.add(file);

    caja.focus();
    const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
    // Algunas versiones de Chrome ignoran clipboardData del constructor.
    if (!ev.clipboardData || !ev.clipboardData.files.length) {
      Object.defineProperty(ev, "clipboardData", { value: dt });
    }
    caja.dispatchEvent(ev);
    await dormir(900);

    if (!pie) return false;

    /* El pie va en la caja de la VISTA PREVIA de la imagen, que no es la del chat.
       Antes se buscaba solo dentro de #main y descartando cualquier footer — y esa
       vista previa vive FUERA de #main, con su caja dentro de un footer. Las dos
       exclusiones juntas la dejaban siempre fuera y el link del GPS nunca se
       escribía, aunque el panel dijera que sí.

       Ahora se buscan todas las cajas visibles y se elige por puntaje. Lo único que
       se excluye de plano es el buscador de la barra lateral (#side): si el link
       termina ahí, además de no mandarse, le cambia el chat a la asesora. */
    const elegirCaja = () => {
      const cajas = [...document.querySelectorAll('[contenteditable="true"]')]
        .filter((n) => n.offsetParent !== null && !n.closest("#side"));
      if (!cajas.length) return null;

      const puntos = (n) => {
        let p = 0;
        if (!n.closest("#main")) p += 2;                 // la vista previa es un overlay
        const t = `${n.getAttribute("aria-label") || ""} ${n.dataset?.placeholder || ""}`;
        if (/comentario|caption|pie/i.test(t)) p += 3;   // "Añade un comentario"
        else if (/mensaje|message/i.test(t)) p += 1;
        return p;
      };
      // A igual puntaje gana la última del DOM: el overlay se monta después.
      return cajas.reduce((mej, n) => (puntos(n) >= puntos(mej) ? n : mej), cajas[0]);
    };

    // Trozo final del link: sirve para saber si el pie YA está escrito.
    const marca = pie.slice(-12);
    const tiene = (n) => (n?.innerText || "").includes(marca);

    for (let intento = 0; intento < 16; intento++) {
      const cap = elegirCaja();
      if (cap) {
        // Comprobar ANTES de escribir. Sin esto, el intento anterior escribía bien
        // pero innerText todavía no se había actualizado, la verificación fallaba y
        // el pie se escribía una segunda vez: el lead recibía el link duplicado.
        if (tiene(cap)) return true;

        cap.focus();
        document.execCommand("insertText", false, pie);
        cap.dispatchEvent(new InputEvent("input", { bubbles: true }));

        // Se le da tiempo al DOM antes de verificar, y recién ahí se confirma: si
        // execCommand no prende, el panel no debe decir que quedó listo.
        await dormir(350);
        if (tiene(cap)) return true;
      }
      await dormir(300);
    }
    toast("⚠️ Pegué la imagen pero no pude escribir el link. Añádelo tú.", 6000);
    return false;
  }

  async function accionPlantilla(accion, t) {
    const txt = rellenar(t.texto);

    // No se manda una plantilla con huecos sin rellenar ni con "vence el ." —
    // eso llega al cliente como un mensaje roto.
    if (/\[[A-ZÁÉÍÓÚÑ0-9]+\]/.test(txt) || /\bel\s*\./.test(txt)) {
      const hueco = (txt.match(/\[[A-ZÁÉÍÓÚÑ0-9]+\]/) || [])[0];
      toast(hueco
        ? `⚠️ Falta llenar ${hueco.replace(/[\[\]]/g, "").toLowerCase()} arriba.`
        : "⚠️ Este socio no tiene fecha de vencimiento, así que la plantilla queda coja.", 7000);
      return;
    }

    if (accion === "insertar") {
      if (insertar(txt)) toast("✍️ Texto listo — revísalo y envía");
      return;
    }

    // El destinatario se congela ANTES del primer await: si cambia de chat a mitad,
    // las guardas de insertarYEnviar lo detectan y no mandan nada.
    const destino = { ...ctxChat };
    if (!(await insertarYEnviar(txt, destino))) return;

    if (t.conUbicacion) {
      await dormir(1200);
      const ok2 = await insertarYEnviar(window.RURUSH_UBICACION, destino);
      toast(ok2 ? "✅ Mensaje + ubicación enviados"
                : "⚠️ Se envió el mensaje pero NO la ubicación.", 6000);
    } else {
      toast("✅ Enviado");
    }
  }

  function repintarVistasPrevias() {
    panel.querySelectorAll("details.rr-tpl[open]").forEach((d) => {
      const t = window.RURUSH_TEMPLATES.find((x) => x.id === d.dataset.id);
      const prev = d.querySelector(".rr-preview");
      if (t && prev) prev.textContent = rellenar(t.texto);
    });
  }

  function rellenar(txt) {
    const v = (id) => panel.querySelector(id)?.value || "";
    return txt
      .replaceAll("[NOMBRE]", v("#rr-v-nombre"))
      .replaceAll("[DIA]", v("#rr-v-dia"))
      .replaceAll("[HORA2]", v("#rr-v-hora2"))
      .replaceAll("[HORA]", v("#rr-v-hora"))
      .replaceAll("[FECHA]", fechaCorta(ficha?.fin))   // dd/mm, no el ISO del API
      .replace(/[ \t]{2,}/g, " ")                      // solo espacios: \s borraría los saltos de línea
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\s+([!?,.])/g, "$1");                  // "¡Hola !" → "¡Hola!"
  }

  // Cada plantilla declara sus huecos en su propio texto, así que el panel muestra
  // solo esos campos. Antes los cuatro estaban siempre a la vista y dos de ellos
  // servían a una sola plantilla cada uno: parecía un formulario largo para mandar
  // "¡Hola Ana!".
  const CAJA_DE = { "rr-c-nombre": "[NOMBRE]", "rr-c-dia": "[DIA]",
                    "rr-c-hora": "[HORA]", "rr-c-hora2": "[HORA2]" };

  function actualizarCamposVisibles() {
    const cont = panel.querySelector("#rr-plantillas");
    if (!cont?.dataset.listo) return;

    const abierta = cont.querySelector("details.rr-tpl[open]");
    const t = abierta && window.RURUSH_TEMPLATES.find((x) => x.id === abierta.dataset.id);
    const usa = t ? (t.texto.match(/\[[A-Z0-9]+\]/g) || []) : ["[NOMBRE]"];

    let visibles = 0;
    for (const [caja, marca] of Object.entries(CAJA_DE)) {
      const d = cont.querySelector("#" + caja);
      if (!d) continue;
      // La segunda hora sigue a la primera, así que [HORA2] también necesita [HORA].
      const ver = usa.includes(marca) || (marca === "[HORA]" && usa.includes("[HORA2]"));
      d.classList.toggle("oculto", !ver);
      if (ver) visibles++;
    }
    cont.querySelector("#rr-campos")?.classList.toggle("oculto", visibles === 0);
  }

  /* ---------- 2. Pipedrive ---------- */

  /* ---------- guardar contactos solos (como Timelines) ----------
     Si el chat abierto no tiene ficha, se crea sola con el nombre de WhatsApp y el número.
     Solo si la persona ya escribió (para no crear fichas de chats que se abren por mirar),
     nunca en grupos ni sin número/@usuario, y se apaga en Opciones. Lo creado se recuerda
     en esta PC: el buscador de Pipedrive tarda en indexar y, sin eso, al volver a abrir el
     chat se crearía una segunda ficha. */
  const entrante = () => !!document.querySelector("#main .message-in, #main [data-id^='false_']");

  // Se usa la ficha que acaba de devolver Pipedrive en vez de volver a
  // buscarla: su buscador tarda unos segundos en indexar lo recién creado,
  // y mientras tanto el panel parecía no haber guardado nada.
  function quedarseCon(cont, p) {
    personaPd = {
      id: p.id,
      nombre: p.name || p.nombre || "",
      telefonos: (p.phone || p.telefonos || []).map((x) => x.value || x),
      valores: p.valores || {},
      proxima: p.proxima || null
    };
    nota("rr-crm", `#${personaPd.id}`);
    pintarChips(cont);
    nombrarLead();
    pintarProxima();
    pintarAgendar();
    pintarDatos();
  }

  async function recordarCreado(clave, id) {
    if (!clave || !id) return;
    const { pdCreados = {} } = await chrome.storage.local.get("pdCreados");
    pdCreados[clave] = { id, at: Date.now() };
    // solo lo de los últimos 2 días: después Pipedrive ya lo encuentra solo
    for (const k of Object.keys(pdCreados)) if (Date.now() - pdCreados[k].at > 2 * 864e5) delete pdCreados[k];
    await chrome.storage.local.set({ pdCreados });
  }

  // true = ya quedó resuelto (creado o recuperado); false = se muestra el formulario de siempre
  async function guardarSolo(cont, gen, usuarioWa) {
    const { autoPdApagado, pdCreados = {} } = await chrome.storage.local.get(["autoPdApagado", "pdCreados"]);
    let t = String(telDeEstaPersona() || "").replace(/\D/g, "");
    if (t.length < 9) {                       // el número a veces solo lo tiene WhatsApp por dentro
      const dentro = await chatDesdeWhatsApp();
      if (gen !== generacion) return true;
      if (dentro && dentro.telefono) { t = dentro.telefono; telManual = t; }
    }
    const tel = t.length >= 9 ? conPais(t) : "";
    const clave = tel || usuarioWa;
    if (!clave) return false;

    // creado hace poco desde esta PC: se abre esa ficha en vez de crear otra
    const ya = pdCreados[clave];
    if (ya) {
      const det = await pedir("pdDetalle", { personId: ya.id });
      if (gen !== generacion) return true;
      if (det.ok) { quedarseCon(cont, { id: ya.id, nombre: det.data.nombre, valores: det.data.valores, proxima: det.data.proxima }); return true; }
      return false;
    }

    if (autoPdApagado) return false;
    // ¿ya escribió? Primero se le pregunta a WhatsApp; si no responde, se mira la pantalla
    // (los mensajes pueden tardar un poco en aparecer al abrir el chat)
    let escribio = null;
    for (let i = 0; i < 6; i++) {
      const dentro = await chatDesdeWhatsApp();
      if (gen !== generacion) return true;
      escribio = dentro && typeof dentro.escribio === "boolean" ? dentro.escribio : null;
      if (escribio || entrante()) { escribio = true; break; }
      await new Promise((r) => setTimeout(r, 500));
      if (gen !== generacion) return true;
    }
    if (!escribio) return false;

    const nom = (ficha?.nombre || (ctxChat.nombre ? ctxChat.titulo : "") || "").trim() ||
                (usuarioWa || ("Lead " + tel.slice(-9)));
    cont.innerHTML = tarjeta("Gestión", '<p class="rr-aviso">Guardando contacto en Pipedrive…</p>');
    const res = await pedir("crearPd", { nombre: nom, telefono: tel });
    if (!res.ok) { toast("❌ No se pudo guardar solo: " + res.error, 6000); return false; }
    await recordarCreado(clave, res.data.id);
    if (usuarioWa && res.data?.id) {
      pedir("nota", { personId: res.data.id, contenido: `Usuario de WhatsApp: ${usuarioWa}` }).catch(() => {});
    }
    if (gen !== generacion) return true;
    quedarseCon(cont, res.data);
    toast(`✅ Guardado solo en Pipedrive: ${nom}`, 5000);
    return true;
  }

  async function pintarCrm(gen, enVuelo = null) {
    const cont = panel.querySelector("#rr-crm");
    if (!ctxChat || ctxChat.esGrupo) { cont.innerHTML = ""; return; }

    cont.innerHTML = tarjeta("Gestión", '<p class="rr-aviso">Buscando ficha…</p>');

    // Si refrescar() ya la lanzó en paralelo, acá solo se recoge: el viaje empezó
    // mientras Apps Fit todavía respondía.
    const r = await (enVuelo || pedir("buscarPd", {
      telefono: telDeEstaPersona(),
      nombre: ficha?.nombre || ctxChat.titulo    // el nombre real del socio busca mejor que el alias del chat
    }));
    if (gen !== generacion) return;

    if (!r.ok) {
      cont.innerHTML = tarjeta("Gestión", `<p class="rr-error">${esc(r.error)}</p>`);
      return;
    }

    const encontrados = r.data || [];
    const usuarioWa = ctxChat.usuario || "";

    if (!encontrados.length && await guardarSolo(cont, gen, usuarioWa)) return;
    if (!encontrados.length) {
      nota("rr-crm", "sin ficha");
      abrirSeccion(panel, "rr-crm");        // sin ficha no se puede agendar: que se vea
      // Nombre y número en la MISMA tarjeta. Antes el número se escribía arriba, en
      // Contacto, y había que bajar otra vez a guardar: con los contactos que solo
      // comparten su usuario (@fulano) eso era el caso normal, no la excepción.
      cont.innerHTML = tarjeta("Gestión",
        `<p class="rr-aviso">No hay ficha para este contacto. Guárdalo para poder agendarle y etiquetarlo.</p>
         <label class="rr-lbl">Nombre con el que se guarda</label>
         <input class="rr-input" id="rr-nuevo-nombre" value="${esc(ficha?.nombre || (ctxChat.nombre ? ctxChat.titulo : ""))}"
                placeholder="Nombre y apellido">
         <label class="rr-lbl">Número de WhatsApp</label>
         <div class="rr-btns">
           <input class="rr-input" id="rr-nuevo-tel" value="${esc(telDeEstaPersona())}"
                  placeholder="9XXXXXXXX" inputmode="numeric" style="flex:1">
           <button class="rr-btn sec" id="rr-nuevo-traer">📇 Traer</button>
         </div>
         ${usuarioWa ? `<p class="rr-aviso">Se guardará también su usuario <b>${esc(usuarioWa)}</b>, para volver a encontrarlo desde este chat.</p>` : ""}
         <p class="rr-aviso" id="rr-nuevo-sintel"></p>
         <div class="rr-btns"><button class="rr-btn" id="rr-crear">Guardar contacto</button></div>`);

      // El aviso de "sin número" se actualiza mientras escribe, en vez de saltar
      // como error recién al darle Guardar.
      const inTel = cont.querySelector("#rr-nuevo-tel");
      const avisoTel = cont.querySelector("#rr-nuevo-sintel");
      const repintarAviso = () => {
        const hay = inTel.value.replace(/\D/g, "").length >= 9;
        avisoTel.innerHTML = hay ? "" :
          "⚠️ Sin número no le llegan los recordatorios automáticos ni cruza con Apps Fit. " +
          "Puedes guardarlo igual y agregárselo cuando te lo pase." +
          // Pista técnica: qué identificadores vio en el chat. Sirve para saber por
          // qué no encontró el número en los chats donde falla.
          `<br><span class="rr-tenue">no encontré número en el chat · ${esc(ctxChat.pistas || "—")}</span>`;
      };
      inTel.oninput = repintarAviso;
      repintarAviso();

      cont.querySelector("#rr-nuevo-traer").onclick = async (ev) => {
        const soltar = ocupar(ev.target, "…");
        if (!soltar) return;
        const dentro = await chatDesdeWhatsApp();
        let t = dentro && dentro.telefono, paso = "";
        if (!t) ({ tel: t, paso } = await numeroDesdeInfo());
        soltar();
        if (!t) {
          toast(`No pude traerlo: ${paso}. Ábrelo tú (clic en el nombre del contacto, arriba) y vuelve a darle a Traer.`, 9000);
          return;
        }
        inTel.value = t;
        repintarAviso();
        toast("✅ Número traído: " + t);
      };

      cont.querySelector("#rr-crear").onclick = async (ev) => {
        const nom = cont.querySelector("#rr-nuevo-nombre").value.trim();
        if (!nom) { toast("⚠️ Ponle un nombre antes de guardarlo."); return; }

        const tel = conPais(inTel.value.replace(/\D/g, ""));
        const soltar = ocupar(ev.target, "Guardando…");
        if (!soltar) return;

        // Con número, primero se revisa si ya existe: crear una segunda ficha de la
        // misma persona es el error más caro acá — se etiqueta una y se agenda en la
        // otra, y nadie se entera hasta que falta el socio en el reporte.
        if (tel) {
          const dup = await pedir("buscarPd", { telefono: tel, nombre: "" });
          if (gen !== generacion) { soltar(); return; }
          if (dup.ok && dup.data?.length) {
            soltar();
            toast(`Ese número ya tiene ficha en Pipedrive — te la abro en vez de crear otra.`, 6000);
            telManual = tel;
            refrescar();
            return;
          }
        }

        const res = await pedir("crearPd", { nombre: nom, telefono: tel });
        soltar();
        if (!res.ok) { toast("❌ " + res.error, 6000); return; }

        // El usuario de WhatsApp va como nota: es lo único que identifica a esta
        // persona cuando no comparte su número, y Pipedrive busca dentro de las notas.
        if (usuarioWa && res.data?.id) {
          pedir("nota", { personId: res.data.id, contenido: `Usuario de WhatsApp: ${usuarioWa}` })
            .catch(() => {});
        }

        // Mientras Pipedrive respondia se pudo cambiar de chat. Sin este corte, la
        // ficha recien creada quedaba como "la del chat abierto" y lo que se
        // agendara o etiquetara despues se escribia en la persona equivocada.
        if (gen !== generacion) {
          toast("✅ Contacto guardado, pero ya cambiaste de chat. Vuelve a abrirlo.", 7000);
          return;
        }

        recordarCreado(tel || usuarioWa, res.data.id);
        quedarseCon(cont, res.data);
        toast("✅ Contacto guardado en Pipedrive");
      };
      return;
    }

    // Con duplicados no elige la extensión: etiquetar la ficha equivocada ensucia
    // el CRM sin que nadie se entere.
    if (encontrados.length > 1) {
      nota("rr-crm", `⚠️ ${encontrados.length} fichas`);
      abrirSeccion(panel, "rr-crm");
      cont.innerHTML = tarjeta("Gestión",
        `<p class="rr-tpl-nota">${encontrados[0]?.porNombre
            ? `⚠️ No tengo su número, así que busqué por el nombre «${esc(ctxChat.titulo)}» y salieron ${encontrados.length} parecidas. Revisa bien antes de elegir — o escribe su número arriba, en Contacto, para encontrarlo exacto.`
            : `⚠️ Hay ${encontrados.length} fichas con este dato. Elige cuál antes de etiquetar.`}</p>
         ${encontrados.map((p, i) => `
           <button class="rr-btn sec rr-elegir" data-i="${i}">
             #${esc(p.id)} — ${esc(p.nombre)}${p.telefonos?.length ? " · " + esc(p.telefonos.join(", ")) : ""}
           </button>`).join("")}`);
      cont.querySelectorAll(".rr-elegir").forEach((b) => {
        b.onclick = async (ev) => {
          const elegida = encontrados[+b.dataset.i];
          // Con duplicados la búsqueda devuelve las fichas peladas: sin etiquetas y
          // sin la cita pendiente. Si se pintaba así, los chips salían en blanco
          // (y al marcar uno se pisaba el que ya estaba) y el aviso de "ya tiene
          // cita" nunca aparecía. Se piden los detalles de la que eligió.
          const soltar = ocupar(ev.currentTarget, "Cargando…");
          const det = await pedir("pdDetalle", { personId: elegida.id });
          if (soltar) soltar();
          if (gen !== generacion) return;

          personaPd = det.ok ? { ...elegida, ...det.data } : elegida;
          if (!det.ok) toast("⚠️ No pude leer sus etiquetas: " + det.error, 6000);

          pintarChips(cont); nombrarLead(); pintarProxima(); pintarAgendar(); pintarDatos();
        };
      });
      return;
    }

    personaPd = encontrados[0];
    nota("rr-crm", `#${personaPd.id}`);
    pintarChips(cont);
    nombrarLead();
    pintarProxima();
  }

  // La tarjeta de Contacto se pinta antes de consultar Pipedrive, así que para un
  // lead se queda con el número. Cuando llega la ficha del CRM, le ponemos el nombre.
  function nombrarLead() {
    if (ficha || !personaPd) return;                       // socio: manda Apps Fit
    const nom = String(personaPd.nombre || "").trim();
    if (!nom || /^\+?[\d\s()-]+$/.test(nom)) return;       // en el CRM también es un número
    const h = panel.querySelector("#rr-ficha .rr-nombre");
    if (h) h.textContent = nom;
  }

  // Deja listos los clics de UN grupo de chips. Vive aparte de pintarChips porque
  // los grupos que se bajan de Pipedrive se repintan despues y hay que recablearlos.
  function cablearChips(g, p) {
    g.querySelectorAll(".rr-chip").forEach((chip) => {
      chip.onclick = async () => {
        // Clic sobre el que ya esta marcado = borrarlo. Antes, un clic por error
        // se quedaba en el CRM para siempre y desde el panel no habia como sacarlo.
        const borrar = chip.classList.contains("ok");
        const soltar = ocupar(chip, "…");
        if (!soltar) return;
        const res = await pedir("etiquetar", {
          personId: p.id, campos: { [g.dataset.campo]: borrar ? null : chip.dataset.v }
        });
        soltar();
        if (res.ok) {
          g.querySelectorAll(".rr-chip").forEach((c) => c.classList.remove("ok"));
          if (!borrar) chip.classList.add("ok");
          if (p.valores) p.valores[g.dataset.campo] = borrar ? "" : chip.dataset.v;
          toast(borrar ? "✅ Etiqueta quitada" : "✅ Etiquetado");
        } else toast("❌ " + res.error, 6000);
      };
    });
  }

  // Baja de Pipedrive las opciones reales de un campo y repinta sus chips. Si la
  // llamada falla se queda lo que ya estaba (OPC), que es viejo pero funciona: nunca
  // se deja a la asesora sin poder etiquetar.
  async function cargarChips(cont, p, campo) {
    const g = cont.querySelector(`.rr-chips[data-campo="${campo}"]`);
    if (!g) return;
    const r = await pedir("opciones", { campo });
    if (!r.ok || !r.data?.length) return;

    const actual = String(p.valores?.[campo] ?? "");
    // El que ya está marcado se muestra siempre, aunque sea de alguien que ya no
    // está: si no, la ficha parecería sin etiquetar y el primer clic la pisaría.
    const visibles = r.data.filter((o) =>
      String(o.id) === actual || !YA_NO_ESTAN.includes(String(o.label).trim().toUpperCase()));
    if (!visibles.length) return;

    g.innerHTML = visibles.map((o) =>
      `<button class="rr-chip${String(o.id) === actual ? " ok" : ""}" data-v="${esc(o.id)}">${esc(o.label)}</button>`
    ).join("");
    cablearChips(g, p);
  }

  function pintarChips(cont) {
    const p = personaPd;
    const grupo = (campo) => `
      <div class="rr-grupo">
        <label class="rr-lbl">${ETIQUETA_GRUPO[campo]}</label>
        <div class="rr-chips" data-campo="${campo}">
          ${OPC[campo].map(([v, t]) =>
            `<button class="rr-chip${String(p.valores?.[campo] ?? "") === v ? " ok" : ""}" data-v="${v}">${esc(t)}</button>`
          ).join("")}
        </div>
      </div>`;

    cont.innerHTML = tarjeta("Gestión",
      `<div class="rr-fila"><span>Ficha</span><span>
         <a href="https://rurushfitnessclub.pipedrive.com/person/${encodeURIComponent(p.id)}"
            target="_blank" rel="noopener">#${esc(p.id)}</a></span></div>

       ${grupo("CIERRE")}${grupo("PRESENTO_PLAN")}${grupo("ORIGEN")}
       <label class="rr-lbl">Coach que hizo el free pass</label>
       <select class="rr-select" id="rr-coach"><option value="">Cargando…</option></select>
       <label class="rr-lbl">Video / creativo por el que entró</label>
       <select class="rr-select" id="rr-video"><option value="">Cargando…</option></select>
       <label class="rr-lbl">Nota rápida</label>
       <textarea class="rr-input" id="rr-nota" rows="2" placeholder="Qué pasó en esta conversación…"></textarea>
       <div class="rr-btns">
         <button class="rr-btn sec" id="rr-guardar-nota">Guardar nota</button>
         <a class="rr-btn sec" target="_blank" rel="noopener"
            href="https://rurushfitnessclub.pipedrive.com/person/${encodeURIComponent(p.id)}">Abrir en CRM</a>
       </div>`);

    cont.querySelectorAll(".rr-chips").forEach((g) => cablearChips(g, p));

    cargarSelectCampo(cont, p, "COACH_FP", "#rr-coach", "Coach etiquetado");
    cargarSelectCampo(cont, p, "VIDEO", "#rr-video", "Video etiquetado");
    cargarChips(cont, p, "PRESENTO_PLAN");
    cargarChips(cont, p, "ORIGEN");

    cont.querySelector("#rr-guardar-nota").onclick = async (ev) => {
      const ta = cont.querySelector("#rr-nota");
      const txt = ta.value.trim();
      if (!txt) return;
      const soltar = ocupar(ev.target, "Guardando…");
      if (!soltar) return;
      const res = await pedir("nota", { personId: p.id, contenido: txt });
      soltar();
      if (res.ok) { ta.value = ""; toast("✅ Nota guardada"); }
      else toast("❌ " + res.error, 6000);
    };
  }

  /* Listas largas (video, coach) van en desplegable y no en chips: con quince
     botones la tarjeta se vuelve una pared y encontrar el que toca cuesta más que
     el dato que se guarda. Las opciones se bajan de Pipedrive, así que agregar o
     quitar un coach allá se refleja solo. */
  async function cargarSelectCampo(cont, p, campo, idSel, aviso) {
    const sel = cont.querySelector(idSel);
    if (!sel) return;
    const r = await pedir("opciones", { campo });
    if (!r.ok) { sel.innerHTML = `<option value="">No cargó: ${esc(r.error)}</option>`; return; }

    const actual = String(p.valores?.[campo] ?? "");
    sel.innerHTML = '<option value="">— sin definir —</option>' +
      r.data.map((o) => `<option value="${esc(o.id)}"${o.id === actual ? " selected" : ""}>${esc(o.label)}</option>`).join("");

    sel.onchange = async () => {
      if (!sel.value) return;
      sel.disabled = true;
      const res = await pedir("etiquetar", { personId: p.id, campos: { [campo]: sel.value } });
      sel.disabled = false;
      if (res.ok) {
        if (p.valores) p.valores[campo] = sel.value;
        toast("✅ " + aviso);
      } else toast("❌ " + res.error, 6000);
    };
  }


  /* ---------- refresco ---------- */

  async function refrescar() {
    if (!panel.classList.contains("abierto")) return;

    const gen = ++generacion;   // invalida cualquier pintado en vuelo
    ficha = null;
    personaPd = null;
    ["rr-ficha", "rr-crm", "rr-datos", "rr-agendar"].forEach((id) => nota(id, ""));
    ctxChat = chatActual();
    // Si la asesora corrigio el nombre a mano, esa correccion vale para ESE chat y
    // no para el siguiente: sin esto, el saludo del chat anterior viajaba al nuevo.
    panel.querySelector("#rr-v-nombre")?.removeAttribute("data-tocado");

    // Lo mismo con el Día: al agendar a varios días se agrega una opción con la
    // fecha concreta ("el vie 9/10") y quedaba seleccionada en el chat siguiente.
    // Un recordatorio con la fecha de otra persona es justo lo que este selector
    // vino a evitar.
    const selDiaPrev = panel.querySelector("#rr-v-dia");
    if (selDiaPrev) {
      [...selDiaPrev.options].forEach((o) => { if (o.dataset.extra) o.remove(); });
      selDiaPrev.value = "mañana";
    }

    const t0 = performance.now();

    try {
      /* Se pinta el nombre del chat nuevo YA, antes de ir a buscar nada. Si no, el
         panel se queda mostrando la ficha del chat anterior mientras lee y busca
         —varios segundos— y parece que el panel se colgó o, peor, que esa ficha es
         de la persona que acabas de abrir. */
      if (ctxChat && !ctxChat.esGrupo) {
        ["rr-crm", "rr-datos", "rr-agendar"].forEach((id) => {
          const c = panel.querySelector("#" + id);
          if (c) c.innerHTML = "";
        });
        panel.querySelector("#rr-ficha").innerHTML = tarjeta("Contacto",
          `<div class="rr-nombre">${esc(ctxChat.titulo || "Sin nombre")}</div>
           <p class="rr-aviso">Buscando su información…</p>`);
      }

      /* WhatsApp dejó de publicar el número en el DOM, así que si el chat no lo trae
         se lee de "Info. del contacto" antes de buscar nada: de ese número dependen
         la ficha de Apps Fit, la búsqueda en Pipedrive y Agendar. Una sola vez por
         chat, y nunca con un mensaje a medio escribir. */
      if (ctxChat && !ctxChat.esGrupo && !ctxChat.telefono && !telManual &&
          infoIntentada !== ctxChat.titulo) {
        infoIntentada = ctxChat.titulo;

        // Primero por dentro: instantáneo y sin abrir nada.
        const dentro = await chatDesdeWhatsApp();
        if (gen !== generacion) return;
        if (dentro && dentro.telefono) telManual = dentro.telefono;

        // Si WhatsApp no lo soltó, el método viejo. Ése sí abre el panel de info,
        // así que se respeta un mensaje a medio escribir.
        if (!telManual && !escribiendoAlgo()) {
          const { tel } = await numeroDesdeInfo();
          if (gen !== generacion) return;
          if (tel) telManual = tel;
        }
      }

      /* Los dos viajes arrancan JUNTOS cuando ya hay número: Apps Fit busca por
         teléfono y Pipedrive también, así que ninguno necesita el resultado del otro.
         En fila costaban el doble de espera en cada cambio de chat.

         Sin número sí se espera la ficha: ahí el único modo de buscar en Pipedrive es
         por nombre, y el nombre real del socio busca mucho mejor que el alias del
         chat ("Flaco gym 💪"). */
      const telYa = telDeEstaPersona();
      const crmEnVuelo = (ctxChat && !ctxChat.esGrupo && telYa)
        ? pedir("buscarPd", { telefono: telYa, nombre: ctxChat.titulo })
        : null;

      await pintarFicha(gen);
      if (gen !== generacion) return;

      if (ctxChat && !ctxChat.esGrupo) {
        pintarPlantillas();
        await pintarCrm(gen, crmEnVuelo);
        if (gen !== generacion) return;
        pintarAgendar();        // va después: necesita saber si hay ficha en el CRM
        pintarDatos();          // idem: sin ficha no hay nada que editar
        // Las plantillas se pintaron antes de saber si tiene cita agendada: ahora
        // que se sabe, se recalcula cuáles sugerir.
        panel.querySelector("#rr-plantillas")?._repartir?.();

        /* Si el chat tardó en armarse, se dice CUÁNTO. Sin esto, "está lento" es una
           sensación que no se puede perseguir: con el número se sabe si fue el
           internet de ese momento o algo del panel, y se puede comparar entre PCs.
           Solo aparece cuando de verdad tardó; en lo normal no se ve nada. */
        const ms = Math.round(performance.now() - t0);
        if (ms > 1800) nota("rr-ficha", `tardó ${(ms / 1000).toFixed(1)} s`);
      } else {
        // En un grupo no se ofrecen plantillas: mandar "tu plan vence el…" a un
        // grupo de WhatsApp es peor que no tener panel.
        const pl = panel.querySelector("#rr-plantillas");
        pl.innerHTML = "";
        pl.removeAttribute("data-listo");
        panel.querySelector("#rr-crm").innerHTML = "";
        panel.querySelector("#rr-datos").innerHTML = "";
        panel.querySelector("#rr-agendar").innerHTML = "";
      }
    } catch (e) {
      panel.querySelector("#rr-ficha").innerHTML = tarjeta("Contacto",
        `<p class="rr-error">${esc(e.message || "Algo falló")}</p>
         <p class="rr-aviso">Si acabas de recargar la extensión, recarga WhatsApp Web (F5).</p>`);
    }
  }

  // Detecta el cambio de chat. El número escrito a mano queda fuera de la firma a
  // propósito: si entrara, el panel se repintaría mientras se teclea.
  let firmaPrev = null;
  setInterval(() => {
    if (!panel.classList.contains("abierto")) return;
    const c = chatActual();
    const firma = c ? `${c.titulo}|${c.telefono}` : "";
    if (firma === firmaPrev) return;

    // Ya pintamos ESTE chat con número y ahora viene sin él: es un parpadeo del DOM
    // (WhatsApp rearma la lista de mensajes al hacer scroll). Se ignora para no
    // perder un número que ya teníamos.
    if (c && !c.telefono && firmaPrev !== null && firmaPrev.startsWith(`${c.titulo}|`)) return;

    firmaPrev = firma;
    telManual = "";
    refrescar();
  }, 900);

  // Calienta la lista de socios apenas carga WhatsApp, para que la primera ficha
  // no tenga que esperar la descarga completa de la cartera.
  setTimeout(() => pedir("activos").catch(() => {}), 4000);

  // Alt+R y no Ctrl+Shift+R: ese último lo intercepta Chrome y recarga la página.
  document.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "r") {
      e.preventDefault();
      tab.click();
    }
  });
})();

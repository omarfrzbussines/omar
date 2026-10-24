/* RURUSH — service worker.
   Único punto que habla con Apps Fit y Pipedrive: así los tokens nunca llegan a
   la página web y no hay problemas de CORS desde los content scripts. */

const VERSION_SW = "1.26.2";   // sube con el manifest: sirve para saber qué motor corre
const APPSFIT_BASE   = "https://webapiappsfit-cliente.azurewebsites.net";
const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

// IDs de los campos personalizados de Person en Pipedrive.
// Las opciones de cada uno están en content/wa.js (OPC): si se agrega una
// categoría allá sin su ID acá, etiquetar falla a gritos (ver pdEtiquetar).
const PD_FIELDS = {
  // ASISTE se quitó: ese ID es el campo LLAMADA, y la asistencia al free pass no se
  // guarda en ningún campo — se registra marcando la actividad como hecha (citaHecha).
  CIERRE:        "33b8be2e235bd672060ee054b04372be13b53f52",
  PRESENTO_PLAN: "7de502a12cd072ed8904fc783228913fa16a0e29",
  ORIGEN:        "54b4903fda8f4635e2a679b3367f73bbcfba0886",
  VIDEO:         "fc33a951e60d1b49959af6eaadd44cc21b19d793",
  COACH_FP:      "9e850eece75b5e1d9ed9b4e61e8643a57e1d4b70"
};

// Los campos de la seccion "Datos del socio". Se buscan por NOMBRE y no por hash
// a proposito: asi Omar puede renombrar, reordenar o agregar opciones en Pipedrive
// sin que haya que tocar la extension. Son pocos y no veinte porque un formulario
// largo se llena a medias, y una ficha a medio llenar es peor que ninguna: se
// decide igual con ella.
const DATOS_CAMPOS = [
  { id: "OBJETIVO",  nombre: "OBJETIVO",            etiqueta: "Objetivo" },
  { id: "DISTRITO",  nombre: "DISTRITO",            etiqueta: "Distrito" },
  { id: "SEXO",      nombre: "SEXO",                etiqueta: "Sexo" },
  { id: "NACE",      nombre: "FECHA DE NACIMIENTO", etiqueta: "Fecha de nacimiento" },
  { id: "EDAD",      nombre: "EDAD",                etiqueta: "Edad", ayuda: "28", entero: true },
  { id: "OCUPACION", nombre: "OCUPACION",           etiqueta: "Ocupación" },
  { id: "LESION",    nombre: "LESION",              etiqueta: "Lesión / cuidado" },
  { id: "PESO",      nombre: "PESO",                etiqueta: "Peso (kg)", ayuda: "72" },
  { id: "ESTATURA",  nombre: "ESTATURA",            etiqueta: "Estatura (m)", ayuda: "1.72" },
  // DNI en Pipedrive es un campo numerico (tipo double, id 9077). Se escribe como
  // texto para que no salga el selector de flechitas ni acepte decimales, y el
  // background lo convierte a numero antes de mandarlo.
  { id: "DNI",       nombre: "DNI",                 etiqueta: "DNI", ayuda: "70385154", entero: true }
];

const MIN = 60 * 1000;

/* ---------- utilidades ---------- */

const pad = (n) => String(n).padStart(2, "0");

// Hoy en Lima (UTC-5; Perú no cambia de hora).
function hoyLima(offsetDias = 0) {
  const d = new Date(Date.now() - 5 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + offsetDias);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Días entre hoy (Lima) y una fecha. Positivo = falta, negativo = ya pasó.
function diasHasta(iso) {
  if (!iso) return null;
  const a = new Date(hoyLima() + "T00:00:00Z");
  const b = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

// Últimos 9 dígitos: la única forma fiable de cruzar celulares peruanos.
function tel9(v) {
  const d = String(v || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : "";
}

const normNombre = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Los datos de socios van a storage.session: viven en memoria y mueren al cerrar
// Chrome. En storage.local quedarían en disco DNI, celulares y saldos de todos.
const cacheGet = (k) => chrome.storage.session.get(k).then((o) => o[k]);
const cacheSet = (k, v) => chrome.storage.session.set({ [k]: v });


/* ---------- asesoras ----------
   Apps Fit guarda dos campos y NO significan lo mismo:
     Vendedor          = quien vendió el plan. Poblado en el 100% de la cartera.
     VendedorRepartido = a quién se le repartió después. Poblado en ~23% y con
                         gente que ya no está en el equipo.
   Por eso la asesora que se muestra es Vendedor; el repartido va aparte y solo
   cuando existe, para que se note que ese campo está desactualizado. */
const ASESORAS = {
  monica10da: "MÓNICA", monica03: "MÓNICA", monica: "MÓNICA",
  laura31: "LAURA", danna123: "DANNA", dilan24: "DILAN",
  omarfrz10: "OMAR",
  valeria22: "VALERIA", gustavo: "GUSTAVO", erik: "ERIK", omar: "OMAR"
};
const nombreAsesora = (cod) => {
  const c = String(cod || "").trim();
  if (!c) return "SIN ASIGNAR";
  return ASESORAS[c.toLowerCase()] || c.toUpperCase();
};

/* ---------- Apps Fit ---------- */

let authEnVuelo = null;   // evita dos POST /auth a la vez (el 2º invalida al 1º)

async function appsfitBearer(forzar = false) {
  if (!forzar) {
    const c = await cacheGet("bearer");
    if (c && c.exp > Date.now()) return c.token;
  }
  if (authEnVuelo) return authEnVuelo;

  authEnVuelo = (async () => {
    const { appsfitToken } = await chrome.storage.local.get("appsfitToken");
    if (!appsfitToken) throw new Error("Falta el TokenEmpresa de Apps Fit (ve a Opciones).");

    const r = await fetch(`${APPSFIT_BASE}/api/managements/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ TokenEmpresa: appsfitToken })
    });
    if (!r.ok) throw new Error(`Apps Fit respondió ${r.status} al autenticar.`);

    const j = await r.json();
    if (!j?.Success || !j.Item?.Token) throw new Error("Apps Fit rechazó el TokenEmpresa.");

    // El token dura ~24h; lo damos por bueno 20h para no re-autenticar a cada rato.
    await cacheSet("bearer", { token: j.Item.Token, exp: Date.now() + 20 * 3600 * 1000 });
    return j.Item.Token;
  })().finally(() => { authEnVuelo = null; });

  return authEnVuelo;
}

// OJO: la clave de la lista es "cutomers" — typo del propio API, no lo corrijas.
async function appsfitCustomers({ type_date = 1, date_from, date_to }, reintento = 0) {
  const porLlave = !!(await proxyCfg());
  // En modo llave el bearer lo saca y lo renueva el intermediario; acá no hay
  // TokenEmpresa que pedir.
  const token = porLlave ? null : await appsfitBearer();
  const out = [];
  let page = 1, pages = 1;

  do {
    if (porLlave) {
      const j = await proxyPedir({
        recurso: "af", page: String(page), type_date: String(type_date),
        date_from, date_to, with_frostbite: "0"
      });
      out.push(...(j?.Item?.cutomers || []));
      pages = j?.Item?.paging?.pages || 1;
      page++;
      continue;
    }

    const qs = new URLSearchParams({
      page: String(page), type_date: String(type_date), date_from, date_to, with_frostbite: "0"
    });
    const r = await fetch(`${APPSFIT_BASE}/api/managements/customers?${qs}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (r.status === 401) {
      // Un solo reintento: sin tope, un token revocado deja el service worker
      // en bucle infinito y el panel cargando para siempre.
      if (reintento >= 1) throw new Error("Apps Fit sigue rechazando el token. Revísalo en Opciones.");
      await appsfitBearer(true);
      return appsfitCustomers({ type_date, date_from, date_to }, reintento + 1);
    }
    // Sin esto, un 500 con HTML dentro revienta en r.json() y la asesora ve
    // "Unexpected token '<'" en el panel.
    if (!r.ok) throw new Error(`Apps Fit respondió ${r.status}.`);

    const j = await r.json();
    out.push(...(j?.Item?.cutomers || []));
    pages = j?.Item?.paging?.pages || 1;
    page++;
  } while (page <= pages);

  return out;
}

// Lista completa de socios con plan vigente, cacheada 30 min.
// Nunca se usa ?search=<numero>: devuelve 0 aunque la persona SÍ sea socia.
let activosEnVuelo = null;

/* La cartera completa de Apps Fit, con caché de 30 min.

   Vencido el caché NO se hace esperar a la asesora: se le entrega la lista vieja al
   instante y la nueva se baja por detrás. Antes, el primer chat después de media
   hora sin usar el panel pagaba la descarga entera de la cartera —y eso pasa varias
   veces al día, porque se trabaja a ratos. La diferencia real de frescura es de
   segundos; la de espera, de la descarga completa.

   Con "Refrescar" (forzar) sí se espera: ahí lo que se pidió es justamente el dato
   nuevo. */
async function sociosActivos(forzar = false) {
  const c = await cacheGet("activos");
  if (!forzar && c && c.exp > Date.now()) return c.data;

  const bajar = () => {
    if (activosEnVuelo) return activosEnVuelo;   // dos chats a la vez = una descarga
    activosEnVuelo = (async () => {
      const data = await appsfitCustomers({ type_date: 1, date_from: hoyLima(), date_to: "2099-12-31" });
      await cacheSet("activos", { data, exp: Date.now() + 30 * MIN });
      return data;
    })().finally(() => { activosEnVuelo = null; });
    return activosEnVuelo;
  };

  if (!forzar && c && c.data) { bajar().catch(() => {}); return c.data; }
  return bajar();
}

async function fichaPorTelefono({ telefono, nombre }) {
  const objetivo = tel9(telefono);
  const activos = await sociosActivos();
  let s = null;

  if (objetivo) {
    s = activos.find((c) => tel9(c.Celular) === objetivo || tel9(c.Telefono) === objetivo);
  }

  // Cruce por nombre, solo cuando no hay número. Exige coincidir en nombre Y
  // apellido: con solo el nombre de pila, "Ana Torres" traía la ficha de
  // "Ana Quispe" y la asesora le mandaba el vencimiento de otra persona.
  if (!s && nombre && !/^\+?[\d\s()-]+$/.test(nombre)) {
    const q = normNombre(nombre);
    const toks = q.split(/\s+/).filter((t) => t.length > 2);
    if (toks.length >= 2) {
      const cands = activos.filter((c) => {
        const full = normNombre(`${c.Nombres} ${c.Apellidos}`);
        if (full === q) return true;
        return toks.filter((t) => full.includes(t)).length >= 2;
      });
      if (cands.length === 1) s = cands[0];   // ante la duda, no se adivina
    }
  }

  return s ? fichaDe(s) : null;
}

// Todo lo que el API entrega por socio, ya interpretado.
function fichaDe(s) {
  const diasDesde = (d) => (d ? -diasHasta(d) : null);

  // UltimaAsistencia llega como "2026-07-11 11:38"
  const ua = s.UltimaAsistencia ? String(s.UltimaAsistencia).replace(" ", "T") : null;
  const diasSinAsistir = ua ? diasDesde(ua.slice(0, 10)) : null;

  const usadas    = Number(s.TotalAsistencia ?? s.NroIngresoActual ?? 0);
  const incluidas = Number(s.TotalSesion ?? s.NroIngresos ?? 0);
  const aprovecha = incluidas > 0 ? Math.round((usadas / incluidas) * 100) : null;

  const diasDePlan = s.FechaInicio ? Math.max(diasDesde(String(s.FechaInicio).slice(0, 10)), 1) : null;
  const porSemana  = diasDePlan ? +(usadas / (diasDePlan / 7)).toFixed(1) : null;

  // El corte de 10 días no es arbitrario: por encima, la renovación cae del 50%
  // al 11% (medido sobre la cola de julio 2026, n=214).
  let temperatura = null;
  if (diasSinAsistir !== null) {
    temperatura = diasSinAsistir <= 10
      ? { estado: "CALIENTE", icono: "🔥", renueva: "50%" }
      : { estado: "FRÍO", icono: "🧊", renueva: "11%" };
  }

  return {
    esSocio: true,
    codigo: s.CodigoSocio,
    nombre: `${s.Nombres || ""} ${s.Apellidos || ""}`.trim(),
    plan: s.desTiempoPaquete,
    tipoVenta: s.DesTipoVenta,
    inicio: (s.FechaInicio || "").slice(0, 10),
    fin: (s.FechaFin || "").slice(0, 10),
    diasRestantes: diasHasta(s.FechaFin),
    clasesUsadas: usadas,
    clasesIncluidas: incluidas,
    aprovecha,
    porSemana,
    ultimaAsistencia: ua ? ua.slice(0, 16).replace("T", " ") : null,
    diasSinAsistir,
    temperatura,
    // Solo Vendedor. VendedorRepartido está poblado en ~23% de la cartera y apunta
    // a gente que ya no está: mostrarlo confundía más de lo que ayudaba.
    asesora: nombreAsesora(s.Vendedor),
    origen: s.NombreOrigen,
    celular: tel9(s.Celular),
    costo: Number(s.Costo) || 0,
    pagado: Number(s.Pago) || 0,
    saldo: (Number(s.Costo) || 0) - (Number(s.Pago) || 0)
  };
}

// De la fecha/hora UTC que guarda Pipedrive, de vuelta a Lima. Confundir esto es
// lo que hace que un free pass de las 9am se anuncie como "9pm".
function aLima(dueDate, dueTime) {
  if (!dueDate) return null;
  if (!dueTime) return { fecha: String(dueDate).slice(0, 10), hora: "" };   // cita de día entero
  const u = new Date(`${String(dueDate).slice(0, 10)}T${String(dueTime).slice(0, 5)}:00Z`);
  if (isNaN(u)) return null;
  const l = new Date(u.getTime() - 5 * 3600 * 1000);
  return {
    fecha: `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`,
    hora: `${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`
  };
}

/* ---------- intermediario ----------
   Dos modos, misma extensión:

     MODO DIRECTO   — la PC de Omar. Los tokens están acá y se habla con Pipedrive
                      y Apps Fit sin intermediarios. Es el más rápido y no depende
                      de nada más.
     MODO LLAVE     — las PC de las asesoras. Acá NO hay tokens: solo una llave que
                      apunta al Apps Script de Omar, que es quien los guarda. Si
                      alguien copia la extensión, se lleva una llave que se revoca
                      en diez segundos y que solo sirve para lo que el panel ya hace.

   Es lo mismo que hace Pipechat: la credencial vive en el servidor, no en el
   navegador de quien la usa. */

async function proxyCfg() {
  const { proxyUrl, proxyLlave } = await chrome.storage.local.get(["proxyUrl", "proxyLlave"]);
  return (proxyUrl && proxyLlave) ? { url: proxyUrl, llave: proxyLlave } : null;
}

// Todo por GET y sin cookies. Con las cookies de Google del navegador,
// Apps Script devuelve una pantalla intermedia en vez de datos.
async function proxyPedir(params) {
  const cfg = await proxyCfg();
  if (!cfg) throw new Error("Falta configurar la llave (ve a Opciones).");

  const qs = new URLSearchParams({ ...params, llave: cfg.llave });
  const destino = `${cfg.url}?${qs}`;
  // Apps Script corta las URL largas. Mejor avisar con nombre y apellido que
  // dejar que vuelva un error de Google que no dice nada.
  if (destino.length > 7500) throw new Error("El texto es muy largo para enviarlo. Acórtalo y reinténtalo.");

  // Apps Script devuelve 404 o 500 de a ratos mientras despierta, y a veces tarda
  // varios segundos en responder. Un reintento tapa casi todos esos casos; sin él,
  // la asesora ve "respondió 404" sin que nada esté roto.
  // Solo se reintenta lo que se puede repetir sin consecuencias: una consulta (GET)
  // o un fallo de red. Un alta o un etiquetado NO se repiten solos — podría haberse
  // guardado y quedarían dos.
  const repetible = !params.metodo || String(params.metodo).toUpperCase() === "GET";

  let r = null, fallo = null;
  for (let intento = 0; intento < (repetible ? 2 : 1); intento++) {
    if (intento) await new Promise((res) => setTimeout(res, 900));
    try {
      r = await fetch(destino, { redirect: "follow", credentials: "omit" });
      if (r.ok) { fallo = null; break; }
      fallo = `El intermediario respondió ${r.status}.`;
      if (r.status !== 404 && r.status !== 429 && r.status < 500) break;   // ese no mejora repitiendo
    } catch (e) {
      fallo = "No se pudo llegar al intermediario.";
    }
  }
  if (fallo) throw new Error(fallo);

  const texto = await r.text();
  let j;
  try { j = JSON.parse(texto); }
  catch {
    if (/^\s*<!DOCTYPE|^\s*<html/i.test(texto))
      throw new Error("El intermediario devolvió una página web en vez de datos. Vuelve a implementarlo (Nueva versión).");
    throw new Error("Respuesta rara del intermediario: " + texto.slice(0, 80));
  }
  if (!j.ok) throw new Error(j.error || "Error del intermediario");
  return j.data;
}

/* ---------- Pipedrive ---------- */

async function pd(path, { method = "GET", body = null } = {}) {
  // Con llave configurada el token ni se busca: no está en esta computadora.
  if (await proxyCfg()) {
    const j = await proxyPedir({
      recurso: "pd", metodo: method, ruta: path,
      ...(body ? { cuerpo: JSON.stringify(body) } : {})
    });
    if (j?.success === false) throw new Error(j?.error || "Pipedrive rechazó la operación.");
    return j?.data;
  }

  const { pipedriveToken } = await chrome.storage.local.get("pipedriveToken");
  if (!pipedriveToken) throw new Error("Falta el API token de Pipedrive (ve a Opciones).");

  // Por cabecera, no en la URL: en la query string el token queda en cualquier
  // log o traza de error que incluya la dirección.
  const r = await fetch(`${PIPEDRIVE_BASE}${path}`, {
    method,
    headers: {
      "x-api-token": pipedriveToken,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : null
  });

  let j = null;
  try { j = await r.json(); } catch { /* respuesta sin JSON */ }

  if (!r.ok || j?.success === false) {
    if (r.status === 401) throw new Error("Pipedrive rechazó el token. Revísalo en Opciones.");
    throw new Error(j?.error || `Pipedrive respondió ${r.status}.`);
  }
  return j?.data;
}

// Devuelve las fichas candidatas con los valores que ya tienen guardados, para
// que los chips del panel muestren lo que ya se etiquetó antes.
/* Un titulo de WhatsApp sirve para buscar por nombre solo si de verdad parece un
   nombre. Sin este filtro, un chat guardado como "JL" disparaba una busqueda por
   nombre que devolvia 8 fichas sin relacion (JLo, JLion, Jlandaaa...) y el panel
   las ofrecia como si fueran la persona. Mejor no encontrar nada y pedir el
   numero, que ofrecer ocho candidatos equivocados. */
function sirveParaBuscarPorNombre(nombre) {
  const n = String(nombre || "").trim();
  if (!n) return false;
  if (/^\+?[\d\s()-]+$/.test(n)) return false;          // es un numero, no un nombre
  const letras = (n.match(/\p{L}/gu) || []).length;
  if (letras < 5) return false;                           // "JL", "JLo", "Ana"
  return true;
}

async function pdBuscarPersona({ telefono, nombre }) {
  const t9 = tel9(telefono);
  let items = [];
  let porNombre = false;                                  // de donde salio el match

  if (t9) {
    const r = await pd(`/persons/search?term=${encodeURIComponent(t9)}&fields=phone&limit=10`);
    items = r?.items || [];
  }
  if (!items.length && sirveParaBuscarPorNombre(nombre)) {
    const r = await pd(`/persons/search?term=${encodeURIComponent(nombre)}&fields=name&limit=10`);
    items = r?.items || [];
    porNombre = items.length > 0;
  }

  // Ultimo recurso para los contactos que solo comparten su usuario (@fulano): al
  // guardarlos, el panel deja ese usuario escrito en una nota. Pipedrive busca
  // dentro de las notas, asi que el mismo chat vuelve a encontrar su ficha aunque
  // se haya guardado con el nombre real de la persona.
  if (!items.length && /^@[A-Za-z0-9._-]{2,}$/.test(String(nombre || "").trim())) {
    const r = await pd(`/persons/search?term=${encodeURIComponent(nombre.trim())}&fields=notes&limit=10`);
    items = r?.items || [];
    porNombre = items.length > 0;
  }

  const base = items.map((i) => ({
    id: i.item.id, nombre: i.item.name, telefonos: i.item.phones || [], porNombre
  }));

  // Solo se piden los detalles cuando hay una sola: con varias, el panel obliga a
  // elegir antes de etiquetar, así que no hace falta el viaje extra.
  if (base.length === 1) {
    try {
      // Los dos viajes van JUNTOS y no en fila: las actividades solo necesitan el id,
      // que ya se sabe desde la busqueda. En fila costaban ~250 ms de mas por chat,
      // y eso es justo lo que se siente al cambiar de conversacion.
      const [full, proxima] = await Promise.all([
        pd(`/persons/${base[0].id}`),
        proximaCita(base[0].id)
      ]);
      base[0].valores = {};
      for (const [campo, key] of Object.entries(PD_FIELDS)) {
        if (full?.[key] !== undefined && full[key] !== null) base[0].valores[campo] = String(full[key]);
      }
      base[0].proxima = proxima;
    } catch { /* si falla, los chips salen en blanco y ya */ }
  }
  return base;
}

// La próxima cita pendiente de esa persona, para que el panel no deje agendar a
// ciegas encima de una que ya existe.
/* El próximo FREE PASS de la persona. Solo eso.

   Antes se usaba full.next_activity_id, y Pipedrive devuelve ahí la próxima
   actividad PENDIENTE sin importar su tipo: con una llamada "NUEVO LEAD" y un free
   pass el mismo día, elegía la llamada y el free pass no aparecía. Ahora se piden
   todas las pendientes de esa persona y se filtra el free pass; las llamadas, las
   tareas y las citas de nutrición se ignoran — para eso está Pipedrive.

   Se prefiere la más cercana de hoy en adelante; si no hay, la última que ya pasó
   dentro de los últimos 14 días (ésa es la que toca reagendar). Más atrás no se
   mira: hay fichas con decenas de clases de 2022 sin marcar y mostrarlas sería
   ruido disfrazado de pendiente. */
async function proximaCita(id) {
  if (!id) return null;

  try {
    const acts = await pd(`/persons/${id}/activities?done=0&limit=100`);
    // Solo meeting: así se crean los free pass (agendarFp usa type "meeting"). La
    // nutrición se crea como "deadline" y queda fuera a propósito — este aviso es
    // del free pass, y mezclar las dos citas acá confunde dos procesos distintos.
    const esFreePass = (a) => a.type === "meeting" && !/nutri/i.test(a.subject || "");

    const hoy = hoyLima();
    const limite = hoyLima(-14);
    const cand = [];

    for (const a of acts || []) {
      if (a.done || !esFreePass(a)) continue;
      const l = aLima(a.due_date, a.due_time);
      if (!l) continue;
      cand.push({ id: a.id, fecha: l.fecha, hora: l.hora,
                  asunto: String(a.subject || ""), tipo: String(a.type || "") });
    }
    if (!cand.length) return null;

    const orden = (x) => `${x.fecha} ${x.hora || "00:00"}`;
    const proximas = cand.filter((x) => x.fecha >= hoy).sort((a, b) => orden(a).localeCompare(orden(b)));
    if (proximas.length) return proximas[0];

    const pasadas = cand.filter((x) => x.fecha >= limite).sort((a, b) => orden(b).localeCompare(orden(a)));
    return pasadas[0] || null;
  } catch { return null; }   // sin cita visible se sigue igual: es un aviso, no un requisito
}

// Etiquetas y proxima cita de UNA ficha. Hace falta cuando hay duplicados: ahi la
// busqueda devuelve las fichas peladas y hasta que no se elige una no se sabe
// cual pedir.
async function pdDetalle({ personId }) {
  if (!personId) throw new Error("Falta la ficha.");
  const [full, proxima] = await Promise.all([
    pd(`/persons/${personId}`),
    proximaCita(personId)
  ]);

  const valores = {};
  for (const [campo, key] of Object.entries(PD_FIELDS)) {
    if (full?.[key] !== undefined && full[key] !== null) valores[campo] = String(full[key]);
  }
  return { valores, proxima, nombre: full?.name || "" };
}

const pdCrearPersona = ({ nombre, telefono }) => {
  const body = { name: nombre };
  // Sin numero se crea igual: los contactos que solo comparten su usuario de
  // WhatsApp no tienen uno, y una ficha con nombre vale mas que ninguna. Lo que no
  // se manda es un phone vacio, que deja el campo en blanco y ensucia la busqueda.
  const t = String(telefono || "").replace(/\D/g, "");
  if (t) body.phone = [t];
  return pd("/persons", { method: "POST", body });
};


/* Marca la cita como hecha — y eso ES la asistencia.

   Así trabaja Omar: cuando la persona viene al free pass, él marca la actividad
   como hecha en Pipedrive, se inscriba o no. Los reportes del embudo y el panel de
   no-shows leen ese mismo campo. Por eso la asistencia NO va en un campo aparte:
   duplicarla crearía dos verdades y tarde o temprano dirían cosas distintas. */
const citaHecha = ({ actividadId, hecha }) => {
  if (!actividadId) throw new Error("Falta la cita.");
  return pd(`/activities/${actividadId}`, { method: "PUT", body: { done: hecha ? 1 : 0 } });
};

function pdEtiquetar({ personId, campos }) {
  const body = {};
  for (const [k, v] of Object.entries(campos)) {
    // Falla ruidosamente: antes, una categoría sin ID se descartaba en silencio,
    // el chip se ponía verde y no se había guardado nada.
    if (!PD_FIELDS[k]) throw new Error(`El campo "${k}" no tiene ID configurado (background.js → PD_FIELDS).`);
    body[PD_FIELDS[k]] = v;
  }
  if (!Object.keys(body).length) throw new Error("No hay nada que etiquetar.");
  return pd(`/persons/${personId}`, { method: "PUT", body });
}

// Las opciones del campo Video (los creativos de Meta) cambian cada mes, así que
// se leen del CRM en vez de tenerlas escritas aquí. Cacheadas 6h.
/* La lista de campos de Persona, pedida UNA sola vez.

   Pesa 48 KB y tarda ~1 s, y se necesitaba en cinco sitios distintos (las cuatro
   listas de opciones del panel y los datos del socio). Cada uno la pedía por su
   cuenta: 241 KB y cinco viajes por cada arranque en frío, para leer cinco campos
   del mismo archivo. Además salían las cinco a la vez, así que ni siquiera se
   aprovechaban entre ellas.

   Ahora: caché de 6 h —cambia casi nunca— y, si ya hay una petición en vuelo, las
   demás esperan a ésa en vez de disparar otra. */
let camposEnVuelo = null;

async function camposPersona(forzar = false) {
  const clave = "personFields_" + VERSION_SW;
  if (!forzar) {
    const c = await cacheGet(clave);
    if (c && c.exp > Date.now()) return c.data;
    if (camposEnVuelo) return camposEnVuelo;
  }
  const trabajo = (async () => {
    const campos = await pd("/personFields?limit=500");
    await cacheSet(clave, { data: campos, exp: Date.now() + 6 * 3600 * 1000 });
    return campos;
  })();
  if (!forzar) camposEnVuelo = trabajo.finally(() => { camposEnVuelo = null; });
  return trabajo;
}

// Se llama tras crear una opción nueva: si no, el panel seguiría mostrando la lista
// vieja hasta que venza el caché.
async function olvidarCampos(campo) {
  await cacheSet("personFields_" + VERSION_SW, { data: null, exp: 0 });
  await cacheSet("datosDef_" + VERSION_SW, { data: null, exp: 0 });
  if (campo) await cacheSet("opciones_" + campo, { data: null, exp: 0 });
}

async function opcionesCampo({ campo }) {
  const key = PD_FIELDS[campo];
  if (!key) throw new Error(`Campo desconocido: ${campo}`);

  const c = await cacheGet("opciones_" + campo);
  if (c && c.exp > Date.now()) return c.data;

  const campos = await camposPersona();
  const f = (campos || []).find((x) => x.key === key);
  const data = (f?.options || [])
    .map((o) => ({ id: String(o.id), label: String(o.label) }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  await cacheSet("opciones_" + campo, { data, exp: Date.now() + 6 * 3600 * 1000 });
  return data;
}

/* ---------- datos del socio ----------
   Definicion de los 8 campos leida del propio CRM: tipo (enum / date / numero /
   texto) y, para los enum, sus opciones con el ID que espera la API. Cacheada 6h
   porque casi nunca cambia y cada consulta a /personFields trae 55 campos. */
async function datosDef() {
  const c = await cacheGet("datosDef_" + VERSION_SW);
  if (c && c.exp > Date.now()) return c.data;

  const campos = await camposPersona();
  const porNombre = new Map();
  for (const f of campos || []) porNombre.set(sinTildes(f.name), f);

  const data = [], faltan = [];
  for (const d of DATOS_CAMPOS) {
    const f = porNombre.get(sinTildes(d.nombre));
    // Si alguien borra o renombra un campo en Pipedrive se avisa en el panel, en
    // vez de mostrar el formulario con un hueco que nadie nota.
    if (!f) { faltan.push(d.nombre); continue; }
    data.push({
      id: d.id, etiqueta: d.etiqueta, key: f.key, tipo: f.field_type,
      ayuda: d.ayuda || "", entero: !!d.entero,
      opciones: (f.options || []).map((o) => ({ id: String(o.id), label: String(o.label) }))
    });
  }

  const out = { campos: data, faltan };
  await cacheSet("datosDef_" + VERSION_SW, { data: out, exp: Date.now() + 6 * 3600 * 1000 });
  return out;
}

/* Agrega una opción nueva a un desplegable de Pipedrive desde el panel.

   Existe porque DISTRITO es una lista cerrada: si la socia vive en un distrito que
   no está, la asesora no tiene dónde ponerlo y el campo queda vacío. Al escribirlo
   se crea la opción y queda para todas — así la lista crece con la realidad en vez
   de con lo que alguien adivinó al crear el campo.

   Se normaliza a MAYÚSCULAS sin espacios de más y se compara sin tildes antes de
   crear: sin eso, en un mes hay "Huanchaco", "huanchaco " y "HUANCHACO" como tres
   distritos distintos y el campo deja de servir para contar nada. */
async function opcionNueva({ campo, texto }) {
  const d = DATOS_CAMPOS.find((x) => x.id === campo);
  if (!d) throw new Error(`Campo desconocido: ${campo}`);

  const limpio = String(texto || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (limpio.length < 3)  throw new Error("Escríbelo completo, con al menos 3 letras.");
  if (limpio.length > 30) throw new Error("Demasiado largo (máximo 30 caracteres).");

  const campos = await camposPersona(true);
  const f = (campos || []).find((x) => sinTildes(x.name) === sinTildes(d.nombre));
  if (!f) throw new Error(`"${d.nombre}" ya no está en Pipedrive.`);
  if (f.field_type !== "enum") throw new Error(`"${d.nombre}" no es una lista de opciones.`);

  const igual = (a, b) => sinTildes(String(a)).toUpperCase() === sinTildes(String(b)).toUpperCase();
  const ya = (f.options || []).find((o) => igual(o.label, limpio));
  if (ya) return { id: String(ya.id), label: String(ya.label), yaExistia: true };

  const options = (f.options || []).map((o) => ({ id: o.id, label: o.label }));
  options.push({ label: limpio });
  const res = await pd(`/personFields/${f.id}`, { method: "PUT", body: { options } });

  const nueva = (res?.options || []).find((o) => igual(o.label, limpio));
  if (!nueva) throw new Error("Pipedrive aceptó el cambio pero no devolvió la opción nueva.");

  await olvidarCampos(campo);
  return { id: String(nueva.id), label: String(nueva.label), yaExistia: false };
}

async function datosLeer({ personId }) {
  if (!personId) throw new Error("Falta la ficha de Pipedrive.");
  const def = await datosDef();
  const p = await pd(`/persons/${personId}`);

  const valores = {};
  for (const c of def.campos) {
    const v = p?.[c.key];
    valores[c.id] = (v === null || v === undefined) ? "" : String(v);
  }
  return { campos: def.campos, faltan: def.faltan, valores,
           nombre: p?.name || "",
           telefono: ((p?.phone || [])[0]?.value || (p?.phone || [])[0] || "") };
}

async function datosGuardar({ personId, valores, nombre, telefono }) {
  if (!personId) throw new Error("Falta la ficha de Pipedrive.");
  const def = await datosDef();
  const porId = new Map(def.campos.map((c) => [c.id, c]));

  const body = {};

  /* Nombre y teléfono son campos nativos de la persona, no personalizados, pero
     viajan en el MISMO PUT que el resto: así un clic en "Guardar" guarda todo o no
     guarda nada, en vez de dejar el nombre puesto y los demás campos sin escribir
     porque la segunda llamada falló. */
  if (nombre !== undefined) {
    const n = String(nombre || "").trim();
    if (!n) throw new Error("El nombre no puede quedar vacío.");
    body.name = n;
  }
  if (telefono !== undefined) {
    const t = String(telefono || "").replace(/\D/g, "");
    if (t && t.length < 9) throw new Error("El número tiene que tener al menos 9 dígitos.");
    body.phone = t ? [t] : [];
  }
  for (const [id, v] of Object.entries(valores || {})) {
    const c = porId.get(id);
    // Mismo criterio que pdEtiquetar: un campo desconocido falla a gritos. Antes,
    // descartarlo en silencio dejaba el boton en verde sin haber guardado nada.
    if (!c) throw new Error(`El campo "${id}" ya no está en Pipedrive. Cierra y vuelve a abrir la sección.`);

    const txt = String(v ?? "").trim();
    if (txt === "") { body[c.key] = null; continue; }   // null borra el valor

    if (c.tipo === "double") {
      if (c.entero && !/^\d+$/.test(txt))
        throw new Error(`"${c.etiqueta}" solo admite dígitos, sin puntos ni espacios.`);
      // El campo DNI de Pipedrive es numérico, así que un DNI que empieza con 0 se
      // guardaría con 7 dígitos y quedaría mal para siempre — y con ese dato se
      // emiten las boletas. Mejor no dejarlo guardar y decir por qué.
      if (c.id === "DNI" && (txt.length !== 8 || txt[0] === "0"))
        throw new Error(txt[0] === "0"
          ? "Ese DNI empieza con 0 y el campo de Pipedrive es numérico: se guardaría sin el cero. Déjalo vacío y anótalo en una nota."
          : "El DNI debe tener 8 dígitos.");
      const n = Number(txt.replace(",", "."));          // "1,72" tambien vale
      if (!isFinite(n)) throw new Error(`"${c.etiqueta}" tiene que ser un número.`);
      body[c.key] = n;
    } else body[c.key] = txt;
  }

  if (!Object.keys(body).length) throw new Error("No hay nada que guardar.");
  await pd(`/persons/${personId}`, { method: "PUT", body });
  return { guardados: Object.keys(body).length };
}

const pdNota = ({ personId, contenido }) =>
  pd("/notes", { method: "POST", body: { person_id: personId, content: contenido } });


/* ---------- agendar ----------
   Pipedrive guarda due_time en UTC. Lima es -5 fijo, así que una cita de 7pm se
   guarda como 00:00 del día siguiente. Convertir mal es lo que hace que un free
   pass de la noche aparezca en el día equivocado. */
function aUtc(fechaLima, horaLima) {
  const [a, m, d] = fechaLima.split("-").map(Number);
  const [hh, mm] = horaLima.split(":").map(Number);
  const u = new Date(Date.UTC(a, m - 1, d, hh + 5, mm));
  return {
    due_date: `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}`,
    due_time: `${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}`
  };
}

/* El asunto se arma como "FP <ASESORA> <VIA>" y ese formato NO es decorativo:
   los reportes leen el 2º token para saber qué asesora agendó, y el 3º para saber
   por dónde entró la cita. Sin tildes, porque el parsing compara texto plano.
     APC = agendado por chat · APL = por llamada · APV = por visita           */
const VIA_FP = { chat: "APC", llamada: "APL", visita: "APV" };

const sinTildes = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

/* Una RETOMA no es un free pass y por eso NO lleva el prefijo FP.

   Es un ex alumno o un alumno con plan activo que dejó de venir y vuelve a clases.
   Si se escribiera "FP ...", todo lo que cuenta free pass —los reportes del embudo,
   el dashboard, los Apps Scripts del Sheet— la sumaría como una clase de prueba, y
   una retoma nunca "cierra" una venta nueva: bajaría la tasa de cierre del mes sin
   que nadie entienda por qué. Con prefijo propio queda registrada, se le puede
   marcar la asistencia igual, y no toca ninguna métrica de venta. */
const esRetoma = (asunto) => /^\s*RETOMA\b/i.test(String(asunto || ""));

function agendarFp({ personId, asesora, via, fecha, hora, tipo }) {
  if (!personId) throw new Error("Primero guarda el contacto en Pipedrive.");
  if (fecha < hoyLima()) throw new Error("Esa fecha ya pasó.");

  const sufijo = VIA_FP[via];
  if (!sufijo) throw new Error("Falta indicar si se agendó por chat, llamada o visita.");

  const prefijo = tipo === "retoma" ? "RETOMA" : "FP";
  const { due_date, due_time } = aUtc(fecha, hora);
  return pd("/activities", {
    method: "POST",
    body: {
      subject: `${prefijo} ${sinTildes(asesora) || "RURUSH"} ${sufijo}`,
      type: "meeting",
      person_id: personId,
      due_date, due_time, duration: "01:00"
    }
  });
}

// Cupos de nutrición ya tomados, para no ofrecer un horario ocupado.
async function cuposNutri({ desde, hasta }) {
  // Las citas se guardan en UTC, asi que las de 7pm y 7:30pm de Lima caen en el dia
  // siguiente. Sin este dia extra, los dos ultimos cupos del ultimo dia de la
  // ventana salian siempre libres y se agendaba encima de una cita existente.
  const tope = new Date(`${hasta}T00:00:00Z`);
  tope.setUTCDate(tope.getUTCDate() + 2);
  const hastaUtc = `${tope.getUTCFullYear()}-${pad(tope.getUTCMonth() + 1)}-${pad(tope.getUTCDate())}`;

  const data = await pd(`/activities?type=deadline&start_date=${desde}&end_date=${hastaUtc}&limit=200`);
  const ocupados = [];
  for (const a of data || []) {
    if (a.done || !a.due_time) continue;
    // De UTC de vuelta a Lima
    const u = new Date(`${a.due_date}T${a.due_time}:00Z`);
    const l = new Date(u.getTime() - 5 * 3600 * 1000);
    ocupados.push(`${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())} ${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`);
  }
  return ocupados;
}

function agendarNutri({ personId, nombre, fecha, hora }) {
  if (!personId) throw new Error("Primero crea la ficha del socio en Pipedrive.");
  const { due_date, due_time } = aUtc(fecha, hora);
  return pd("/activities", {
    method: "POST",
    body: {
      subject: `${nombre || ""} / Omar rurush - EVALUACIÓN NUTRICIONAL`.trim(),
      type: "deadline",
      person_id: personId,
      due_date, due_time, duration: "00:30"
    }
  });
}


/* ---------- dashboard del día ---------- */

// Pipedrive devuelve 0 cuando start_date = end_date, por eso se pide un rango y
// se filtra acá. Y due_time viene en UTC: hay que restar 5h para leerlo en Lima.
async function actividadesRango(desde, hasta) {
  const data = await pd(`/activities?type=meeting&start_date=${desde}&end_date=${hasta}&limit=200`);
  return (data || []).map((a) => {
    // Una actividad sin hora es de día completo: convertirla de zona la mandaría
    // al día anterior y aparecería como no-show de ayer.
    if (!a.due_time) {
      return { id: a.id, asunto: a.subject, persona: a.person_name, hecha: a.done,
               personId: a.person_id, fechaLima: a.due_date, horaLima: "—", sinHora: true };
    }
    const utc  = new Date(`${a.due_date}T${a.due_time}:00Z`);
    const lima = new Date(utc.getTime() - 5 * 3600 * 1000);
    return {
      id: a.id, asunto: a.subject, persona: a.person_name, hecha: a.done,
      personId: a.person_id, sinHora: false,
      fechaLima: `${lima.getUTCFullYear()}-${pad(lima.getUTCMonth() + 1)}-${pad(lima.getUTCDate())}`,
      horaLima: `${pad(lima.getUTCHours())}:${pad(lima.getUTCMinutes())}`
    };
  });
}

/* El asunto se arma "FP <ASESORA> <VIA>", y en la campaña de reactivación
   "FP REACT <ASESORA>". De ahí sale a quién pertenece cada free pass: no hay otro
   campo en la actividad que lo diga. */
function asesoraDeAsunto(asunto) {
  const t = String(asunto || "").trim().split(/\s+/);
  // RETOMA va igual que FP: la asesora es la palabra siguiente. Se reconoce acá
  // para que la retoma salga con nombre en el tablero; lo que NO hace es contarla
  // como free pass — de eso se encarga esRetoma() en el dashboard.
  if (!t.length || !/^(FP|RETOMA)$/i.test(t[0])) return "";
  const n = /^REACT$/i.test(t[1] || "") ? t[2] : t[1];
  return (n || "").toUpperCase();
}

/* Venta por asesora, leída del Sheet VENTAS 2026 a través del Apps Script.

   No se lee el Sheet directamente a propósito: eso exigiría meter una credencial
   de Google en las cuatro computadoras. Acá lo único que viaja es una URL y una
   llave que se da de baja en diez segundos si hace falta.

   Caché de 5 min: el dashboard se abre varias veces al día y el Apps Script tarda
   1-2 s; sin caché cada apertura esperaría de nuevo. */
async function ventasSheet({ forzar } = {}) {
  const { ventasUrl, ventasLlave } = await chrome.storage.local.get(["ventasUrl", "ventasLlave"]);
  if (!ventasUrl) throw new Error("Falta la URL de ventas (Opciones → Venta por asesora).");

  if (!forzar) {
    const c = await cacheGet("ventas");
    if (c && c.exp > Date.now()) return c.data;
  }

  const u = new URL(ventasUrl);
  if (ventasLlave) u.searchParams.set("llave", ventasLlave);

  // credentials "omit" es obligatorio: con las cookies de Google en la petición,
  // Apps Script devuelve una página HTML de "elige tu cuenta" en vez del JSON.
  const r = await fetch(u.toString(), { credentials: "omit", redirect: "follow" });
  const txt = await r.text();

  let j;
  try { j = JSON.parse(txt); }
  catch {
    throw new Error(/<html/i.test(txt)
      ? "El Apps Script respondió una página en vez de datos. Revisa que esté implementado con acceso «Cualquier usuario»."
      : "Respuesta inesperada del Apps Script.");
  }
  if (!j.ok) throw new Error(j.error || "El Apps Script devolvió un error.");

  await cacheSet("ventas", { data: j.data, exp: Date.now() + 5 * 60 * 1000 });
  return j.data;
}

async function dashboard() {
  const hoy = hoyLima(), ayer = hoyLima(-1), limite = hoyLima(7);
  const res = { fecha: hoy, errores: [] };

  try {
    const activos = await sociosActivos();
    res.activos = activos.length;

    const porVencer = activos.filter((c) => {
      const f = (c.FechaFin || "").slice(0, 10);
      return f && f >= hoy && f <= limite;
    });

    res.porVencer = porVencer
      .map((c) => ({
        nombre: `${c.Nombres || ""} ${c.Apellidos || ""}`.trim(),
        vence: (c.FechaFin || "").slice(0, 10),
        celular: tel9(c.Celular),
        asesora: nombreAsesora(c.Vendedor),
        diasSinAsistir: c.UltimaAsistencia ? -diasHasta(String(c.UltimaAsistencia).slice(0, 10)) : null
      }))
      .sort((a, b) => a.vence.localeCompare(b.vence));

    // Los fríos que además vencen son la cola urgente: renuevan al 11% contra el
    // 50% de un caliente, y todavía hay días para hacerlos volver.
    // Orden por urgencia real, no solo por fecha: entre dos que vencen el mismo día,
    // primero el que lleva más tiempo sin aparecer — es el que cuesta más recuperar
    // y el que menos días de margen deja.
    res.friosPorVencer = res.porVencer
      .filter((c) => c.diasSinAsistir === null || c.diasSinAsistir > 10)
      .sort((a, b) => a.vence.localeCompare(b.vence) ||
                      ((b.diasSinAsistir ?? 999) - (a.diasSinAsistir ?? 999)));

    // Cartera y fríos por asesora, para que el filtro del dashboard cambie también
    // los números de arriba y no solo las listas.
    const porAse = {};
    for (const c of activos) {
      const k = nombreAsesora(c.Vendedor);
      const d = c.UltimaAsistencia ? -diasHasta(String(c.UltimaAsistencia).slice(0, 10)) : null;
      const x = porAse[k] = porAse[k] ||
        { activos: 0, frios: 0, total: 0, hoy: 0, ayer: 0, d7: 0, d10: 0, d30: 0, nunca: 0 };
      x.activos++; x.total++;
      if (d === null) { x.nunca++; x.frios++; continue; }
      if (d > 10) x.frios++;
      if (d <= 0)  x.hoy++;
      if (d === 1) x.ayer++;
      if (d <= 7)  x.d7++;
      if (d <= 10) x.d10++;
      if (d <= 30) x.d30++;
    }
    res.porAsesora = porAse;
    res.asesoras = Object.keys(porAse).sort();

    // Asistencia real de la cartera: el % de socios activos que de verdad viene.
    // Es la métrica que anticipa la renovación (un socio que no viene no renueva).
    const sinVenir = activos.map((c) =>
      c.UltimaAsistencia ? -diasHasta(String(c.UltimaAsistencia).slice(0, 10)) : null);

    const cuenta = (tope) => sinVenir.filter((d) => d !== null && d <= tope).length;
    res.asistencia = {
      total: activos.length,
      hoy: cuenta(0),          // los que ya marcaron asistencia hoy
      ayer: cuenta(1) - cuenta(0),
      d7:  cuenta(7),
      d10: cuenta(10),
      d30: cuenta(30),
      nunca: sinVenir.filter((d) => d === null).length
    };

    const inscritos = await appsfitCustomers({ type_date: 2, date_from: hoy, date_to: hoy });
    res.inscritosHoy = inscritos.length;
    res.ventaHoy = inscritos.reduce((t, c) => t + (Number(c.Pago) || 0), 0);
  } catch (e) {
    res.errores.push("Apps Fit: " + enCristiano(e));
  }

  // Va en su propio try: si el Sheet no está configurado o falla, el resto del
  // dashboard tiene que salir igual. Es un extra, no un requisito.
  try {
    const { ventasUrl } = await chrome.storage.local.get("ventasUrl");
    if (ventasUrl) res.ventas = await ventasSheet();
  } catch (e) {
    res.errores.push("Ventas: " + enCristiano(e));
  }

  try {
    const acts = await actividadesRango(hoyLima(-2), hoyLima(2));
    const fila = ({ horaLima, persona, asunto, hecha, personId }) =>
      ({ hora: horaLima, persona, asunto, hecha, personId, asesora: asesoraDeAsunto(asunto) });
    const porHora = (a, b) => a.hora.localeCompare(b.hora);

    const hoyTodo = acts.filter((a) => a.fechaLima === hoy);
    res.fpHoy     = hoyTodo.filter((a) => !esRetoma(a.asunto)).map(fila).sort(porHora);
    res.retomasHoy = hoyTodo.filter((a) =>  esRetoma(a.asunto)).map(fila).sort(porHora);

    /* Las de día completo no cuentan como no-show: no se sabe si ya pasó su hora.
       Las retomas tampoco entran acá: el no-show es una métrica del embudo de venta
       y una retoma no es una venta. Si no vino, eso se ve en su asistencia. */
    res.noShowsAyer = acts
      .filter((a) => a.fechaLima === ayer && !a.hecha && !a.sinHora && !esRetoma(a.asunto))
      .map(({ horaLima, persona, asunto, personId }) =>
        ({ hora: horaLima, persona, asunto, personId, asesora: asesoraDeAsunto(asunto) }));
  } catch (e) {
    res.errores.push("Pipedrive: " + enCristiano(e));
  }

  return res;
}

/* ---------- router ---------- */

// "Failed to fetch" no le dice nada a una asesora. Esto sí.
function enCristiano(e) {
  const m = e?.message || String(e);
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión a internet o el servicio no responde.";
  if (/401|rechaz/i.test(m)) return m;
  return m;
}

/* 💬 último chat de cada número → app de Llamadas (UltimoContacto.gs). Va con la llave del link de la asesora. */
async function mandarChatsLlamadas({ chats }) {
  const { ucUrl } = await chrome.storage.local.get("ucUrl");
  if (!ucUrl) throw new Error("Falta el link de la app de Llamadas (Opciones).");
  const u = new URL(ucUrl), k = u.searchParams.get("k");
  if (!k) throw new Error("El link de Llamadas no tiene la llave (?k=…).");
  const r = await fetch(u.origin + u.pathname, {
    method: "POST", redirect: "follow", credentials: "omit",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ accion: "chats", k, chats: chats || [] })
  });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch { throw new Error("La app de Llamadas respondió una página en vez de datos."); }
  if (!j.ok) throw new Error(j.error || "Error de la app de Llamadas");
  return j.data;
}

const rutas = {
  chats:     (p) => mandarChatsLlamadas(p),
  ficha:     (p) => fichaPorTelefono(p),
  activos:   () => sociosActivos(),              // respeta el caché de 30 min
  refrescar: () => sociosActivos(true).then((a) => ({ activos: a.length })),
  buscarPd:  (p) => pdBuscarPersona(p),
  pdDetalle: (p) => pdDetalle(p),
  crearPd:   (p) => pdCrearPersona(p),
  citaHecha: (p) => citaHecha(p),
  etiquetar: (p) => pdEtiquetar(p),
  nota:      (p) => pdNota(p),
  opciones:  (p) => opcionesCampo(p),
  opcionNueva: (p) => opcionNueva(p),
  datosLeer:    (p) => datosLeer(p),
  datosGuardar: (p) => datosGuardar(p),
  agendarFp:    (p) => agendarFp(p),
  agendarNutri: (p) => agendarNutri(p),
  cuposNutri:   (p) => cuposNutri(p),
  dashboard: () => dashboard(),
  ventas:    (p) => ventasSheet(p || {}),
  olvidar:   async () => { await chrome.storage.session.clear(); return { limpio: true }; },
  version:   () => ({ sw: VERSION_SW }),
  probar:    async () => {
    const out = {};
    const cfg = await proxyCfg();
    out.modo = cfg ? "Por llave (los tokens están en el intermediario)"
                   : "Directo (los tokens están en esta computadora)";

    // En modo llave no se prueba el TokenEmpresa: acá no existe. Se prueba que el
    // intermediario conteste y que la llave siga dada de alta.
    if (cfg) {
      try { const r = await proxyPedir({ recurso: "ping" }); out.appsfit = "Llave OK — " + r.asesora; }
      catch (e) { out.appsfit = "ERROR: " + enCristiano(e); }
    } else {
      try { await appsfitBearer(true); out.appsfit = "OK"; }
      catch (e) { out.appsfit = "ERROR: " + enCristiano(e); }
    }

    try { const u = await pd("/users/me"); out.pipedrive = "OK — " + u.name; }
    catch (e) { out.pipedrive = "ERROR: " + enCristiano(e); }
    return out;
  }
};

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  const fn = rutas[msg?.tipo];
  if (!fn) { responder({ ok: false, error: "Acción desconocida: " + msg?.tipo }); return false; }
  Promise.resolve(fn(msg.datos || {}))
    .then((data) => responder({ ok: true, data }))
    .catch((e) => responder({ ok: false, error: enCristiano(e) }));
  return true;   // respuesta asíncrona
});

// ───────── Autorrecarga: el actualizador de la PC copia los archivos nuevos desde GitHub a esta
// carpeta; cada 5 min se compara la versión del manifest en disco con la cargada y, si cambió,
// la extensión se recarga sola (las pestañas de WhatsApp Web toman el panel nuevo al recargarse).
chrome.alarms.create("recarga", { delayInMinutes: 2, periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "recarga") return;
  try {
    const m = await (await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" })).json();
    if (m.version && m.version !== chrome.runtime.getManifest().version) chrome.runtime.reload();
  } catch (e) { /* manifest a medio copiar: se intenta en la próxima vuelta */ }
});

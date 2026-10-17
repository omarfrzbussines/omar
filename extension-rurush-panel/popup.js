/* RURUSH — dashboard del día */

const app = document.getElementById("app");
const selAse = document.getElementById("ase");

let datos = null;        // última respuesta del dashboard, sin filtrar
let asesora = "";        // "" = todas

/* Abre el chat de WhatsApp de esa persona.

   Se usa el link oficial (web.whatsapp.com/send?phone=) y NO buscar el nombre en el
   buscador de WhatsApp, aunque eso evitaría la recarga: el buscador abriría el
   primer resultado y, si hay dos parecidos, la asesora termina escribiéndole del
   vencimiento a otra socia. Acá vale más acertar que ahorrar cinco segundos.

   Si WhatsApp Web ya está abierto se reutiliza esa pestaña en vez de abrir una
   nueva cada vez. */
async function abrirChat(celular) {
  const tel = String(celular || "").replace(/\D/g, "");
  if (tel.length < 9) return;
  const url = `https://web.whatsapp.com/send?phone=${tel.length === 9 ? "51" + tel : tel}`;
  try {
    const [t] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (t) {
      await chrome.tabs.update(t.id, { url, active: true });
      await chrome.windows.update(t.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url });
    }
    window.close();
  } catch {
    await chrome.tabs.create({ url });
  }
}

const abrirCrm = (id) =>
  chrome.tabs.create({ url: `https://rurushfitnessclub.pipedrive.com/person/${id}` });

const esc = (s) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

// El Sheet escribe "MONICA" y Apps Fit devuelve "MÓNICA": sin normalizar, el
// filtro por asesora nunca encontraría su venta.
const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
const soles = (n) => "S/ " + Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: 0 });

function ventaDe(d, quien) {
  const v = d.ventas;
  if (!v) return null;
  if (!quien) return { mes: v.total, hoy: v.hoy, ventas: v.filas };
  const k = Object.keys(v.asesoras || {}).find((x) => sinTildes(x) === sinTildes(quien));
  return k ? v.asesoras[k] : { mes: 0, hoy: 0, ventas: 0 };
}

function pintar(d) {
  document.getElementById("fecha").textContent = d.fecha;

  // El filtro toca las listas y sus KPIs. Los de arriba (asistencia de la cartera)
  // se quedan globales a propósito: la asistencia no se reparte por asesora y
  // mostrarla filtrada haría creer que esa es "su" retención.
  const mia = (x) => !asesora || String(x.asesora || "").toUpperCase() === asesora;
  const porVencer = (d.porVencer || []).filter(mia);
  const frios     = (d.friosPorVencer || []).filter(mia);
  const fpHoy     = (d.fpHoy || []).filter(mia);
  const retomas   = (d.retomasHoy || []).filter(mia);
  const noShows   = (d.noShowsAyer || []).filter(mia);
  const pa        = asesora ? (d.porAsesora || {})[asesora] : null;
  const vta       = ventaDe(d, asesora);

  const errores = d.errores?.length
    ? `<div class="err">⚠️ ${d.errores.map(esc).join("<br>")}</div>` : "";

  const kpi = (n, l, extra = "") =>
    `<div class="kpi"><div class="n">${n}</div><div class="l">${l}</div>${extra}</div>`;

  // Retención = socios que de verdad vienen. La barra hace visible de un vistazo
  // qué parte de la cartera está activa y qué parte ya se está enfriando.
  // Con filtro, la barra pasa a ser la retención de SU cartera: mismos socios
  // activos, misma regla de 7 días, solo que contados por asesora.
  const a = pa || d.asistencia;
  const pct = a && a.total ? Math.round((a.d7 / a.total) * 100) : null;
  const barra = pct === null ? "" :
    `<div class="barra"><i style="width:${pct}%"></i></div>`;

  const fp = fpHoy.length
    ? fpHoy.map((a) => `<div class="item">
         <span class="h">${esc(a.hora)}</span>
         <span class="p">${esc(a.persona || a.asunto)}</span>
         ${a.personId ? `<button class="wa" data-crm="${esc(a.personId)}">CRM</button>` : ""}
         <span class="e">${a.hecha ? "✅" : "⏳"}</span></div>`).join("")
    : `<p class="vacio">Sin free pass agendados para hoy.</p>`;

  /* Las retomas van en su propia lista y NO suman al KPI de free pass: son alumnos
     que vuelven a clases, no ventas por cerrar. Metidas en el mismo número bajarían
     la tasa de cierre del mes sin que se note por qué. La sección solo aparece si
     hay alguna, para no dejar un cajón vacío todos los días. */
  const ret = retomas.length
    ? `<div class="sec"><h4>Retomas de hoy</h4>${
        retomas.map((a) => `<div class="item">
         <span class="h">${esc(a.hora)}</span>
         <span class="p">${esc(a.persona || a.asunto)}</span>
         ${a.personId ? `<button class="wa" data-crm="${esc(a.personId)}">CRM</button>` : ""}
         <span class="e">${a.hecha ? "✅" : "⏳"}</span></div>`).join("")}</div>`
    : "";

  const ns = noShows.length
    ? noShows.map((a) => `<div class="item">
         <span class="h">${esc(a.hora)}</span>
         <span class="p">${esc(a.persona || a.asunto)}</span>
         ${a.personId ? `<button class="wa" data-crm="${esc(a.personId)}">CRM</button>` : ""}
         <span class="e">🔄</span></div>`).join("")
    : `<p class="vacio">Sin no-shows pendientes de ayer. 🎉</p>`;

  const fr = frios.length
    ? frios.slice(0, 10).map((c) => `<div class="item">
         <span class="h">${esc(c.vence.slice(5))}</span>
         <span class="p">${esc(c.nombre)}</span>
         ${c.celular ? `<button class="wa" data-tel="${esc(c.celular)}">WA</button>` : ""}
         <span class="e">${c.diasSinAsistir === null ? "nunca" : c.diasSinAsistir + "d"}</span></div>`).join("")
    : `<p class="vacio">Ninguno de los que vence está frío. 💪</p>`;

  const pv = porVencer.length
    ? porVencer.slice(0, 12).map((c) => `<div class="item">
         <span class="h">${esc(c.vence.slice(5))}</span>
         <span class="p">${esc(c.nombre)}</span>
         ${c.celular ? `<button class="wa" data-tel="${esc(c.celular)}">WA</button>` : ""}
         <span class="e">${esc(c.asesora).slice(0, 6)}</span></div>`).join("")
    : `<p class="vacio">Nadie vence en los próximos 7 días.</p>`;

  app.innerHTML = `
    ${errores}
    ${a ? `<div class="destacado">
      <div class="dn">${a.d7}<span>/${a.total}</span></div>
      <div class="dl">${asesora ? `Socios de ${esc(asesora)} que vinieron` : "Vinieron"} en los últimos 7 días · <b>${pct}%</b></div>
      ${barra}
      <div class="dsub">Hoy vinieron <b>${a.hoy}</b> · ayer ${a.ayer} · ${a.d10} en 10 días · ${a.nunca} nunca vinieron</div>
    </div>` : ""}

    <div class="kpis">
      ${kpi(a ? a.hoy : "—", asesora ? "Sus socios hoy" : "Vinieron hoy")}
      ${kpi(pa ? pa.activos : (d.activos ?? "—"), asesora ? "Sus socios activos" : "Socios activos")}
      ${kpi(d.inscritosHoy ?? "—", "Inscritos hoy")}
      ${kpi(fpHoy.length, "Free pass hoy")}
      ${kpi(porVencer.length, "Vencen en 7d")}
      ${kpi(frios.length, "Fríos que vencen")}
      ${kpi(pa ? pa.frios : (a ? a.total - a.d10 : "—"), "Fríos en total")}
      ${vta ? kpi(soles(vta.mes), asesora ? "Vendió este mes" : "Venta del mes") : ""}
      ${vta ? kpi(soles(vta.hoy), asesora ? "Vendió hoy" : "Venta de hoy") : ""}
    </div>
    ${asesora && d.asistencia ? `<p class="nota">Toda la cartera: ${d.asistencia.d7}/${d.asistencia.total} · ${Math.round((d.asistencia.d7 / d.asistencia.total) * 100)}% en 7 días.</p>` : ""}
    ${d.ventas && !asesora ? `<div class="sec"><h4>Avance por asesora</h4>${
      Object.entries(d.ventas.asesoras || {})
        .sort((a, b) => (b[1].objetivo || 0) - (a[1].objetivo || 0) || b[1].mes - a[1].mes)
        .map(([n, v]) => {
          const meta = v.objetivo || 0;
          // La barra se calcula con la venta del log, que es la que se muestra.
          // Si el AVANCE del Sheet no coincide, se marca en vez de taparlo.
          const pct = meta ? Math.round((v.mes / meta) * 100) : null;
          const desfase = v.avanceSheet !== undefined && Math.abs(v.avanceSheet - v.mes) > 1;
          return `<div class="vta">
            <div class="vta-top"><b>${esc(n)}</b>${
              pct !== null ? `<span class="pc">${pct}%</span>` : ""}</div>
            <div class="vta-sub">${soles(v.mes)}${meta ? ` de <b>${soles(meta)}</b>` : " · sin meta"}${
              v.hoy ? ` · hoy <b>${soles(v.hoy)}</b>` : ""}${
              meta ? ` · faltan ${soles(Math.max(meta - v.mes, 0))}` : ""}${
              desfase ? ` <span class="alerta" title="El Sheet dice ${soles(v.avanceSheet)} y las transacciones suman ${soles(v.mes)}">⚠</span>` : ""}</div>
            ${meta ? `<div class="barra"><i style="width:${Math.min(pct, 100)}%"></i></div>` : ""}
          </div>`;
        }).join("")
      || '<p class="vacio">Sin ventas registradas este mes.</p>'
    }<p class="nota">${esc(d.ventas.mes)} · Fuente: Sheet VENTAS 2026.</p></div>` : ""}
    <div class="sec"><h4>Free pass de hoy</h4>${fp}</div>
    ${ret}
    <div class="sec"><h4>No-shows de ayer — reagendar</h4>${ns}</div>
    <div class="sec"><h4>Planes por vencer</h4>${pv}</div>
    <div class="sec"><h4>🧊 Fríos que vencen — la cola urgente</h4>${fr}</div>
`;

  app.querySelectorAll("[data-tel]").forEach((b) => { b.onclick = () => abrirChat(b.dataset.tel); });
  app.querySelectorAll("[data-crm]").forEach((b) => { b.onclick = () => abrirCrm(b.dataset.crm); });
}

async function cargar() {
  app.innerHTML = `<p class="vacio">Consultando Apps Fit y Pipedrive…</p>`;

  // Con tope de tiempo y try/catch: si el service worker no contesta, sin esto el
  // popup se queda en "Consultando…" para siempre y nadie sabe por qué.
  let r;
  try {
    r = await Promise.race([
      chrome.runtime.sendMessage({ tipo: "dashboard" }),
      new Promise((res) => setTimeout(
        () => res({ ok: false, error: "El servicio no responde. Revisa tu internet." }), 30000))
    ]);
  } catch {
    r = { ok: false, error: "La extensión se recargó. Ciérrala y vuelve a abrirla." };
  }

  if (!r?.ok) {
    app.innerHTML = `<div class="err">${esc(r?.error || "Error")}</div>
      <p class="vacio">Revisa que las credenciales estén cargadas en Opciones.</p>`;
    return;
  }
  datos = r.data;

  // La asesora elegida se recuerda POR PC: así cada chica abre el panel y ve lo
  // suyo sin tocar nada, y en la de Omar queda en "Todas".
  const guardada = (await chrome.storage.local.get("dashAsesora")).dashAsesora || "";
  const lista = datos.asesoras || [];
  selAse.innerHTML = `<option value="">Todas</option>` +
    lista.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  asesora = lista.includes(guardada) ? guardada : "";
  selAse.value = asesora;

  pintar(datos);
}

selAse.onchange = () => {
  asesora = selAse.value;
  chrome.storage.local.set({ dashAsesora: asesora });
  if (datos) pintar(datos);
};

document.getElementById("refrescar").onclick = cargar;
document.getElementById("opciones").onclick = () => chrome.runtime.openOptionsPage();
cargar();

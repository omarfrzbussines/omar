/* RURUSH — buscador flotante dentro del CRM de Apps Fit.
   Escribes nombre, DNI o celular y sale la ficha, con salto directo a WhatsApp. */

(() => {
  if (window.__rurushAppsfit) return;
  window.__rurushAppsfit = true;

  const { esc, pedir, toast, crearPanel, alternar, notaSeccion, tel9, normalizar, diasHasta, fechaCorta } = window.RR;

  const { panel, tab } = crearPanel({ secciones: [
    { id: "rr-buscador", titulo: "Buscar socio", abierta: true },
    { id: "rr-res",      titulo: "Resultados",   abierta: true }
  ] });

  panel.querySelector("#rr-buscador").innerHTML = `
    <input class="rr-input" id="rr-q" placeholder="Nombre, apellido, DNI o celular">
    <p class="rr-aviso">Busca entre los socios con plan vigente.</p>`;

  tab.onclick = () => { if (alternar(panel)) panel.querySelector("#rr-q").focus(); };

  // Caché corto propio: si la asesora acaba de inscribir a alguien, con un caché
  // eterno no aparecería y el panel diría "puede estar vencido", que es mentira.
  let cache = null, cacheAt = 0;

  async function activos() {
    if (cache && Date.now() - cacheAt < 5 * 60 * 1000) return cache;
    const r = await pedir("activos");
    if (!r.ok) throw new Error(r.error);
    cache = r.data;
    cacheAt = Date.now();
    return cache;
  }

  let t;
  panel.querySelector("#rr-q").addEventListener("input", (e) => {
    clearTimeout(t);
    const q = e.target.value.trim();
    t = setTimeout(() => buscar(q), 260);
  });

  async function buscar(q) {
    const cont = panel.querySelector("#rr-res");
    if (q.length < 3) { cont.innerHTML = ""; return; }
    cont.innerHTML = '<div class="rr-card"><p class="rr-aviso">Buscando…</p></div>';

    let lista;
    try {
      lista = await activos();
    } catch (e) {
      // Distinto de "no encontré": si Apps Fit se cayó, decir "puede estar
      // vencido" haría que traten a un socio activo como ex-socio.
      cont.innerHTML = `<div class="rr-card"><p class="rr-error">${esc(e.message)}</p>
        <p class="rr-aviso">No pude consultar Apps Fit — esto no significa que el socio no exista.</p></div>`;
      return;
    }

    const qn = normalizar(q), q9 = tel9(q);
    const hits = lista.filter((c) =>
      normalizar(`${c.Nombres} ${c.Apellidos}`).includes(qn) ||
      String(c.NumeroDocumento || "").includes(q) ||
      (q9 && tel9(c.Celular) === q9)
    ).slice(0, 12);

    if (!hits.length) {
      cont.innerHTML = '<div class="rr-card"><p class="rr-aviso">Sin resultados entre los socios vigentes. Puede estar vencido.</p></div>';
      return;
    }

    notaSeccion(panel, "rr-res", `${hits.length}`);
    cont.innerHTML = hits.map(tarjetaSocio).join("");
  }

  // Mismos nombres que muestra el panel de WhatsApp (ver ASESORAS en background.js).
  const NOMBRES = { monica10da:"MÓNICA", monica03:"MÓNICA", monica:"MÓNICA", laura31:"LAURA",
                    danna123:"DANNA", dilan24:"DILAN", valeria22:"VALERIA", gustavo:"GUSTAVO",
                    erik:"ERIK", omar:"OMAR" };
  const asesora = (cod) => {
    const c = String(cod || "").trim();
    return c ? (NOMBRES[c.toLowerCase()] || c.toUpperCase()) : "SIN ASIGNAR";
  };

  function tarjetaSocio(c) {
    const fin  = (c.FechaFin || "").slice(0, 10);
    const dias = diasHasta(fin);                       // mismo cálculo que el resto
    const cel  = tel9(c.Celular);
    const sinVenir = c.UltimaAsistencia ? -diasHasta(String(c.UltimaAsistencia).slice(0, 10)) : null;
    const frio = sinVenir !== null && sinVenir > 10;

    return `
      <div class="rr-card ${(dias !== null && dias <= 7) || frio ? "alerta" : "socio"}" style="margin-bottom:8px">
        <div class="rr-nombre">${esc(c.Nombres)} ${esc(c.Apellidos)}</div>
        <div class="rr-fila"><span>Código</span><span>#${esc(c.CodigoSocio)}</span></div>
        <div class="rr-fila"><span>Plan</span><span>${esc(c.desTiempoPaquete || "—")}</span></div>
        <div class="rr-fila"><span>Vence</span><span>${fechaCorta(fin) || "—"}${
          dias !== null ? ` · ${dias < 0 ? `hace ${-dias}d` : dias === 0 ? "HOY" : `en ${dias}d`}` : ""}</span></div>
        <div class="rr-fila"><span>Clases</span><span>${c.TotalAsistencia ?? c.NroIngresoActual ?? "—"} de ${c.TotalSesion ?? c.NroIngresos ?? "—"}</span></div>
        <div class="rr-fila"><span>Última clase</span><span>${
          sinVenir === null ? "Nunca" : `${frio ? "🧊" : "🔥"} hace ${sinVenir}d`}</span></div>
        <div class="rr-fila"><span>Asesora</span><span>${esc(asesora(c.Vendedor))}</span></div>
        ${cel
          ? `<div class="rr-btns"><a class="rr-btn" target="_blank" rel="noopener"
               href="https://web.whatsapp.com/send?phone=51${esc(cel)}">WhatsApp</a></div>`
          : '<p class="rr-tpl-nota">⚠️ Sin celular cargado en Apps Fit</p>'}
      </div>`;
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "r") {
      e.preventDefault(); tab.click();
    }
  });
})();

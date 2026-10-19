/* Clave de acceso a esta pantalla.
   Qué protege y qué no: evita que alguien en esta PC entre de casualidad y vea o
   cambie los tokens. NO es seguridad de verdad — quien sepa abrir las herramientas
   de desarrollador de Chrome puede leer lo guardado igual. Es un candado, no una
   caja fuerte. Se guarda el hash, nunca la clave. */

async function hash(txt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("rurush:" + txt));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Dice en la cara si esta pantalla tiene clave o no. Sin esto, abrir Opciones y
// ver los tokens de frente parece que la clave no sirve, cuando en realidad
// todavia no se ha creado ninguna.
async function pintarAvisoClave() {
  const caja = document.getElementById("aviso-clave");
  if (!caja) return;
  const { pinHash } = await chrome.storage.local.get("pinHash");
  caja.innerHTML = pinHash
    ? `<div class="aviso">🔒 Esta pantalla está protegida con clave. Para quitarla o cambiarla, usa "Clave de acceso".</div>`
    : `<div class="aviso" style="border-color:#ffb020">⚠️ <b>Esta pantalla NO tiene clave.</b> Cualquiera que abra Opciones en esta computadora ve los tokens. Ponle una con el botón <b>"Clave de acceso"</b> de abajo.</div>`;
}

async function arrancar() {
  const { pinHash } = await chrome.storage.local.get("pinHash");
  const contenido = document.getElementById("contenido");

  // Sin clave configurada se entra directo, pero avisando.
  if (!pinHash) { contenido.hidden = false; pintarAvisoClave(); return; }

  document.getElementById("cerrojo").hidden = false;
  const campo = document.getElementById("pin");
  const est = document.getElementById("pin-estado");
  campo.focus();

  const probar = async () => {
    if (await hash(campo.value) === pinHash) {
      document.getElementById("cerrojo").hidden = true;
      document.getElementById("contenido").hidden = false;
      pintarAvisoClave();
    } else {
      est.innerHTML = '<span class="err">❌ Clave incorrecta.</span>';
      campo.value = "";
      campo.focus();
    }
  };
  document.getElementById("entrar").onclick = probar;
  campo.addEventListener("keydown", (e) => { if (e.key === "Enter") probar(); });
}
arrancar();

const $ = (id) => document.getElementById(id);
const estado = $("estado");

chrome.storage.local.get(["appsfitToken", "pipedriveToken",
                          "proxyUrl", "proxyLlave"]).then((c) => {
  $("appsfit").value = c.appsfitToken || "";
  $("pipedrive").value = c.pipedriveToken || "";
  $("proxyUrl").value = c.proxyUrl || "";
  $("proxyLlave").value = c.proxyLlave || "";
});

const proxyEstado = $("proxy-estado");

$("guardarProxy").onclick = async () => {
  const url = $("proxyUrl").value.trim();
  const llave = $("proxyLlave").value.trim();
  if (!url || !llave) {
    proxyEstado.innerHTML = `<span class="error">Pon la URL y la llave, las dos.</span>`;
    return;
  }
  // Al pasar a modo llave se borran los tokens de esta computadora: dejarlos ahí
  // sería tener el candado puesto y la llave colgada al lado.
  await chrome.storage.local.set({ proxyUrl: url, proxyLlave: llave });
  await chrome.storage.local.remove(["appsfitToken", "pipedriveToken"]);
  $("appsfit").value = ""; $("pipedrive").value = "";
  proxyEstado.innerHTML = `<span class="ok">✅ Modo llave activo. Los tokens se borraron de este equipo. Prueba la conexión arriba.</span>`;
};

$("quitarProxy").onclick = async () => {
  await chrome.storage.local.remove(["proxyUrl", "proxyLlave"]);
  $("proxyUrl").value = ""; $("proxyLlave").value = "";
  proxyEstado.innerHTML = `<span class="ok">✅ Modo directo. Vuelve a poner los tokens arriba.</span>`;
};

/* ---------- venta por asesora ---------- */
const ventasEstado = $("ventas-estado");

chrome.storage.local.get(["ventasUrl", "ventasLlave"]).then(({ ventasUrl, ventasLlave }) => {
  if (ventasUrl) $("ventasUrl").value = ventasUrl;
  if (ventasLlave) $("ventasLlave").value = ventasLlave;
});

$("guardarVentas").onclick = async () => {
  const url = $("ventasUrl").value.trim();
  if (!/^https:\/\/script\.google\.com\/.*\/exec$/.test(url)) {
    ventasEstado.innerHTML = `<span class="err">La URL tiene que ser la de implementación y terminar en <b>/exec</b>.</span>`;
    return;
  }
  await chrome.storage.local.set({ ventasUrl: url, ventasLlave: $("ventasLlave").value.trim() });
  ventasEstado.innerHTML = `<span class="ok">✅ Guardado. Dale a Probar.</span>`;
};

$("quitarVentas").onclick = async () => {
  await chrome.storage.local.remove(["ventasUrl", "ventasLlave"]);
  $("ventasUrl").value = ""; $("ventasLlave").value = "";
  ventasEstado.innerHTML = `<span class="ok">Quitado. El dashboard deja de mostrar ventas.</span>`;
};

$("probarVentas").onclick = async () => {
  ventasEstado.textContent = "Consultando el Sheet…";
  // forzar: saltarse el caché, si no "Probar" diría OK con datos de hace rato.
  const r = await chrome.runtime.sendMessage({ tipo: "ventas", forzar: true });
  if (!r?.ok) { ventasEstado.innerHTML = `<span class="err">❌ ${r?.error || "Error"}</span>`; return; }
  const d = r.data, ases = Object.keys(d.asesoras || {});
  ventasEstado.innerHTML = `<span class="ok">✅ ${d.mes}: S/ ${d.total.toLocaleString("es-PE")} ·
    hoy S/ ${d.hoy.toLocaleString("es-PE")} · ${d.filas} ventas · ${ases.length} asesoras
    (${ases.join(", ")})</span>` +
    (d.subtotalesDescartados ? `<div class="hint">Descartó ${d.subtotalesDescartados} filas de subtotal, como debe ser.</div>` : "");
};

async function probarConexion() {
  estado.textContent = "Probando…";
  const r = await chrome.runtime.sendMessage({ tipo: "probar" });
  if (!r?.ok) return `<span class="err">❌ ${r?.error || "Error"}</span>`;
  // Se mira si DICE error, no si empieza con "OK": en modo llave la respuesta buena
  // es "Llave OK — LAURA", y con la regla vieja salía con la cruz roja aunque
  // estuviera bien.
  const linea = (nombre, txt) => {
    const mal = /^ERROR|error/i.test(txt);
    return `<span class="${mal ? "err" : "ok"}">${mal ? "❌" : "✅"} ${nombre}: ${txt}</span>`;
  };
  return (r.data.modo ? `<span class="hint">Modo: ${r.data.modo}</span><br>` : "") +
    linea("Apps Fit", r.data.appsfit) + "<br>" + linea("Pipedrive", r.data.pipedrive);
}

$("probar").onclick = async () => { estado.innerHTML = await probarConexion(); };


/* ---------- Guardar · Ver · Borrar · Clave ----------

   Estos cuatro botones estaban dibujados en la pantalla pero no tenían NADA detrás.
   Por eso "Guardar" no guardaba —el token se escribía, se perdía al cerrar y el
   panel seguía diciendo que faltaba— y "Ver / ocultar" no mostraba nada. Lo único
   que sí guardaba era cargar el archivo credenciales_api.txt, que escribe en
   storage por su cuenta; de ahí que a veces pareciera funcionar y a veces no. */

const UUID36 = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;
const HEX40  = /^[0-9a-f]{40}$/i;

$("guardar").onclick = async () => {
  const af = $("appsfit").value.trim();
  const pd = $("pipedrive").value.trim();

  if (!af && !pd) {
    estado.innerHTML = `<span class="err">❌ No hay nada que guardar: pega al menos uno de los dos tokens.</span>`;
    return;
  }

  // Un formato raro NO impide guardar —los tokens pueden cambiar de forma algún día—
  // pero se avisa: nueve de cada diez veces es media cadena pegada o un espacio.
  const dudas = [];
  if (af && !UUID36.test(af)) dudas.push("el de Apps Fit no tiene forma de UUID (36 caracteres con guiones)");
  if (pd && !HEX40.test(pd))  dudas.push("el de Pipedrive no tiene 40 caracteres");

  const guardar = {};
  if (af) guardar.appsfitToken = af;
  if (pd) guardar.pipedriveToken = pd;
  await chrome.storage.local.set(guardar);
  await chrome.runtime.sendMessage({ tipo: "olvidar" }).catch(() => {});

  const aviso = dudas.length
    ? `<div class="hint">⚠️ Ojo: ${dudas.join(" y ")}. Si la prueba falla, vuelve a copiarlo completo.</div>` : "";
  const prueba = await probarConexion();
  estado.innerHTML = `<span class="ok">✅ Guardado en esta computadora.</span>${aviso}<br>${prueba}`;
};

$("ver").onclick = () => {
  const mostrar = $("appsfit").type === "password";
  $("appsfit").type = $("pipedrive").type = mostrar ? "text" : "password";
  $("ver").textContent = mostrar ? "Ocultar" : "Ver / ocultar";
};

/* Borrar pide dos clics en vez de un cuadro de confirmación: el cuadro de Chrome
   congela la pestaña y acá no hace falta. El botón se desarma solo a los 6 s. */
let borrarArmado = false;
$("borrar").onclick = async () => {
  if (!borrarArmado) {
    borrarArmado = true;
    $("borrar").textContent = "¿Seguro? Dale otra vez";
    estado.innerHTML = `<span class="hint">Esto borra los dos tokens de ESTA computadora. El panel deja de funcionar hasta volver a ponerlos.</span>`;
    setTimeout(() => {
      if (!borrarArmado) return;
      borrarArmado = false;
      $("borrar").textContent = "Borrar todo";
    }, 6000);
    return;
  }
  borrarArmado = false;
  $("borrar").textContent = "Borrar todo";
  await chrome.storage.local.remove(["appsfitToken", "pipedriveToken"]);
  $("appsfit").value = ""; $("pipedrive").value = "";
  await chrome.runtime.sendMessage({ tipo: "olvidar" }).catch(() => {});
  estado.innerHTML = `<span class="ok">✅ Tokens borrados de esta computadora.</span>`;
};

$("clave").onclick = async () => {
  if (document.getElementById("clave-caja")) {        // ya está abierta: se cierra
    document.getElementById("clave-caja").remove();
    return;
  }
  const { pinHash } = await chrome.storage.local.get("pinHash");
  const caja = document.createElement("div");
  caja.id = "clave-caja";
  caja.className = "auto";
  caja.innerHTML =
    `<b>${pinHash ? "CAMBIAR O QUITAR LA CLAVE" : "PONER UNA CLAVE"}</b>
     <p>${pinHash
        ? "Para quitarla, escribe la actual y deja la nueva en blanco."
        : "Se le pedirá a quien abra esta pantalla. Se guarda cifrada, nunca la clave en sí."}</p>
     ${pinHash ? `<label>Clave actual</label>
                  <input id="clave-vieja" type="password" autocomplete="off">` : ""}
     <label>Clave nueva${pinHash ? " (vacía = quitar la clave)" : ""}</label>
     <input id="clave-nueva" type="password" autocomplete="off">
     <div class="btns">
       <button id="clave-ok">${pinHash ? "Cambiar" : "Poner clave"}</button>
       <button class="sec" id="clave-cancelar">Cancelar</button>
     </div>
     <div id="clave-estado" class="hint"></div>`;
  estado.parentNode.insertBefore(caja, estado);

  const est = $("clave-estado");
  $("clave-cancelar").onclick = () => caja.remove();

  $("clave-ok").onclick = async () => {
    if (pinHash) {
      const vieja = $("clave-vieja").value;
      if (await hash(vieja) !== pinHash) {
        est.innerHTML = `<span class="err">❌ La clave actual no es esa.</span>`;
        return;
      }
    }
    const nueva = $("clave-nueva").value;

    if (!nueva) {
      if (!pinHash) { est.innerHTML = `<span class="err">❌ Escribe la clave nueva.</span>`; return; }
      await chrome.storage.local.remove("pinHash");
      caja.remove();
      pintarAvisoClave();
      estado.innerHTML = `<span class="ok">✅ Clave quitada. Esta pantalla queda sin candado.</span>`;
      return;
    }
    if (nueva.length < 4) {
      est.innerHTML = `<span class="err">❌ Que tenga al menos 4 caracteres.</span>`;
      return;
    }

    await chrome.storage.local.set({ pinHash: await hash(nueva) });
    caja.remove();
    pintarAvisoClave();
    estado.innerHTML = `<span class="ok">✅ Clave guardada. Te la pedirá la próxima vez que abras Opciones.</span>`;
  };
};

/* Autoconfiguración desde credenciales_api.txt — el archivo se lee en el navegador,
   no se sube a ningún lado. */
$("archivo").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const txt = await f.text();

  const appsfit = txt.match(/TokenEmpresa[^:]*:\s*([0-9A-Fa-f-]{36})/);
  const pipedrive = txt.match(/API\s*Token:\s*([0-9a-f]{40})/i);

  const encontrados = [];
  if (appsfit) { $("appsfit").value = appsfit[1]; encontrados.push("Apps Fit"); }
  if (pipedrive) { $("pipedrive").value = pipedrive[1]; encontrados.push("Pipedrive"); }

  if (!encontrados.length) {
    estado.innerHTML = `<span class="err">❌ No encontré tokens en ese archivo. Pégalos a mano.</span>`;
    return;
  }

  await chrome.storage.local.set({
    appsfitToken: $("appsfit").value.trim(),
    pipedriveToken: $("pipedrive").value.trim(),
  });
  await chrome.runtime.sendMessage({ tipo: "olvidar" }).catch(() => {});
  estado.innerHTML = `<span class="ok">✅ Cargado y guardado: ${encontrados.join(" + ")}. Ya puedes borrar credenciales_api.txt. Probando…</span>`;
  ev.target.value = "";
  $("probar").click();
});

/* ---------- guardar contactos solos (prendido por defecto) ---------- */
chrome.storage.local.get("autoPdApagado").then(({ autoPdApagado }) => { $("autoPd").checked = !autoPdApagado; });
$("autoPd").onchange = async () => {
  if ($("autoPd").checked) await chrome.storage.local.remove("autoPdApagado");
  else await chrome.storage.local.set({ autoPdApagado: true });
  $("autoPd-estado").innerHTML = `<span class="ok">✅ ${$("autoPd").checked ? "Prendido" : "Apagado"}.</span>`;
};

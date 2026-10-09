#!/bin/sh
# Arma App.html (la app del celular) con las MISMAS pantallas y reglas de la extensión,
# para que haya un solo código. Correr después de cambiar algo en extension-rurush-entrevistas/:
#   sh rurush-app-entrevistas/construir.sh
set -e
cd "$(dirname "$0")"
EXT=../extension-rurush-entrevistas
{
  cat <<'HTML'
<!doctype html>
<html lang="es">
<head>
<base target="_top">
<meta charset="utf-8">
<!-- ⚠️ ARCHIVO GENERADO por construir.sh: no lo edites a mano. -->
<style>
HTML
  cat "$EXT/sidepanel.css"
  cat <<'HTML'
</style>
</head>
<body>
  <header>
    <button id="atras" class="icono" title="Volver" hidden>←</button>
    <h1 id="titulo">🎯 Entrevistas</h1>
    <button id="equipoBtn" class="icono" title="Equipo: quién tiene acceso" hidden>👥</button>
    <button id="refrescar" class="icono" title="Volver a leer el Sheet">🔄</button>
    <button id="opciones" class="icono" title="Opciones">⚙️</button>
  </header>
  <div id="aviso" hidden></div>
  <main id="app"><p class="vacio">Cargando…</p></main>
  <div id="toast" hidden></div>
<script>
const INVITA = <?!= jsonSeguro_(invita) ?>;
const CONFIG_SERVIDOR = <?!= jsonSeguro_(config) ?>;
HTML
  cat "$EXT/config.js"
  cat <<'JS'

// Plataforma: app del celular (Apps Script con google.script.run).
// La clave de ESTE celular se guarda solo aquí (localStorage). Sin ella no se ve ningún dato.
const CLAVE_LS = 'rre:clave';
function llamar(fn, ...args) {
  return new Promise((ok, mal) => {
    google.script.run
      .withSuccessHandler(j => (j && j.ok ? ok(j) : mal(new Error((j && j.error) || 'Error desconocido'))))
      .withFailureHandler(e => mal(new Error((e && e.message) || String(e))))[fn](...args);
  });
}
function leerClaveLS() { try { return JSON.parse(localStorage.getItem(CLAVE_LS)); } catch (e) { return null; } }
function pantalla(html) {
  document.getElementById('equipoBtn').hidden = true;
  document.getElementById('refrescar').hidden = true;
  document.getElementById('app').innerHTML = `<div class="bloqueo">${html}</div>`;
}

const PLAT = {
  movil: true,
  config: async () => ({ ...DEFAULTS, ...CONFIG_SERVIDOR }),
  faltaConfig: () => false,

  /** Si este celular no tiene clave: activa la invitación del link o muestra el candado. */
  preparar() {
    if (leerClaveLS()) return Promise.resolve(true);
    let guarda = false;
    try { localStorage.setItem('rre:prueba', '1'); localStorage.removeItem('rre:prueba'); guarda = true; } catch (e) { /* bloqueado */ }
    if (!guarda) {
      pantalla(`<div class="grande">⚠️</div><h2>Este navegador no deja guardar el acceso</h2>
        <p>Abre el link en Chrome o Safari normal (no en modo incógnito ni dentro de WhatsApp).</p>`);
      return Promise.resolve(false);
    }
    if (!INVITA) { PLAT.sinAcceso(); return Promise.resolve(false); }
    return new Promise(listo => {
      pantalla(`<div class="grande">🔐</div><h2>Activar este celular</h2>
        <p>Esta invitación sirve <b>una sola vez</b>: solo el celular donde toques “Activar” tendrá acceso.</p>
        <button id="btnActivar">Activar este celular</button><p id="msgActivar"></p>`);
      document.getElementById('btnActivar').onclick = async ev => {
        ev.target.disabled = true;
        document.getElementById('msgActivar').textContent = 'Activando…';
        try {
          const j = await llamar('appActivar', INVITA);
          localStorage.setItem(CLAVE_LS, JSON.stringify({ t: j.t, nombre: j.nombre, rol: j.rol }));
          document.getElementById('refrescar').hidden = false;
          toast(`✔ Listo: ${j.nombre}. Agrega esta página a la pantalla de inicio.`, 6000);
          listo(true);
        } catch (e) {
          ev.target.disabled = false;
          document.getElementById('msgActivar').textContent = '✖ ' + e.message;
        }
      };
    });
  },
  sinAcceso() {
    try { localStorage.removeItem(CLAVE_LS); localStorage.removeItem('rre:cache'); } catch (e) { /* nada */ }
    pantalla(`<div class="grande">🔒</div><h2>Este celular no está autorizado</h2>
      <p>Pide una invitación al administrador. Las invitaciones sirven una sola vez y en un solo celular.</p>`);
  },
  api(metodo, datos) {
    const c = leerClaveLS(), t = c && c.t;
    if (datos.a === 'lista') return llamar('appLista', t);
    if (datos.a === 'guardar') return llamar('appGuardar', { ...datos, t });
    if (datos.a === 'equipo') return llamar('appEquipo', t);
    if (datos.a === 'invitar') return llamar('appInvitar', t, datos.nombre);
    if (datos.a === 'quitar') return llamar('appQuitar', t, datos.id);
    return Promise.reject(new Error('Acción desconocida'));
  },
  async leerLocal(k) { try { return JSON.parse(localStorage.getItem('rre:' + k)); } catch (e) { return null; } },
  guardarLocal(k, v) { try { localStorage.setItem('rre:' + k, JSON.stringify(v)); } catch (e) {} },
  borrarLocal(k) { try { localStorage.removeItem('rre:' + k); } catch (e) {} }
};
JS
  cat "$EXT/reglas.js"
  echo
  cat "$EXT/sidepanel.js"
  cat <<'HTML'
</script>
</body>
</html>
HTML
} > App.html
if grep -n '<?' App.html | grep -v 'jsonSeguro_' ; then echo "⚠️ hay '<?' sueltos en App.html"; exit 1; fi
echo "✔ App.html generado"

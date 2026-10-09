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
    <button id="refrescar" class="icono" title="Volver a leer el Sheet">🔄</button>
    <button id="opciones" class="icono" title="Opciones">⚙️</button>
  </header>
  <div id="aviso" hidden></div>
  <main id="app"><p class="vacio">Cargando…</p></main>
  <div id="toast" hidden></div>
<script>
const LLAVE = <?!= JSON.stringify(llave) ?>;
const CONFIG_SERVIDOR = <?!= JSON.stringify(config) ?>;
HTML
  cat "$EXT/config.js"
  cat <<'JS'

// Plataforma: app del celular (Apps Script con google.script.run).
const PLAT = {
  movil: true,
  config: async () => ({ ...DEFAULTS, ...CONFIG_SERVIDOR }),
  faltaConfig: () => false,
  api(metodo, datos) {
    return new Promise((ok, mal) => {
      const r = google.script.run
        .withSuccessHandler(j => (j && j.ok ? ok(j) : mal(new Error((j && j.error) || 'Error desconocido'))))
        .withFailureHandler(e => mal(new Error((e && e.message) || String(e))));
      if (metodo === 'GET') r.appLista(LLAVE);
      else r.appGuardar({ ...datos, k: LLAVE });
    });
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
if grep -n '<?' App.html | grep -v 'JSON.stringify' ; then echo "⚠️ hay '<?' sueltos en App.html"; exit 1; fi
echo "✔ App.html generado"

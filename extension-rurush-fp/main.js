// Corre en el contexto de la página de WhatsApp Web, antes que su propio código.
// Cuando la extensión cambia de chat, evita el diálogo "¿Quieres salir del sitio web?"
// (solo si la extensión marcó que va a navegar; para las personas no cambia nada).
window.addEventListener('beforeunload', (e) => {
  if (document.documentElement.dataset.rurushNav === '1') e.stopImmediatePropagation();
}, true);

// Corre en el contexto de la página de WhatsApp Web, antes que su propio código.
// 1) Anota para qué número se abrió esta carga (send?phone=…), así la extensión
//    puede comprobar que está escribiendo en el chat correcto.
// 2) Cuando la extensión cambia de chat, evita el diálogo "¿Quieres salir del sitio web?"
//    (solo si la extensión marcó que va a navegar; para las personas no cambia nada).
document.documentElement.dataset.rurushPhone =
  (new URLSearchParams(location.search).get('phone') || '').replace(/\D/g, '');
window.addEventListener('beforeunload', (e) => {
  if (document.documentElement.dataset.rurushNav === '1') e.stopImmediatePropagation();
}, true);

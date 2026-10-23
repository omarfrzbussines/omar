/* 📞 LLAMADAS dentro de la app Free Pass: muestra la app de Llamadas de cada asesora (Llamadas · 🏋️ Socios ·
   💰 Cobros) adentro, para que todo esté en un solo lugar. La app de Llamadas es otro proyecto (rurush-sheet-scripts);
   aquí solo se guarda la LLAVE de cada asesora (Propiedad del script FP_LLAMADAS, nunca en el repo).
   Omar la pega una vez desde la misma app (sección 📞 Llamadas → ⚙️ Links), copiando los links del botón 🔗 Links
   de su app de Llamadas. La primera vez en cada computadora, la app de Llamadas pide el PIN de Omar
   (la computadora queda como segunda llave: el celular sigue funcionando). */

const FPL_EXEC = 'https://script.google.com/macros/s/AKfycbzsvzWanclhKavutDs3l1N-7MEbdY4hojdnS3Pm8WkMffgSPihvwQxPuppMgCNwKG95/exec';
const FPL_ASESORAS = ['MONICA', 'LAURA', 'DANNA', 'CIELO', 'OMAR'];

function fpl_llaves_() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('FP_LLAMADAS') || '{}'); }
function fpl_quien_(llave, pc) {
  return String(fp_quien_(llave, pc)).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Link de la app de Llamadas de quien abre (y, para Omar, qué asesoras ya están conectadas). */
function fp_llamadasLink(llave, pc) {
  const quien = fpl_quien_(llave, pc), k = fpl_llaves_();
  const r = { url: k[quien] ? FPL_EXEC + '?k=' + encodeURIComponent(k[quien]) : '', esOmar: quien === 'OMAR' };
  if (r.esOmar) r.conectadas = FPL_ASESORAS.map(function (a) { return { asesora: a, ok: !!k[a] }; });
  return r;
}

/** Solo Omar: guarda los links (o llaves) pegados. Vacío = no cambia; "-" = quitar. */
function fp_guardarLlamadas(llave, pc, pegados) {
  if (fpl_quien_(llave, pc) !== 'OMAR') throw new Error('Solo Omar puede conectar los links.');
  const k = fpl_llaves_(), malos = [];
  FPL_ASESORAS.forEach(function (a) {
    const v = String((pegados || {})[a] || '').trim();
    if (!v) return;
    if (v === '-') { delete k[a]; return; }
    const m = v.match(/[?&]k=([A-Za-z0-9]{12,})/) || v.match(/^([A-Za-z0-9]{12,})$/);
    if (m) k[a] = m[1]; else malos.push(a);
  });
  if (malos.length) throw new Error('No encontré la llave (?k=…) en el link de: ' + malos.join(', ') + '. Copia el link completo desde 🔗 Links.');
  PropertiesService.getScriptProperties().setProperty('FP_LLAMADAS', JSON.stringify(k));
  return fp_llamadasLink(llave, pc);
}

// Rurush Difusiones — dibuja el cuadro de ventas (HTML de RURUSH Hoy) como imagen PNG 4:5 (1080×1350).
// Corre en un documento oculto de la extensión: HTML → SVG <foreignObject> → canvas → PNG.
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.type !== 'cuadroPng') return false;
  aPng(m.html).then((b64) => reply({ ok: true, b64 }), (e) => reply({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

async function aPng(html) {
  const W = 540, H = 675, ESCALA = 2;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // XHTML bien formado para el SVG (convierte &nbsp;, <br>, etc.)
  const cuerpo = new XMLSerializer().serializeToString(doc.body)
    .replace(/^<body/, '<div').replace(/<\/body>$/, '</div>');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
    '<foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' +
    '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + W + 'px;height:' + H + 'px;overflow:hidden;background:#fcfcfb;margin:0">' +
    cuerpo + '</div></foreignObject></svg>';
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = W * ESCALA; c.height = H * ESCALA;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fcfcfb';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(ESCALA, ESCALA);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/png').split(',')[1];
}

/* 📊 Informe semanal en diapositivas (Google Slides) — 0 tokens, sin la PC.
   Cada lunes, sm_enviarCorreo arma la presentación con los mismos datos del correo (sm_datos)
   y pone el link arriba del correo. Se abre en Google Slides y se baja como PowerPoint
   (Archivo → Descargar → Microsoft PowerPoint).
   Ejecutar sp_probar UNA vez desde el editor: pide el permiso de Presentaciones y crea la de la semana pasada. */

const SP_LOGO = 'https://raw.githubusercontent.com/omarfrzbussines/omar/main/marca/logo_rurush.png';
const SP = { rojo: '#D31F26', negro: '#141414', gris: '#6B6B6B', claro: '#F4F4F4', blanco: '#FFFFFF', verde: '#1E8E3E', amar: '#E8A317' };

function sp_probar() {
  const url = sp_crear(sm_datos());
  Logger.log('Presentación lista: ' + url);
  return url;
}

function sp_caja(s, x, y, w, h, color) {
  const r = s.insertShape(SlidesApp.ShapeType.RECTANGLE, x, y, w, h);
  r.getFill().setSolidFill(color);
  r.getBorder().setTransparent();
  return r;
}
function sp_texto(s, x, y, w, h, t, size, color, bold, centro) {
  const b = s.insertTextBox(String(t), x, y, w, h);
  b.getText().getTextStyle().setFontFamily('Calibri').setFontSize(size || 14).setForegroundColor(color || SP.negro).setBold(!!bold);
  if (centro) b.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  return b;
}
function sp_kpi(s, x, y, w, etiqueta, valor, nota, color) {
  sp_caja(s, x, y, w, 88, SP.claro);
  sp_caja(s, x, y, 5, 88, color || SP.rojo);
  sp_texto(s, x + 12, y + 4, w - 16, 20, etiqueta, 10, SP.gris, true);
  sp_texto(s, x + 12, y + 24, w - 16, 36, valor, 24, SP.negro, true);
  if (nota) sp_texto(s, x + 12, y + 62, w - 16, 20, nota, 9, SP.gris);
}
function sp_tabla(s, x, y, w, filas, size) {
  const t = s.insertTable(filas.length, filas[0].length, x, y, w, 22 * filas.length);
  filas.forEach((f, i) => f.forEach((v, j) => {
    const c = t.getCell(i, j);
    c.getFill().setSolidFill(i === 0 ? SP.negro : i % 2 ? SP.claro : SP.blanco);
    c.getText().setText(String(v));
    c.getText().getTextStyle().setFontFamily('Calibri').setFontSize(size || 10).setBold(i === 0).setForegroundColor(i === 0 ? SP.blanco : SP.negro);
  }));
  return t;
}
function sp_hoja(p, titulo, sub, pie) {
  const s = p.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  sp_caja(s, 0, 0, 720, 58, SP.negro);
  sp_caja(s, 0, 58, 720, 4, SP.rojo);
  sp_texto(s, 24, 12, 560, 36, titulo, 22, SP.blanco, true);
  try { s.insertImage(SP_LOGO, 640, 6, 46, 46); } catch (e) {}
  if (sub) sp_texto(s, 24, 66, 670, 22, sub, 11, SP.gris);
  sp_texto(s, 24, 382, 670, 18, pie, 8, SP.gris);
  return s;
}

/** Crea la presentación de la semana de d (sm_datos) y devuelve su link. */
function sp_crear(d) {
  const S = (v) => 'S/ ' + Math.round(v || 0).toLocaleString('en-US');
  const dif = (a, b) => (b ? (a >= b ? '▲ ' : '▼ ') + Math.abs(Math.round((a - b) / b * 100)) + '%' : '');
  const hr = (h) => (h % 12 || 12) + (h < 12 ? 'am' : 'pm');
  const T = d.tot, G = d.hoja, rango = sm_lab(d.lun) + ' – ' + sm_lab(d.dom);
  const pie = 'RURUSH Fitness Club · Informe semanal ' + rango;
  const pctMes = T.meta ? T.acum / T.meta : 0;
  const p = SlidesApp.create('RURUSH Informe semanal ' + rango);
  const portada = p.getSlides()[0];

  // 1) portada
  const s1 = p.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  sp_caja(s1, 0, 0, 720, 405, SP.negro);
  sp_caja(s1, 0, 250, 720, 5, SP.rojo);
  try { s1.insertImage(SP_LOGO, 40, 36, 90, 90); } catch (e) {}
  sp_texto(s1, 40, 140, 640, 50, 'INFORME SEMANAL', 38, SP.blanco, true);
  sp_texto(s1, 40, 192, 640, 34, 'Semana ' + rango, 20, '#DDDDDD');
  sp_texto(s1, 40, 270, 640, 30, 'Venta de la semana ' + S(T.sem) + '  ' + dif(T.sem, T.ant) + '   ·   Mes: ' + Math.round(pctMes * 100) + '% de la meta', 16, SP.blanco);
  portada.remove();

  // 2) venta
  const s2 = sp_hoja(p, '💰 Venta de la semana', T.ant ? 'vs semana anterior (' + S(T.ant) + ') ' + dif(T.sem, T.ant) : '', pie);
  sp_kpi(s2, 24, 96, 216, 'VENTA SEMANA', S(T.sem), dif(T.sem, T.ant) + ' vs semana anterior');
  sp_kpi(s2, 252, 96, 216, 'NUEVOS', S(T.nuevos), sm_pct(T.nuevos, T.sem) + '% de la semana', SP.amar);
  sp_kpi(s2, 480, 96, 216, 'FIDELIZACIÓN', S(T.fidel), sm_pct(T.fidel, T.sem) + '% de la semana', SP.verde);
  sp_texto(s2, 24, 206, 600, 22, 'Avance del mes', 14, SP.negro, true);
  sp_caja(s2, 24, 234, 672, 26, SP.claro);
  if (pctMes > 0) sp_caja(s2, 24, 234, Math.max(4, 672 * Math.min(1, pctMes)), 26, SP.rojo);
  sp_caja(s2, 24 + 672 * Math.min(1, d.esperado), 228, 3, 38, SP.amar);
  sp_texto(s2, 24, 268, 672, 40, S(T.acum) + ' de ' + S(T.meta) + '  ·  ' + Math.round(pctMes * 100) + '%  ·  deberíamos ir en ' + Math.round(d.esperado * 100) +
    '% (línea amarilla)  ·  faltan ' + S(Math.max(0, T.meta - T.acum)), 12, SP.gris);

  // 3) asesoras: barras del mes vs meta + tablas
  const s3 = sp_hoja(p, '👩‍💼 Ventas por asesora', 'Mes vs meta (barra gris = meta)', pie);
  const max = Math.max.apply(null, d.lista.map((a) => Math.max(a.meta, a.acum)).concat([1]));
  d.lista.forEach((a, i) => {
    const y = 100 + i * 64;
    sp_texto(s3, 24, y, 260, 18, a.nombre + ' · ' + a.estado, 11, a.estado === 'EN RIESGO' ? SP.rojo : SP.verde, true);
    sp_caja(s3, 24, y + 20, 260 * a.meta / max, 16, '#C8C8C8');
    if (a.acum > 0) sp_caja(s3, 24, y + 20, Math.max(3, 260 * a.acum / max), 16, SP.rojo);
    sp_texto(s3, 24, y + 38, 260, 16, S(a.acum) + ' de ' + S(a.meta) + ' (' + Math.round(a.pct * 100) + '%)', 9, SP.gris);
  });
  const ag = (n) => (G.ag[n] ? G.ag[n].APC + G.ag[n].APV + G.ag[n].APL : 0);
  sp_tabla(s3, 310, 96, 386, [['Asesora', 'Semana', 'FP agendó', 'Cerró']].concat(d.lista.map((a) => {
    const n = dv_nom(a.nombre);
    return [a.nombre, S(a.sem) + ' ' + dif(a.sem, a.ant), ag(n), G.ci[n] ? G.ci[n].cerro + '/' + G.ci[n].pres : '–'];
  })));
  if (d.llamadas) {
    sp_tabla(s3, 310, 236, 386, [['📞 Llamadas', 'Hechas', 'Contestaron', 'Agendados']].concat(d.lista.map((a) => {
      const ll = d.llamadas[a.nombre === 'MÓNICA' ? 'MONICA' : a.nombre] || { n: 0, cont: 0, agend: 0 };
      return [a.nombre, ll.n, ll.cont, ll.agend];
    })));
  }

  // 4) free pass
  const s4 = sp_hoja(p, '🎟️ Free Pass de la semana', 'Vino el ' + sm_pct(G.fpA, G.fpP) + '% · se inscribió el ' + sm_pct(G.cerro, G.fpA) + '% de los que vinieron', pie);
  [['Programados', G.fpP], ['Asistieron', G.fpA], ['Se inscribieron', G.cerro]].forEach((x, i) => {
    const h = G.fpP ? 220 * x[1] / G.fpP : 0, xx = 40 + i * 110;
    if (h > 0) sp_caja(s4, xx, 330 - Math.max(3, h), 80, Math.max(3, h), SP.rojo);
    sp_texto(s4, xx, 310 - Math.max(3, h), 80, 20, x[1], 14, SP.negro, true, true);
    sp_texto(s4, xx - 10, 334, 100, 30, x[0], 10, SP.gris, false, true);
  });
  sp_kpi(s4, 400, 100, 296, 'ASISTENCIA', sm_pct(G.fpA, G.fpP) + '%', G.fpA + ' de ' + G.fpP + ' programados · ' + (G.fpP - G.fpA) + ' no vinieron');
  sp_kpi(s4, 400, 200, 296, 'CIERRE', sm_pct(G.cerro, G.fpA) + '%', G.cerro + ' inscritos de ' + G.fpA + ' que vinieron', SP.amar);
  sp_texto(s4, 400, 300, 296, 24, '🥗 Nutrición: ' + G.nutA + ' de ' + G.nutC + ' citas asistieron', 12, SP.verde, true);

  // 5) canal, coach y horas
  if (d.canal || (d.coach && d.coach.length)) {
    const s5 = sp_hoja(p, '📍 Canal del FP y cierre por coach', 'Acumulado del mes', pie);
    if (d.canal) {
      const C = d.canal;
      sp_tabla(s5, 24, 96, 320, [['Canal', 'Agendaron', 'Vinieron', 'Inscritos']].concat([['Chat', 'APC'], ['Visita', 'APV'], ['Llamada', 'APL']].map((x) =>
        [x[0], C[x[1]].ag, C[x[1]].pa + ' (' + sm_pct(C[x[1]].pa, C[x[1]].ag) + '%)', C[x[1]].ins])), 11);
    }
    if (d.coach && d.coach.length) {
      sp_tabla(s5, 370, 96, 326, [['Coach', 'FP', 'Cierres', '% cierre']].concat(d.coach.map((c) => [c.coach, c.fp, c.cierres, c.pct + '%'])), 11);
    }
    if (d.horas && d.horas.pasaron.length) {
      sp_texto(s5, 24, 200, 320, 80, '⏰ Horas que más rinden\nMás clases: ' + d.horas.pasaron.map((x) => hr(x.h) + ' (' + x.n + ')').join(' · ') +
        (d.horas.inscritos.length ? '\nMás inscritos: ' + d.horas.inscritos.map((x) => hr(x.h) + ' (' + x.n + ')').join(' · ') : ''), 12);
    }
  }

  // 6) socios
  if (d.vencidos || d.retencion) {
    const R = d.retencion, pg = R ? sm_pct(R.tot.vinieron, R.tot.activos) : null;
    const s6 = sp_hoja(p, '📅 Socios: vencidos, por renovar y retención', R ? 'Retención de uso: ' + pg + '% (meta ' + Math.round(SM_RET_META * 100) + '%) · ' + R.tot.vinieron + ' de ' + R.tot.activos + ' activos vinieron' : '', pie);
    if (d.vencidos) {
      sp_kpi(s6, 24, 96, 216, 'VENCIERON', d.vencidos.length, d.vencidos.filter((x) => x.renovo).length + ' ya renovaron');
      sp_kpi(s6, 252, 96, 216, 'POR RENOVAR 10–30 DÍAS', d.renovar.length, 'empezar por los que menos vienen', SP.amar);
    }
    if (R) {
      sp_kpi(s6, 480, 96, 216, 'RETENCIÓN', pg + '%', 'meta ' + Math.round(SM_RET_META * 100) + '%', pg >= SM_RET_META * 100 ? SP.verde : SP.rojo);
      sp_tabla(s6, 24, 200, 300, [['Asesora', 'Activos', 'Vinieron', '%']].concat(DV_ASESORAS.filter((a) => R.porAse[a]).map((a) =>
        [DV_NOMBRE[a], R.porAse[a].activos, R.porAse[a].vinieron, sm_pct(R.porAse[a].vinieron, R.porAse[a].activos) + '%'])), 11);
    }
    if (d.vencidos && d.vencidos.length) {
      sp_texto(s6, 350, 200, 346, 170, '🔴 Vencidos (más días sin venir)\n' + d.vencidos.filter((x) => !x.renovo).slice(0, 6).map((x) =>
        x.nombre + ' · ' + (DV_NOMBRE[x.ase] || x.ase) + ' · ' + (x.sinVenir == null ? 'sin dato' : x.sinVenir + ' días')).join('\n'), 11);
    }
  }

  // 7) Meta Ads
  const r = d.ads && d.ads.reg, pr = d.ads && d.ads.prev;
  if (r) {
    const S2 = (v) => 'S/ ' + (Math.round((v || 0) * 100) / 100).toLocaleString('en-US');
    const e = r.embudo || {}, pe = pr && pr.embudo;
    const s7 = sp_hoja(p, '📣 Meta Ads · ' + sm_lab(r.inicio) + ' – ' + sm_lab(r.fin), '', pie);
    sp_kpi(s7, 24, 96, 160, 'GASTO', S(r.gasto), pr ? dif(r.gasto, pr.gasto) : '');
    sp_kpi(s7, 196, 96, 160, 'CONVERSACIONES', Math.round(r.conversaciones || 0), pr ? dif(r.conversaciones, pr.conversaciones) : '', SP.verde);
    sp_kpi(s7, 368, 96, 160, 'COSTO / CONV', S2(r.costo_conv), pr ? dif(r.costo_conv, pr.costo_conv) : '', SP.amar);
    sp_kpi(s7, 540, 96, 156, 'COSTO / INSCRITO', e.cpi_global ? S(e.cpi_global) : '–', pe && pe.cpi_global ? dif(e.cpi_global, pe.cpi_global) + ' (antes ' + S(pe.cpi_global) + ')' : '');
    sp_texto(s7, 24, 200, 672, 60, 'Alcance ' + Math.round(r.alcance || 0).toLocaleString('en-US') + ' · CTR ' + (r.ctr || 0).toFixed(2) + '% · CPM ' + S2(r.cpm), 12, SP.gris);
  }

  // 8) qué hacer
  const rec = [];
  const cero = d.lista.filter((a) => a.sem === 0).map((a) => a.nombre);
  if (cero.length) rec.push('🔴 ' + cero.join(', ') + ' no vendió esta semana: revisar su lista de FP y llamadas del lunes');
  const riesgo = d.lista.filter((a) => a.estado === 'EN RIESGO').map((a) => a.nombre);
  if (riesgo.length) rec.push('⚠️ En riesgo de meta: ' + riesgo.join(', ') + '. Faltan ' + S(Math.max(0, T.meta - T.acum)) + ' para el equipo');
  if (G.fpP && G.fpA / G.fpP < 0.5) rec.push('🎟️ Solo vino el ' + sm_pct(G.fpA, G.fpP) + '% de los FP: reforzar el recordatorio 2h antes y confirmar por llamada');
  if (G.fpA && G.cerro / G.fpA < 0.5) rec.push('💳 Se inscribió el ' + sm_pct(G.cerro, G.fpA) + '% de los que vinieron: revisar el cierre en clase (coach + asesora)');
  if (d.renovar && d.renovar.length) rec.push('🔁 ' + d.renovar.length + ' socios vencen en 10–30 días: empezar por los que menos vienen');
  if (d.retencion && d.retencion.tot.activos && d.retencion.tot.vinieron / d.retencion.tot.activos < SM_RET_META) rec.push('🔥 Retención bajo la meta: llamar a los que llevan más días sin venir');
  if (rec.length) {
    const s8 = sp_hoja(p, '✅ Qué hacer esta semana', '', pie);
    rec.slice(0, 6).forEach((t, i) => {
      const y = 80 + i * 48;
      sp_caja(s8, 24, y, 672, 40, SP.claro);
      sp_caja(s8, 24, y, 5, 40, SP.rojo);
      sp_texto(s8, 36, y + 8, 650, 26, t, 13);
    });
  }

  p.saveAndClose();
  return p.getUrl();
}

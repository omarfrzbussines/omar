/* =====================================================================
   📊 DASHBOARD LLAMADAS
   Recorre todas las bases (cada llamada: fecha, hora, asesora, estado, duración, timbradas),
   guarda los totales en la pestaña oculta _DASH_DATOS y la pestaña "📊 DASHBOARD LLAMADAS"
   los muestra con fórmulas (filtro de mes y asesora) y gráficos.
   Se actualiza solo cada hora (el disparador se instala solo la primera vez que se usa la app).
   ===================================================================== */
const DASH_HOJA = "📊 DASHBOARD LLAMADAS";
const DASH_DATOS = "_DASH_DATOS";
const DASH_NO_CONTESTAN = ["NO CONTESTO", "APAGADO"];
const DASH_DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Lo corre el disparador cada hora (o tú desde el editor). */
function dash_actualizar() {
  const ss = SpreadsheetApp.getActive();
  const agg = {};
  const meses = {};
  LL_BASES.forEach(function (base) {
    const hoja = ss.getSheetByName(base);
    if (!hoja) return;
    const est = ll_estructura(hoja);
    let datos;
    try {
      datos = app_valores(ss.getId(), ["'" + base + "'!A" + (LL_FILA_HEADER + 1) + ":" + app_col(est.ancho - 1)],
        { valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" })[0];
    } catch (e) {
      const n = hoja.getLastRow();
      if (n <= LL_FILA_HEADER) return;
      datos = hoja.getRange(LL_FILA_HEADER + 1, 1, n - LL_FILA_HEADER, est.ancho).getValues();
    }
    datos.forEach(function (fila) {
      est.rondas.forEach(function (ro) {
        let estado = String(fila[ro.estado] == null ? "" : fila[ro.estado]).trim().toUpperCase();
        if (!estado) return;
        const f = dash_fecha_(ro.fecha >= 0 ? fila[ro.fecha] : "");
        if (!f) return;
        const mes = f.getUTCFullYear() + "-" + ("0" + (f.getUTCMonth() + 1)).slice(-2);
        meses[mes] = true;
        const asesora = String((ro.asesor >= 0 ? fila[ro.asesor] : "") || "SIN ASESOR").trim().toUpperCase();
        const min = dash_minutos_(ro.hora >= 0 ? fila[ro.hora] : "");
        const hora = min >= 0 ? Math.floor(min / 60) : -1;
        const dur = dash_segundos_(ro.duracion >= 0 ? fila[ro.duracion] : "");
        const tim = ro.timbrada >= 0 ? Number(fila[ro.timbrada]) || 0 : 0;
        const k = [mes, asesora, base, f.getUTCDay(), hora, estado, f.toISOString().slice(0, 10)].join("|");
        const a = agg[k] || (agg[k] = [0, 0, 0, 0, 0]);
        a[0]++;
        if (dur > 0) { a[1] += dur; a[2]++; }
        if (tim > 0) { a[3] += tim; a[4]++; }
      });
    });
  });

  const filas = Object.keys(agg).map(function (k) {
    const p = k.split("|");
    return [p[0], p[1], p[2], Number(p[3]), Number(p[4]), p[5]].concat(agg[k], [p[6]]);
  });
  let d = ss.getSheetByName(DASH_DATOS);
  if (!d) { d = ss.insertSheet(DASH_DATOS); d.hideSheet(); }
  d.clearContents();
  d.getRange("A:C").setNumberFormat("@");
  d.getRange("F:F").setNumberFormat("@");
  d.getRange("L:L").setNumberFormat("@");
  d.getRange(1, 1, 1, 12).setValues([["MES", "ASESORA", "BASE", "DIA", "HORA", "ESTADO", "N", "DUR_SUM", "DUR_N", "TIMB_SUM", "TIMB_N", "FECHA"]]);
  if (filas.length) d.getRange(2, 1, filas.length, 12).setValues(filas);

  let h = ss.getSheetByName(DASH_HOJA);
  if (!h) h = dash_armar_(ss);
  const lista = ["TODOS"].concat(Object.keys(meses).sort().reverse());
  h.getRange("B2").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(lista, true).build());
  h.getRange("B2").setNumberFormat("@");
  if (h.getRange("G4").getValue() === "Duración prom. (min)") {   // versión anterior: pasaba a minutos
    h.getRange("G4").setValue("Duración prom. (seg)");
    h.getRange("G5").setFormula(String(h.getRange("G5").getFormula()).replace(/\/60,0\)$/, ",0)")).setNumberFormat("0");
  }
  if (!h.getRange("B2").getValue()) h.getRange("B2").setValue(Utilities.formatDate(new Date(), "America/Lima", "yyyy-MM"));
  PropertiesService.getScriptProperties().setProperty("DASH_ULT", String(Date.now()));
  h.getRange("G2").setValue("Actualizado: " + Utilities.formatDate(new Date(), "America/Lima", "dd/MM HH:mm") + " · se actualiza cada hora");
}

/** Borra y vuelve a armar la pestaña del dashboard (si se desordenó). */
function dash_rehacer() {
  const ss = SpreadsheetApp.getActive();
  const h = ss.getSheetByName(DASH_HOJA);
  if (h) ss.deleteSheet(h);
  dash_actualizar();
}

/** Instala el disparador de cada hora y arma el dashboard en un minuto (una sola vez). */
const DASH_VER = "3";   // al cambiar el cálculo, súbelo: la app rehace los datos al minuto sin esperar la hora
function dash_instalarSiFalta() {
  const props = PropertiesService.getScriptProperties();
  // versión nueva del cálculo, o datos con más de 70 min (el disparador de cada hora falló): rehacer al minuto
  const viejo = Date.now() - Number(props.getProperty("DASH_ULT") || 0) > 70 * 60000;
  const pedido = Date.now() - Number(props.getProperty("DASH_PEDIDO") || 0) < 10 * 60000;
  if (props.getProperty("DASH_TRIGGER") && !pedido && (props.getProperty("DASH_VER") !== DASH_VER || viejo)) {
    props.setProperty("DASH_VER", DASH_VER);
    props.setProperty("DASH_PEDIDO", String(Date.now()));
    ScriptApp.newTrigger("dash_primeraVez").timeBased().after(60 * 1000).create();
  }
  if (props.getProperty("DASH_TRIGGER")) return;
  props.setProperty("DASH_VER", DASH_VER);
  props.setProperty("DASH_TRIGGER", "1");
  const ya = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "dash_actualizar"; });
  if (!ya) {
    ScriptApp.newTrigger("dash_actualizar").timeBased().everyHours(1).create();
    ScriptApp.newTrigger("dash_primeraVez").timeBased().after(60 * 1000).create();
  }
}
function dash_primeraVez() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "dash_primeraVez") ScriptApp.deleteTrigger(t); });
  dash_actualizar();
}

/* ---------- lectura de valores ---------- */

// serial de Sheets o "dd/MM/yyyy" → Date (UTC, solo el día)
function dash_fecha_(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return v > 30000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5) : null;
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const a = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
  return new Date(Date.UTC(a, Number(m[2]) - 1, Number(m[1])));
}
// "6:30 pm" / fracción de día → minutos desde medianoche (-1 si no hay)
function dash_minutos_(v) {
  if (v === "" || v == null) return -1;
  if (typeof v === "number") return Math.round((v % 1) * 1440);
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const s = String(v).toLowerCase(), m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  let h = Number(m[1]) % 12;
  if (/p\.?\s*m/.test(s)) h += 12; else if (!/a\.?\s*m/.test(s)) h = Number(m[1]);
  return h * 60 + Number(m[2]);
}
// "2:15" (min:seg) → segundos. Sheets toma "0:55" como 0 h 55 min: si viene como hora sin segundos,
// en realidad eran minutos:segundos.
function dash_segundos_(v) {
  if (v === "" || v == null) return 0;
  if (typeof v === "number") {
    const t = Math.round((v % 1) * 86400);
    return t % 60 === 0 ? t / 60 : t;
  }
  const p = String(v).split(":").map(Number);
  if (p.some(isNaN)) return 0;
  return p.length === 3 ? (p[2] === 0 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2]) : p.length === 2 ? p[0] * 60 + p[1] : 0;
}

/* ---------- armado de la pestaña (fórmulas + gráficos) ---------- */

function dash_armar_(ss) {
  const h = ss.insertSheet(DASH_HOJA, 0);
  const D = "'" + DASH_DATOS + "'!";
  const col = function (c) { return D + "$" + c + ":$" + c; };
  // filtros: Z1 = mes ("*" = todos), Z2 = asesora ("*" = todas)
  h.getRange("Z1").setFormula('=IF($B$2="TODOS","*",$B$2)');
  h.getRange("Z2").setFormula('=IF($E$2="TODAS","*",$E$2)');
  const base = function (conAsesora) {
    return col("A") + ",$Z$1" + (conAsesora ? "," + col("B") + ",$Z$2" : "");
  };
  const N = function (extra, conAsesora) { return "SUMIFS(" + col("G") + "," + base(conAsesora !== false) + (extra ? "," + extra : "") + ")"; };
  const noCont = function (extra, conAsesora) {
    return "(" + N(extra, conAsesora) + "-" + DASH_NO_CONTESTAN.map(function (e) {
      return N((extra ? extra + "," : "") + col("F") + ',"' + e + '"', conAsesora);
    }).join("-") + ")";
  };
  const est = function (e, extra, conAsesora) { return N((extra ? extra + "," : "") + col("F") + ',"' + e + '"', conAsesora); };
  const pct = function (a, b) { return "=IFERROR(" + a + "/" + b + ",0)"; };

  h.setHiddenGridlines(true);
  h.getRange("A1:K1").merge().setValue("📊 DASHBOARD LLAMADAS").setFontSize(18).setFontWeight("bold")
    .setBackground("#1f2a44").setFontColor("#ffffff");
  h.getRange("A2").setValue("Mes:").setFontWeight("bold");
  h.getRange("D2").setValue("Asesora:").setFontWeight("bold");
  h.getRange("E2").setValue("TODAS");
  h.getRange("B2:C2").setNumberFormat("@");
  h.getRange("B2:C2").merge().setBackground("#fff2cc").setFontWeight("bold");
  h.getRange("E2:F2").merge().setBackground("#fff2cc").setFontWeight("bold");
  h.getRange("G2:K2").merge().setFontColor("#888888").setFontSize(9);

  // KPIs
  const kpis = [
    ["Llamadas", "=" + N()],
    ["Contestan", "=" + noCont()],
    ["% Contestan", pct(noCont(), N())],
    ["Agendados", "=" + est("AGENDADO")],
    ["% Agendan (de los que contestan)", pct(est("AGENDADO"), noCont())],
    ["Clientes", "=" + est("CLIENTE")],
    ["Duración prom. (seg)", "=IFERROR(SUMIFS(" + col("H") + "," + base(true) + ")/SUMIFS(" + col("I") + "," + base(true) + "),0)"],
    ["Timbradas prom.", "=IFERROR(SUMIFS(" + col("J") + "," + base(true) + ")/SUMIFS(" + col("K") + "," + base(true) + "),0)"]
  ];
  kpis.forEach(function (k, i) {
    h.getRange(4, i + 1).setValue(k[0]);
    h.getRange(5, i + 1).setFormula(k[1]);
  });
  h.getRange("A4:H4").setFontSize(9).setFontColor("#666666").setWrap(true).setVerticalAlignment("bottom");
  h.getRange("A5:H5").setFontSize(20).setFontWeight("bold").setFontColor("#1f2a44");
  h.getRange("C5").setNumberFormat("0%"); h.getRange("E5").setNumberFormat("0%");
  h.getRange("G5").setNumberFormat("0"); h.getRange("H5").setNumberFormat("0.0");

  // Embudo
  dash_titulo_(h, "A7", "🎯 Embudo");
  h.getRange("A8:B8").setValues([["Etapa", "Personas"]]);
  [["Llamadas", "=A5"], ["Contestan", "=B5"], ["Agendados", "=D5"], ["Clientes", "=F5"]]
    .forEach(function (r, i) { h.getRange(9 + i, 1).setValue(r[0]); h.getRange(9 + i, 2).setFormula(r[1]); });
  h.getRange("C8").setValue("%");
  for (let i = 0; i < 4; i++) h.getRange(9 + i, 3).setFormula("=IFERROR(B" + (9 + i) + "/$B$9,0)");
  h.getRange("C9:C12").setNumberFormat("0%");

  // Por asesora (solo filtro de mes)
  dash_titulo_(h, "E7", "👩 Por asesora (mes elegido)");
  h.getRange("E8:J8").setValues([["Asesora", "Llamadas", "Contestan", "% Cont.", "Agendados", "% Agend."]]);
  for (let i = 0; i < 12; i++) {
    const r = 9 + i, A = "$E" + r, ex = col("B") + "," + A;
    h.getRange(r, 6).setFormula('=IF(' + A + '="","",' + N(ex, false) + ")");
    h.getRange(r, 7).setFormula('=IF(' + A + '="","",' + noCont(ex, false) + ")");
    h.getRange(r, 8).setFormula('=IF(' + A + '="","",IFERROR(G' + r + "/F" + r + ",0))");
    h.getRange(r, 9).setFormula('=IF(' + A + '="","",' + est("AGENDADO", ex, false) + ")");
    h.getRange(r, 10).setFormula('=IF(' + A + '="","",IFERROR(I' + r + "/G" + r + ",0))");
  }
  h.getRange("E9").setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + D + 'B2:B,' + D + 'B2:B<>"",' + D + 'B2:B<>"SIN ASESOR"))),"")');
  h.getRange("H9:H20").setNumberFormat("0%"); h.getRange("J9:J20").setNumberFormat("0%");

  // Por hora
  dash_titulo_(h, "A23", "🕐 Por hora: ¿cuándo contestan más?");
  h.getRange("A24:E24").setValues([["Hora", "Llamadas", "Contestan", "% Contestan", "Agendados"]]);
  for (let hr = 6; hr <= 22; hr++) {
    const r = 25 + hr - 6, ex = col("E") + "," + hr;
    h.getRange(r, 1).setValue(((hr + 11) % 12 + 1) + (hr < 12 ? " am" : " pm"));
    h.getRange(r, 2).setFormula("=" + N(ex));
    h.getRange(r, 3).setFormula("=" + noCont(ex));
    h.getRange(r, 4).setFormula("=IFERROR(C" + r + "/B" + r + ",0)");
    h.getRange(r, 5).setFormula("=" + est("AGENDADO", ex));
  }
  h.getRange("D25:D41").setNumberFormat("0%");
  h.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().setGradientMinpoint("#f8d7da")
    .setGradientMidpointWithValue("#fff3cd", SpreadsheetApp.InterpolationType.PERCENTILE, "50")
    .setGradientMaxpoint("#b7e1cd").setRanges([h.getRange("D25:D41"), h.getRange("J25:J31"), h.getRange("J46:J56"), h.getRange("H9:H20")]).build()]);
  // lista de asesoras para el filtro (columna Y, oculta)
  h.getRange("E2").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(h.getRange("Y1:Y20"), true).build());
  h.getRange("Y1").setValue("TODAS");
  h.getRange("Y2").setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + D + 'B2:B,' + D + 'B2:B<>""))),"")');

  // Por día de la semana
  dash_titulo_(h, "G23", "📅 Por día");
  h.getRange("G24:K24").setValues([["Día", "Llamadas", "Contestan", "% Cont.", "Agendados"]]);
  [1, 2, 3, 4, 5, 6, 0].forEach(function (dw, i) {
    const r = 25 + i, ex = col("D") + "," + dw;
    h.getRange(r, 7).setValue(DASH_DIAS[dw]);
    h.getRange(r, 8).setFormula("=" + N(ex));
    h.getRange(r, 9).setFormula("=" + noCont(ex));
    h.getRange(r, 10).setFormula("=IFERROR(I" + r + "/H" + r + ",0)");
    h.getRange(r, 11).setFormula("=" + est("AGENDADO", ex));
  });
  h.getRange("J25:J31").setNumberFormat("0%");

  // Por base
  dash_titulo_(h, "G44", "📂 Por base");
  h.getRange("G45:K45").setValues([["Base", "Llamadas", "Contestan", "% Cont.", "Agendados"]]);
  LL_BASES.forEach(function (b, i) {
    const r = 46 + i, ex = col("C") + ',"' + b + '"';
    h.getRange(r, 7).setValue(b);
    h.getRange(r, 8).setFormula("=" + N(ex));
    h.getRange(r, 9).setFormula("=" + noCont(ex));
    h.getRange(r, 10).setFormula("=IFERROR(I" + r + "/H" + r + ",0)");
    h.getRange(r, 11).setFormula("=" + est("AGENDADO", ex));
  });
  h.getRange("J46:J56").setNumberFormat("0%");

  [h.getRange("A8:C8"), h.getRange("E8:J8"), h.getRange("A24:E24"), h.getRange("G24:K24"), h.getRange("G45:K45")]
    .forEach(function (r) { r.setFontWeight("bold").setBackground("#1f2a44").setFontColor("#ffffff"); });
  h.setColumnWidths(1, 11, 95);
  h.setColumnWidth(5, 110);
  h.hideColumns(25, 2);   // Y:Z (listas y filtros)

  // Gráficos
  h.insertChart(h.newChart().asBarChart().addRange(h.getRange("A8:B12")).setPosition(58, 1, 0, 0)
    .setOption("title", "Embudo").setOption("legend", { position: "none" }).setOption("width", 420).setOption("height", 220).build());
  h.insertChart(h.newChart().asColumnChart().addRange(h.getRange("A24:A41")).addRange(h.getRange("D24:D41"))
    .setPosition(23, 13, 0, 0).setOption("title", "% que contesta por hora").setOption("legend", { position: "none" })
    .setOption("vAxis", { format: "percent" }).setOption("width", 560).setOption("height", 280).build());
  h.insertChart(h.newChart().asColumnChart().addRange(h.getRange("A24:A41")).addRange(h.getRange("B24:B41"))
    .setPosition(43, 13, 0, 0).setOption("title", "Llamadas por hora (cuándo llaman)").setOption("legend", { position: "none" })
    .setOption("width", 560).setOption("height", 280).build());
  h.insertChart(h.newChart().asColumnChart().addRange(h.getRange("E8:E20")).addRange(h.getRange("H8:H20")).addRange(h.getRange("J8:J20"))
    .setPosition(7, 13, 0, 0).setOption("title", "Por asesora: % contestan y % agendan").setOption("vAxis", { format: "percent" })
    .setOption("width", 560).setOption("height", 280).build());
  return h;
}

function dash_titulo_(h, celda, texto) {
  h.getRange(celda).setValue(texto).setFontWeight("bold").setFontSize(12).setFontColor("#1f2a44");
}

/** Link de Omar (🧪): rehace el dashboard ahora mismo (tarda ~1 min). */
function app_dashAhora(llave) {
  if (app_asesora(llave) !== APP_PRUEBA) throw new Error("Solo para Omar.");
  const t0 = Date.now();
  dash_actualizar();
  return Math.round((Date.now() - t0) / 1000);
}

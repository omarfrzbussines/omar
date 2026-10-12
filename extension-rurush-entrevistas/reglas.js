// Todo lo "de negocio" vive aquí: el pre-filtro automático, la guía de preguntas
// de cada criterio y las plantillas de WhatsApp. Cámbialo sin tocar el panel.

const DIRECCION = 'Av. Larco 1164, Víctor Larco (al costado de Mass)';

// Estados que ya no se muestran en "Activos".
const ESTADOS_CERRADOS = /descartado|no va|contratado/i;

const CRITERIOS = [
  {
    id: 'actitud', nombre: 'Actitud', icono: '🔥',
    mirar: 'Energía, ganas, cómo habla de los fracasos, si culpa a otros.',
    preguntas: d => [
      'Si llevas 30 llamadas sin ningún cierre, ¿qué haces en la llamada 31?',
      d.peorMes && `Su PEOR mes: “${d.peorMes}”. → ¿Qué cambiaste el mes siguiente?`,
      d.reaccion && `Cuando no vende escribió: “${d.reaccion}”. → Dame un ejemplo real de la última vez.`,
      'Cuéntame algo que aprendiste solo/a en los últimos 3 meses.'
    ]
  },
  {
    id: 'comunicacion', nombre: 'Comunicación', icono: '🗣️',
    mirar: 'Claridad, tono, escucha (¿pregunta antes de ofrecer?), muletillas, cómo escribe.',
    preguntas: d => [
      'Véndeme Rurush en 30 segundos, como si yo nunca hubiera entrenado.',
      'Un lead del anuncio te escribe solo “precio”. Escríbeme AHORA el WhatsApp que le mandarías.',
      d.whatsappVentas && `Ventas por WhatsApp: “${d.whatsappVentas}”. → ¿Cómo reactivas un chat que te dejó en visto?`
    ]
  },
  {
    id: 'cierre', nombre: 'Cierre', icono: '🤝',
    mirar: 'Role-play: ¿indaga la objeción real?, ¿propone un siguiente paso concreto (free pass, pago hoy)?, ¿pide la venta?',
    preguntas: d => [
      `ROLE-PLAY · tú eres el cliente: “Lo voy a pensar”.${d.caso1 ? `\n   En el formulario respondió: “${d.caso1}”` : ''}`,
      `ROLE-PLAY · “Está muy caro”.${d.caso2 ? `\n   En el formulario respondió: “${d.caso2}”` : ''}`,
      `ROLE-PLAY · “Tengo que consultarlo con mi pareja”.${d.caso3 ? `\n   En el formulario respondió: “${d.caso3}”` : ''}`,
      d.mejorMes && `Su MEJOR mes: “${d.mejorMes}”. → ¿Qué hiciste exactamente diferente?`,
      '¿Cómo le pides el pago a alguien que ya dijo que le gusta el gimnasio?'
    ]
  },
  {
    id: 'experiencia', nombre: 'Experiencia', icono: '📈',
    mirar: 'Números concretos y comprobables, metas que tenía, manejo de seguimiento/leads.',
    preguntas: d => [
      d.ultimoTrabajo && `Último trabajo: “${d.ultimoTrabajo}”. → ¿Cuál era tu meta mensual y cuánto cumplías?`,
      d.promedioVentas && `Dice que cerraba ${d.promedioVentas}. → ¿Cómo lo medías? ¿Me lo puede confirmar tu ex jefe?`,
      /nunca|solo excel/i.test(d.crm || '')
        ? `CRM: “${d.crm}”. → ¿Cómo hacías para no olvidarte de un cliente?`
        : (d.crm && `CRM: “${d.crm}”. → ¿Qué registrabas y cada cuánto?`),
      '¿Qué haces con un lead que no responde hace 3 días?'
    ]
  },
  {
    id: 'cultura', nombre: 'Cultura', icono: '💪',
    mirar: '¿Conoce Rurush? ¿Entrena? ¿Encaja con el equipo? ¿Respuestas propias o de internet?',
    preguntas: d => [
      d.porQue && `¿Por qué Rurush?: “${d.porQue}”. → ¿Ya viniste al gym? ¿Qué te gustó / qué cambiarías?`,
      d.fitness && `Interés en fitness: ${d.fitness}/5. → ¿Entrenas? ¿Qué rutina haces?`,
      'Otra asesora cierra un cliente que tú trabajaste. ¿Qué haces?',
      '¿Qué tipo de jefe saca lo mejor de ti?'
    ]
  },
  {
    id: 'permanencia', nombre: 'Permanencia', icono: '⏳',
    mirar: 'Horario real (tarde-noche y sábados), estudios u otro trabajo, sueldo esperado vs. comisión, planes a 1 año.',
    preguntas: d => [
      `Disponibilidad: “${d.horario || '—'}” · ${d.jornada || '—'}. → La hora pico es tarde-noche y sábados. ¿Puedes?`,
      d.permanencia && `Se imagina trabajando: ${d.permanencia}. → ¿Qué tendría que pasar para quedarte más?`,
      d.sueldo && `Pide ${d.sueldo} de base. → Explícale sueldo + comisión y mira su reacción.`,
      '¿Estudias o tienes otro trabajo? ¿Planeas mudarte o viajar este año?',
      d.vision && `Visión 2-3 años: “${d.vision}”.`
    ]
  }
];

/** Pre-filtro automático a partir de las respuestas del formulario. */
function evaluar(d) {
  const out = [];
  const ok = t => out.push({ t: 'ok', txt: t });
  const alerta = t => out.push({ t: 'alerta', txt: t });
  const info = t => out.push({ t: 'info', txt: t });
  const s = k => String(d[k] || '').trim();

  const edad = parseInt(s('edad'), 10);
  if (edad && edad < 18) alerta(`Menor de edad (${edad})`);

  // Opciones reales del formulario: "🌅 6:00 AM - 2:00 PM (full-time mañana)", "🌆 2:00 PM - 10:00 PM
  // (full-time tarde-noche)", "🔥 … (partido)", "✅ Cualquier horario", "Solo Lunes-Viernes 5:00-9:00 PM (noche)",
  // "Sábado 9:00 AM - 6:00 PM", "Domingo (cualquier horario)". Se puede marcar varias.
  const horario = s('horario');
  if (horario) {
    const cualquiera = /✅|^cualquier|, cualquier/i.test(horario);
    const opciones = horario.split(/,\s*(?=[^\d\s])/);
    const entreSemana = opciones.filter(o => !/^(s[aá]bado|domingo)/i.test(o.trim()));
    if (cualquiera) ok('Cualquier horario');
    else if (!entreSemana.length) alerta('Solo fines de semana');
    else if (/tarde|noche|partido|pm - 10|5:00 ?pm/i.test(entreSemana.join(' ').replace(/6:00 AM - 2:00 PM/i, ''))) ok('Cubre la hora pico (tarde-noche)');
    else alerta('Solo mañana: no cubre la hora pico');
    if (!cualquiera && /solo lunes.?viernes/i.test(horario) && !/s[aá]bado/i.test(horario)) alerta('No puede sábados');
  }

  const jornada = s('jornada');
  if (/full/i.test(jornada)) ok('Full-time');
  else if (jornada) info(jornada.replace(/\s*\(.*\)/, ''));

  const sueldo = s('sueldo');
  const montos = (sueldo.match(/\d[\d,.]*/g) || []).map(n => Number(n.replace(/[,.]/g, '')));
  const desde = /menos de/i.test(sueldo) ? 0 : (montos[0] || 0);
  if (desde >= 1800) alerta(`Sueldo alto: ${sueldo}`);
  else if (desde >= 1500) info(`Sueldo: ${sueldo}`);
  else if (sueldo) ok(`Sueldo: ${sueldo}`);

  const perm = s('permanencia');
  if (/menos de 1|meses/i.test(perm)) alerta(`Permanencia corta: ${perm}`);
  else if (/1 a 2/.test(perm)) info('Viene “probando” (1–2 años)');
  else if (perm) ok(`Se queda: ${perm.replace(/\s*\(.*\)/, '')}`);

  const exp = s('tiempoVentas');
  if (/menos de 6|ninguna|no tengo/i.test(exp)) alerta(`Poca experiencia en ventas (${exp})`);
  else if (exp) ok(`Experiencia en ventas: ${exp}`);

  const gym = s('gimnasio');
  if (/membres[ií]as de gimnasio/i.test(gym)) ok('Ya vendió membresías de gym');
  else if (/fitness/i.test(gym)) ok('Vendió productos fitness');
  else if (/nunca|primera vez/i.test(gym)) info('Primera vez vendiendo');

  const prom = s('promedioVentas');
  if (/m[aá]s de 40|20 a 40/i.test(prom)) ok(`Vendía ${prom}`);
  else if (/menos de 5|^0|ninguna/i.test(prom)) alerta(`Vendía poco: ${prom}`);
  else if (/no tengo/i.test(prom)) info('Sin trabajo anterior en ventas');

  const wa = s('whatsappVentas');
  if (/canal principal/i.test(wa)) ok('Cierra por WhatsApp');
  else if (/^no|nunca/i.test(wa)) alerta('Nunca cerró por WhatsApp');

  const com = s('comision');
  if (/^no|sueldo fijo/i.test(com)) alerta('Prefiere sueldo fijo (no le motiva la comisión)');

  const metas = s('metas');
  if (/^no|estres|no me gustan/i.test(metas)) alerta(`Metas diarias: ${metas}`);
  else if (/aunque no/i.test(metas)) info(`Metas diarias: ${metas}`);

  const fit = parseInt(s('fitness'), 10);
  if (fit && fit <= 2) alerta(`Poco interés en fitness (${fit}/5)`);

  ['caso1', 'caso2', 'caso3'].forEach((k, i) => {
    const v = s(k);
    if (v && v.length < 45) alerta(`Caso ${i + 1}: respuesta muy corta`);
  });
  if (s('porQue') && s('porQue').length < 60) info('“¿Por qué Rurush?” genérico');

  if (s('nombre') && !s('cv')) alerta('No subió CV');
  if (s('nombre') && !s('video')) info('Sin video de presentación');
  if (s('nombre') && !s('referencias')) info('Sin referencias');
  return out;
}

function semaforo(flags) {
  const n = flags.filter(f => f.t === 'alerta').length;
  return n >= 3 ? 'rojo' : n >= 1 ? 'amarillo' : 'verde';
}

// Plantillas de WhatsApp. {nombre} {fecha} {hora} {firma} {direccion}
// ronda: el botón "Agendar y enviar" guarda la cita (pestaña AGENDA + Google Calendar).
// estado: el botón "Abrir y marcar" cambia el ESTADO del postulante.
const PLANTILLAS = [
  {
    id: 'e1', titulo: '📅 Invitar a 1ª entrevista', ronda: 1, pideFecha: true,
    texto: 'Hola {nombre} 👋, te escribe {firma}. Revisamos tu postulación para Asesor(a) Comercial y nos gustaría conocerte.\n\n¿Puedes venir a una entrevista el *{fecha}* a las *{hora}*?\n📍 {direccion}\n\nConfírmame por aquí, por favor 🙌'
  },
  {
    id: 'e2', titulo: '⭐ Invitar a 2ª entrevista', ronda: 2, pideFecha: true,
    texto: '¡Hola {nombre}! 🎉 Pasaste a la *2ª entrevista* para Asesor(a) Comercial en Rurush.\n\nTe esperamos el *{fecha}* a las *{hora}* en {direccion}.\nVen preparado/a para una simulación de venta 💪\n\n¿Me confirmas?'
  },
  {
    id: 'rec', titulo: '⏰ Recordatorio del día', pideFecha: true,
    texto: 'Hola {nombre} 👋 te recuerdo tu entrevista *hoy* a las *{hora}* en {direccion}. ¡Te esperamos! Si tienes algún inconveniente, avísame por aquí.'
  },
  {
    id: 'docs', titulo: '📎 Pedir documentos',
    texto: 'Hola {nombre}, te escribe {firma}. Para avanzar con tu postulación nos falta: {faltan}. ¿Nos lo puedes enviar por aquí? 🙏'
  },
  {
    id: 'no', titulo: '🙏 No seleccionado', estado: '🔴 Descartado',
    texto: 'Hola {nombre}, gracias por tu tiempo y por postular a Rurush Fitness Club 🙏. En esta ocasión decidimos avanzar con otros perfiles, pero guardamos tus datos para próximas convocatorias. ¡Te deseamos muchos éxitos!'
  },
  {
    id: 'si', titulo: '🎉 Contratado', estado: '🟢 CONTRATADO', pideFecha: true,
    texto: '¡Felicidades {nombre}! 🎉 Queremos que seas parte del equipo comercial de Rurush Fitness Club.\n\nTu primer día es el *{fecha}* a las *{hora}* en {direccion}. Trae tu DNI. ¡Bienvenido/a! 💪'
  }
];

function faltantes(d) {
  const f = [];
  if (!d.cv) f.push('tu CV en PDF');
  if (!d.certijoven) f.push('tu Certijoven');
  if (!d.video) f.push('tu video de presentación (máx. 1 min)');
  if (!d.referencias) f.push('1 o 2 referencias laborales con WhatsApp');
  return f.length ? f.join(', ') : 'tu CV en PDF';
}

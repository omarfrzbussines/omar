/* Plantillas aprobadas por Omar.
   [NOMBRE], [DIA], [HORA], [HORA2] y [FECHA] los rellena el panel solo.
   Para cambiarlas: editar este archivo y recargar la extensión en
   chrome://extensions, luego F5 en WhatsApp Web. */

const UBICACION =
  "Aquí la ubicación GPS 📍 https://maps.app.goo.gl/8qmgUTHsMH7NHF698\n" +
  "Avenida Larco 1164 - Víctor Larco, al costado de Mass (antes de la Reniec de Larco)";

window.RURUSH_TEMPLATES = [
  /* Antes habia TRES recordatorios de free pass: uno que decia "manana", otro que
     tambien decia "manana" pero pedia confirmar, y otro que decia "hoy". La asesora
     tenia que acertar entre los tres y de ahi salian los mensajes tipo "tu clase es
     manana jueves" enviados un jueves. Ahora son dos, y el dia lo pone el selector
     Dia: la eleccion que se podia errar ya no existe. */
  {
    id: "recordatorio",
    grupo: "Free Pass",
    titulo: "Recordatorio de clase",
    nota: "FP temprano: mandarlo la noche anterior, mínimo 8pm. FP de tarde: el mismo día, mínimo 2h antes.",
    texto:
      "¡Hola [NOMBRE]! Todo listo para [DIA] a las [HORA] 💪 Te esperamos en Rurush Fitness Club. " +
      "Ven con ropa cómoda y tu botella de agua. ¡Nos vemos!",
    conUbicacion: true
  },
  {
    id: "recordatorio_confirma",
    grupo: "Free Pass",
    titulo: "Recordatorio que pide confirmar",
    nota: "Cuando necesitas respuesta: primera vez, o el lead no ha dicho nada.",
    texto:
      "¡Hola [NOMBRE]! Tu clase gratuita en Rurush Fitness Club es [DIA] a las [HORA]. " +
      "Ya tenemos tu espacio reservado y tu coach está listo para ayudarte según tu objetivo.\n\n" +
      "Para asegurar tu cupo, por favor responde:\n" +
      "\"Confirmo\" si vienes\n\"Reagendar\" si deseas mover tu horario.\n\n" +
      "¡Te vemos pronto para empezar tu cambio!",
    conUbicacion: true
  },
  /* Va apenas se agenda, no el dia antes. Sale de la auditoria de no-shows de
     agosto: 47 de 79 casos venian de chats donde la hora nunca se cerro por
     escrito. El panel la abre solo despues de agendar, con el dia y la hora ya
     puestos, para que nadie los vuelva a teclear. */
  {
    id: "confirmacion_cita",
    grupo: "Agendamiento",
    titulo: "Confirmación de la cita",
    nota: "Se abre sola al agendar. Cierra la hora por escrito — es lo que evita el no-show.",
    texto:
      "¡Listo [NOMBRE]! 💪 Te dejo reservada tu clase gratuita para [DIA] a las [HORA] " +
      "en Rurush Fitness Club.\n¿Te queda bien ese horario?",
    conUbicacion: true
  },
  {
    id: "doble_opcion_momento",
    grupo: "Agendamiento",
    titulo: "Cierre — momento del día",
    nota: "Primero el momento, después la hora. Nunca pregunta abierta.",
    texto: "¿Te agendo hoy en la tarde o en la noche? 😊",
    conUbicacion: false
  },
  {
    id: "doble_opcion_hora",
    grupo: "Agendamiento",
    titulo: "Cierre — hora",
    nota: "Solo hoy o mañana. Nunca a más días.",
    texto: "Perfecto 💪 ¿Te reservo a las [HORA] o a las [HORA2]?",
    conUbicacion: false
  },
  {
    id: "viajero",
    grupo: "Agendamiento",
    titulo: "Lead de viaje",
    nota: "Siempre cerrar con fecha concreta.",
    texto: "¡Entiendo [NOMBRE]! 😊 ¿Más o menos cuándo llegas? Así te dejo reservada tu clase para ese día.",
    conUbicacion: false
  },
  {
    id: "reagendo",
    grupo: "No-show",
    titulo: "Reagendo no-show",
    nota: "Leer el chat antes: si ya respondió algo, cambiar el arranque.",
    texto:
      "Hola [NOMBRE]! 😊 Vimos que no pudiste venir. Te reagendamos para [DIA] a las [HORA] 🕒\n" +
      "¿Confirmas? ✅ / Reagendar 🔄",
    conUbicacion: true
  },
  {
    id: "falta_socio",
    grupo: "Retención",
    titulo: "Socio que dejó de venir",
    nota: "Escala 3 / 7 / 15 días sin asistir.",
    texto:
      "¡Hola [NOMBRE]! 😊 Te extrañamos por el gym, notamos que no vienes hace unos días. " +
      "¿Todo bien? Cuéntame qué horario te queda mejor esta semana y te reservo tu espacio 💪",
    conUbicacion: false
  },
  {
    id: "renovacion",
    grupo: "Retención",
    titulo: "Plan por vencer",
    nota: "Usar cuando la ficha muestra menos de 7 días restantes.",
    texto:
      "¡Hola [NOMBRE]! 💪 Tu plan vence el [FECHA]. Para que no pierdas el ritmo que ya agarraste, " +
      "te puedo dejar lista tu renovación desde hoy. ¿Te reservo el mismo plan o quieres que veamos otra opción?",
    conUbicacion: false
  }
];

/* Opciones del campo Dia. Era texto libre con "manana" escrito por defecto, y de
   ahi salian los "manana jueves" mandados un jueves. La regla es hoy o manana. */
window.RURUSH_DIAS = ["hoy", "mañana"];

window.RURUSH_UBICACION = UBICACION;

/* Imágenes que se pegan en el chat listas para enviar. Para agregar una: poner el
   archivo en assets/, sumarlo aquí y declararlo en web_accessible_resources. */
window.RURUSH_ADJUNTOS = [
  { id: "ubicacion", titulo: "📍 Foto de ubicación", archivo: "assets/ubicacion.jpg",
    nota: "Mapa con el gym marcado. Va con el link de GPS como texto de la foto.",
    // El texto viaja PEGADO a la imagen, no como mensaje aparte: así el lead
    // recibe el mapa y el link juntos y no se le pierde uno de los dos.
    pie: "📍 Aquí nos ubicas 👉 https://maps.app.goo.gl/8qmgUTHsMH7NHF698" },
  { id: "horarios",  titulo: "🕐 Horario de atención", archivo: "assets/horarios.jpg",
    nota: "Lun-Vie 6am-10pm · Sáb 7am-6pm.",
    pie: "" }
];
/* Horarios válidos para ofrecer una clase de prueba.
   El 8am estuvo excluido hasta el 25-sep-2026 por pedido de Omar; ese día pidió
   habilitarlo. Si vuelve a quedar fuera, se borra esta línea y listo. */
window.RURUSH_HORAS = [
  { v: "06:00", t: "6am" },  { v: "07:00", t: "7am" },
  { v: "08:00", t: "8am" },  { v: "09:00", t: "9am" },
  { v: "10:00", t: "10am" }, { v: "11:00", t: "11am" }, { v: "12:00", t: "12m" },
  { v: "13:00", t: "1pm" },  { v: "14:00", t: "2pm" },  { v: "15:00", t: "3pm" },
  { v: "16:00", t: "4pm" },  { v: "17:00", t: "5pm" },  { v: "18:00", t: "6pm" },
  { v: "19:00", t: "7pm" },  { v: "20:00", t: "8pm" },  { v: "21:00", t: "9pm" }
];
window.RURUSH_HORARIOS = window.RURUSH_HORAS.map((h) => h.t);

/* Diego atiende nutrición solo martes y miércoles, en sesiones de 30 min. */
window.RURUSH_NUTRI = {
  dias: [2, 3],                                   // 2 = martes, 3 = miércoles
  cupos: ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
          "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"]
};

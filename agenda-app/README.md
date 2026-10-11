# Agenda Omar

App para el celular conectada al Google Sheet **"RURUSH — Tablero de Tareas 2026"**.
Lee y escribe directo en la pestaña **TAREAS**: lo que haces en la app aparece en el Sheet, y lo que se agrega al Sheet aparece en la app.

## Qué hace

- **Hoy**: lo vencido, lo de hoy, mañana, los próximos 7 días y lo que está en proceso. Solo tus tareas.
- **Agenda**: todas tus tareas, incluidas las de más adelante y las que no tienen fecha.
- **Equipo**: las tareas de Mónica, Dana, Brian y las que están por asignar, con filtro por persona.
- **Completar**: tocas el círculo y la tarea pasa a la pestaña **HECHAS** con la fecha de hoy.
- **Agregar** (botón dorado `+`): escribes o dictas la tarea. Si dices "mañana", "el lunes", "el 15", "15 de noviembre" o "urgente", la app elige sola la fecha y la prioridad.
- **Cambiar fecha, prioridad o responsable**: tocas la tarea y eliges.

- **Google Calendar**: en **Hoy** ves arriba tus eventos del día ("Tu día") y los de mañana junto a las tareas de mañana. En **Agenda** ves los eventos de los próximos 7 días. La app solo **lee** tu Calendar principal: los eventos se siguen creando y cambiando en Google Calendar.
- **Prioridad**: cada tarea tiene una barra a la izquierda: dorada si es Alta y gris si es Media. Dentro de cada día, las de prioridad Alta van primero.

La app mantiene el orden del Sheet: cuando agregas o cambias una fecha, la fila se mueve a su lugar.

## Instalación (una sola vez, unos 5 minutos)

1. Abre el Sheet en la computadora y entra a **Extensiones → Apps Script**.
2. Crea un archivo de script nuevo: botón **+** junto a "Archivos" → **Secuencia de comandos**, llámalo `Agenda` y pega el contenido de `Agenda.gs`.
   - Si el proyecto ya tiene código, **no lo borres**. Solo agrega este archivo nuevo.
   - Si otro archivo del proyecto ya tiene una función `doGet`, avísame antes de seguir: solo puede haber una.
3. Crea un archivo HTML: **+** → **HTML**, llámalo exactamente `AgendaApp` y pega el contenido de `AgendaApp.html`.
4. En **Configuración del proyecto** (ícono de engranaje), pon la zona horaria **(GMT-05:00) Lima**.
5. Arriba a la derecha: **Implementar → Nueva implementación** → tipo **App web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Solo yo**
6. Pulsa **Implementar**, acepta los permisos con tu cuenta de Google y copia la **URL de la app web**.

## Ponerla como app en el iPhone

1. Abre la URL en **Safari** (con tu cuenta de Google iniciada).
2. Toca **Compartir** → **Agregar a pantalla de inicio** → nombre: `Agenda`.

Queda como un ícono más en tu pantalla.

## Dictar por voz

El botón de micrófono intenta usar el reconocimiento de voz del navegador. Google muestra estas apps dentro de un marco que a veces bloquea el micrófono; si pasa, la app te avisa y basta con tocar el **micrófono del teclado del iPhone**, que funciona siempre. En los dos casos la app entiende fechas y prioridad en lo que dictas.

## Cuando cambies el código

Después de pegar una versión nueva: **Implementar → Administrar implementaciones → editar (lápiz) → Versión: Nueva → Implementar**. La URL sigue siendo la misma.

## Permiso de Google Calendar

La versión con Calendar necesita un permiso nuevo. Después de pegar el código:

1. En el editor de Apps Script, elige la función `getData` arriba y pulsa **Ejecutar**.
2. Google pide permisos: **Revisar permisos → tu cuenta → Configuración avanzada → Ir a Agenda (no seguro) → Permitir**.
3. Publica la versión nueva como se explica arriba.

Si no das el permiso, la app sigue funcionando con tus tareas y te muestra un aviso en lugar de los eventos.

## Probarla sin Google

Si abres `AgendaApp.html` directo en un navegador, entra en **modo demo** con datos de ejemplo y no guarda nada.

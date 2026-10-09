# 📱 RURUSH Entrevistas — app del celular

La misma herramienta de la extensión de Chrome, pero en el celular: agenda del día, lista de postulantes,
pre-filtro automático, entrevista guiada E1/E2 con puntaje 1–10, notas (dictadas con el 🎤
del teclado), 📞 Llamar, 💬 WhatsApp con plantillas, y todo se guarda en el Sheet
**ENTREVISTA ASESOR V3**.

Este mismo Apps Script también sirve a la extensión de Chrome (`extension-rurush-entrevistas`):
se instala una sola vez para las dos.

## Instalar (Omar, en la PC, una sola vez, ~10 min)

1. **script.google.com → Nuevo proyecto** → nombre **RURUSH Entrevistas**.
2. `Código.gs`: borra todo y pega **Code.gs**.
3. **＋ → HTML** → nombre **App** (sin .html) → pega **App.html**.
4. ⚙️ Configuración → marca **Mostrar "appsscript.json"** → abre **appsscript.json** → pega **appsscript.json**. 💾 Guardar.
5. **Implementar → Nueva implementación → ⚙️ Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - **Implementar** → **Autorizar** (Avanzado → Ir a RURUSH Entrevistas → Permitir).
   > "Cualquier usuario" es para no tener que iniciar sesión con Google en el celular.
   > Sin la llave el link no muestra nada.
6. Selector de funciones → **crearLlave** → **▶ Ejecutar**. En el registro sale:
   ```
   LLAVE → 3f9c…
   URL   → https://script.google.com/macros/s/…/exec
   📱 LINK DEL CELULAR → https://script.google.com/macros/s/…/exec?k=3f9c…
   ```
7. Mándate el **LINK DEL CELULAR** por WhatsApp (y a quien entreviste contigo).
   Quien tenga ese link puede ver y editar las postulaciones: no lo compartas con postulantes.

Opcional: para cambiar la firma de los mensajes, ⚙️ Configuración del proyecto →
**Propiedades del script** → agrega `FIRMA` = `Omar — Rurush Fitness Club`.

## En el celular

1. Abre el link → iPhone: compartir ⬆️ → **Agregar a inicio**; Android: ⋮ → **Agregar a pantalla principal**.
2. Toca un postulante → **🎤 Entrevista** → marca los 6 criterios → **💾 Guardar E1/E2**.
3. Si se cierra la app a la mitad, los puntajes marcados siguen ahí al volver.

## 📅 Agenda de entrevistas

- **Agendar:** en la ficha → 💬 Mensajes → elige fecha y hora → **📅 Agendar E1 y enviar**.
  Abre WhatsApp con la invitación, crea el evento en tu Google Calendar (30 min, con
  recordatorio) y pone el ESTADO en "Entrevista 1 agendada". Si ya tenía cita, la cambia
  (el evento viejo se borra del calendario).
- Al abrir la app sale primero **⏰ ¿Vino?** (citas que ya pasaron sin marcar) o **📅 Hoy**.
  🗓 **Agenda** muestra todas las próximas, por fecha.
- En la ficha: **🎤 Empezar** / **✔ Sí, calificar**, **✖ No vino**, **Reagendar** o **Cancelar**.
  Al guardar la entrevista, la cita queda como "Asistió".
- Todo se guarda en la pestaña nueva **AGENDA ENTREVISTAS** (se crea sola la primera vez).
  **La pestaña del formulario no se toca**: ni columnas nuevas ni cambios de orden, así el
  Google Form sigue llenándola igual. No borres ni reordenes las columnas de AGENDA ENTREVISTAS.
- Para usar otro calendario (no el principal): Propiedades del script → `CALENDARIO_ID` = id del calendario.

**Si ya tenías instalada la versión anterior:** pega el nuevo Code.gs y App.html, luego en el
editor ejecuta **crearLlave** una vez (pedirá permiso para **Google Calendar**: Avanzado →
Permitir) y después **Implementar → Gestionar implementaciones → ✏️ → Versión: nueva**.

## Si cambias algo

Las pantallas y reglas son las mismas de la extensión. Se editan en
`extension-rurush-entrevistas/` (`reglas.js` = pre-filtro, preguntas y plantillas) y luego:
```
sh rurush-app-entrevistas/construir.sh
```
genera de nuevo **App.html**. Pégalo en el proyecto y **Implementar → Gestionar
implementaciones → ✏️ → Versión: nueva** (así el link no cambia).

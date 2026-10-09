# 📱 RURUSH Entrevistas — app del celular

La misma herramienta de la extensión de Chrome, pero en el celular: agenda del día, lista de postulantes,
pre-filtro automático, entrevista guiada E1/E2 con puntaje 1–10, notas (dictadas con el 🎤
del teclado), 📞 Llamar, 💬 WhatsApp con plantillas, y todo se guarda en el Sheet
**ENTREVISTA ASESOR V3**.

Este mismo Apps Script también sirve a la extensión de Chrome (`extension-rurush-entrevistas`):
se instala una sola vez para las dos.

## 🔐 Seguridad: solo celulares autorizados

- El link de la app **no abre nada por sí solo**: sin autorización muestra
  "🔒 Este celular no está autorizado" y no carga ningún dato.
- Cada celular entra con una **invitación de un solo uso** (vence en 24 h). Al tocar
  "Activar", **ese celular** recibe su propia clave secreta, que se guarda solo en él.
  Si la invitación se reenvía después, ya no sirve; si se reenvía el link normal, tampoco.
- **Tú (administrador)** ves en **👥 Equipo** qué celulares tienen acceso y cuándo se usaron,
  invitas a otros (ej. la administradora) y **quitas el acceso** a cualquiera: ese celular
  se bloquea al instante y se borra lo que tenía guardado.
- La administradora puede ver, entrevistar y agendar, pero no invitar ni quitar celulares.
- En el Apps Script se guarda solo la "huella" (SHA-256) de cada clave, nunca la clave.

## Instalar (Omar, en la PC, una sola vez, ~10 min)

1. **script.google.com → Nuevo proyecto** → nombre **RURUSH Entrevistas**.
2. `Código.gs`: borra todo y pega **Code.gs**.
3. **＋ → HTML** → nombre **App** (sin .html) → pega **App.html**.
4. ⚙️ Configuración → marca **Mostrar "appsscript.json"** → abre **appsscript.json** → pega **appsscript.json**. 💾 Guardar.
5. **Implementar → Nueva implementación → ⚙️ Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - **Implementar** → **Autorizar** (Avanzado → Ir a RURUSH Entrevistas → Permitir; pide
     permiso para el Sheet y para Google Calendar).
   > "Cualquier usuario" solo significa que no hay que iniciar sesión con Google: sin un
   > celular autorizado la app no muestra ni guarda nada.
6. Selector de funciones → **primerAcceso** → **▶ Ejecutar**. En el registro sale tu invitación:
   ```
   📱 Abre este link EN TU CELULAR y toca "Activar" (vale 1 sola vez, 24 horas):
   https://script.google.com/macros/s/…/exec?invita=…
   ```
   Mándatela por WhatsApp, ábrela **en tu celular** (en Chrome o Safari, no dentro de
   WhatsApp: ⋮ → Abrir en el navegador) y toca **Activar este celular**. Quedas como administrador.
   `primerAcceso` solo funciona mientras no haya administrador.
7. En tu celular: iPhone → compartir ⬆️ → **Agregar a inicio**; Android → ⋮ → **Agregar a pantalla principal**.
8. **Invitar a la administradora:** en la app → **👥** → nombre "Celular administradora" →
   **Crear invitación** → **Enviar por WhatsApp**. Ella lo abre en SU celular y toca Activar.

Opcional: para cambiar la firma de los mensajes, ⚙️ Configuración del proyecto →
**Propiedades del script** → agrega `FIRMA` = `Omar — Rurush Fitness Club`.

### Si algo pasa
- **Robaron o cambió de celular:** 👥 → **Quitar acceso** a ese celular, y crea una invitación nueva.
- **"Este celular no está autorizado" en un celular que sí estaba:** pasa si se borraron los
  datos del navegador (o en iPhone tras muchos días sin abrir la app). Créale una invitación nueva.
- **Perdiste TU celular (el administrador):** Configuración del proyecto → Propiedades del
  script → borra las que empiezan con `DISP_` (eso saca a todos) y vuelve a ejecutar **primerAcceso**.

## En el celular

1. Toca un postulante → **🎤 Entrevista** → marca los 6 criterios → **💾 Guardar E1/E2**.
2. Si se cierra la app a la mitad, los puntajes marcados siguen ahí al volver.

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

**Si ya tenías instalada una versión anterior:** pega el nuevo Code.gs y App.html, ejecuta
**primerAcceso** (pedirá permiso para **Google Calendar**: Avanzado → Permitir) y luego
**Implementar → Gestionar implementaciones → ✏️ → Versión: nueva**. El link viejo con `?k=`
deja de funcionar: ahora se entra solo con invitación.

## Si cambias algo

Las pantallas y reglas son las mismas de la extensión. Se editan en
`extension-rurush-entrevistas/` (`reglas.js` = pre-filtro, preguntas y plantillas) y luego:
```
sh rurush-app-entrevistas/construir.sh
```
genera de nuevo **App.html**. Pégalo en el proyecto y **Implementar → Gestionar
implementaciones → ✏️ → Versión: nueva** (así el link no cambia).

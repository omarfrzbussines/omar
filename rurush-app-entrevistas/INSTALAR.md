# 📱 RURUSH Entrevistas — app del celular

La misma herramienta de la extensión de Chrome, pero en el celular: lista de postulantes,
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

## Si cambias algo

Las pantallas y reglas son las mismas de la extensión. Se editan en
`extension-rurush-entrevistas/` (`reglas.js` = pre-filtro, preguntas y plantillas) y luego:
```
sh rurush-app-entrevistas/construir.sh
```
genera de nuevo **App.html**. Pégalo en el proyecto y **Implementar → Gestionar
implementaciones → ✏️ → Versión: nueva** (así el link no cambia).

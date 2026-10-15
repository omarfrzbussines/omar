# 📞 RURUSH Llamadas — app del celular para las asesoras

Cada asesora (Mónica, Danna, Laura) abre **su link** en el celular, ve **su cola de
la base 2026**, toca **📞 Llamar**, marca cómo salió, dicta la observación con el 🎤
del teclado y pasa a la siguiente. Se guarda en el Sheet *BASE DE DATOS LEADS RFC*,
en la siguiente ronda libre (1ª a 6ª), con su nombre y la fecha: el RESUMEN se llena solo.

## Instalar (Omar, en la PC, una sola vez, ~10 min)

1. **script.google.com → Nuevo proyecto** → nombre **RURUSH Llamadas**.
2. `Código.gs`: borra todo y pega **Code.gs**.
3. **＋ → HTML** → nombre **Llamadas** (sin .html) → pega **Llamadas.html**.
4. ⚙️ Configuración → marca **Mostrar "appsscript.json"** → en el editor abre
   **appsscript.json** → pega **appsscript.json**. 💾 Guardar.
5. **Implementar → Nueva implementación → ⚙️ Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario** (cualquiera, incluso anónimo)
   - **Implementar** → **Autorizar** (Avanzado → Ir a RURUSH Llamadas → Permitir).
   > "Cualquier usuario" es para que las asesoras no tengan que iniciar sesión con
   > Google. Sin su llave el link no muestra nada.
6. En el editor, selector de funciones → **crearLlaves** → **▶ Ejecutar**.
   En el registro salen los 3 links:
   ```
   MONICA → https://script.google.com/macros/s/…/exec?k=…
   DANNA  → …
   LAURA  → …
   ```
7. Mándale a cada una **su** link por WhatsApp.

## Cada asesora (en su celular)

1. Abre su link → en iPhone: compartir ⬆️ → **Agregar a inicio**; en Android: ⋮ → **Agregar a pantalla principal**.
2. **📞 Llamar** abre el marcador con el número. Al colgar vuelve a la app.
3. Toca cómo salió (CONTESTO, NO CONTESTO, AGENDADO…). Si es **AGENDADO** en la 1ª
   llamada, pone fecha y hora del Free Pass.
4. Toca el cuadro de observación y el **🎤 del teclado** para dictar.
5. **Guardar y siguiente** (se guarda en segundo plano, no hay que esperar).

## Reglas de la cola

- Primero los leads **nunca llamados** (los más nuevos arriba), después los **seguimientos** (los que llevan más tiempo sin llamar).
- No salen: los cerrados (CLIENTE, DESCARTADO, AGENDADO, Otra Ciudad), los que ya tienen 6 llamadas, los llamados **hoy**, y los que llamó **otra asesora** del equipo.
- Lo que se le muestra a una asesora queda reservado para ella 30 min: no se cruzan.
- Antes de escribir se verifica que el número de la fila siga siendo el mismo
  (si alguien ordenó el Sheet, avisa en vez de escribir sobre otra persona).
- La observación de la **1ª llamada** queda como **nota** en la celda ESTADO
  (la 1ª ronda de la base 2026 no tiene columna de observación).

## Quitar el acceso a alguien

Ejecuta **crearLlaves** de nuevo: salen links nuevos y los anteriores dejan de funcionar.
Mándale los nuevos a quienes sigan.

## Si cambias el código

**Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar.**

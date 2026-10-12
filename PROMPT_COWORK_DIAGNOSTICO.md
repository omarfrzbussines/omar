# Diagnóstico: la app de asesoras se queda cargando

Proyecto: Apps Script del Sheet **BASE DE DATOS LEADS RFC** (Extensiones → Apps Script).
Archivos en GitHub `omarfrzbussines/omar`, rama `claude/new-session-xs74z0` (copiar con **Raw**, completos):
`rurush-sheet-scripts/AppLlamadas.gs`, `rurush-sheet-scripts/Llamadas.html`, `rurush-sheet-scripts/Cobros.gs`

1. **Antes de tocar nada:** menú izquierdo **Ejecuciones** (ícono ☰ con reloj). Copiar las últimas 5 filas
   con estado **Error** o **Tiempo de espera agotado**: función, duración y mensaje (clic en la fila).
2. Revisar que en el proyecto haya **un solo** archivo llamado Cobros y que empiece con
   `RURUSH Llamadas → pestaña 💰 Cobros` (si empieza con `RURUSH Hoy → …` es el archivo equivocado: reemplazarlo).
3. **Servicios** (izquierda): si no está **Sheets**, ＋ → Google Sheets API → identificador `Sheets` → Agregar.
4. Reemplazar todo **AppLlamadas**, **Llamadas** (HTML) y **Cobros** con los de GitHub. Ctrl+S.
5. Ejecutar **app_diagnostico** (autorizar si lo pide). Copiar el registro completo.
6. Implementar → Administrar implementaciones → ✏️ → **Nueva versión**. **No** crear implementación nueva.

No tocar otros archivos ni celdas. Reportar: lo de los pasos 1, 2, 3 y 5.

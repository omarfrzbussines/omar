# Acelerar la app de asesoras (RURUSH Llamadas)

Proyecto: Apps Script del Sheet **BASE DE DATOS LEADS RFC** (Extensiones → Apps Script).
Archivos en GitHub `omarfrzbussines/omar`, rama `claude/new-session-xs74z0` (copiar con **Raw**, completos):
`rurush-sheet-scripts/Cobros.gs` y `rurush-sheet-scripts/Llamadas.html`

1. Panel izquierdo **Servicios**: si NO aparece **Sheets**, toca **＋** → **Google Sheets API** → identificador `Sheets` → **Agregar**.
2. Reemplazar todo el archivo **Cobros** con `Cobros.gs` y todo el HTML **Llamadas** con `Llamadas.html`. Ctrl+S.
3. Ejecutar **app_probarApi** → el registro debe decir `misma cola: SÍ ✅` y los ms con y sin API. Anotarlo.
4. Ejecutar **cob_probar** → debe decir "(API Sheets)". Anotarlo.
5. Implementar → Administrar implementaciones → ✏️ → **Nueva versión**. **No** crear implementación nueva.

No tocar otros archivos ni celdas. Reportar: si el servicio Sheets ya estaba o se agregó, y lo que salió en los pasos 3 y 4.

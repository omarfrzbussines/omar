# Instalar "💰 Cobros" en 2 Apps Script de RURUSH

Archivos en GitHub `omarfrzbussines/omar`, rama `claude/new-session-xs74z0` (copiar con **Raw**, completos):
- A1 `rurush-sheet-scripts/Cobros.gs` · A2 `rurush-sheet-scripts/Llamadas.html`
- B1 `rurush-app-celular/Cobros.gs` · B2 `rurush-app-celular/Index.html`
(A1 y B1 son distintos: no cruzarlos.)

## A. RURUSH Llamadas (Sheet BASE DE DATOS LEADS RFC → Extensiones → Apps Script)
1. ＋ Secuencia de comandos **Cobros** ← A1. HTML **Llamadas** ← A2 (reemplazar todo). Ctrl+S.
2. Ejecutar **cob_probar** (autorizar). Anotar el registro; si hay error, parar y avisar.
3. Implementar → Administrar implementaciones → ✏️ → Nueva versión. **No** crear implementación nueva.

## B. RURUSH Hoy (script.google.com)
1. ＋ Secuencia de comandos **Cobros** ← B1. HTML **Index** ← B2 (reemplazar todo). Ctrl+S.
2. Ejecutar **getCobros** (autorizar). Si hay error, avisar.
3. Implementar → Administrar implementaciones → ✏️ → Nueva versión. **No** crear implementación nueva.

No tocar otros archivos ni celdas de los Sheets. No usar ✓ Cobrado ni guardar cobros de prueba.

## Comprobar y reportar
1. Registro de `cob_probar`.
2. Link de una asesora → pestaña 💰 Cobros carga (lista, mes, días sin asistir, botones).
3. RURUSH Hoy → 💰 Cobros, Octubre 2026, TODAS: ¿muestra ~S/5,066 de S/18,438?

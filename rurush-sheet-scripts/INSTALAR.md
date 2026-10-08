# 🔧 Scripts del Sheet BASE DE DATOS LEADS RFC — actualización oct-2026

Todo va en el proyecto de Apps Script del Sheet (**Extensiones → Apps Script**).
⚠️ **Hacer esto ANTES de agregar las columnas nuevas a la pestaña 2026.**
Los scripts nuevos funcionan igual con la hoja de hoy y con la nueva.

## 1. AGENDAMIENTO AUTOMÁTICO (reemplazar todo)
1. Abre el archivo **AGENDAMIENTO AUTOMÁ…**.
2. **Copia tu línea actual** `const PD_TOKEN = '…';` (la vas a necesitar).
3. Ctrl+A → pega **AGENDAMIENTO_AUTOMATICO.gs**.
4. Reemplaza la línea `const PD_TOKEN = 'PEGA-AQUI-…';` por tu línea del paso 2.
5. Ctrl+S. Ejecuta **diagnosticoFP**: en el registro deben salir las columnas de las 6 llamadas.

## 2. LlamadasAPI (reemplazar todo)
1. Abre **LlamadasAPI.gs** → **copia tu línea actual** `const LL_TOKEN = "…";`.
2. Ctrl+A → pega **LlamadasAPI.gs** → reemplaza la línea `LL_TOKEN` por la tuya → Ctrl+S.

## 3. App del celular (2 archivos nuevos)
1. **＋ → Secuencia de comandos** → nombre **AppLlamadas** → pega **AppLlamadas.gs** → Ctrl+S.
2. **＋ → HTML** → nombre **Llamadas** → pega **Llamadas.html** → Ctrl+S.

## 4. FP NO ASISTIERON (1 línea)
Busca:
```js
const FNA_COL_GESTION_FIN = 12;    // L = última col de gestión (ajustar si hay más)
```
y cámbiala por:
```js
const FNA_COL_GESTION_FIN = 29;    // AC = última columna de la 6ª llamada (mueve TODA la gestión)
```
Ctrl+S.

## 5. Publicar la versión nueva
**Implementar → Administrar implementaciones → ✏️ (la de LlamadasAPI) → Versión: Nueva versión → Implementar.**
La URL no cambia: la extensión sigue funcionando sin tocar nada.

## 6. Links de las asesoras
Selector de funciones → **app_crearLlaves** → ▶ Ejecutar. En el registro salen los links
de MÓNICA, DANNA y LAURA (`…/exec?k=…`). Mándale a cada una el suyo.

> La implementación debe estar con **Ejecutar como: Yo** y **Acceso: Cualquier usuario**
> (ya está así porque la usa la extensión).

## Después de pegar todo → avísale a Claude
Claude agrega las columnas a la pestaña 2026 y verifica que el RESUMEN dé los mismos números.

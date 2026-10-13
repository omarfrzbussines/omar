# Cowork — dejar lista la App de Diego (nutrición)

Pega todo lo de abajo en Cowork.

---

Necesito que dejes funcionando la app web de nutrición para Diego, el nutricionista. Usa Chrome con la cuenta **rurushfitclub@gmail.com**: el proyecto de Apps Script es de esa cuenta, no de omarfrz.

**Contexto**
- Hoja: **NUTRICIÓN RURUSH 2026** (https://docs.google.com/spreadsheets/d/1TCaxgkM0CLnDr4b_gdK4wQH6rugpSiwuulIspkRhnIg/edit).
- Su proyecto de Apps Script ya tiene los archivos `Nutricion.gs`, `AppDiego.gs` y `AppDiegoUI.html`. Ya se subieron y no hay que tocar el código.
- La app se abre con la URL de la aplicación web del proyecto + `?app=diego` y pide un PIN, guardado en la propiedad del script `DIEGO_PIN`.
- Problema actual: al abrir el link sale "Google Drive · Necesitas acceso", incluso en incógnito. Casi seguro la implementación no tiene acceso público.

**Pasos**
1. Abre la hoja → **Extensiones → Apps Script**.
2. **Engranaje** (Configuración del proyecto) → **Propiedades del script**: anota el valor de `DIEGO_PIN`. Si no existe, créalo con 4 números al azar y anótalo.
3. Revisa que en **Configuración del proyecto** la zona horaria sea **(GMT-05:00) Lima**.
4. **Implementar → Administrar implementaciones**. Busca la implementación de tipo **Aplicación web**; ignora las de tipo "Biblioteca".
   - Si existe: lápiz (Editar) → **Versión: Nueva versión** → **Ejecutar como: Yo (rurushfitclub@gmail.com)** → **Quién tiene acceso: Cualquier persona** → **Implementar**.
   - Si no existe: **Implementar → Nueva implementación** → engranaje → **Aplicación web** → Descripción "App Diego" → Ejecutar como **Yo** → Acceso **Cualquier persona** → **Implementar**.
   - Si pide permisos, acéptalos con rurushfitclub@gmail.com.
   - **No borres ni archives ninguna implementación.** La extensión Rurush FP usa la que ya existe.
5. Copia la **URL de la aplicación web** (termina en `/exec`). Anota también el **ID de implementación** (empieza con `AKfycb`).
6. Prueba en una **ventana de incógnito**: URL + `?app=diego` → escribe el PIN → debe verse la agenda con el logo de Rurush y las citas del día. Toma una captura.
   - Si sigue saliendo "Necesitas acceso", revisa que el paso 4 haya quedado en "Cualquier persona" y que la versión sea la nueva.
7. **No marques ninguna cita** (ni Asistió, ni No vino, ni Reagendar): eso escribe en Pipedrive. Solo mira que cargue.

**Al terminar, respóndeme con:**
- La URL final para Diego (con `?app=diego`).
- El PIN.
- El ID de implementación y si es la misma implementación que ya existía o una nueva.
- La captura de la app abierta en incógnito.
- Cualquier error, copiado tal cual.

# RURUSH Nutrición — cerebro del seguimiento 11:30

1. Abre la hoja **NUTRICION RURUSH 2026** → Extensiones → Apps Script.
2. Crea `Nutricion.gs` con el contenido de este repo y reemplaza `appsscript.json`
   (Configuración del proyecto → "Mostrar appsscript.json").
3. Configuración del proyecto → Propiedades del script → agrega `PIPEDRIVE_TOKEN` con tu token (a mano).
4. Ejecuta `nu_instalar`: acepta los permisos y copia la **LLAVE** que sale en el registro.
5. Implementar → Nueva implementación → tipo **Aplicación web** → Ejecutar como **Yo** →
   Acceso **Cualquier usuario** → Implementar → copia el link que termina en `/exec`.
6. En la extensión Rurush FP (v2.4.0) → Opciones → sección Nutrición: pega el link y la llave → Guardar.
   El módulo "Nutrición: seguimiento 11:30" empieza en 🧪 Simulación.

## App de Diego (consulta en PC, sin Claude)

Archivos: `AppDiego.gs` y `AppDiegoUI.html` (van en este mismo proyecto; `Nutricion.gs` ya los llama desde `doGet`).

1. Sube los cambios con **ACTUALIZAR.bat** (o pega los dos archivos nuevos en el editor y reemplaza `Nutricion.gs`).
   Si lo haces a mano: Implementar → Administrar implementaciones → lápiz → Versión: **Nueva** → Implementar. El link no cambia.
2. Configuración del proyecto → Propiedades del script → agrega **`DIEGO_PIN`** con una clave de 4 a 6 números.
3. En el editor, elige `dg_probar` → Ejecutar. El registro debe decir cuántas filas leyó y "PIN configurado: sí".
4. Link para Diego: el de la app web + `?app=diego`:
   `https://script.google.com/macros/s/AKfycbzobT-hVbcpJ4-MzOpmFD_ia10vmn4WDu7c2RdNm1jnD6GAof5FwXlJtJcuzH2SmfW6/exec?app=diego`
   Diego lo abre en Chrome, escribe el PIN una vez y lo guarda en favoritos. No necesita cuenta de Claude.

Qué puede hacer Diego: ✅ Asistió (observación obligatoria, InBody, próxima cita), ❌ No vino, 🔁 Reagendar,
🚫 Cancelar, ⧉ Duplicado, ↩ Deshacer, 📅 Agendar próxima, + Llegó sin cita (busca al socio por celular antes de crear ficha).
Reglas: solo martes y miércoles, horas de `NU_HORAS`, nunca para hoy, sin choques, un socio no puede tener dos citas futuras.
"No vino" deja la actividad abierta en Pipedrive a propósito: así el seguimiento de las 11:30 le escribe para reagendar.
Para probar la pantalla sin Google: abre `AppDiegoUI.html` directo en el navegador (modo demostración).

## Reservas de las asesoras (reemplaza el formulario de Pipedrive)

Archivos: `AppReservas.gs` y `AppReservasUI.html` (mismo proyecto; `Nutricion.gs` los abre con `?app=reservas`).

1. Sube con **ACTUALIZAR.bat** y crea una **nueva versión** de la implementación (el link no cambia).
2. Propiedades del script → agrega **`RESERVAS_PIN`** (clave para las asesoras, distinta a la de Diego).
3. Link: el de la app web + `?app=reservas`.

Cómo funciona: la asesora escribe el **celular** → ve la ficha (nombre, DNI, activo/inactivo, evaluaciones, si ya tiene cita).
Si no existe: nombre y apellido (+ DNI opcional); antes de crear muestra fichas parecidas para no duplicar.
No se pide correo: la cita va directo a la ficha (`person_id`), así nunca cae en la ficha de Omar.
Si ya tiene cita futura no deja crear otra: ofrece **moverla**. Al confirmar, la cita entra a Pipedrive (de Diego)
y a CONTROL NUTRICIÓN, y sale el mensaje de WhatsApp listo para copiar.

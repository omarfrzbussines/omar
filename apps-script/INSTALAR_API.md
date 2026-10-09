# API de difusiones — instalar en el Sheet (5 minutos, una sola vez)

Conecta la extensión **Rurush Difusiones** con el Sheet **DIFUSIONES_RURUSH_ago2026**.

## 1. Pegar el script

1. Abre el Sheet **DIFUSIONES_RURUSH_ago2026**.
2. Menú **Extensiones → Apps Script**.
3. Crea un archivo nuevo (**+ → Secuencia de comandos**), llámalo `Difusiones_API` y pega
   todo el contenido de `Difusiones_API.gs`. Si ya hay otros scripts en el proyecto, no los borres.
4. Guarda (💾).

## 2. Crear la clave

1. Arriba, en el selector de funciones, elige **configurar** → **Ejecutar**.
2. La primera vez Google pide permisos: **Revisar permisos → tu cuenta → Configuración avanzada →
   Ir a… (no seguro) → Permitir**. Es tu propio script.
3. Abajo, en **Registro de ejecución**, aparece: `Clave de la API (…): xxxxxxxx`. Cópiala.

## 3. Publicarlo como app web

1. Botón **Implementar → Nueva implementación**.
2. Tipo (⚙️): **App web**.
3. **Ejecutar como:** Yo. **Quién tiene acceso:** Cualquier usuario.
   (Sin la clave nadie puede leer ni escribir nada.)
4. **Implementar** → copia la **URL de la app web** (termina en `/exec`).

## 4. Pegar URL y clave en la extensión

Ícono 📨 de la extensión → **Opciones** → pega la **URL** y la **Clave** → **Guardar**.

## Si cambias el script después

**Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión → Implementar.**
La URL se mantiene.

## Lo que necesita el Sheet

- Pestaña **⚙️ CONFIG** con los rangos con nombre:
  - `DIAS_HOY`: la frase de días que cambia sola cada día.
  - `LINEAS`: asesora y su número de WhatsApp. Si una asesora no tiene número, no se le envía nada.
  - `FERIADOS`: días que no se ofrecen.
- Pestañas de tanda con la cabecera **CELULAR, ASESORA, MENSAJE, ENV, FECHA, RESULTADO, MOTIVO / NOTA**
  (como las de 📨 TANDA 4). Los datos terminan donde empieza el bloque «NO ENVIAR TODAVÍA».
- En el **MENSAJE**, el día va como **`{DIAS}`**: «¿Prefieres {DIAS}?».
  Un mensaje con un día escrito a mano («mañana jueves») queda apartado para que nunca salga una fecha vieja.

## Qué escribe en el Sheet

| Pasa esto | ENV | FECHA | RESULTADO | MOTIVO / NOTA |
|---|---|---|---|---|
| Se envió y se vio la burbuja | ✔ TRUE | hoy | ENVIADO SIN RESPUESTA | Enviado dd/mm hh:mm línea X — extensión, verificado |
| El número no tiene WhatsApp | — | — | SIN WHATSAPP | Número no está en WhatsApp — verificado por extensión |
| Ya le habían escrito | — | — | YA CONTACTADO | Por qué no se envió |

Además deja cada movimiento en la pestaña **📜 LOG EXTENSIÓN**, que se crea sola.

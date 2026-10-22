# Llamadas — instalación (una sola vez, ~5 minutos)

La pestaña **Llamadas** del panel lee y escribe tu Sheet *BASE DE DATOS LEADS RFC*.
Para eso hay que instalar un pequeño script dentro del propio Sheet.

## 1. Instalar el script en el Sheet

1. Abre el Sheet de llamadas → menú **Extensiones** → **Apps Script**
2. Borra lo que haya en el editor y pega todo el contenido de `RURUSH_Llamadas_API.gs`
3. En la línea 25, cambia:

   ```js
   const TOKEN = "CAMBIA-ESTO-POR-UNA-FRASE-LARGA";
   ```

   por una frase tuya, larga y sin espacios. Por ejemplo `rurush-larco-2026-xK9mp`.
   **Anótala**, la vas a necesitar en el paso 3.

4. Guarda (💾)

## 2. Publicarlo

1. Botón **Implementar** → **Nueva implementación**
2. Engranaje ⚙️ → **Aplicación web**
3. Configura así:
   - **Ejecutar como:** Yo (tu correo)
   - **Quién tiene acceso:** Cualquier usuario
4. **Implementar** → te pide autorizar → **Permitir**
5. Copia la **URL de la aplicación web** (termina en `/exec`)

> "Cualquier usuario" suena abierto, pero sin el token del paso 1 toda petición se
> rechaza. Es lo que permite que la extensión entre sin manejar claves de Google.

## 3. Conectar la extensión

1. Clic derecho en el ícono RURUSH → **Opciones**
2. Baja a **Sheet de llamadas**
3. Pega la URL `/exec` y el token
4. **Guardar** → **Probar conexión**

Debe salir: ✅ *Conectado a: BASE DE DATOS LEADS RFC*

## Cómo se usa

En WhatsApp Web, abre el panel → sección **Llamadas**:

1. Elige **quién llama** y la **base** (cada una muestra cuántos pendientes tiene)
2. **Cargar cola** → trae los siguientes 30
3. Por cada persona: **Abrir su chat** → la buscas en WhatsApp y hablas
4. Marcas el resultado, escribes la observación y **Guardar y siguiente**

Lo que se guarda va a la **primera ronda libre** de esa fila (1ª a 6ª llamada),
con la asesora y la fecha de hoy.

## Detalles que conviene saber

- **Cada asesora ve lo suyo:** las filas asignadas a ella más las que nadie tomó.
- **No se repiten llamadas cerradas:** si la última fue CLIENTE, DESCARTADO o
  AGENDADO, esa persona sale de la cola.
- **Tope de 6 llamadas:** quien las agotó ya no aparece.
- **Protección contra filas movidas:** antes de escribir se verifica que el número
  de la fila siga siendo el mismo. Si alguien ordenó el Sheet mientras llamabas,
  avisa en vez de escribir sobre otra persona.
- **Los conteos se cachean 10 minutos.** El botón 🔄 los recalcula.

## Si algo falla

| Mensaje | Qué pasa |
|---|---|
| Falta configurar el Sheet | No pegaste la URL o el token en Opciones |
| Token inválido | El token de Opciones no coincide con el del script |
| El Sheet respondió 401/403 | La implementación no quedó como "Cualquier usuario" |
| La fila cambió en el Sheet | Alguien ordenó o insertó filas — dale Cargar cola otra vez |

Al cambiar el archivo .gs hay que volver a **Implementar → Administrar
implementaciones → editar ✏️ → Versión: Nueva** para que tome los cambios.

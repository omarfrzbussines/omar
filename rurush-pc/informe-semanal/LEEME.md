# PowerPoint semanal sin Claude (0 tokens)

Copia estos 4 archivos a `Documentos\Claude\Projects\RURUSH VENTAS 2026\_informe_semanal\`,
reemplazando `etl.py`:

- `etl.py`: ahora lee las ventas de DATOS_ORIGEN y usa las metas 18k/11k/11k. Ya no lleva tokens adentro.
- `semanal.py`: corre `etl.py`, luego `build.js`, luego `transitions.py`, y copia el deck a la carpeta del proyecto.
- `instalar_tarea.ps1` y `INSTALAR.bat`

Luego:

1. Abre `credenciales_api.txt` (en `RURUSH VENTAS 2026`). Debe tener estas líneas:
   ```
   PIPEDRIVE
   Token: <tu token>
   APPS FIT
   Token: <tu TokenEmpresa>
   ```
2. Haz doble clic en `INSTALAR.bat`. Instala Python y Node si faltan, crea la tarea **"RURUSH Informe Semanal"** (lunes 7:00 am) y hace una prueba.
3. El deck queda en `RURUSH VENTAS 2026` como `RURUSH_Resumen_Semanal_5-11-oct.pptx`.
   - Si algo falla, mira `semanal_log.txt`.

Si la PC está apagada el lunes a las 7, la tarea corre apenas la prendas.

## 📧 Que el PowerPoint te llegue por correo (una sola vez, ~3 min)
Al terminar, `semanal.py` te manda el `.pptx` adjunto a tu Gmail. Necesita una **clave de aplicación**
de Google (no es tu contraseña; sirve solo para enviar correo y la puedes borrar cuando quieras):

1. Entra a **myaccount.google.com/apppasswords** con omarfrz@gmail.com
   (si dice que no está disponible, primero activa la **Verificación en 2 pasos** en Seguridad).
2. Nombre: **RURUSH PowerPoint** → **Crear** → copia la clave de 16 letras.
3. En `credenciales_api.txt` agrega al final:
   ```
   GMAIL
   Correo: omarfrz@gmail.com
   Clave: abcd efgh ijkl mnop
   ```
4. Reemplaza `semanal.py` por la versión nueva.
5. Prueba sin esperar al lunes: en esa carpeta abre una terminal y corre
   `python semanal.py --solo-correo` → reenvía el último deck. En `semanal_log.txt` debe decir `CORREO enviado`.

Si el correo falla, el deck igual queda en la carpeta y el error queda en `semanal_log.txt`.

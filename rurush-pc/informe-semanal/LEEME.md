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

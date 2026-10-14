# Actualizar todo con doble clic (0 tokens)

- **ACTUALIZAR.bat**: baja lo nuevo de GitHub (rama `main`), sube a Google los Apps Script de
  `proyectos.txt` (solo los que cambiaron) y te dice qué extensión recargar en `chrome://extensions`.
  Nunca borra archivos de Google: baja el proyecto, pone encima los del repo y sube.
- **CONECTAR_CUENTA.bat**: conecta una cuenta de Google (una vez por cuenta).
- **proyectos.txt**: carpeta | ID del script | cuenta | ID de implementación.

Primera vez: activar la API de Apps Script en https://script.google.com/home/usersettings (cada cuenta),
CONECTAR_CUENTA.bat por cada cuenta, llenar proyectos.txt y doble clic en ACTUALIZAR.bat.

## Automático (sin doble clic)
- **ACTUALIZAR_AUTOMATICO.bat** (una sola vez): crea la tarea "RURUSH Actualizar". Cada 10 min mira GitHub; si hay algo nuevo sube a Google los Apps Script y copia las extensiones, sin abrir ventana. Lo que hace queda en `tools\auto_log.txt`.
- **QUITAR_AUTOMATICO.bat**: la apaga.
- **extensiones.txt**: si un Chrome carga una extensión desde otra carpeta, pon aquí `carpeta del repo | ruta "Cargado desde"` y ACTUALIZAR copiará ahí los archivos nuevos.
- Las extensiones Rurush FP (2.8.4+) y Difusiones (1.3.8+) se recargan solas cuando ven archivos nuevos (cada 5 min, nunca a mitad de un envío).

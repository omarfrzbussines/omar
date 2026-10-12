# Actualizar todo con doble clic (0 tokens)

- **ACTUALIZAR.bat**: baja lo nuevo de GitHub (rama `main`), sube a Google los Apps Script de
  `proyectos.txt` (solo los que cambiaron) y te dice qué extensión recargar en `chrome://extensions`.
  Nunca borra archivos de Google: baja el proyecto, pone encima los del repo y sube.
- **CONECTAR_CUENTA.bat**: conecta una cuenta de Google (una vez por cuenta).
- **proyectos.txt**: carpeta | ID del script | cuenta | ID de implementación.

Primera vez: activar la API de Apps Script en https://script.google.com/home/usersettings (cada cuenta),
CONECTAR_CUENTA.bat por cada cuenta, llenar proyectos.txt y doble clic en ACTUALIZAR.bat.

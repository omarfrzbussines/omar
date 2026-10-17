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

## 📲 Cuadro de ventas por WhatsApp (lun-vie 7:00 am y 9:00 pm)

Lo envía la extensión **Rurush Difusiones** desde el WhatsApp Web donde está abierta (línea de Mónica):
- A quién: pestaña **📲 CUADRO WHATSAPP** de la HOJA DE REPORTES 2026 (columna A, con 51). Agrega o borra filas ahí.
- 7:00 am: lo que necesitan HOY · 9:00 pm: cierre del día. Si WhatsApp está ocupado, reintenta cada 5 min hasta 2 h.
- La primera vez llega a tu correo "Autoriza…": tocas Autorizar y listo.
- Probar ahora: ícono de la extensión → **📊 Probar cuadro de ventas ahora**.
- `cuadro_whatsapp.ps1` (envío desde la PC) queda solo como respaldo manual: `CUADRO_PROBAR.bat`.

## 🖥️ PCs lejanas: extensiones que se actualizan solas
En cada PC (una sola vez): abrir **PowerShell** y pegar:
```
irm https://raw.githubusercontent.com/omarfrzbussines/omar/main/tools/actualizador_remoto.ps1 | iex
```
- Pregunta qué extensiones usa esa PC (Difusiones, FP, Entrevistas) y su carpeta.
- Crea la tarea **RURUSH Extensiones**: cada 10 min mira GitHub y copia la versión nueva; la extensión se recarga sola.
- No necesita Git ni cuentas de Google. Registro: `%LOCALAPPDATA%\RurushActualizador\log.txt`.
- Quitar: `Unregister-ScheduledTask "RURUSH Extensiones"`.

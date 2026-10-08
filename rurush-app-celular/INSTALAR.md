# 📱 RURUSH Hoy — instalar en el celular (una sola vez, ~10 min)

App web de Google Apps Script. Corre en Google (no necesita la PC prendida), los
tokens quedan guardados en Google y **solo tú puedes abrirla** con tu cuenta.

## 1. Crear el proyecto (en la PC, ~5 min)

1. Entra a **script.google.com** → **Nuevo proyecto** → arriba cambia el nombre a **RURUSH Hoy**.
2. En `Código.gs`: borra todo y pega **Code.gs**.
3. **＋ → Secuencia de comandos**, nómbrala **Configurar** y pega **Configurar.gs**.
4. **＋ → HTML**, nómbralo **Index** (sin .html) y pega **Index.html**.
5. ⚙️ Configuración del proyecto → marca **"Mostrar el archivo de manifiesto appsscript.json"** →
   vuelve al editor, abre **appsscript.json**, borra todo y pega **appsscript.json**.
6. En **Configurar**, pega tus dos tokens donde dice `PEGA-AQUÍ…` → 💾 Guardar.

## 2. Guardar los tokens y probar (1 clic)

1. Arriba, en el selector de funciones, elige **configurarUnaVez** → **Ejecutar**.
2. Te pide permisos → **Revisar permisos** → tu cuenta → **Avanzado → Ir a RURUSH Hoy** → **Permitir**.
   (Es tu propio script; el aviso sale porque Google no lo revisó.)
3. Abajo, en el registro, debe salir: `{"appsfit":"OK","pipedrive":"OK — Omar…"}`
4. Listo: **borra el archivo Configurar** (⋮ → Eliminar). Los tokens ya quedaron guardados en Google.

## 3. Publicarla

1. **Implementar → Nueva implementación** → engranaje ⚙️ → **Aplicación web**.
2. **Ejecutar como:** Yo · **Quién tiene acceso:** Solo yo.
3. **Implementar** → copia la **URL de la aplicación web**.

## 4. En el celular

1. Mándate la URL (por WhatsApp a ti mismo, por ejemplo) y ábrela en **Chrome**
   (Android) o **Safari** (iPhone), con la misma cuenta de Google.
2. Agrégala a la pantalla de inicio:
   - **Android / Chrome:** menú ⋮ → **Agregar a la pantalla principal**.
   - **iPhone / Safari:** botón compartir ⬆️ → **Agregar a inicio**.

Listo: queda como un ícono más.

## Uso

- **Hoy:** socios activos, % que vino (hoy, ayer, 7 y 30 días), en riesgo, inscritos y venta del día.
- **Free Pass:** FP de hoy (✅ si asistió), no-shows de ayer y FP de mañana.
- **Retención:** fríos que vencen en 7 días, en riesgo (vigentes con +10 días sin venir) y los que vencen esta semana.
- Arriba filtras por asesora. 💬 abre el WhatsApp de esa persona.
- Los datos se guardan 5 minutos; 🔄 trae lo último al momento.

## Si cambias el código más adelante

**Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar.**
La URL no cambia.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| Falta APPSFIT_TOKEN / PIPEDRIVE_TOKEN | Revisa las Propiedades del script (paso 1.5) |
| Apps Fit rechazó el TokenEmpresa | El token está mal copiado |
| Pipedrive rechazó el token | Copia de nuevo el token desde Pipedrive → Preferencias personales → API |
| "No tienes permiso" al abrir en el celular | Estás con otra cuenta de Google en el celular |

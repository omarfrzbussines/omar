# 📲 RURUSH Historias IG — programar historias de Instagram (una sola vez, ~15 min)

Programa **historias orgánicas** de la cuenta de RURUSH (no es publicidad, no gasta saldo).
Corre en Google: no necesita la PC ni el celular prendidos.

**Cómo se usa después de instalarlo:**
1. Subes la imagen o video (vertical 9:16) a la carpeta de Drive **HISTORIAS RURUSH**
   (desde el celular también: app de Drive → ＋ → Subir).
2. Aparece sola en la hoja **HISTORIAS** (máx. 10 min). Le pones **FECHA** y **HORA**.
3. A esa hora sale en Instagram. La columna ESTADO pasa a **PUBLICADA ✅** y el archivo
   se mueve a la subcarpeta **PUBLICADAS**.

> Atajo: si nombras el archivo `2026-10-15 07-30 promo.jpg`, fecha y hora se llenan solas.

---

## 1. Token de Meta con permiso para publicar (~7 min)

El token de Ads (`META_TOKEN` de RURUSH Hoy) **solo lee anuncios**; para publicar historias
hace falta uno con otros permisos. Lo mejor es un *usuario del sistema* (no vence):

1. **business.facebook.com** → ⚙️ Configuración → **Usuarios → Usuarios del sistema** → **Agregar**
   (nombre: `historias`, rol: Administrador).
2. Con ese usuario seleccionado → **Asignar activos** → **Páginas** → la página de RURUSH →
   control total. Haz lo mismo en **Cuentas de Instagram** → la cuenta de RURUSH.
3. **Generar nuevo token** → elige tu app (si no tienes, créala en developers.facebook.com →
   Crear app → tipo *Empresa*) → caducidad **Nunca** → marca estos permisos:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`
4. Copia el token.

## 2. Carpeta y hoja (~3 min)

1. En Drive crea la carpeta **HISTORIAS RURUSH** y copia su link.
2. Crea una hoja de cálculo nueva: **RURUSH Historias IG**.
3. En la hoja: **Extensiones → Apps Script**.
4. En `Código.gs`: borra todo y pega **Code.gs**.
5. **＋ → Secuencia de comandos**, nómbrala **Configurar** y pega **Configurar.gs**.
6. ⚙️ Configuración del proyecto → marca **"Mostrar el archivo de manifiesto appsscript.json"** →
   abre **appsscript.json**, borra todo y pega **appsscript.json**.
7. En **Configurar** pega el token y el link de la carpeta donde dice `PEGA-AQUÍ…` → 💾 Guardar.

## 3. Activar (1 clic)

1. Selector de funciones → **configurarUnaVez** → **Ejecutar**.
2. Permisos → **Revisar permisos** → tu cuenta → **Avanzado → Ir a…** → **Permitir**.
3. En el registro debe salir: `✅ Listo: @rurush… · carpeta "HISTORIAS RURUSH" · reloj cada 10 min.`
4. **Borra el archivo Configurar** (⋮ → Eliminar). El token ya quedó guardado en Google.
5. Recarga la hoja: aparece el menú **📲 Historias IG** → **Probar conexión con Instagram**.

---

## Bueno saber

- **Formato:** imagen JPG o PNG (los PNG se convierten solos a JPG) o video MP4 de hasta 60 s,
  vertical 1080×1920.
- **Puntualidad:** sale entre 0 y 10 min después de la hora puesta (el reloj revisa cada 10 min).
- **Lo que la API de Instagram no permite:** stickers (link, encuesta, música, menciones
  clicables). Si la historia necesita sticker de link, ponlo en el diseño como texto o súbela a mano.
- **Límite de Instagram:** 50 publicaciones por día por API (sobra para historias).
- **Si algo falla:** ESTADO = **ERROR ❌**, el motivo sale en DETALLE y te llega un correo.
  Corrige y **borra el ESTADO** para que lo reintente.
- **Atrasadas:** si por algo el reloj no corrió y pasaron más de 12 h, queda **VENCIDA ⚠️**
  en vez de publicarse tarde. Cambia fecha/hora y borra el ESTADO.
- **Publicar ya:** selecciona la fila → menú **📲 Historias IG → Publicar YA la fila seleccionada**.
- Al momento de publicar, el archivo se comparte unos segundos "cualquiera con el enlace" (Instagram lo
  descarga de ahí); al publicarse vuelve a privado.

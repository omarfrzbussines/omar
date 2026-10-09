# 📨 Rurush Difusiones (extensión de Chrome)

Envía una **tanda de difusión** del Sheet **DIFUSIONES_RURUSH_ago2026** por WhatsApp Web, uno por uno,
**sin repetir números**, y marca el Sheet después de cada envío. No usa Claude.

Es una extensión **aparte** de la de ventas y de la de Free Pass, para no mezclar.

## Antes de instalarla

Instala la API en el Sheet: ver [`../apps-script/INSTALAR_API.md`](../apps-script/INSTALAR_API.md).

## Instalación (una sola vez por PC)

1. Descarga la carpeta `extension-rurush-difusiones` a la PC.
2. En Chrome (el perfil que tiene WhatsApp Web de la asesora) abre `chrome://extensions`.
3. Activa **Modo de desarrollador** (arriba a la derecha) → **Cargar descomprimida** → elige la carpeta.
4. Fija el ícono 📨 (rompecabezas → 📌).
5. Clic en 📨 → **Opciones** → pega la **URL** y la **Clave** de la API → **Guardar**.

## Cómo se usa

1. Abre **WhatsApp Web con la línea de la asesora** (Laura 936 555 464, Mónica 934 352 367).
2. Clic en 📨 → elige la **pestaña de la tanda** y la **asesora** → **Cargar pendientes**.
   - Verás cuántos hay para enviar y la lista de **apartados** con el motivo
     (sin WhatsApp, no contactar, ya recibió difusión, mensaje con día fijo…).
3. **▶️ Iniciar.** Puedes cerrar el popup: sigue sola. **⏸️ Pausar** / **⏹️ Detener** cuando quieras.
4. No uses esa pestaña de WhatsApp Web mientras envía. Si la usas, la extensión espera 5 minutos.

## Primera vez: modo simulación 🧪

Viene con **Simulación activada**: abre cada chat y hace todos los controles, pero **no aprieta
Enviar ni marca el Sheet**. Revisa en el popup qué le habría mandado a cada uno. Si todo cuadra,
en Opciones desmarca **Simulación** → **Guardar** → vuelve a **Cargar pendientes** e **Iniciar**.

## 🤖 Modo automático (v1.1.0)

En **Opciones → Modo automático**: marca «Enviar solo todos los días», hora **8**, días **Lun–Vie**,
y la pestaña (por ejemplo `📨 TANDA 8 EX ALUMNOS`). Tope por línea: **30**.

- Cada 10 minutos la extensión revisa: si es día marcado, ya pasó la hora y hoy todavía no arrancó,
  mira qué número está abierto en WhatsApp Web, busca su asesora en **⚙️ CONFIG → LINEAS** y carga
  sus pendientes de la primera pestaña que tenga algo. Luego envía sola hasta el tope del día.
- No hay que elegir asesora: **la línea abierta decide**. Así nunca sale un mensaje de Laura desde el
  WhatsApp de Mónica.
- Si la PC se prende tarde (por ejemplo 10:30), arranca al prender. Si Chrome se cierra a mitad, la retoma.
- Una PC / un perfil de Chrome por línea, cada uno con su WhatsApp Web abierto.
- Respeta la simulación: con «Simulación» marcada no envía nada de verdad.

## 💬 Revisión de respuestas (v1.2.0)

Viene activada (Opciones → «Revisar respuestas solo»). Funciona aunque el envío automático esté apagado.

- **2 horas después del último envío** y **cada mañana** (antes de enviar), la extensión abre los chats
  que siguen «ENVIADO SIN RESPUESTA» de los **últimos 3 días** de la línea abierta.
- Si el contacto escribió después de nuestro mensaje: RESULTADO = **RESPONDIO - POR CONTESTAR**, en NOTA
  queda lo que dijo, y se agrega una fila en **💬 RESPUESTAS**. El cuadro de KPIs lo cuenta solo.
- No toca filas que las asesoras ya marcaron a mano. No responde a nadie: solo avisa.
- Botón **💬 Revisar respuestas** en el popup para hacerlo cuando quieras.

## Cómo evita repetir un número (basta uno para no enviar)

1. **Lista de bloqueo** de Opciones.
2. **Registro de esta PC:** números a los que esta extensión ya envió en los últimos N días.
3. **El Sheet, justo antes de cada envío:** busca el número en **todas** las pestañas de tanda
   (por si otra PC lo envió hace un rato o está marcado NO CONTACTAR).
4. **El chat de WhatsApp:** si ya hay un mensaje nuestro que diga «Rurush» en los últimos N días, no envía.
5. **Al marcar,** el Sheet rechaza una fila que ya estaba enviada.

N = **30 días** por defecto (Opciones → «Días sin repetir»).

## Otros cuidados

- **Línea correcta:** si WhatsApp Web está en otro número que el de la asesora, **no envía nada** y se pausa.
- **Borrador exacto:** solo aprieta Enviar si el texto cargado es igual al mensaje del Sheet.
- **Burbuja confirmada:** después de enviar, espera ver el mensaje en el chat. Si queda con reloj o con
  error, se pausa para que lo revises.
- **Fecha del día:** el Sheet reemplaza `{DIAS}` por la frase de hoy (pestaña ⚙️ CONFIG), así nunca sale
  una fecha vieja.
- **Pausas** al azar entre envíos (45–90 s), **tope por línea por día** (40) y **horario** (8:00–20:00).
  Todo se cambia en Opciones.
- Si el Sheet no responde al marcar, guarda la marca y la reintenta en el siguiente envío.
- Si Chrome se cierra en medio, al volver queda **pausada**: no arranca sola.

## Límites conocidos

- Necesita **la PC prendida y Chrome abierto** mientras envía.
- Lee solo los mensajes que WhatsApp Web tiene cargados del chat (los últimos).
- Si WhatsApp cambia su página y no encuentra el botón Enviar, se pausa con ⚠️ y no manda nada a medias.

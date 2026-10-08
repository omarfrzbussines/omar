# 🔥 Rurush FP — recordatorio 2h (extensión de Chrome)

Reemplaza la rutina **FPS 2HRS** sin gastar uso de Claude. Corre en el Chrome
donde está abierto WhatsApp Web (Pipechat) de las asesoras.

## Qué hace (cada 30 min, 8am–8pm, lun–sáb, hora Lima)

1. **Pipedrive** → actividades `FP…` / `FREE PASS…` de HOY (ventana ayer → hoy+2 por el bug de UTC).
2. **Portero** → solo sigue si a alguna clase le faltan **≤ 4h** y todavía no pasó.
3. **WhatsApp Web** → abre el chat y lo lee:
   - ya tiene recordatorio cercano con GPS hoy → salta
   - canceló / pidió reagendar → salta
   - el chat menciona **otra hora** distinta a Pipedrive → **no envía**, lo marca ⚠️ para revisar a mano
   - confirmó → reconfirmación + GPS · no respondió → "¿confirmas?" + GPS
4. **Envía** un solo mensaje (≤180 caracteres, combinatorio para que no se repita).
5. Registra cada FP enviado para no repetirle, y muestra el resumen en el ícono 🔥.

Si en Opciones cargaste una **imagen "cómo llegar"**, la envía justo después del texto.

Todos los días a las **9:05pm** descarga solo el reporte del día en
`Descargas/RurushFP/reporte-AAAA-MM-DD.txt` (también está el botón 📋 Copiar reporte de hoy).

Nunca contacta los números de la lista de bloqueo (vienen cargados 51942853538 y 51953876647).

## Instalación (una sola vez)

1. Descarga esta carpeta `extension-rurush-fp` a la PC.
2. En Chrome (el perfil **ASESOR RURUSH**, el que tiene WhatsApp Web) abre `chrome://extensions`.
3. Activa **Modo de desarrollador** (arriba a la derecha) → **Cargar descomprimida** → elige la carpeta.
4. Clic en el ícono 🔥 → **Opciones**:
   - pega el **token de Pipedrive**
   - el número de la sesión ya viene cargado (51926918075): si WhatsApp Web está en otro número, no envía nada
   - **Guardar**
5. Deja una pestaña de WhatsApp Web abierta (mejor fijada). Si no hay, la extensión la abre.

## Primera vez: modo simulación 🧪

Viene con **Simulación activada**: hace todo menos apretar Enviar y te muestra en el
ícono 🔥 qué mensaje le habría mandado a cada uno. Revisa un par de corridas y, si
todo cuadra, en Opciones desmarca **Simulación** → desde ahí envía de verdad.

Después **desactiva la rutina "FPS 2HRS"** para que no manden los dos.

## Convivencia con las rutinas de Claude

- Si alguien (una asesora o Claude) está usando WhatsApp Web en ese momento, la
  extensión **espera 10 min** y reintenta, para no cambiarle el chat a la mitad.
- Cuando la extensión corre, la pestaña de WhatsApp Web navega sola entre chats
  (≈30 s por persona). No la toques mientras dice que está enviando.

## Límites conocidos

- Necesita la **PC prendida y Chrome abierto** (igual que las rutinas de hoy).
- Lee solo lo que WhatsApp Web tiene cargado del chat (los últimos mensajes).
- Detecta "otra hora" solo cuando la hora lleva am/pm, "hrs" o "de la tarde/noche".
  "a las 7" a secas no la detecta.
- Si WhatsApp cambia su página, puede dejar de encontrar el botón Enviar: en ese caso
  avisa con ⚠️ y no manda nada a medias.

# 🔥 Rurush FP — recordatorio 2h (extensión de Chrome)

Reemplaza la rutina **FPS 2HRS** sin gastar uso de Claude. Corre en el Chrome
donde está abierto WhatsApp Web (Pipechat) de las asesoras.

## Módulos (hora Lima)

| Módulo | Cuándo | A quién | Reemplaza |
|---|---|---|---|
| Recordatorio 2h | cada 30 min, lun–sáb 8–20h | FP de hoy con ≤4h para la clase | FPS 2HRS |
| Recordatorio de la mañana | lun–sáb 9:00 (configurable) | FP de hoy desde la 1pm | (nuevo) |
| No-show de ayer | lun–sáb 9:15 | FP de ayer que no vinieron | FP 9 AM (parte no-shows) |
| Sábado seguimiento | sáb 11:00 | no-shows lun–sáb sin FP nuevo | FP SABADOS SEGUIMIENTO |
| No-show de la mañana | lun–sáb 13:00 | FP de hoy 6:00–11:30 | FP 1PM |
| Refuerzo noche anterior | dom–vie 20:00 | FP de mañana | FP 8PM (parte FP de mañana) |
| No-show de la tarde | lun–sáb 20:10 | FP de hoy 11:30–18:30 | FP 8PM (parte no-shows) |
| Domingo | dom 9:00 | FP del lunes + no-shows de la semana | DOMINGO REC FP 9 AM |
| Etiquetar FREE PASS | cada 2h desde 8:40 | todo el que tenga FP en Pipedrive (hoy a 14 días) | (nuevo) |
| Chats de anuncios | cada 30 min, 8–21h | leads nuevos de Pipedrive (3 días) | etiquetar a mano mirando la foto |

Cada módulo tiene su modo en Opciones: 🧪 Simulación (no envía), 📤 Envío real o Apagado.

Reglas comunes:
- Antes de escribir abre el chat, comprueba que es el del número y lo lee.
- Reagendos: máximo 1 cada 48h y 3 en total por persona; nunca a quien ya tiene un FP nuevo.
- Salta a quien escribió hace <3h, dijo que ya asistió, que avisa, o canceló (según el módulo).
- Avisa ⚠️ para revisar a mano: otra hora en el chat, "no me interesa", "voy el viernes" sin FP nuevo.
- Nunca escribe antes de las 6:00 ni después de las 21:30; si la PC estuvo apagada >3h a la hora programada, ese módulo se omite.
- No escribe en Pipedrive (salvo el campo Video de los chats de anuncios).
- Dirección: Av. Larco 1164, Víctor Larco, al costado de Mass.

Etiquetar FREE PASS: abre el chat y le pone la etiqueta de WhatsApp Business "FREE PASS"
(⋮ → Añadir a la lista → FREE PASS). No quita otras etiquetas; si no puede saber si ya la tenía, no toca nada.
Máximo 15 por corrida; a cada persona se la etiqueta una sola vez. Para probarlo: abre un
chat en WhatsApp Web y toca 🏷️ Probar etiqueta en el chat abierto (en el ícono 🔥).

## Chats de anuncios (FB / Instagram) → Video en Pipedrive + etiqueta FB ADS

Lo hace la extensión sola, nadie tiene que abrir los chats:

1. Cada 30 min (8:00–21:00) toma las personas **creadas en Pipedrive en los últimos 3 días** que todavía no revisó (máx. 15 por vuelta).
2. Abre su chat de WhatsApp: por celular, o por el **@usuario** si en Pipedrive solo tiene eso (lo busca en la lista de chats).
3. Busca la tarjeta **"Anuncio de facebook · Ver detalles"**; si la conversación es larga, **sube hasta el inicio del chat** (máx. 25 s).
4. Si vino de anuncio:
   - reconoce el **video por la miniatura** y llena el campo **Video** de la persona (solo si está vacío; nunca cambia uno ya puesto);
   - pone la etiqueta de WhatsApp Business **FB ADS** (créala una vez a mano; el nombre se cambia en Opciones).
5. Si el chat estaba **sin leer**, lo vuelve a dejar sin leer (WhatsApp igual le muestra al lead el doble check azul).
6. Si no vino de anuncio (llegó al inicio y no hay tarjeta), lo anota y no lo vuelve a abrir.

- Si alguien usa WhatsApp Web, no corre (o para a la mitad) y sigue en la próxima vuelta.
- Viene en 🧪 Simulación: abre los chats y anota qué haría, pero no escribe en Pipedrive ni etiqueta. Pásalo a 📤 Etiquetar en Opciones.
- 📣 Revisar leads nuevos ahora (ícono 🔥) corre la vuelta al momento.
- **Videos por aprender** (Opciones): si llega una miniatura que no conoce, queda ahí con la lista de leads; eliges una vez cuál video es y se llena a todos.
- **Videos aprendidos** (Opciones): si uno quedó mal, se borra.
- `videos-precargados.json` trae videos ya cargados (miniatura recortada de capturas de WhatsApp Web): S M EDITA, FOTO CANSADA DE ENTRENAR SOLA, NUNCA PISASTE UN GYM (opción 251; hay otra 126 con el mismo nombre que ya no se usa).
- Además, cuando una persona abre un chat de anuncio, se procesa al toque (sin subir, para no moverle la pantalla).
- 📣 ¿Vino de anuncio? (ícono 🔥) procesa el chat abierto aunque esté en simulación.

La imagen "cómo llegar" (Opciones) va en el recordatorio 2h, el refuerzo de la noche anterior y el del domingo.

Todos los días a las **9:05pm** descarga el reporte del día en
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

## Activar un módulo

1. Viene en 🧪 Simulación. Déjalo correr 1–2 días y revisa en el ícono 🔥 qué habría enviado.
2. Si está bien, en Opciones pásalo a 📤 Envío real.
3. Pausa (o recorta) la rutina de Claude que reemplaza, para que no salgan mensajes dobles.

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

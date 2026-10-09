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

Cada módulo tiene su modo en Opciones: 🧪 Simulación (no envía), 📤 Envío real o Apagado.

Reglas comunes:
- Antes de escribir abre el chat, comprueba que es el del número y lo lee.
- Reagendos: máximo 1 cada 48h y 3 en total por persona; nunca a quien ya tiene un FP nuevo.
- Salta a quien escribió hace <3h, dijo que ya asistió, que avisa, o canceló (según el módulo).
- Avisa ⚠️ para revisar a mano: otra hora en el chat, "no me interesa", "voy el viernes" sin FP nuevo.
- Nunca escribe antes de las 6:00 ni después de las 21:30; si la PC estuvo apagada >3h a la hora programada, ese módulo se omite.
- No escribe en Pipedrive.
- Dirección: Av. Larco 1164, Víctor Larco, al costado de Mass.

Etiquetar FREE PASS: abre el chat y le pone la etiqueta de WhatsApp Business "FREE PASS"
(⋮ → Etiquetar chat). No quita otras etiquetas; si no puede saber si ya la tenía, no toca nada.
Máximo 15 por corrida; a cada persona se la etiqueta una sola vez. Para probarlo: abre un
chat en WhatsApp Web y toca 🏷️ Probar etiqueta en el chat abierto (en el ícono 🔥).

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

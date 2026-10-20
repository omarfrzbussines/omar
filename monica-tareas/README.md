# Tareas Mónica

Crea **Tareas de Google** (las que se marcan con check) en el Calendar del gym, a partir del Sheet **"RURUSH — Tareas Mónica"**. Omar le pide a Claude una tarea y Claude escribe una fila; a los 10 minutos aparece como tarea en la cuenta del gym.

- **PENDIENTES**: tareas de un día. Columnas: TAREA, FECHA, HORA, NOTAS. El script llena ESTADO (`Enviada`, `Hecha` o `Borrada`), COMPLETADA (fecha y hora en que Mónica la marcó) e ID.
- **DIARIAS**: tareas que se repiten. En DÍAS van las letras L, M, X, J, V, S, D separadas por comas, o `TODOS`. Cada día que toca, el script las copia a PENDIENTES.

Google Tasks no guarda la hora, así que la hora va al inicio del título (`8:15 · Revisar historias…`) y la tarea sale arriba del día en Calendar.

## Instalación (una vez, con la cuenta rurushfitclub@gmail.com)

1. Abre [script.google.com](https://script.google.com) con la sesión de **rurushfitclub@gmail.com** → **Nuevo proyecto**, llámalo `Tareas Mónica`.
2. Borra lo que hay en `Código.gs` y pega `TareasMonica.gs`.
3. A la izquierda, en **Servicios** (+), agrega **Google Tasks API** y pulsa **Añadir**.
4. En **Configuración del proyecto** (engranaje), pon la zona horaria **(GMT-05:00) Lima**.
5. Arriba elige la función `instalar` y pulsa **Ejecutar**. Acepta los permisos: **Revisar permisos → rurushfitclub → Configuración avanzada → Ir a Tareas Mónica → Permitir**.

Listo: las tareas de hoy aparecen en el Calendar del gym y se revisan solas cada 10 minutos.

---
name: agendar-rurush
description: Agenda rápida de Omar (RURUSH FITNESS CLUB). Usar cuando Omar pida agendar, crear una tarea, poner algo en el calendario, dejarle algo a Mónica o a la administradora, marcar una tarea como hecha o cambiarle la fecha. Mensajes típicos "Agenda: ...", "Tarea: ...", "ponle a Mónica ...", "márcala como hecha". Usa el Sheet "RURUSH — Tablero de Tareas 2026" y Google Calendar.
---

# Agendar Rurush

Objetivo: hacerlo en el menor número de pasos y sin preguntas cuando los datos alcanzan. Responder en una o dos líneas.

## Regla principal

- **Tiene hora** → evento en Google Calendar.
- **No tiene hora** → fila en la pestaña TAREAS del Sheet.
- Si Omar pide las dos cosas ("en el sheet y en el calendar"), hacer las dos.

## Calendarios (zona horaria America/Lima)

| Para quién | calendarId |
|---|---|
| Omar (personal) | `primary` |
| Mónica, la administradora o "el gym" | `rurushfitclub@gmail.com` |

- Duración por defecto: **20 minutos**.
- Título: lo que pidió Omar. Si es para Mónica, agregar "(Mónica)" al final.
- Descripción: datos extra que dio (dirección, qué llevar, números) y "Dejada por Omar" si va al calendario del gym.
- No tocar el calendario personal de Omar cuando el pedido es para Mónica, ni al revés.
- Usar los recordatorios por defecto del calendario.

## Sheet de tareas

- ID: `11QQUNxxRKVwmLi-x0jqdGduVBmC3fCcG8VPNdUItO6c`
- Pestaña `TAREAS` (sheetId 0). Columnas A–G: TAREA · RESPONSABLE · ÁREA · PRIORIDAD · ESTADO · FECHA LÍMITE · NOTAS.
- Pestaña `HECHAS` (sheetId 777000003): mismas columnas; ahí se archivan las terminadas.
- Responsables válidos: Omar, Mónica, Dana, Brian, POR ASIGNAR.
- Áreas válidas: Dirección, Ventas, Entrenamiento, Marketing, Administración, Rápida, Personal.
- Prioridades: Alta, Media, Baja. Estados: Pendiente, En proceso, Idea, Hecho.

**Valores por defecto** si Omar no los dice: responsable Omar, prioridad Media, estado Pendiente, área según el tema (compras y trámites cortos = Rápida).

**Fechas:** escribir la fecha como número de serie, no como texto. Serie = días desde 1899-12-30. Referencia: 2026-10-15 = 46310 (sumar o restar días desde ahí).

### Agregar una tarea (orden por fecha)

1. Leer solo `TAREAS!A:F` (no leer notas ni otras pestañas).
2. La lista está ordenada así: En proceso, luego Pendiente por fecha (sin fecha al final del grupo). Buscar la primera fila Pendiente con fecha mayor a la nueva; esa es la posición.
3. `insert_dimension` en esa posición (0-based, `inheritFromBefore: true`) y escribir A:G con `update_values`.
4. Confirmar con una lectura corta de esa fila.

### Marcar como hecha

1. Copiar la fila a la siguiente fila vacía de `HECHAS`, con ESTADO "Hecho" y FECHA LÍMITE = hoy.
2. Borrar la fila de TAREAS con `deleteDimension`.

### Cambiar fecha o prioridad

Actualizar la celda. Si cambia la fecha, mover la fila a su lugar con `moveDimension` para mantener el orden.

## Cómo responder

Una o dos líneas: qué se creó, dónde (Sheet o qué calendario), día y hora. Sin tablas largas ni repetir todo el pedido.

Solo preguntar si falta algo que no tiene valor por defecto: la **hora** de un evento, o el **día** cuando no se puede deducir. Hacer una sola pregunta corta.

# Bot del embudo (Pipedrive) — arreglo del 24/10/2026

`embudo.js` reemplaza al del servidor del bot (el original está en `embudo.original.js` para comparar).

## Qué se arregló
1. **NO VINO nunca funcionaba.** La consulta pedía `start_date=ayer&end_date=ayer`, y Pipedrive **no incluye** el día de `end_date`:
   devolvía 0 actividades. Ahora pide un rango y filtra por la **fecha de la clase en hora Perú** (antes también se
   perdían las clases de 7 pm en adelante, que en UTC ya son del día siguiente).
2. **Se pone al día una sola vez:** la primera vez que corre, revisa los FP de los últimos 14 días sin marcar
   (≈ 88 personas al 23/10). Después, solo los de ayer.
3. **No marca NO VINO a quien ya reagendó** (tiene otro FP pendiente de hoy en adelante).
4. **/recents paginado:** antes, si había más de 500 cambios en 30 min, se perdía el resto.

Lo de GANADO / PERDIDO / VINO A CLASE / EN DECISIÓN ya funcionaba bien (verificado en Pipedrive).

## Pendiente (no se tocó)
- **Tratos duplicados:** varias personas tienen 2–3 tratos en el embudo 14 (p. ej. uno en NUEVO LEAD, otro en
  CLASE AGENDADA y otro GANADO). Los crea otra parte del sistema (el que registra leads) además de `tratoDe`.
  El panel ya cuenta uno por persona; para limpiarlos en Pipedrive conviene unirlos (merge) o que el que crea
  leads busque antes si la persona ya tiene trato en el embudo 14.

## Cómo instalarlo
Copiar `embudo.js` encima del del servidor y reiniciar el bot. No cambia `embudo.json` (agrega `noVinoAlDia`).

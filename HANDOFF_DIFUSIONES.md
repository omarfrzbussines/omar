# Traspaso — Difusiones RURUSH (09-oct-2026)

## Ya está hecho y funcionando
- **Extensión `extension-rurush-difusiones` (v1.0.2)**, aparte de la de ventas y la de Free Pass.
  Envía tandas del Sheet por WhatsApp Web, sin repetir números, y marca ENV/FECHA/RESULTADO.
  Probada en real el 08-oct desde la línea de MÓNICA: 2 envíos, ambos marcados en el Sheet.
- **API en el Sheet** `DIFUSIONES_RURUSH_ago2026` (`apps-script/Difusiones_API.gs`), publicada como app web.
  Falta subir 2 cambios menores (columna `ASES.` y números falsos): ver commit "API difusiones: reconocer columna ASES.".
- **Pestaña ⚙️ CONFIG** en el Sheet: `DIAS_HOY` (frase de días automática, lun–vie, salta feriados),
  `LINEAS` (LAURA 51936555464, MÓNICA 51934352367, DANNA sin línea → no se envía), `FERIADOS`.
- **Pestaña 🧪 PRUEBA** con 2 filas de prueba (926 918 075 gym y 972 156 556).
- Mensajes con **`{DIAS}`** en vez de día fijo; los mensajes con día escrito a mano quedan apartados.
- `{DIAS}` ofrece **lunes a sábado** (nunca domingo) desde el 09-oct: viernes → «mañana sábado o el lunes».
- **📨 TANDA 8 EX ALUMNOS** creada el 09-oct: 195 filas (98 Laura / 97 Mónica), más recientes primero,
  versiones V1/V2/V3 rotando (columna VERSIÓN), RESULTADO con lista (incluye AGENDADO / VINO / SE INSCRIBIO).
  Filas 149 y 174 con nota de posible duplicado.
- **📝 PLANTILLAS**: 1er mensaje por tanda, 2do mensaje por objeción, seguimiento único, cómo medir.
  Regla: nombre → dato positivo → invitación → UNA pregunta con doble opción. Sin «no te vendo nada» ni «qué no te gustó».

## Estado de las tandas
TANDA 2, 3 y 4 + 🔥 100 DE HOY: **Laura y Mónica no tienen nada por enviar** (lo pendiente son números
malos, sin WhatsApp, no contactar o socios activos). Lo que queda pendiente es de DANNA (sin línea, no tocar).

## Pipedrive por API (ya conectado)
Secreto de red en el entorno: cabecera `x-api-token` hacia `api.pipedrive.com`. Probado OK (usuario Omar rurush).
34,603 personas · 2,994 negocios abiertos (EMBUDO CLOUDE: 1,473 NUEVO LEAD, 745 CLASE AGENDADA;
EMBUDO GENERAL: 755 FREE PASS PROGRAMADO).

### Listas propuestas (limpias, sin repetir) — falta crearlas en el Sheet
| Lista | Criterio | Limpios |
|---|---|---|
| TANDA 5 · FP no inscritos | FECHA FP 2026 pasada + vino (COACH FP / PRESENTÓ PLAN / CIERRE NO o SEGUIMIENTO) | 309 |
| TANDA 6 · FP no vinieron | Deal en CLASE AGENDADA (73) o FREE PASS PROGRAMADO (54) con fecha pasada | 1,433 |
| TANDA 7 · Leads 2026 | Deal en NUEVO LEAD (71/77) + leads del Sheet BASE DE DATOS LEADS RFC, más recientes primero | 3,051 |
| TANDA 8 · Ex alumnos | INICIO PLAN y FIN PLAN hace +30 días | 195 |
| **Total** | | **4,988** |

**Exclusiones aplicadas:** socio con plan vigente (BASE DE SOCIOS activo o FIN PLAN ≥ hoy), cualquier número ya
presente en una pestaña de difusión, CIERRE=SI o FECHA DE INSCRIPCIÓN, DESCARTADO / CLIENTE / OTRA CIUDAD,
observaciones "no le interesa / otro gym / fuera de Trujillo / número equivocado", números inválidos o falsos, repetidos.
No incluidos: 17,910 leads antiguos 2024–2025 (fríos, riesgo de bloqueo).

### Pendiente de decidir con Omar
1. Crear TANDA 5–8 en el Sheet DIFUSIONES (mitad Laura / mitad Mónica, `{DIAS}`, 3–4 variantes de mensaje;
   si el nombre es un número o apodo → saludo "Hola 👋" sin nombre).
2. **Modo automático** de la extensión (v1.1.0): arranque diario solo (¿9:00 lun–sáb?), tope 30 por línea
   al inicio, un perfil de Chrome por línea, fuente de contactos (pestaña fija "📬 COLA DIARIA" o tandas activas en ⚙️ CONFIG).

## Seguridad
El `.md` de la carpeta del proyecto (RURUSH VENTAS 2026) contenía claves sin tapar: Apps Fit, Jotform, Pipedrive,
cuenta de servicio de Google, OAuth. **Rotarlas.** La herramienta Carpeta a Markdown ya fue corregida para detectarlas.

## Otros cambios del día (archivo VENTAS 2026)
OCTUBRE, NOVIEMBRE y DICIEMBRE: columna **COD** en ventas y renovación (autocompleta nombre, celular, DNI desde
"3. BASE DE SOCIOS"), en Arial y dentro del recuadro. Pendiente confirmar si Gali Savedra = código 1009.

## Actualización 09-oct (tarde)
- Extensión **v1.2.0**: envío arreglado (detecta la burbuja por texto, una sola apertura por chat),
  modo automático L–V 8:00 (30 por línea, la línea abierta decide la asesora), frase {DIAS} recargada
  si la tanda sigue otro día, y **revisión de respuestas** (2 h después del último envío + cada mañana,
  últimos 3 días → «RESPONDIO - POR CONTESTAR» + fila en 💬 RESPUESTAS).
- API: {DIAS} calculado en Apps Script (fecha Lima, lun–sáb, sin feriados); acciones porRevisar/respuesta.
- **Embudo_Difusiones.gs** (mismo proyecto): cruza cada envío con Pipedrive (FP creado después del envío →
  AGENDADO; FP realizado → VINO) y con 3. BASE DE SOCIOS (plan desde el envío → SE INSCRIBIO). Menú 🔁 Rurush,
  token en Script Properties (PIPEDRIVE_TOKEN), corre a diario 9 pm. Nunca baja un estado.
- KPIs de las 8 tandas unificados (Agendados / % agendado); links 📲 de TANDA 2 corregidos.
- Rutinas FP de Claude (6) pausadas: los recordatorios FP salen solo de la extensión FP.

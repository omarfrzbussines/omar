# RURUSH — Panel Operativo (extensión de Chrome)

## Instalar (2 minutos, una sola vez)

1. Abre Chrome y entra a `chrome://extensions`
2. Activa **Modo de desarrollador** (arriba a la derecha)
3. Clic en **Cargar descomprimida**
4. Selecciona esta carpeta: `rurush-chrome-extension`
5. Aparece el ícono de RURUSH en la barra. Fíjalo con el pin 📌

## Configurar

Clic derecho en el ícono → **Opciones**. Pega dos cosas:

- **TokenEmpresa de Apps Fit** — el UUID que empieza con `CC0677F3`, está en `credenciales_api.txt`
- **API token de Pipedrive** — Pipedrive → tu foto → Preferencias personales → API

O más rápido: en el recuadro **⚡ Autoconfigurar** elige tu archivo `credenciales_api.txt` y los toma solo.

Ambas líneas deben salir en verde. **Después borra `credenciales_api.txt`** — ya no hace falta.

## Cómo se usa

**En WhatsApp Web** — pestaña roja "RURUSH" al costado derecho (o `Alt + R`):
- Ficha del contacto: si es socio activo te dice plan, vencimiento, asistencias, asesora y saldo. Si no aparece, es lead o está vencido.
- Plantillas aprobadas con el nombre y la hora ya rellenados. "Insertar" deja el texto listo para que lo revises; "Insertar y enviar" lo manda y, en los recordatorios de free pass, manda la ubicación aparte automáticamente.
- Etiquetado en Pipedrive sin salir del chat: asistió, resultado del cierre, quién presentó el plan, origen, y notas.

**En Apps Fit** — la misma pestaña abre un buscador de socios vigentes por nombre, DNI o celular, con botón directo a su WhatsApp.

**El ícono de la extensión** abre el dashboard del día: socios activos, inscritos de hoy, free pass agendados, no-shows de ayer por reagendar y planes que vencen en 7 días.

## Notas

- Los tokens se guardan solo en este Chrome, en esta laptop. Si cambias de equipo hay que volver a pegarlos. El botón **Borrar todo** de Opciones los elimina.
- La lista de socios vive en memoria y se borra sola al cerrar Chrome. Se refresca cada 30 minutos, o al toque con el 🔄 del dashboard.
- **Asesora** es quien vendió el plan (campo Vendedor de Apps Fit). "Repartida a" solo aparece cuando el socio fue reasignado — ojo que ese campo está poblado en menos de la cuarta parte de la cartera.
- Apps Fit solo expone por API a los socios **con plan vigente**. Los vencidos siguen saliendo únicamente por el Excel de la web.
- Las plantillas se editan en `lib/templates.js`. Después de editarlas, recarga la extensión en `chrome://extensions`.
- Los asesores del etiquetado están en `content/wa.js` (constante `OPC`), por si entra o sale alguien del equipo.

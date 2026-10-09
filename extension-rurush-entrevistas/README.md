# 🎯 Rurush Entrevistas — extensión de Chrome

Panel lateral para entrevistar postulantes a **Asesor(a) Comercial**. Todo sale del
Sheet **ENTREVISTA ASESOR V3** (pestaña *Respuestas de formulario 2*) y se guarda ahí mismo.
No usa Claude.

## Qué hace

| Pestaña | Para qué |
|---|---|
| **Lista** | Todos los postulantes, del más nuevo al más antiguo. Filtros por ESTADO (por defecto *Activos*: oculta descartados y contratados), buscador por nombre / celular / nota. Punto 🟢🟡🔴 = pre-filtro del formulario; número naranja = puntaje FINAL. |
| **📋 Resumen** | Pre-filtro automático (horario, sábados, sueldo, permanencia, experiencia, casos muy cortos, CV faltante…), datos clave, puntajes E1/E2 y **notas rápidas** (columna NOTAS). |
| **🎤 Entrevista** | Guía de la E1 o E2: los 6 criterios del Sheet (Actitud, Comunicación, Cierre, Experiencia, Cultura, Permanencia) con qué mirar, **preguntas armadas con lo que respondió en el formulario** (incluye role-play de sus 3 casos) y botones 1–10 (+½). Promedio en vivo y recomendación (✅ ≥7,5 · 🟡 ≥6,5 · 🔴). Cronómetro. |
| **📝 Formulario** | Todas sus respuestas ordenadas por tema. |
| **💬 Mensajes** | Plantillas de WhatsApp (invitar a E1/E2, recordatorio, pedir documentos, no seleccionado, contratado) con fecha y hora. Abre WhatsApp Web con el texto listo y, si quieres, cambia el ESTADO. |

Arriba de la ficha: botones a WhatsApp, CV, Video, Certijoven e Instagram, y el ESTADO
(se guarda al cambiarlo).

**💾 Guardar E1/E2** escribe en el Sheet: FECHA E1/E2 (hoy), los 6 puntajes de esa ronda,
el comentario final (última columna NOTAS) y el ESTADO ("Entrevista N hecha" o el que elijas).
PUNTAJE/P1, P2 y FINAL siguen saliendo de sus fórmulas; si una fila nueva no las tiene, se las pone.

Mientras entrevistas, los puntajes se guardan solos en la PC: si cierras el panel, no se pierden.

## Instalación (una sola vez, ~10 min)

### 1. Apps Script (el puente con el Sheet)

1. **script.google.com → Nuevo proyecto** → nombre **RURUSH Entrevistas**.
2. `Código.gs`: borra todo y pega **apps-script/Code.gs**. 💾 Guardar.
3. **Implementar → Nueva implementación → ⚙️ Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - **Implementar** → **Autorizar** (Avanzado → Ir a RURUSH Entrevistas → Permitir).
   - Copia la **URL** (termina en `/exec`).
   > Sin la llave el link no muestra nada.
4. Selector de funciones → **crearLlave** → **▶ Ejecutar**. En el registro sale la **LLAVE**.

### 2. Extensión

1. Descarga la carpeta `extension-rurush-entrevistas` a la PC.
2. Chrome → `chrome://extensions` → **Modo de desarrollador** → **Cargar descomprimida** → elige la carpeta.
3. Fíjala (📌) y haz clic derecho en el ícono → **Opciones**: pega la URL y la LLAVE → **Probar conexión** → **Guardar**.
4. Clic en el ícono → se abre el panel a la derecha y queda abierto mientras ves el CV o el video.

Si cambias `Code.gs`: **Implementar → Gestionar implementaciones → ✏️ → Versión: nueva** (así la URL no cambia).

## Cambiar reglas, preguntas o mensajes

Todo está en **reglas.js**: el pre-filtro (`evaluar`), las preguntas de cada criterio
(`CRITERIOS`) y las plantillas de WhatsApp (`PLANTILLAS`). Después de editar:
`chrome://extensions` → 🔄 en la extensión. Los umbrales de la recomendación y la firma
de los mensajes están en Opciones.

## Límites

- Si alguien ordena o borra filas del Sheet con el panel abierto, al guardar avisa
  "El Sheet cambió" y no escribe nada: toca 🔄 y vuelve a guardar.
- Sin internet muestra la última copia, pero no guarda.

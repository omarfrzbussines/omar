---
name: carpeta-a-md
description: Convierte una carpeta completa (PDF, Word, Excel, CSV, PowerPoint, HTML, TXT, JSON) a Markdown, en un solo archivo con índice o en un .md por archivo. Usar cuando Omar pida "convertir una carpeta a md", "pasar estos archivos a markdown", "prepara esta carpeta para subirla al proyecto", o suba un .zip o varios documentos para usarlos como conocimiento en un Proyecto de Claude.
---

# Carpeta a Markdown

Convierte documentos a Markdown para usarlos en Proyectos de Claude: ocupan menos tokens y se leen mejor que los PDF o Excel originales.

## Pasos

1. **Ubicar la carpeta.**
   - Si Omar subió un `.zip`, descomprimirlo en una carpeta nueva y vacía.
   - Si subió varios archivos sueltos, usarlos tal cual.
   - Si da una ruta de su computadora y no hay acceso a ella, pedirle que suba la carpeta comprimida en `.zip`.
2. **Elegir el modo** (no preguntar si no lo dijo):
   - Por defecto: **un solo `.md`** con índice. Es lo mejor para subirlo a un Proyecto.
   - Con `--separados`: un `.md` por archivo, si pide "uno por archivo" o la carpeta es muy grande (más de 1 MB de salida).
3. **Ejecutar el script** que viene con este skill:

   ```bash
   python <ruta-del-skill>/scripts/carpeta_a_md.py CARPETA [--salida ARCHIVO.md] [--separados] [--max-filas 500]
   ```

   Si `markitdown` no está instalado, se puede intentar `pip install markitdown`. El script funciona igual sin él, con conversores de respaldo.
4. **Revisar el resultado**: mirar el resumen que imprime el script y abrir el inicio del `.md` para confirmar que el texto se ve bien.
5. **Entregar** el `.md` (o la carpeta comprimida con los `.md`) y responder en pocas líneas:
   - Cuántos archivos se convirtieron
   - Cuáles fallaron u omitió, y por qué
   - El tamaño aproximado en tokens

## Casos especiales

- **PDF escaneado** (foto o imagen): sale sin texto. Avisarlo; para leerlo hace falta OCR (skill `pdf`).
- **Excel grande**: las tablas se cortan en 500 filas por hoja. Si necesita más, usar `--max-filas`. Avisar si se cortó algo.
- **Formatos no soportados** (imágenes, audios, videos, .zip dentro de la carpeta): se omiten y se listan en el resumen.
- **Archivos con datos sensibles** (DNI, contraseñas, datos de clientes): mencionarlo antes de subirlos a un Proyecto compartido.

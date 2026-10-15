#!/usr/bin/env python3
"""Convierte todos los archivos de una carpeta a Markdown.

Uso:
  python carpeta_a_md.py CARPETA [--salida RUTA] [--separados] [--max-filas N]

- Por defecto junta todo en UN archivo .md con índice (ideal para subir a un Proyecto).
- Con --separados crea un .md por archivo, copiando la estructura de subcarpetas.
- Al final imprime un resumen: convertidos, omitidos y con error.

Formatos: PDF, Word (.docx), Excel (.xlsx/.xls), CSV, PowerPoint (.pptx),
HTML, TXT/MD, JSON. Usa MarkItDown si está instalado; si no, usa
conversores de respaldo.
"""
import argparse
import csv
import io
import json
import os
import subprocess
import sys

SOPORTADOS = {'.pdf', '.docx', '.xlsx', '.xls', '.csv', '.pptx', '.html', '.htm',
              '.txt', '.md', '.json'}
IGNORAR_CARPETAS = {'.git', 'node_modules', '__pycache__', '.venv'}

try:
    from markitdown import MarkItDown
    _MID = MarkItDown()
except Exception:
    _MID = None


def tabla_md(filas, max_filas):
    filas = [[('' if c is None else str(c)).replace('|', '\\|').replace('\n', ' ') for c in f] for f in filas]
    filas = [f for f in filas if any(c.strip() for c in f)]
    if not filas:
        return '_(vacía)_'
    ancho = max(len(f) for f in filas)
    filas = [f + [''] * (ancho - len(f)) for f in filas]
    cortado = len(filas) - 1 > max_filas
    filas = filas[:max_filas + 1]
    out = ['| ' + ' | '.join(filas[0]) + ' |', '|' + '---|' * ancho]
    out += ['| ' + ' | '.join(f) + ' |' for f in filas[1:]]
    if cortado:
        out.append(f'\n_(Se muestran las primeras {max_filas} filas.)_')
    return '\n'.join(out)


def respaldo(ruta, ext, max_filas):
    if ext == '.pdf':
        try:
            return subprocess.run(['pdftotext', '-layout', ruta, '-'], capture_output=True, text=True, check=True).stdout
        except Exception:
            from pypdf import PdfReader
            return '\n\n'.join((p.extract_text() or '') for p in PdfReader(ruta).pages)
    if ext == '.docx':
        import docx
        d = docx.Document(ruta)
        partes = []
        for p in d.paragraphs:
            t = p.text.strip()
            if not t:
                continue
            estilo = (p.style.name or '').lower()
            if estilo.startswith('heading') or estilo.startswith('título') or estilo.startswith('titulo'):
                nivel = ''.join(ch for ch in estilo if ch.isdigit()) or '2'
                partes.append('#' * min(int(nivel) + 1, 6) + ' ' + t)
            else:
                partes.append(t)
        for tb in d.tables:
            partes.append(tabla_md([[c.text for c in r.cells] for r in tb.rows], max_filas))
        return '\n\n'.join(partes)
    if ext in ('.xlsx', '.xls'):
        import openpyxl
        wb = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
        return '\n\n'.join(f'### Hoja: {h.title}\n\n' + tabla_md(list(h.iter_rows(values_only=True)), max_filas) for h in wb.worksheets)
    if ext == '.csv':
        with open(ruta, newline='', encoding='utf-8', errors='replace') as f:
            return tabla_md(list(csv.reader(f)), max_filas)
    if ext == '.pptx':
        from pptx import Presentation
        partes = []
        for i, s in enumerate(Presentation(ruta).slides, 1):
            textos = [sh.text_frame.text.strip() for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip()]
            partes.append(f'### Diapositiva {i}\n\n' + '\n\n'.join(textos))
        return '\n\n'.join(partes)
    if ext in ('.html', '.htm'):
        from bs4 import BeautifulSoup
        with open(ruta, encoding='utf-8', errors='replace') as f:
            return BeautifulSoup(f.read(), 'html.parser').get_text('\n', strip=True)
    if ext == '.json':
        with open(ruta, encoding='utf-8', errors='replace') as f:
            return '```json\n' + json.dumps(json.load(f), ensure_ascii=False, indent=2) + '\n```'
    with open(ruta, encoding='utf-8', errors='replace') as f:
        return f.read()


def convertir(ruta, max_filas):
    ext = os.path.splitext(ruta)[1].lower()
    if ext in ('.txt', '.md'):
        return respaldo(ruta, ext, max_filas)
    if _MID is not None and ext not in ('.csv', '.json'):
        try:
            texto = _MID.convert(ruta).text_content
            if texto and texto.strip():
                return texto
        except Exception:
            pass
    return respaldo(ruta, ext, max_filas)


def limpiar(texto):
    """Quita líneas vacías repetidas y baja un nivel los títulos internos
    (## pasa a ###) para que queden debajo del título de cada archivo."""
    lineas = [l.rstrip() for l in texto.replace('\r\n', '\n').split('\n')]
    out, vacias, en_codigo = [], 0, False
    for l in lineas:
        if l.lstrip().startswith('```'):
            en_codigo = not en_codigo
        if not en_codigo and l.startswith('#'):
            marcas = len(l) - len(l.lstrip('#'))
            if l[marcas:marcas + 1] == ' ':
                l = '#' * min(marcas + 2, 6) + l[marcas:]
        vacias = vacias + 1 if not l.strip() else 0
        if vacias <= 1:
            out.append(l)
    return '\n'.join(out).strip()


def main():
    ap = argparse.ArgumentParser(description='Convierte una carpeta a Markdown')
    ap.add_argument('carpeta')
    ap.add_argument('--salida', help='Archivo .md (modo unido) o carpeta (modo --separados)')
    ap.add_argument('--separados', action='store_true', help='Un .md por archivo')
    ap.add_argument('--max-filas', type=int, default=500, help='Máximo de filas por tabla de Excel/CSV')
    a = ap.parse_args()

    raiz = os.path.abspath(a.carpeta)
    if not os.path.isdir(raiz):
        sys.exit(f'No existe la carpeta: {raiz}')
    nombre = os.path.basename(raiz.rstrip(os.sep)) or 'carpeta'

    archivos, omitidos = [], []
    for d, subdirs, files in os.walk(raiz):
        subdirs[:] = sorted(s for s in subdirs if s not in IGNORAR_CARPETAS and not s.startswith('.'))
        for f in sorted(files):
            if f.startswith('.') or f.startswith('~$'):
                continue
            ruta = os.path.join(d, f)
            (archivos if os.path.splitext(f)[1].lower() in SOPORTADOS else omitidos).append(ruta)

    ok, errores, secciones = [], [], []
    for ruta in archivos:
        rel = os.path.relpath(ruta, raiz)
        try:
            texto = limpiar(convertir(ruta, a.max_filas))
            if not texto:
                errores.append((rel, 'sin texto (¿PDF escaneado o imagen?)'))
                continue
            ok.append(rel)
            secciones.append((rel, texto))
        except Exception as e:
            errores.append((rel, str(e)[:120]))

    if a.separados:
        destino = a.salida or os.path.join(os.path.dirname(raiz), nombre + '_md')
        for rel, texto in secciones:
            out = os.path.join(destino, os.path.splitext(rel)[0] + '.md')
            os.makedirs(os.path.dirname(out), exist_ok=True)
            with open(out, 'w', encoding='utf-8') as f:
                f.write(f'# {rel}\n\n{texto}\n')
    else:
        destino = a.salida or os.path.join(os.path.dirname(raiz), nombre + '.md')
        indice = '\n'.join(f'- {rel}' for rel, _ in secciones)
        cuerpo = '\n\n---\n\n'.join(f'## {rel}\n\n{texto}' for rel, texto in secciones)
        with open(destino, 'w', encoding='utf-8') as f:
            f.write(f'# {nombre}\n\n**Archivos incluidos ({len(secciones)}):**\n\n{indice}\n\n---\n\n{cuerpo}\n')

    print(f'Salida: {destino}')
    print(f'Convertidos: {len(ok)}')
    if errores:
        print(f'Con problema: {len(errores)}')
        for rel, err in errores:
            print(f'  - {rel}: {err}')
    if omitidos:
        print(f'Omitidos (formato no soportado): {len(omitidos)}')
        for r in omitidos[:30]:
            print(f'  - {os.path.relpath(r, raiz)}')
    if not a.separados and os.path.exists(destino):
        kb = os.path.getsize(destino) / 1024
        print(f'Tamaño: {kb:,.0f} KB (≈ {int(kb * 1024 / 4):,} tokens)')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""RURUSH - PowerPoint semanal SIN Claude (0 tokens).
Lo corre el Programador de tareas de Windows cada lunes 7:00 (ver instalar_tarea.ps1):
  etl.py -> build.js -> transitions.py -> copia el deck a la carpeta del proyecto.
Deja el resultado en semanal_log.txt (misma carpeta)."""
import datetime, os, shutil, subprocess, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
PROYECTO = os.path.dirname(AQUI)
LOG = os.path.join(AQUI, "semanal_log.txt")
MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

def log(t):
    linea = datetime.datetime.now().strftime("%Y-%m-%d %H:%M") + "  " + t
    print(linea)
    with open(LOG, "a", encoding="utf-8") as f: f.write(linea + "\n")

def correr(cmd):
    r = subprocess.run(cmd, cwd=AQUI, capture_output=True, text=True, encoding="utf-8", errors="replace", shell=(os.name == "nt" and cmd[0] == "node"))
    salida = (r.stdout or "").strip().splitlines()
    if r.returncode != 0:
        log("ERROR en " + " ".join(cmd) + ":\n" + ((r.stderr or "") + "\n" + "\n".join(salida[-10:])).strip())
        sys.exit(1)
    if salida: log(salida[-1])

def main():
    hoy = datetime.date.today()
    dom = hoy - datetime.timedelta(days=(hoy.weekday() + 1) % 7 or 7)   # domingo pasado
    lun = dom - datetime.timedelta(days=6)
    log("== Informe semanal " + lun.isoformat() + " a " + dom.isoformat())
    correr([sys.executable, "etl.py"])
    correr(["node", "build.js"])
    correr([sys.executable, "transitions.py"])
    origen = os.path.join(AQUI, "deck_final.pptx")
    if not os.path.exists(origen):
        log("ERROR: no se generó deck_final.pptx"); sys.exit(1)
    rango = (f"{lun.day}-{dom.day}-{MES[dom.month-1]}" if lun.month == dom.month
             else f"{lun.day}-{MES[lun.month-1]}-{dom.day}-{MES[dom.month-1]}")
    destino = os.path.join(PROYECTO, f"RURUSH_Resumen_Semanal_{rango}.pptx")
    try:
        shutil.copyfile(origen, destino)
    except PermissionError:      # el archivo está abierto en PowerPoint
        destino = destino.replace(".pptx", "_v2.pptx"); shutil.copyfile(origen, destino)
    log("LISTO: " + destino)

if __name__ == "__main__":
    main()

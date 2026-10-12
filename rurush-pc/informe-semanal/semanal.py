#!/usr/bin/env python3
"""RURUSH - PowerPoint semanal SIN Claude (0 tokens).
Lo corre el Programador de tareas de Windows cada lunes 7:00 (ver instalar_tarea.ps1):
  etl.py -> build.js -> transitions.py -> copia el deck a la carpeta del proyecto -> te lo manda por correo.
Deja el resultado en semanal_log.txt (misma carpeta)."""
import datetime, os, re, shutil, smtplib, subprocess, sys
from email.message import EmailMessage

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
    for l in salida:
        if "ERROR" in l.upper() and l != (salida[-1] if salida else ""): log("  " + l.strip())
    if salida: log(salida[-1])

def gmail():
    """Correo y clave de aplicación de Gmail desde credenciales_api.txt (bloque GMAIL). Nunca van en este archivo."""
    f = os.path.join(PROYECTO, "credenciales_api.txt")
    if not os.path.exists(f): return None, None
    t = open(f, encoding="utf-8", errors="ignore").read()
    m = re.search(r"GMAIL.*?Correo:\s*(\S+).*?Clave:\s*([a-z ]{16,19})", t, re.S | re.I)
    return (m.group(1), m.group(2).replace(" ", "")) if m else (None, None)

def enviar(ruta, rango):
    correo, clave = gmail()
    if not correo:
        log("Sin correo: falta el bloque GMAIL (Correo: / Clave:) en credenciales_api.txt"); return
    msg = EmailMessage()
    msg["Subject"] = f"📊 PowerPoint semanal RURUSH · {rango}"
    msg["From"] = correo; msg["To"] = correo
    msg.set_content(f"Adjunto el resumen semanal {rango}.\nEl resumen en texto llega aparte en el correo de las 7:15.")
    with open(ruta, "rb") as fh:
        msg.add_attachment(fh.read(), maintype="application",
                           subtype="vnd.openxmlformats-officedocument.presentationml.presentation",
                           filename=os.path.basename(ruta))
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as s:
            s.login(correo, clave); s.send_message(msg)
        log("CORREO enviado a " + correo)
    except Exception as e:       # el deck ya quedó en la carpeta: no se pierde nada
        log("ERROR al enviar el correo: " + str(e))

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
    enviar(destino, rango)

if __name__ == "__main__":
    if "--solo-correo" in sys.argv:       # reenviar el último deck sin volver a generarlo (para probar)
        decks = sorted((os.path.join(PROYECTO, f) for f in os.listdir(PROYECTO) if f.startswith("RURUSH_Resumen_Semanal_") and f.endswith(".pptx")), key=os.path.getmtime)
        if decks: enviar(decks[-1], os.path.basename(decks[-1])[23:-5])
        else: log("No hay ningún RURUSH_Resumen_Semanal_*.pptx en " + PROYECTO)
    else:
        main()

# RURUSH - Actualizador de extensiones para PCs lejanas (sin Git, sin cuentas de Google, 0 tokens).
#
# INSTALAR en una PC (una sola vez): abrir PowerShell y pegar esta linea:
#   irm https://raw.githubusercontent.com/omarfrzbussines/omar/main/tools/actualizador_remoto.ps1 | iex
# Pregunta que extensiones tiene esa PC y en que carpeta, y crea la tarea "RURUSH Extensiones":
# cada 10 min mira en GitHub si hay version nueva y, si la hay, la copia a la carpeta. La extension
# se recarga sola (autoRecarga). Se quita con:  Unregister-ScheduledTask "RURUSH Extensiones"
$Auto = ($args -contains "-Auto")
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$REPO = "omarfrzbussines/omar"
$RAW = "https://raw.githubusercontent.com/$REPO/main"
$ZIP = "https://codeload.github.com/$REPO/zip/refs/heads/main"
$DIR = Join-Path $env:LOCALAPPDATA "RurushActualizador"
$CFG = Join-Path $DIR "destinos.txt"
$LOG = Join-Path $DIR "log.txt"
$EXTS = [ordered]@{
  "extension-rurush-difusiones"  = "Rurush Difusiones (difusiones, cuadro de ventas, estados)"
  "extension-rurush-fp"          = "Rurush FP (recordatorios y confirmacion de Free Pass)"
  "extension-rurush-panel"       = "RURUSH Panel Operativo (ficha del socio y plantillas para las asesoras)"
  "extension-rurush-entrevistas" = "Rurush Entrevistas"
}

function Anotar($t) {
  $l = (Get-Date -Format "dd/MM HH:mm") + "  " + $t
  if (-not $Auto) { Write-Host $t }
  Add-Content -Path $LOG -Value $l -Encoding UTF8
  $todo = Get-Content $LOG -Encoding UTF8
  if ($todo.Count -gt 300) { $todo | Select-Object -Last 200 | Set-Content $LOG -Encoding UTF8 }
}
function Version($archivo) {
  try { return (Get-Content $archivo -Raw -Encoding UTF8 | ConvertFrom-Json).version } catch { return "" }
}
function VersionRemota($ext) {
  try { return (Invoke-RestMethod "$RAW/$ext/manifest.json?t=$([DateTime]::Now.Ticks)" -UseBasicParsing).version } catch { return "" }
}

# ---------- actualizar (lo que corre cada 10 min) ----------
function Actualizar {
  if (-not (Test-Path $CFG)) { return }
  $destinos = @(Get-Content $CFG -Encoding UTF8 | Where-Object { $_ -match "\|" } | ForEach-Object {
    $p = $_.Split("|"); [pscustomobject]@{ ext = $p[0].Trim(); dir = $p[1].Trim() } })
  $falta = @($destinos | Where-Object {
    $r = VersionRemota $_.ext
    $r -and ($r -ne (Version (Join-Path $_.dir "manifest.json")))
  })
  if (-not $falta.Count) { return }
  $tmp = Join-Path $env:TEMP ("rurush-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory $tmp | Out-Null
  try {
    Invoke-WebRequest $ZIP -OutFile "$tmp\repo.zip" -UseBasicParsing
    if (Get-Command Expand-Archive -ErrorAction SilentlyContinue) { Expand-Archive "$tmp\repo.zip" -DestinationPath $tmp -Force }
    else {   # Windows 8 / PowerShell 4 no trae Expand-Archive
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [System.IO.Compression.ZipFile]::ExtractToDirectory("$tmp\repo.zip", $tmp)
    }
    $raiz = Get-ChildItem $tmp -Directory | Select-Object -First 1
    foreach ($d in $falta) {
      $origen = Join-Path $raiz.FullName $d.ext
      if (-not (Test-Path $origen)) { Anotar "No existe $($d.ext) en GitHub"; continue }
      if (-not (Test-Path $d.dir)) { New-Item -ItemType Directory $d.dir -Force | Out-Null }
      Copy-Item (Join-Path $origen "*") $d.dir -Recurse -Force
      Anotar ("OK " + $d.ext + " -> version " + (Version (Join-Path $d.dir "manifest.json")) + " en " + $d.dir)
    }
  } catch { Anotar ("ERROR: " + $_.Exception.Message) }
  finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}

if ($Auto) { New-Item -ItemType Directory $DIR -Force | Out-Null; Actualizar; return }

# ---------- instalar (una vez por PC) ----------
New-Item -ItemType Directory $DIR -Force | Out-Null
Write-Host ""
Write-Host "=== RURUSH - Actualizador de extensiones ===" -ForegroundColor Cyan
Invoke-WebRequest "$RAW/tools/actualizador_remoto.ps1" -OutFile (Join-Path $DIR "actualizador_remoto.ps1") -UseBasicParsing
Add-Type -AssemblyName System.Windows.Forms
$lineas = @()
foreach ($ext in $EXTS.Keys) {
  $r = Read-Host ("Esta PC usa " + $EXTS[$ext] + "? (s/n)")
  if ($r -notmatch "^[sS]") { continue }
  Write-Host "  Elige la carpeta desde donde Chrome carga esa extension (si es nueva, elige o crea una carpeta vacia)." -ForegroundColor Yellow
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = "Carpeta de " + $EXTS[$ext]
  $dlg.SelectedPath = Join-Path $env:USERPROFILE "Downloads"
  $frente = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }   # que la ventana salga adelante
  if ($dlg.ShowDialog($frente) -ne "OK") { Write-Host "  (saltada)"; continue }
  $lineas += "$ext | $($dlg.SelectedPath)"
  Write-Host ("  -> " + $dlg.SelectedPath) -ForegroundColor Green
}
if (-not $lineas.Count) { Write-Host "No elegiste ninguna extension. No se instalo nada."; return }
Set-Content $CFG -Value $lineas -Encoding UTF8

$script = Join-Path $DIR "actualizador_remoto.ps1"
$ps = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Auto"
$conhost = Join-Path $env:WINDIR "System32\conhost.exe"
if ([Environment]::OSVersion.Version.Build -ge 19044 -and (Test-Path $conhost)) {
  $accion = New-ScheduledTaskAction -Execute $conhost -Argument "--headless powershell.exe $ps" -WorkingDirectory $DIR
} else {
  $accion = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $ps -WorkingDirectory $DIR
}
$cada10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$yo = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name   # DOMINIO\usuario real (a veces difiere de la carpeta)
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$desc = "Copia las extensiones RURUSH nuevas desde GitHub (sin Claude)"
try {
  $alEntrar = New-ScheduledTaskTrigger -AtLogOn -User $yo
  Register-ScheduledTask -TaskName "RURUSH Extensiones" -Action $accion -Trigger @($cada10, $alEntrar) -Settings $ajustes -Description $desc -Force | Out-Null
} catch {
  # algunas PCs no aceptan el disparador "al iniciar sesion": basta con el de cada 10 min
  Register-ScheduledTask -TaskName "RURUSH Extensiones" -Action $accion -Trigger $cada10 -Settings $ajustes -Description $desc -Force | Out-Null
}

Write-Host ""
Write-Host "Bajando la ultima version ahora..." -ForegroundColor Cyan
Actualizar
foreach ($l in $lineas) {
  $d = $l.Split("|")[1].Trim()
  Write-Host ("  " + $l.Split("|")[0].Trim() + ": version " + (Version (Join-Path $d "manifest.json"))) -ForegroundColor Green
}
Write-Host ""
Write-Host "LISTO. Cada 10 minutos esta PC revisa GitHub y actualiza sola." -ForegroundColor Green
Write-Host "Si la extension es nueva en esta PC: Chrome > chrome://extensions > Modo desarrollador > Cargar descomprimida > elige esa carpeta." -ForegroundColor Yellow
Write-Host "Si ya estaba cargada: toca el boton de recargar una vez (despues se recarga sola)." -ForegroundColor Yellow

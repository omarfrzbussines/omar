# RURUSH - Programa el PowerPoint semanal en ESTA PC (0 tokens).
# Uso: clic derecho sobre este archivo -> "Ejecutar con PowerShell".
# Crea la tarea "RURUSH Informe Semanal": lunes 7:00 am. Si la PC estaba apagada, corre apenas la prendas.
$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host "Carpeta: $aqui"

# 1) Python y Node (los instala con winget si faltan)
function Tiene($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
if (-not (Tiene "python")) { Write-Host "Instalando Python..."; winget install -e --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements }
if (-not (Tiene "node"))   { Write-Host "Instalando Node.js..."; winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements }
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$python = (Get-Command python -ErrorAction Stop).Source
Write-Host "Python: $python"

# 2) Librerias
& $python -m pip install --quiet --upgrade openpyxl requests google-auth python-pptx lxml
Push-Location $aqui
if (-not (Test-Path "node_modules\pptxgenjs")) { npm install pptxgenjs --no-audit --no-fund }
Pop-Location

# 3) Tarea programada
$accion = New-ScheduledTaskAction -Execute $python -Argument "`"$aqui\semanal.py`"" -WorkingDirectory $aqui
$cuando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 7:00am
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "RURUSH Informe Semanal" -Action $accion -Trigger $cuando -Settings $ajustes -Description "PowerPoint semanal RURUSH sin Claude" -Force | Out-Null
Write-Host "Tarea creada: lunes 7:00 am."

# 4) Prueba ahora
Write-Host "Probando (tarda 1-2 min)..."
& $python "$aqui\semanal.py"
Write-Host ""
Write-Host "Listo. Resultado en semanal_log.txt. Puedes cerrar esta ventana."
Read-Host "Enter para salir"

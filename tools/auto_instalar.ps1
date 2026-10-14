# RURUSH - Crea la tarea "RURUSH Actualizar": cada 10 min baja lo nuevo de GitHub, sube a Google los
# Apps Script que cambiaron y copia las extensiones (0 tokens, sin ventana). Se apaga con QUITAR_AUTOMATICO.bat.
$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$accion = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$aqui\auto.vbs`"" -WorkingDirectory $aqui
$cada10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName "RURUSH Actualizar" -Action $accion -Trigger @($cada10, $alEntrar) -Settings $ajustes -Description "Sube a Google los Apps Script nuevos de GitHub y copia las extensiones (sin Claude)" -Force | Out-Null
Write-Host "Listo: la tarea RURUSH Actualizar revisa GitHub cada 10 minutos." -ForegroundColor Green
Write-Host "Lo que suba queda anotado en tools\auto_log.txt"

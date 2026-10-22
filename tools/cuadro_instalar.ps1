# RURUSH - Crea la tarea "RURUSH Cuadro": lun-vie 7:45 am (lo que necesitan hoy) y 8:00 pm (cierre del día).
# Corre con tu sesión abierta (necesita pantalla para pegar la foto en WhatsApp). Se quita con CUADRO_QUITAR.bat.
$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$ps = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$aqui\cuadro_whatsapp.ps1`""
$dias = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$quien = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
Register-ScheduledTask -TaskName "RURUSH Cuadro manana" -Force -Settings $ajustes -Principal $quien `
  -Action (New-ScheduledTaskAction -Execute "powershell.exe" -Argument $ps -WorkingDirectory $aqui) `
  -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dias -At "7:45am") -Description "Cuadro de ventas a tu WhatsApp" | Out-Null
Register-ScheduledTask -TaskName "RURUSH Cuadro noche" -Force -Settings $ajustes -Principal $quien `
  -Action (New-ScheduledTaskAction -Execute "powershell.exe" -Argument "$ps -Noche" -WorkingDirectory $aqui) `
  -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek $dias -At "8:00pm") -Description "Cierre de ventas a tu WhatsApp" | Out-Null
Write-Host "Listo: el cuadro llega a tu WhatsApp lun-vie 7:45 am y 8:00 pm." -ForegroundColor Green
Write-Host "Lo que pase queda anotado en tools\cuadro_log.txt"

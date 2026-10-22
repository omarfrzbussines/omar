# RURUSH - Cuadro de ventas a TU WhatsApp (lo corre la tarea "RURUSH Cuadro" a las 7:45 am y 8:00 pm, lun-vie).
#  1) baja el cuadro de RURUSH Hoy (link de solo lectura en cuadro.txt)
#  2) le saca una foto 4:5 con Chrome sin ventana
#  3) abre el chat de tu número en WhatsApp (app de escritorio; si no hay, WhatsApp Web), pega la foto y la envía.
# Uso manual:  powershell -File cuadro_whatsapp.ps1           (mañana)
#              powershell -File cuadro_whatsapp.ps1 -Noche    (cierre de la noche)
#              powershell -File cuadro_whatsapp.ps1 -SoloFoto (solo crea la foto, no envía nada)
param([switch]$Noche, [switch]$SoloFoto)
$ErrorActionPreference = "Stop"
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $aqui "cuadro_log.txt"
function Anotar($t) { Add-Content -Path $log -Value ((Get-Date -Format "dd/MM HH:mm:ss") + "  " + $t) -Encoding UTF8 }

try {
  # --- configuración: todo solo. La PC crea su clave (cuadro_clave.txt, no va a GitHub) y la pide de alta;
  #     a Omar le llega un correo para autorizarla y poner su número. Hasta entonces no envía nada.
  $exec = "https://script.google.com/macros/s/AKfycbxQ43YCw8-Jrgqncz1QiW0lIA4mmNW5_-QGYhKGS68aomEJUaZ5P2t01WqESRlCXfbZ/exec"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $wc = New-Object Net.WebClient
  $wc.Encoding = [Text.Encoding]::UTF8
  $claveF = Join-Path $aqui "cuadro_clave.txt"
  if (-not (Test-Path $claveF)) { Set-Content $claveF ([guid]::NewGuid().ToString("N")) -Encoding ASCII }
  $clave = (Get-Content $claveF -Raw).Trim()
  $alta = $wc.DownloadString("$exec`?cuadroalta=$clave").Trim()
  if ($alta -ne "OK") {
    Anotar ("Esperando que autorices la PC desde tu correo (" + $alta + ")")
    Write-Host "Revisa tu correo: toca 'Autorizar' y pon tu número. Luego vuelve a probar." -ForegroundColor Yellow
    exit 0
  }
  $info = $wc.DownloadString("$exec`?cuadro=$clave&info=1") | ConvertFrom-Json
  $numero = ($info.numero -replace '\D', '')
  if (-not $SoloFoto -and $numero.Length -lt 11) { throw "Falta tu número (vuelve a autorizar desde el correo)." }
  $cfg = @{ link = "$exec`?cuadro=$clave" }

  # --- 1) HTML del cuadro ---
  $url = $cfg.link + $(if ($Noche) { "&noche=1" } else { "" })
  $html = $wc.DownloadString($url)
  if ($html -notmatch 'RURUSH FITNESS CLUB') { throw "El link no devolvió el cuadro: " + $html.Substring(0, [Math]::Min(120, $html.Length)) }
  $tmp = Join-Path $env:TEMP "rurush_cuadro.html"
  [IO.File]::WriteAllText($tmp, $html, (New-Object Text.UTF8Encoding $false))

  # --- 2) foto 4:5 (1080x1350) con Chrome sin ventana ---
  $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
              "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe") |
            Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $chrome) { throw "No encontré Chrome ni Edge." }
  $png = Join-Path $aqui ("cuadro_" + $(if ($Noche) { "noche" } else { "manana" }) + ".png")
  if (Test-Path $png) { Remove-Item $png -Force }
  $perfil = Join-Path $env:TEMP "rurush_cuadro_perfil"
  $chromeArgs = @("--headless=new", "--disable-gpu", "--hide-scrollbars", "--user-data-dir=`"$perfil`"", "--window-size=540,675",
            "--force-device-scale-factor=2", "--screenshot=`"$png`"", "`"file:///$($tmp -replace '\\','/')`"")
  Start-Process -FilePath $chrome -ArgumentList $chromeArgs -Wait -WindowStyle Hidden
  if (-not (Test-Path $png)) { throw "Chrome no creó la foto." }
  Anotar ("Foto lista: " + $png)
  if ($SoloFoto) { Write-Host "Foto lista: $png" -ForegroundColor Green; exit 0 }

  # --- 3) pegar y enviar en TU chat de WhatsApp ---
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $img = [System.Drawing.Image]::FromFile($png)
  [System.Windows.Forms.Clipboard]::SetImage($img)
  $img.Dispose()
  $wsh = New-Object -ComObject WScript.Shell
  $app = Get-StartApps | Where-Object { $_.Name -eq "WhatsApp" } | Select-Object -First 1
  if ($app) {
    Start-Process ("whatsapp://send?phone=" + $numero)
    Start-Sleep -Seconds 8
    [void]$wsh.AppActivate("WhatsApp")
  } else {
    Start-Process ("https://web.whatsapp.com/send?phone=" + $numero)
    Start-Sleep -Seconds 25
    [void]$wsh.AppActivate("WhatsApp")
  }
  Start-Sleep -Seconds 2
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Seconds 4
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Anotar ("Enviado a tu WhatsApp (" + $(if ($app) { "app" } else { "web" }) + ")" + $(if ($Noche) { " · cierre" } else { " · mañana" }))
} catch {
  Anotar ("ERROR: " + $_.Exception.Message)
  Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}

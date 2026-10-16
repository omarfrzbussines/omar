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
  # --- configuración (cuadro.txt no se sube a GitHub) ---
  $cfgFile = Join-Path $aqui "cuadro.txt"
  if (-not (Test-Path $cfgFile)) { throw "Falta tools\cuadro.txt (copia cuadro.ejemplo.txt y llénalo)." }
  $cfg = @{}
  Get-Content $cfgFile -Encoding UTF8 | ForEach-Object { if ($_ -match '^\s*([a-z]+)\s*=\s*(.+?)\s*$') { $cfg[$matches[1]] = $matches[2] } }
  if (-not $cfg.link -or $cfg.link -match 'PEGA-AQUI') { throw "Falta el link en tools\cuadro.txt" }
  $numero = ($cfg.numero -replace '\D', '')
  if (-not $SoloFoto -and $numero.Length -lt 11) { throw "Falta tu número en tools\cuadro.txt (con 51 adelante)" }

  # --- 1) HTML del cuadro ---
  $url = $cfg.link + $(if ($Noche) { "&noche=1" } else { "" })
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $wc = New-Object Net.WebClient
  $wc.Encoding = [Text.Encoding]::UTF8
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

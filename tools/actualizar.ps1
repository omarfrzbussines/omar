# RURUSH — trae lo nuevo de GitHub y sube los Apps Script a Google (0 tokens).
# Lo llama ACTUALIZAR.bat. Nunca borra archivos de Google: primero baja el proyecto,
# encima pone los archivos del repo y recién ahí sube.
$ErrorActionPreference = "Stop"
$tools = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo  = Split-Path -Parent $tools
$estadoF = Join-Path $tools "estado.json"
$NO_SUBIR = @("Configurar.gs")   # plantillas con "PEGA-AQUÍ": no se suben

function Tiene($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function Linea($t, $color = "Gray") { Write-Host $t -ForegroundColor $color }

if (-not (Tiene "git")) { Linea "Instalando Git..." Yellow; winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements }
if (-not (Tiene "node")) { Linea "Instalando Node.js..." Yellow; winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements }
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
if (-not (Tiene "clasp")) { Linea "Instalando clasp (Google)..." Yellow; npm install -g @google/clasp | Out-Null }

# 1) GitHub
Set-Location $repo
$antes = (git rev-parse HEAD).Trim()
Linea "`n⬇️  Bajando lo nuevo de GitHub..." Cyan
git pull --ff-only
$despues = (git rev-parse HEAD).Trim()
if ($antes -eq $despues) { Linea "   Ya estaba al día." } else { git log --oneline "$antes..$despues" | ForEach-Object { Linea "   • $_" } }

# 2) Apps Script
$estado = @{}
if (Test-Path $estadoF) { (Get-Content $estadoF -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $estado[$_.Name] = $_.Value } }
$tmp = Join-Path $env:TEMP "rurush-clasp"
Linea "`n☁️  Apps Script:" Cyan
foreach ($l in Get-Content (Join-Path $tools "proyectos.txt")) {
  if ($l.Trim() -eq "" -or $l.Trim().StartsWith("#")) { continue }
  $p = $l.Split("|") | ForEach-Object { $_.Trim() }
  $carpeta, $id, $cuenta, $dep = $p[0], $p[1], $p[2], $(if ($p.Count -gt 3) { $p[3] } else { "" })
  if (-not $id) { continue }
  $ultimo = (git log -1 --format=%H -- $carpeta).Trim()
  if ($estado[$carpeta] -eq $ultimo) { Linea "   = $carpeta (sin cambios)"; continue }
  try {
    $dir = Join-Path $tmp $carpeta
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    New-Item -ItemType Directory $dir | Out-Null
    Set-Location $dir
    ('{"scriptId":"' + $id + '","rootDir":"."}') | Set-Content ".clasp.json" -Encoding ascii
    $u = @(); if ($cuenta) { $u = @("--user", $cuenta) }
    clasp @u pull | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "no pude bajar el proyecto (¿cuenta conectada? ¿API de Apps Script activada?)" }
    $locales = Get-ChildItem (Join-Path $repo $carpeta) -File | Where-Object { $_.Extension -in ".gs",".js",".html" -or $_.Name -eq "appsscript.json" } | Where-Object { $NO_SUBIR -notcontains $_.Name }
    foreach ($f in $locales) {
      $base = [IO.Path]::GetFileNameWithoutExtension($f.Name)
      if ($f.Extension -in ".gs",".js") { Remove-Item (Join-Path $dir "$base.js"), (Join-Path $dir "$base.gs") -ErrorAction SilentlyContinue }
      Copy-Item $f.FullName (Join-Path $dir $f.Name) -Force
    }
    clasp @u push --force | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "falló clasp push" }
    $msg = "   ✅ $carpeta subido ($($locales.Count) archivos)"
    if ($dep) {
      clasp @u deploy -i $dep -d ("ACTUALIZAR " + (Get-Date -Format "dd/MM HH:mm")) | Out-Null
      if ($LASTEXITCODE -eq 0) { $msg += " · app web con nueva versión (mismo link)" } else { $msg += " · ⚠️ no se pudo actualizar la implementación" }
    }
    Linea $msg Green
    $estado[$carpeta] = $ultimo
  } catch { Linea "   ❌ $carpeta : $_" Red }
  finally { Set-Location $repo }
}
$estado | ConvertTo-Json | Set-Content $estadoF

# 3) Extensiones que hay que recargar
$ext = @(); if ($antes -ne $despues) { $ext = git diff --name-only $antes $despues | Where-Object { $_ -like "extension-*" } | ForEach-Object { $_.Split("/")[0] } | Sort-Object -Unique }
Linea "`n🧩 Extensiones de Chrome:" Cyan
if ($ext.Count) { $ext | ForEach-Object { Linea "   🔄 Recarga «$_» en chrome://extensions" Yellow } } else { Linea "   Ninguna cambió." }
Linea "`nListo." Cyan

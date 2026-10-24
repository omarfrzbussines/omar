# RURUSH — trae lo nuevo de GitHub y sube los Apps Script a Google (0 tokens).
# Lo llama ACTUALIZAR.bat. Nunca borra archivos de Google: primero baja el proyecto,
# encima pone los archivos del repo y recién ahí sube.
param([switch]$SoloComparar, [switch]$Auto)   # -Auto: lo usa la tarea programada (sin ventana, deja log)
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
# si los únicos cambios locales son saltos de línea de Windows (CRLF), se descartan
if (git status --porcelain) { git diff --ignore-cr-at-eol --quiet; if ($LASTEXITCODE -eq 0) { git checkout -- . } }
git pull --ff-only
$despues = (git rev-parse HEAD).Trim()
if ($Auto) {
  # Modo automático: si no hay nada pendiente se va en silencio; si hay, deja todo en auto_log.txt
  $pendiente = $false
  $est = @{}; if (Test-Path $estadoF) { (Get-Content $estadoF -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $est[$_.Name] = $_.Value } }
  foreach ($l in Get-Content (Join-Path $tools "proyectos.txt") -Encoding UTF8) {
    if ($l.Trim() -eq "" -or $l.Trim().StartsWith("#")) { continue }
    $c = ($l.Split("|") | ForEach-Object { $_.Trim() })
    if ($c[1] -and $est[$c[0]] -ne (git log -1 --format=%H -- $c[0]).Trim()) { $pendiente = $true }
  }
  if (-not $pendiente -and $antes -eq $despues) { exit 0 }
  $log = Join-Path $tools "auto_log.txt"
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 500KB) { Remove-Item $log }
  Start-Transcript -Path $log -Append | Out-Null
  Linea "`n===== $(Get-Date -Format 'dd/MM/yyyy HH:mm') =====" Cyan
}
if ($antes -eq $despues) { Linea "   Ya estaba al día." } else { git log --oneline "$antes..$despues" | ForEach-Object { Linea "   • $_" } }

# 2) Apps Script

# Las claves nunca están en GitHub: en el repo dicen PEGA-AQUÍ. Esas líneas se toman de Google.
function Conservar-Secretos($textoRepo, $textoGoogle) {
  if (-not $textoGoogle) { return $textoRepo }
  $g = $textoGoogle -split "`r?`n"
  $salida = foreach ($l in ($textoRepo -split "`r?`n")) {
    if ($l -match 'PEGA[-_ ]?AQU' -and $l -match '^\s*(?:const|var|let)\s+([A-Za-z_$][\w$]*)\s*=') {
      $nom = $Matches[1]
      $real = $g | Where-Object { $_ -match "^\s*(?:const|var|let)\s+$([regex]::Escape($nom))\s*=" } | Select-Object -First 1
      if ($real) { $real } else { $l }
    } else { $l }
  }
  return ($salida -join "`n")
}
function Ocultar($l) { return ($l -replace '[A-Za-z0-9_\-]{20,}', '«…»').Trim() }
$estado = @{}
if (Test-Path $estadoF) { (Get-Content $estadoF -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $estado[$_.Name] = $_.Value } }
$tmp = Join-Path $env:TEMP "rurush-clasp"
Linea "`n☁️  Apps Script:" Cyan
foreach ($l in Get-Content (Join-Path $tools "proyectos.txt") -Encoding UTF8) {
  if ($l.Trim() -eq "" -or $l.Trim().StartsWith("#")) { continue }
  $p = $l.Split("|") | ForEach-Object { $_.Trim() }
  $carpeta, $id, $cuenta = $p[0], $p[1], $p[2]
  $dep = $(if ($p.Count -gt 3) { $p[3] } else { "" })
  $mapa = @{}
  if ($p.Count -gt 4 -and $p[4]) { foreach ($par in $p[4].Split(";")) { $kv = $par.Split("="); if ($kv.Count -eq 2) { $mapa[$kv[0].Trim()] = $kv[1].Trim() } } }
  if (-not $id) { continue }
  $ultimo = (git log -1 --format=%H -- $carpeta).Trim()
  if (-not $SoloComparar -and $estado[$carpeta] -eq $ultimo) { Linea "   = $carpeta (sin cambios)"; continue }
  try {
    $dir = Join-Path $tmp $carpeta
    if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
    New-Item -ItemType Directory $dir | Out-Null
    Set-Location $dir
    ('{"scriptId":"' + $id + '","rootDir":"."}') | Set-Content ".clasp.json" -Encoding ascii
    $u = @(); if ($cuenta) { $u = @("--user", $cuenta) }
    clasp @u pull | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "no pude bajar el proyecto (¿cuenta conectada? ¿API de Apps Script activada?)" }
    $copia = Join-Path $tmp "$carpeta-google"
    if (Test-Path $copia) { Remove-Item $copia -Recurse -Force }
    Copy-Item $dir $copia -Recurse
    $locales = Get-ChildItem (Join-Path $repo $carpeta) -File | Where-Object { $_.Extension -in ".gs",".js",".html" -or $_.Name -eq "appsscript.json" } | Where-Object { $NO_SUBIR -notcontains $_.Name }
    # Emparejar cada archivo del repo con su archivo en Google aunque tenga otro nombre
    # (Código.gs vs Code.gs, con o sin tilde): por nombre o por las funciones que define.
    $funs = { param($t) ([regex]::Matches($t, '(?m)^\s*function\s+([A-Za-z_$][\w$]*)') | ForEach-Object { $_.Groups[1].Value }) }
    $remotos = @(Get-ChildItem $dir -File | Where-Object { $_.Extension -in ".js",".gs" })
    $usados = @{}
    foreach ($f in $locales) {
      if ($f.Extension -notin ".gs",".js") { continue }
      $quiere = $(if ($mapa.ContainsKey($f.Name)) { $mapa[$f.Name] } else { $f.Name })
      $bq = [IO.Path]::GetFileNameWithoutExtension($quiere)
      $igual = $remotos | Where-Object { [IO.Path]::GetFileNameWithoutExtension($_.Name) -eq $bq } | Select-Object -First 1
      if ($igual) { $usados[$igual.Name] = 1; continue }
      $mias = @(& $funs (Get-Content $f.FullName -Raw -Encoding UTF8))
      if (-not $mias.Count) { continue }
      $mejor = $null; $puntaje = 0
      foreach ($r in $remotos) {
        if ($usados.ContainsKey($r.Name)) { continue }
        $suyas = @(& $funs (Get-Content $r.FullName -Raw -Encoding UTF8))
        $comunes = @($mias | Where-Object { $suyas -contains $_ }).Count
        $p = $comunes / [Math]::Max(1, [Math]::Min($mias.Count, [Math]::Max(1, $suyas.Count)))
        if ($p -gt $puntaje) { $puntaje = $p; $mejor = $r }
      }
      if ($mejor -and $puntaje -ge 0.5) {
        $usados[$mejor.Name] = 1
        $mapa[$f.Name] = [IO.Path]::GetFileNameWithoutExtension($mejor.Name) + ".gs"
        Linea "      ↔ $($f.Name) = «$([IO.Path]::GetFileNameWithoutExtension($mejor.Name))» en Google" DarkGray
      }
    }
    foreach ($f in $locales) {
      $nombre = $(if ($mapa.ContainsKey($f.Name)) { $mapa[$f.Name] } else { $f.Name })
      $base = [IO.Path]::GetFileNameWithoutExtension($nombre)
      $gArch = Get-ChildItem (Join-Path $tmp "$carpeta-google") -File | Where-Object { [IO.Path]::GetFileNameWithoutExtension($_.Name) -eq $base -and ($_.Extension -eq $f.Extension -or ($_.Extension -in ".js",".gs" -and $f.Extension -in ".js",".gs")) } | Select-Object -First 1
      $gTexto = $(if ($gArch) { Get-Content $gArch.FullName -Raw -Encoding UTF8 } else { "" })
      if ($f.Extension -in ".gs",".js") { Remove-Item (Join-Path $dir "$base.js"), (Join-Path $dir "$base.gs") -ErrorAction SilentlyContinue }
      $contenido = Conservar-Secretos (Get-Content $f.FullName -Raw -Encoding UTF8) $gTexto
      [IO.File]::WriteAllText((Join-Path $dir $nombre), $contenido, (New-Object Text.UTF8Encoding $false))
    }
    if ($SoloComparar) {
      $dif = @(); $detalle = @()
      foreach ($f in $locales) {
        $nombre = $(if ($mapa.ContainsKey($f.Name)) { $mapa[$f.Name] } else { $f.Name })
        $base = [IO.Path]::GetFileNameWithoutExtension($nombre)
        $remoto = Get-ChildItem (Join-Path $tmp "$carpeta-google") -File -ErrorAction SilentlyContinue | Where-Object { [IO.Path]::GetFileNameWithoutExtension($_.Name) -eq $base -and ($_.Extension -eq $f.Extension -or ($_.Extension -in ".js",".gs" -and $f.Extension -in ".js",".gs")) } | Select-Object -First 1
        if (-not $remoto) { $dif += "NUEVO en Google: $nombre"; continue }
        $b = (Get-Content $remoto.FullName -Raw -Encoding UTF8) -replace "`r`n", "`n"
        $a = (Conservar-Secretos (Get-Content $f.FullName -Raw -Encoding UTF8) $b) -replace "`r`n", "`n"
        if ($f.Name -eq "appsscript.json") {   # Google reordena el JSON: se compara el contenido, no el texto
          try { $a = ($a | ConvertFrom-Json | ConvertTo-Json -Depth 20 -Compress); $b = ($b | ConvertFrom-Json | ConvertTo-Json -Depth 20 -Compress) } catch {}
        }
        if ($a.Trim() -ne $b.Trim()) {
          $la = $a.Trim() -split "`n"; $lb = $b.Trim() -split "`n"
          $d = @(Compare-Object $lb $la)
          $mas = @($d | Where-Object SideIndicator -eq "=>").Count; $menos = @($d | Where-Object SideIndicator -eq "<=").Count
          $dif += "CAMBIA: $nombre (+$mas / -$menos líneas)"
          $detalle += @("      ── $nombre ──") + @($d | Select-Object -First 12 | ForEach-Object { $(if ($_.SideIndicator -eq "=>") { "      + repo:   " } else { "      - Google: " }) + (Ocultar $_.InputObject) })
        }
      }
      $soloGoogle = Get-ChildItem (Join-Path $tmp "$carpeta-google") -File | Where-Object { $_.Name -ne ".clasp.json" } | ForEach-Object { $_.Name } | Where-Object { $n = [IO.Path]::GetFileNameWithoutExtension($_); -not ($locales | Where-Object { [IO.Path]::GetFileNameWithoutExtension($(if ($mapa.ContainsKey($_.Name)) { $mapa[$_.Name] } else { $_.Name })) -eq $n }) }
      if ($dif.Count) { Linea "   ⚠️ $carpeta : $($dif -join ' · ')" Yellow; $detalle | ForEach-Object { Linea $_ } } else { Linea "   ✅ $carpeta : Google y el repo son iguales" Green }
      if ($soloGoogle) { Linea "      (solo en Google, se conservan: $($soloGoogle -join ', '))" }
      continue
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

# 2b) Arreglos de una sola vez en proyectos que NO están en el repo (quedan marcados en estado.json y no se repiten).
#     Cola de Renovación ("Dashboard Cola Renovar"): permitir que se vea DENTRO del panel Free Pass.
#     Solo agrega .setXFrameOptionsMode(ALLOWALL) a lo que devuelve doGet; si no lo encuentra o el código
#     queda raro, NO sube nada y lo deja anotado para hacerlo a mano.
if (-not $SoloComparar -and -not $estado["arreglo:cola-iframe"]) {
  $ID_COLA = "1nLufchu5lHboPKpgKpeKVrSkzbJV0qVYnFbfeaaAWRNxv_qdQw0CbfDN"
  $DEP_COLA = "AKfycbywf-ajwBz9mRioOeA6bLfF1WzMJYbvN5X5VDmDIYbd4mEY-jxe3IW5K2peNuUReFZb"
  Linea "`n🩹 Cola de Renovación: que se vea dentro del panel" Cyan
  $ev = [System.Text.RegularExpressions.MatchEvaluator]{ param($x)
    if ($x.Value -match 'ContentService') { return $x.Value }
    return $x.Groups[1].Value + "`n      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);" }
  foreach ($cuentaCola in @("rurush", "omar")) {
    if ($estado["arreglo:cola-iframe"]) { break }
    try {
      $dirC = Join-Path $tmp "cola-renovar"
      if (Test-Path $dirC) { Remove-Item $dirC -Recurse -Force }
      New-Item -ItemType Directory $dirC | Out-Null
      Set-Location $dirC
      ('{"scriptId":"' + $ID_COLA + '","rootDir":"."}') | Set-Content ".clasp.json" -Encoding ascii
      clasp --user $cuentaCola pull | Out-Null
      if ($LASTEXITCODE -ne 0) { Linea "   · con la cuenta $cuentaCola no se pudo abrir el proyecto" DarkGray; continue }
      $cambiados = 0; $yaEstaba = $false; $malo = $false
      foreach ($f in Get-ChildItem $dirC -File | Where-Object { $_.Extension -in ".js",".gs" }) {
        $t = Get-Content $f.FullName -Raw -Encoding UTF8
        $m = [regex]::Match($t, 'function\s+doGet\s*\([^)]*\)\s*\{')
        if (-not $m.Success) { continue }
        $i = $m.Index + $m.Length; $nivel = 1
        while ($i -lt $t.Length -and $nivel -gt 0) { if ($t[$i] -eq '{') { $nivel++ } elseif ($t[$i] -eq '}') { $nivel-- }; $i++ }
        $cuerpo = $t.Substring($m.Index, $i - $m.Index)
        if ($cuerpo -match 'XFrameOptionsMode') { $yaEstaba = $true; break }
        $nuevo = [regex]::Replace($cuerpo, '(return\s+(?:(?!\breturn\b)[^;])*?(?:HtmlService|\.evaluate\(\)|createHtmlOutput|createTemplate)(?:(?!\breturn\b)[^;])*?)\s*;', $ev)
        if ($nuevo -eq $cuerpo) { continue }
        $t2 = $t.Substring(0, $m.Index) + $nuevo + $t.Substring($i)
        $prueba = Join-Path $env:TEMP "cola-prueba.js"
        [IO.File]::WriteAllText($prueba, $t2, (New-Object Text.UTF8Encoding $false))
        node --check $prueba | Out-Null
        if ($LASTEXITCODE -ne 0) { $malo = $true; break }
        [IO.File]::WriteAllText($f.FullName, $t2, (New-Object Text.UTF8Encoding $false))
        $cambiados++
      }
      if ($yaEstaba) { Linea "   ✅ ya estaba permitido" Green; $estado["arreglo:cola-iframe"] = "ya estaba"; break }
      if ($malo -or -not $cambiados) { Linea "   ⚠️ no encontré dónde ponerlo con seguridad: no subí nada (hay que hacerlo a mano)" Yellow; $estado["arreglo:cola-iframe"] = "a mano"; break }
      clasp --user $cuentaCola push --force | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "falló clasp push" }
      clasp --user $cuentaCola deploy -i $DEP_COLA -d ("Panel: verse dentro " + (Get-Date -Format "dd/MM HH:mm")) | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "subí el cambio pero no pude publicar la nueva versión" }
      Linea "   ✅ listo: Cola de Renovación ya se puede ver dentro del panel (mismo link)" Green
      $estado["arreglo:cola-iframe"] = (Get-Date -Format "dd/MM/yyyy HH:mm")
    } catch { Linea "   ❌ Cola de Renovación ($cuentaCola): $_" Red }
    finally { Set-Location $repo }
  }
}
if (-not $SoloComparar) { $estado | ConvertTo-Json | Set-Content $estadoF }

# 3) Extensiones: copia a las carpetas desde donde las carga cada Chrome (tools\extensiones.txt)
$extF = Join-Path $tools "extensiones.txt"
if (Test-Path $extF) {
  foreach ($l in Get-Content $extF -Encoding UTF8) {
    if ($l.Trim() -eq "" -or $l.Trim().StartsWith("#")) { continue }
    $p = $l.Split("|") | ForEach-Object { $_.Trim() }
    $origen = Join-Path $repo $p[0]
    if ((Test-Path $origen) -and $p[1] -and (Test-Path $p[1])) {
      Copy-Item (Join-Path $origen "*") $p[1] -Recurse -Force
      Linea "   📁 $($p[0]) copiada a $($p[1])" DarkGray
    } elseif ($p[1]) { Linea "   ⚠️ No existe la carpeta $($p[1])" Yellow }
  }
}

# 4) Extensiones que hay que recargar
$ext = @(); if ($antes -ne $despues) { $ext = git diff --name-only $antes $despues | Where-Object { $_ -like "extension-*" } | ForEach-Object { $_.Split("/")[0] } | Sort-Object -Unique }
Linea "`n🧩 Extensiones de Chrome:" Cyan
if ($ext.Count) { $ext | ForEach-Object { Linea "   🔄 «$_» cambió: se recarga sola en unos minutos (o toca ⟳ en chrome://extensions)" Yellow } } else { Linea "   Ninguna cambió." }
# 📲 El cuadro de ventas ahora lo manda la extensión Rurush Difusiones: se quitan las tareas viejas de la PC
foreach ($t in @("RURUSH Cuadro manana", "RURUSH Cuadro noche")) {
  if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $t -Confirm:$false; Linea "   🗑️ Tarea $t quitada (ahora lo envía la extensión)" DarkGray }
}
Linea "`nListo." Cyan
if ($Auto) { Stop-Transcript | Out-Null }

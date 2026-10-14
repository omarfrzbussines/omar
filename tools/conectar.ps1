# Conecta una cuenta de Google a clasp (una vez por cuenta). Abre el navegador para iniciar sesión.
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) { npm install -g @google/clasp | Out-Null }
Write-Host "ANTES: en esa cuenta entra a https://script.google.com/home/usersettings y ACTIVA 'API de Google Apps Script'." -ForegroundColor Yellow
$n = Read-Host "Nombre corto para esta cuenta (ej. omar1 u omar2, el mismo de proyectos.txt)"
clasp login --user $n
Write-Host "Listo: cuenta '$n' conectada." -ForegroundColor Green
Read-Host "Enter para salir"

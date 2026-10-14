@echo off
REM RURUSH: instala la actualizacion automatica (cada 10 min, sin ventana, 0 tokens)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0auto_instalar.ps1"
pause

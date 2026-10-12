@echo off
REM RURUSH: compara los Apps Script de Google con el repo SIN subir nada
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0actualizar.ps1" -SoloComparar
pause

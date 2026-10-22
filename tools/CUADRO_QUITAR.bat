@echo off
REM RURUSH: quita el envio automatico del cuadro
schtasks /Delete /TN "RURUSH Cuadro manana" /F
schtasks /Delete /TN "RURUSH Cuadro noche" /F
pause

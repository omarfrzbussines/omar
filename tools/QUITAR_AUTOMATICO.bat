@echo off
REM RURUSH: apaga la actualizacion automatica
powershell -NoProfile -Command "Unregister-ScheduledTask -TaskName 'RURUSH Actualizar' -Confirm:$false"
echo Actualizacion automatica apagada.
pause

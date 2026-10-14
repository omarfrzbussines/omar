' RURUSH: corre actualizar.ps1 -Auto sin abrir ventana (lo llama la tarea programada "RURUSH Actualizar")
Set fso = CreateObject("Scripting.FileSystemObject")
aqui = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & aqui & "\actualizar.ps1"" -Auto", 0, True

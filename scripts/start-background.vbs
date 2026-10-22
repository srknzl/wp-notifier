Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
projectDir = FSO.GetParentFolderName(scriptDir)
WshShell.Run "powershell.exe -WindowStyle Hidden -Command ""Set-Location '" & projectDir & "'; node src/index.js *>> '" & projectDir & "\data\app.log'""", 0, False


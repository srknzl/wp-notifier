Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
projectDir = FSO.GetParentFolderName(scriptDir)
WshShell.CurrentDirectory = projectDir
WshShell.Run "cmd /c node src/index.js >> data\app.log 2>&1", 0, False

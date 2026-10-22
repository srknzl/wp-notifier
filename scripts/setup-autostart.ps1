param (
    [switch]$Uninstall
)

$startupFolder = [Environment]::GetFolderPath('Startup')
$targetFile = Join-Path $startupFolder "wp-notifier.vbs"
$projectDir = (Get-Item $PSScriptRoot).Parent.FullName

if ($Uninstall) {
    if (Test-Path $targetFile) {
        Remove-Item -Force $targetFile
        Write-Host "Autostart removed." -ForegroundColor Yellow
    } else {
        Write-Host "Autostart is not installed."
    }
    return
}

$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -WindowStyle Hidden -Command ""Set-Location '$projectDir'; node src/index.js *>> '$projectDir\data\app.log'""", 0, False
"@

[System.IO.File]::WriteAllText($targetFile, $vbsContent)
Write-Host "wp-notifier successfully added to Windows Startup!" -ForegroundColor Green
Write-Host "Location: $targetFile"
Write-Host "Working Directory: $projectDir"
Write-Host "Log File: $projectDir\data\app.log"
Write-Host "The bot will now start silently in the background on every user login."

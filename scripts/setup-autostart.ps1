param (
    [switch]$Uninstall
)

$startupFolder = [Environment]::GetFolderPath('Startup')
$targetFile = Join-Path $startupFolder "wp-notifier.vbs"
$projectDir = (Get-Item $PSScriptRoot).Parent.FullName

if ($Uninstall) {
    if (Test-Path $targetFile) {
        Remove-Item -Force $targetFile
        Write-Host "Otomatik başlatma kaldırıldı." -ForegroundColor Yellow
    } else {
        Write-Host "Otomatik başlatma zaten kurulu değil."
    }
    return
}

$vbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -WindowStyle Hidden -Command ""Set-Location '$projectDir'; node src/index.js *>> '$projectDir\data\app.log'""", 0, False
"@

[System.IO.File]::WriteAllText($targetFile, $vbsContent)
Write-Host "wp-notifier Windows başlangıcına başarıyla eklendi!" -ForegroundColor Green
Write-Host "Konum: $targetFile"
Write-Host "Çalışma Dizini: $projectDir"
Write-Host "Log Dosyası: $projectDir\data\app.log"
Write-Host "Artık bilgisayar her açıldığında bot arka planda sessizce otomatik başlayacaktır."


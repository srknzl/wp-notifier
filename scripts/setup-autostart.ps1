param (
    [switch]$Uninstall
)

$startupFolder = [Environment]::GetFolderPath('Startup')
$targetFile = Join-Path $startupFolder "wp-notifier.vbs"
$sourceFile = Join-Path $PSScriptRoot "start-background.vbs"

if ($Uninstall) {
    if (Test-Path $targetFile) {
        Remove-Item -Force $targetFile
        Write-Host "Otomatik başlatma kaldırıldı." -ForegroundColor Yellow
    } else {
        Write-Host "Otomatik başlatma zaten kurulu değil."
    }
    return
}

Copy-Item -Path $sourceFile -Destination $targetFile -Force
Write-Host "wp-notifier Windows başlangıcına başarıyla eklendi!" -ForegroundColor Green
Write-Host "Konum: $targetFile"
Write-Host "Artık bilgisayar her açıldığında bot arka planda sessizce otomatik başlayacaktır."

$processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "src/index.js" -or $_.CommandLine -match "wp-notifier"
}

if ($processes) {
    foreach ($p in $processes) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "wp-notifier durduruldu (PID: $($p.ProcessId))" -ForegroundColor Yellow
    }
} else {
    Write-Host "Çalışan wp-notifier işlemi bulunamadı."
}

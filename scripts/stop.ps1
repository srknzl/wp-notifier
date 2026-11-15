$processes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "src/index.js" -or $_.CommandLine -match "wp-notifier"
}

if ($processes) {
    foreach ($p in $processes) {
        & taskkill /F /T /PID $p.ProcessId 2>$null | Out-Null
        Write-Host "wp-notifier stopped (PID: $($p.ProcessId))" -ForegroundColor Yellow
    }
} else {
    Write-Host "No running wp-notifier processes found."
}

$chromeProcs = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -match "wp-notifier" -or $_.CommandLine -match "\.wwebjs_auth"
}
foreach ($cp in $chromeProcs) {
    Stop-Process -Id $cp.ProcessId -Force -ErrorAction SilentlyContinue
}

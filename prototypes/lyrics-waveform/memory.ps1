$ErrorActionPreference = 'Stop'
# Warm Windows PowerShell 5.1 cmdlet/type initialization before short producers start.
$warmIds = ConvertFrom-Json -InputObject '[1,2]'
@($warmIds | Where-Object { $_ -le 0 }) | Out-Null
$warmProcess = Get-Process -Id $PID
$warmProcess.Refresh()
$warmProcess.PeakWorkingSet64 | Out-Null
$warmProcess.Dispose()
@{ processes = @(@{ pid = 1; samples = 0 }) } | ConvertTo-Json -Compress -Depth 4 | Out-Null
[Console]::Out.WriteLine('READY')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line -or $line -eq 'quit') { break }
  $targetIds = ConvertFrom-Json -InputObject $line
  if ($targetIds.Count -ne 2 -or @($targetIds | Where-Object { $_ -isnot [long] -and $_ -isnot [int] -or $_ -le 0 }).Count -gt 0) { throw 'Invalid owned processes' }
  $observations = @{}
  foreach ($targetProcessId in $targetIds) { $observations[$targetProcessId] = @{ pid = $targetProcessId; peakWorkingSetBytes = 0L; samples = 0 } }
  $clock = [Diagnostics.Stopwatch]::StartNew()
  while ($clock.ElapsedMilliseconds -lt 35000) {
    $alive = 0
    foreach ($targetProcessId in $targetIds) {
      try {
        $targetProcess = [Diagnostics.Process]::GetProcessById($targetProcessId)
        $targetProcess.Refresh()
        $observations[$targetProcessId].peakWorkingSetBytes = [Math]::Max($observations[$targetProcessId].peakWorkingSetBytes, $targetProcess.PeakWorkingSet64)
        $observations[$targetProcessId].samples++
        $targetProcess.Dispose()
        $alive++
      } catch { }
    }
    if ($alive -eq 0) { break }
    Start-Sleep -Milliseconds 20
  }
  [Console]::Out.WriteLine((@{ processes = @($targetIds | ForEach-Object { $row = $observations[$_]; if ($row.samples -eq 0) { $row.peakWorkingSetBytes = $null }; $row }); observedMs = $clock.ElapsedMilliseconds } | ConvertTo-Json -Compress -Depth 4))
}

param([Parameter(Mandatory=$true)][int]$TargetPid)
$ErrorActionPreference = 'Stop'
$target = [System.Diagnostics.Process]::GetProcessById($TargetPid)
$self = [System.Diagnostics.Process]::GetCurrentProcess()
while ($true) {
  try {
    $target.Refresh()
    if ($target.HasExited) { break }
    $self.Refresh()
    [ordered]@{
      at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      cpuSeconds = $target.TotalProcessorTime.TotalSeconds
      privateBytes = $target.PrivateMemorySize64
      workingSet = $target.WorkingSet64
      peakWorkingSet = $target.PeakWorkingSet64
      samplerCpuSeconds = $self.TotalProcessorTime.TotalSeconds
      samplerPrivateBytes = $self.PrivateMemorySize64
      samplerWorkingSet = $self.WorkingSet64
    } | ConvertTo-Json -Compress
    Start-Sleep -Milliseconds 100
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
  }
}

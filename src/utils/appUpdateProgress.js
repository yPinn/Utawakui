// Formats the bounded download telemetry that appUpdateService projects
// (percent + bytes/second + whole-second ETA) into the single status line the
// Settings row shows. Every input is optional; missing parts are dropped so the
// line degrades to just a percentage, or "正在下載中" when nothing is known.

function formatRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  const perSecond = bytesPerSecond / 1024;
  if (perSecond < 1024) return `${Math.round(perSecond)} KB/s`;
  return `${(perSecond / 1024).toFixed(1)} MB/s`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `剩餘約 ${Math.max(1, Math.round(seconds))} 秒`;
  if (seconds < 3600) return `剩餘約 ${Math.round(seconds / 60)} 分`;
  return `剩餘約 ${Math.round(seconds / 3600)} 小時`;
}

export function formatDownloadProgress({
  progress,
  downloadBytesPerSecond,
  downloadEtaSeconds,
} = {}) {
  const parts = [];
  if (Number.isFinite(progress)) {
    parts.push(`正在下載 ${progress}%`);
  }
  const rate = formatRate(downloadBytesPerSecond);
  if (rate) parts.push(rate);
  const eta = formatEta(downloadEtaSeconds);
  if (eta) parts.push(eta);

  return parts.length ? parts.join(' · ') : '正在下載中';
}

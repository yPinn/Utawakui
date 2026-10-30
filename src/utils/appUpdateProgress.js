// Formats the bounded download telemetry that appUpdateService projects
// (percent + bytes/second + whole-second ETA) into the single status line the
// Settings row shows. Every input is optional; missing parts are dropped so the
// line degrades to just a percentage, or a generic downloading label.

import { t } from './i18n.js';

function formatRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  const perSecond = bytesPerSecond / 1024;
  if (perSecond < 1024) return `${Math.round(perSecond)} KB/s`;
  return `${(perSecond / 1024).toFixed(1)} MB/s`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const [unit, count] =
    seconds < 60
      ? ['seconds', Math.max(1, Math.round(seconds))]
      : seconds < 3600
        ? ['minutes', Math.round(seconds / 60)]
        : ['hours', Math.round(seconds / 3600)];
  return t(`appUpdate.progress.eta.${unit}`, { count }, count);
}

export function formatDownloadProgress({
  progress,
  downloadBytesPerSecond,
  downloadEtaSeconds,
} = {}) {
  const parts = [];
  if (Number.isFinite(progress)) {
    parts.push(t('appUpdate.progress.percent', { percent: progress }));
  }
  const rate = formatRate(downloadBytesPerSecond);
  if (rate) parts.push(rate);
  const eta = formatEta(downloadEtaSeconds);
  if (eta) parts.push(eta);

  return parts.length ? parts.join(' · ') : t('appUpdate.progress.unknown');
}

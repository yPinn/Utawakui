import { PITCH_MIN_DBFS } from './inputProcessing.js';

export const MICROPHONE_METER_MIN_DBFS = -60;

export function peakDbfs(peak) {
  return 20 * Math.log10(peak);
}

export function formatMicrophoneDbfs(dbfs) {
  if (!Number.isFinite(dbfs)) return '−∞ dBFS';
  const rounded = dbfs.toFixed(1);
  return `${rounded === '-0.0' ? '0.0' : rounded} dBFS`;
}

export function microphonePitchStatus(frame, { rawClipped, clipped } = {}) {
  if (!frame) return 'waiting';
  if (rawClipped) return 'rawClipping';
  if (clipped) return 'analysisClipping';
  if (frame.dbfs <= PITCH_MIN_DBFS) return 'quiet';
  return frame.hz > 0 ? 'voiced' : 'noPitch';
}

export function microphonePitchTone(status) {
  switch (status) {
    case 'rawClipping':
    case 'analysisClipping':
      return 'danger';
    case 'quiet':
    case 'noPitch':
      return 'warning';
    case 'voiced':
      return 'success';
    default:
      return 'neutral';
  }
}

export function microphoneMeterPercent(dbfs) {
  return Number.isFinite(dbfs)
    ? 100 *
        Math.max(
          0,
          Math.min(1, 1 - Math.round(dbfs) / MICROPHONE_METER_MIN_DBFS),
        )
    : 0;
}

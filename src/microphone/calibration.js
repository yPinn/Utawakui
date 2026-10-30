// Research policy, not Discord's algorithm or a validated speech detector.
// Both windows must be recorded under the measurement owner's same conditions.
const MARGIN_DB = 3;
const validSummary = (value) => {
  if (!value || !Number.isInteger(value.count) || value.count < 80)
    return false;
  const levels = [
    value.p10Dbfs,
    value.medianDbfs,
    value.p95Dbfs,
    value.maxDbfs,
  ];
  return (
    levels.every((v) => Number.isFinite(v) && v >= -100 && v <= 0) &&
    levels.every((v, i) => i === 0 || v >= levels[i - 1]) &&
    Number.isInteger(value.nearClipCount) &&
    value.nearClipCount >= 0 &&
    value.nearClipCount <= value.count
  );
};

export function recommendMicrophoneThreshold(results = {}) {
  const { quiet, voice } = results ?? {};
  if (!quiet || !voice) return { status: 'incomplete' };
  if (!validSummary(quiet) || !validSummary(voice))
    return { status: 'invalid' };
  if (
    !quiet.conditions?.selectedDeviceId ||
    JSON.stringify(quiet.conditions) !== JSON.stringify(voice.conditions)
  )
    return { status: 'conditions' };
  if (
    quiet.conditions.inputOptions?.autoGainControl === true ||
    quiet.conditions.settings?.autoGainControl === true
  )
    return { status: 'auto-gain' };
  if (quiet.nearClipCount || voice.nearClipCount) return { status: 'clipped' };
  if (quiet.p95Dbfs <= -99 || voice.p10Dbfs <= -99) return { status: 'floor' };
  const quietDbfs = quiet.p95Dbfs;
  const voiceDbfs = voice.p10Dbfs;
  const separationDb = voiceDbfs - quietDbfs;
  if (separationDb < MARGIN_DB * 2) return { status: 'overlap' };
  // Choose a whole-dB threshold strictly inside both distributions' margins.
  // Intersect with the supported slider domain; never silently clamp past voice.
  const low = Math.max(-90, Math.ceil(quietDbfs + MARGIN_DB));
  const high = Math.min(-10, Math.floor(voiceDbfs - MARGIN_DB));
  if (low > high) return { status: 'bounds' };
  return {
    status: 'ready',
    thresholdDbfs: Math.max(
      low,
      Math.min(high, Math.round((quietDbfs + voiceDbfs) / 2)),
    ),
    quietDbfs,
    voiceDbfs,
    separationDb,
  };
}

export function recommendMicrophoneActivityThresholds(results = {}) {
  const single = recommendMicrophoneThreshold(results);
  if (single.status !== 'ready') return single;
  if (single.separationDb < 12) return { status: 'overlap' };
  const low = Math.max(-84, Math.ceil(single.quietDbfs + 9));
  const high = Math.min(-10, Math.floor(single.voiceDbfs - 3));
  if (low > high) return { status: 'bounds' };
  const openThreshold = Math.max(low, Math.min(high, single.thresholdDbfs));
  return { ...single, openThreshold, closeThreshold: openThreshold - 6 };
}

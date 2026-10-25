import audioControlValues from '../../shared/audioControlValues.json';

export { audioControlValues as AUDIO_CONTROL_VALUES };

export const DEFAULT_AUDIO_PREFERENCES = Object.freeze({
  performanceVolume: audioControlValues.performanceVolume.defaultValue,
  captureVolume: audioControlValues.captureVolume.defaultValue,
  performanceMuted: audioControlValues.performanceMutedDefault,
  monitorGuideVocalLevel:
    audioControlValues.monitorGuideVocalLevel.defaultValue,
  captureGuideVocalLevel:
    audioControlValues.captureGuideVocalLevel.defaultValue,
});

function boundedValue(value, rule, fallback) {
  return Number.isFinite(value) && value >= rule.min && value <= rule.max
    ? value
    : fallback;
}

export function normalizeAudioPreferences(value) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    performanceVolume: boundedValue(
      source.performanceVolume,
      audioControlValues.performanceVolume,
      DEFAULT_AUDIO_PREFERENCES.performanceVolume,
    ),
    captureVolume: boundedValue(
      source.captureVolume,
      audioControlValues.captureVolume,
      DEFAULT_AUDIO_PREFERENCES.captureVolume,
    ),
    performanceMuted:
      typeof source.performanceMuted === 'boolean'
        ? source.performanceMuted
        : DEFAULT_AUDIO_PREFERENCES.performanceMuted,
    monitorGuideVocalLevel: boundedValue(
      source.monitorGuideVocalLevel,
      audioControlValues.monitorGuideVocalLevel,
      DEFAULT_AUDIO_PREFERENCES.monitorGuideVocalLevel,
    ),
    captureGuideVocalLevel: boundedValue(
      source.captureGuideVocalLevel,
      audioControlValues.captureGuideVocalLevel,
      DEFAULT_AUDIO_PREFERENCES.captureGuideVocalLevel,
    ),
  };
}

export function projectAudioPreferences(playerState) {
  return normalizeAudioPreferences({
    performanceVolume: playerState.volume,
    captureVolume: playerState.captureVolume,
    performanceMuted: playerState.isMuted,
    monitorGuideVocalLevel: playerState.guideVocalValue,
    captureGuideVocalLevel: playerState.captureGuideVocalValue,
  });
}

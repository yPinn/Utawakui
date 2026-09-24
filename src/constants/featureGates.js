import registry from '../../shared/featureGates.json';

export const FEATURE_IDS = Object.freeze({
  PROVIDER_FLOW: 'provider-flow',
  LYRICS_FLOW: 'lyrics-flow',
  AUDIO_PROCESSING_FLOW: 'audio-processing-flow',
  PUBLIC_OUTPUT_FLOW: 'public-output-flow',
  OBS_INTEGRATION: 'obs-integration',
});

export const FEATURE_GATES = Object.freeze(
  Object.fromEntries(
    registry.features.map((feature) => [
      feature.id,
      Object.freeze({
        ...feature,
        noticeVersion: registry.noticeVersion,
      }),
    ]),
  ),
);

export function getFeatureGate(featureId) {
  return FEATURE_GATES[featureId] || null;
}

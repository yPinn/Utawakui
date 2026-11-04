import registry from '../../shared/featureGates.json';
import { catalogKey, t } from '../utils/i18n.js';

export const FEATURE_IDS = Object.freeze({
  PROVIDER_FLOW: 'provider-flow',
  LYRICS_FLOW: 'lyrics-flow',
  AUDIO_PROCESSING_FLOW: 'audio-processing-flow',
  PUBLIC_OUTPUT_FLOW: 'public-output-flow',
  OBS_INTEGRATION: 'obs-integration',
});

export const FEATURE_GATES = Object.freeze(
  Object.fromEntries(
    registry.features.map((feature) => {
      const base = `featureGates.notices.${catalogKey(feature.id)}`;
      const section = (field) =>
        feature.sections.map((key) => t(`${base}.sections.${key}.${field}`));
      // Getters keep notice copy on the shared catalog lookup path.
      return [
        feature.id,
        Object.freeze({
          ...feature,
          noticeVersion: feature.noticeVersion || registry.noticeVersion,
          get documentTitle() {
            return t(`${base}.documentTitle`);
          },
          get summary() {
            return t(`${base}.summary`);
          },
          get body() {
            return section('body');
          },
          get bodyTitles() {
            return section('title');
          },
        }),
      ];
    }),
  ),
);

export function getFeatureGate(featureId) {
  return FEATURE_GATES[featureId] || null;
}

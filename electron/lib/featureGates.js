'use strict';

const registry = require('../../shared/featureGates.json');

const FEATURE_IDS = Object.freeze({
  PROVIDER_FLOW: 'provider-flow',
  LYRICS_FLOW: 'lyrics-flow',
  AUDIO_PROCESSING_FLOW: 'audio-processing-flow',
  PUBLIC_OUTPUT_FLOW: 'public-output-flow',
});

const FEATURE_GATES = Object.freeze(
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

function getFeatureGate(featureId) {
  return Object.hasOwn(FEATURE_GATES, featureId)
    ? FEATURE_GATES[featureId]
    : null;
}

function isIsoDateString(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeFeatureConfirmations(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const confirmations = {};
  for (const [featureId, record] of Object.entries(value)) {
    const gate = getFeatureGate(featureId);
    if (!gate || !record || typeof record !== 'object') continue;
    if (record.noticeVersion !== gate.noticeVersion) continue;
    if (record.enabled !== true) continue;
    if (!isIsoDateString(record.confirmedAt)) continue;

    confirmations[featureId] = {
      featureId,
      noticeVersion: gate.noticeVersion,
      confirmedAt: record.confirmedAt,
      enabled: true,
    };
  }
  return confirmations;
}

function buildFeatureConfirmation(featureId, options = {}) {
  const gate = getFeatureGate(featureId);
  if (!gate) throw new Error(`unknown feature gate: ${featureId}`);
  const now = options.now || (() => new Date());
  return {
    featureId,
    noticeVersion: gate.noticeVersion,
    confirmedAt: now().toISOString(),
    enabled: true,
  };
}

function isFeatureGateEnabled(config, featureId) {
  const confirmations = normalizeFeatureConfirmations(
    config?.featureConfirmations,
  );
  return Boolean(confirmations[featureId]);
}

module.exports = {
  FEATURE_GATES,
  FEATURE_IDS,
  buildFeatureConfirmation,
  getFeatureGate,
  isFeatureGateEnabled,
  normalizeFeatureConfirmations,
};

'use strict';

const { normalizeForCompare, normalizeText } = require('./text.js');

const CONFIDENCE_VALUES = new Set(['high', 'medium', 'low', 'none']);

function firstText(values) {
  return (Array.isArray(values) ? values : [values]).find(
    (value) => normalizeText(value).length > 0,
  );
}

function normalizeDurationSeconds(value) {
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value);
}

function normalizeIsrc(value) {
  const isrc = normalizeText(value)
    .replace(/[^A-Za-z0-9]/gu, '')
    .toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/u.test(isrc) ? isrc : undefined;
}

function normalizeConfidence(value) {
  return CONFIDENCE_VALUES.has(value) ? value : 'none';
}

function normalizeArtistHints(values) {
  const hints = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const hint = normalizeText(value);
    const key = normalizeForCompare(hint);
    if (!key || hints.some((existing) => existing.key === key)) continue;
    hints.push({ key, value: hint });
  }
  return hints.map((hint) => hint.value);
}

// Builds a provider-neutral observation only. Provider adapters decide which
// fields are trustworthy and may supply search hints, but this function never
// parses upload titles, splits an artist credit, or chooses a feature policy.
function buildObservedTrack(observation = {}) {
  const title = normalizeText(observation.title);
  if (!title) return null;

  const artistCredit = normalizeText(observation.artistCredit);
  const artistHints = normalizeArtistHints(observation.artistHints);
  const source = observation.source || {};
  const confidence = observation.confidence || {};

  return {
    title,
    artistCredit: artistCredit || undefined,
    artistHints,
    album: normalizeText(observation.album) || undefined,
    duration: normalizeDurationSeconds(observation.durationSeconds),
    isrc: normalizeIsrc(observation.isrc),
    source: {
      provider: normalizeText(source.provider) || undefined,
      platform: normalizeText(source.platform) || undefined,
      type: normalizeText(source.type) || undefined,
      id: normalizeText(source.id) || undefined,
    },
    confidence: {
      title: normalizeConfidence(confidence.title),
      artist: normalizeConfidence(confidence.artist),
      album: normalizeConfidence(confidence.album),
    },
  };
}

module.exports = {
  buildObservedTrack,
  firstText,
  normalizeArtistHints,
  normalizeDurationSeconds,
  normalizeIsrc,
};

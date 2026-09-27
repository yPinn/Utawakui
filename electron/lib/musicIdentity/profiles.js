'use strict';

const {
  buildObservedTrack,
  normalizeArtistHints,
} = require('./observedTrack.js');
const { normalizeForCompare, normalizeText } = require('./text.js');

const ALIAS_KINDS = Object.freeze([
  'catalog-alias',
  'script-normalized',
  'romanization',
  'fuzzy',
]);
const VALID_ALIAS_KINDS = new Set(ALIAS_KINDS);
const CONFIDENCE_RANK = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};
const MAX_IDENTITY_ALIASES_PER_FIELD = 8;
const MAX_IDENTITY_PROFILES = 24;

function normalizeAlias(alias, defaults) {
  const stringAlias = typeof alias === 'string';
  const input = stringAlias ? { value: alias } : alias || {};
  const value = normalizeText(input.value);
  if (!value) return null;
  if (
    !stringAlias &&
    input.kind !== undefined &&
    !VALID_ALIAS_KINDS.has(input.kind)
  ) {
    return null;
  }
  return {
    value,
    kind: VALID_ALIAS_KINDS.has(input.kind) ? input.kind : defaults.kind,
    source: normalizeText(input.source) || defaults.source,
    confidence: Object.hasOwn(CONFIDENCE_RANK, input.confidence)
      ? input.confidence
      : defaults.confidence,
  };
}

function aliasKey(alias) {
  return [
    normalizeForCompare(alias.value),
    alias.kind,
    alias.source,
    alias.confidence,
  ].join('|');
}

function normalizeAliases(values, primaryValue, defaults) {
  const aliases = [];
  const primaryKey = normalizeForCompare(primaryValue);
  const seen = new Set();
  for (const alias of Array.isArray(values) ? values : []) {
    const normalized = normalizeAlias(alias, defaults);
    const valueKey = normalizeForCompare(normalized?.value);
    if (!normalized || !valueKey || valueKey === primaryKey) continue;
    const key = aliasKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(normalized);
    if (aliases.length >= MAX_IDENTITY_ALIASES_PER_FIELD) break;
  }
  return aliases;
}

function buildIdentityProfile(observation = {}) {
  const track = buildObservedTrack(observation);
  if (!track) return null;
  const source =
    track.source.provider || track.source.platform || 'metadata-observation';
  const defaults = {
    kind: 'catalog-alias',
    source,
    confidence: 'medium',
  };
  return {
    ...track,
    aliases: {
      title: normalizeAliases(observation.titleAliases, track.title, defaults),
      artist: normalizeAliases(
        observation.artistAliases,
        track.artistCredit,
        defaults,
      ),
      album: normalizeAliases(observation.albumAliases, track.album, defaults),
    },
  };
}

function profileKey(profile, comparisonKey) {
  return [
    comparisonKey(profile.title),
    comparisonKey(profile.artistCredit),
    comparisonKey(profile.album),
    profile.duration ?? '',
    profile.isrc || '',
  ].join('|');
}

function mergeAliases(first, second) {
  const aliases = [];
  const seen = new Set();
  for (const alias of [...first, ...second]) {
    const key = aliasKey(alias);
    if (seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
    if (aliases.length >= MAX_IDENTITY_ALIASES_PER_FIELD) break;
  }
  return aliases;
}

function mergeDuplicateProfile(existing, candidate) {
  return {
    ...existing,
    artistHints: normalizeArtistHints([
      ...existing.artistHints,
      ...candidate.artistHints,
    ]),
    aliases: {
      title: mergeAliases(existing.aliases.title, candidate.aliases.title),
      artist: mergeAliases(existing.aliases.artist, candidate.aliases.artist),
      album: mergeAliases(existing.aliases.album, candidate.aliases.album),
    },
  };
}

function boundedProfileLimit(value) {
  if (!Number.isInteger(value)) return 12;
  return Math.min(MAX_IDENTITY_PROFILES, Math.max(1, value));
}

function buildIdentityProfiles(observations, options = {}) {
  const comparisonKey =
    typeof options.comparisonKey === 'function'
      ? options.comparisonKey
      : normalizeForCompare;
  const limit = boundedProfileLimit(options.maxProfiles);
  const profiles = (Array.isArray(observations) ? observations : [])
    .map(buildIdentityProfile)
    .filter(Boolean);
  const profileIndexes = new Map();
  const unique = [];
  for (const profile of profiles) {
    const key = profileKey(profile, comparisonKey);
    if (!comparisonKey(profile.title)) continue;
    const existingIndex = profileIndexes.get(key);
    if (existingIndex !== undefined) {
      unique[existingIndex] = mergeDuplicateProfile(
        unique[existingIndex],
        profile,
      );
      continue;
    }
    if (unique.length >= limit) continue;
    profileIndexes.set(key, unique.length);
    unique.push(profile);
  }
  return unique;
}

module.exports = {
  ALIAS_KINDS,
  MAX_IDENTITY_ALIASES_PER_FIELD,
  MAX_IDENTITY_PROFILES,
  buildIdentityProfile,
  buildIdentityProfiles,
};

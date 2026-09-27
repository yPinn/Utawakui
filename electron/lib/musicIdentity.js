'use strict';

const {
  normalizeForCompare,
  normalizeText,
} = require('./musicIdentity/text.js');
const {
  candidateIntroducesVersion,
  versionTerms,
} = require('./musicIdentity/recordingSignals.js');
const {
  compareRecordingIdentity,
  compareTextEvidence,
  durationDelta,
  signedDurationDelta,
} = require('./musicIdentity/recordingEvidence.js');
const {
  ALIAS_KINDS,
  MAX_IDENTITY_ALIASES_PER_FIELD,
  MAX_IDENTITY_PROFILES,
  buildIdentityProfile,
  buildIdentityProfiles,
} = require('./musicIdentity/profiles.js');
const {
  MAX_IDENTITY_QUERIES,
  buildIdentityQueryVariants,
  chineseScriptForms,
  crossScriptTitleVariants,
} = require('./musicIdentity/queryVariants.js');
const {
  buildObservedTrack,
  firstText,
  normalizeArtistHints,
  normalizeDurationSeconds,
  normalizeIsrc,
} = require('./musicIdentity/observedTrack.js');

module.exports = {
  ALIAS_KINDS,
  MAX_IDENTITY_ALIASES_PER_FIELD,
  MAX_IDENTITY_PROFILES,
  MAX_IDENTITY_QUERIES,
  buildIdentityProfile,
  buildIdentityProfiles,
  buildIdentityQueryVariants,
  buildObservedTrack,
  candidateIntroducesVersion,
  chineseScriptForms,
  compareRecordingIdentity,
  compareTextEvidence,
  crossScriptTitleVariants,
  durationDelta,
  firstText,
  normalizeArtistHints,
  normalizeDurationSeconds,
  normalizeForCompare,
  normalizeIsrc,
  normalizeText,
  signedDurationDelta,
  versionTerms,
};

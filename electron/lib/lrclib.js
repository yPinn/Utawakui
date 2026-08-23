'use strict';

const {
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  searchLrclibCandidates,
} = require('./lrclib/acquisition.js');
const {
  analyzeLrclibRecord,
  rankLrclibCandidateMatches,
  summarizeLrclibCandidate,
} = require('./lrclib/candidate.js');
const {
  buildLrclibUserAgent,
  createLrclibClient,
} = require('./lrclib/client.js');
const { parseLrcLines } = require('./lrclib/lrc.js');
const {
  LYRICSFILE_LIMITS,
  parseLyricsfile,
} = require('./lrclib/lyricsfile.js');
const {
  durationDelta,
  pickBestSyncedCandidate,
  rankSyncedCandidates,
  signedDurationDelta,
} = require('./lrclib/matching.js');
const {
  buildLrclibQueryPlan,
  buildLrclibSearchQueries,
  buildLrclibUrl,
  buildSearchParams,
} = require('./lrclib/query.js');
const {
  fingerprintLrclibRecord,
  normalizeLrclibRecord,
} = require('./lrclib/record.js');
const { readJsonResponse } = require('./lrclib/response.js');
const {
  createLrclibRequestScheduler,
  sharedLrclibRequestScheduler,
} = require('./lrclib/scheduler.js');
const { saveLrclibCandidate } = require('./lrclib/saveFlow.js');
const {
  deleteStoredLrclibSource,
  loadStoredLrclibArtifactSummary,
  saveLrclibRecord,
} = require('./lrclib/storage.js');
const {
  looksLikeChannelArtist,
  stripTrackDecorations,
} = require('./musicTitle.js');

// Keep this a statically analyzable object literal. Vitest and existing ESM
// callers rely on cjs-module-lexer discovering these named CJS exports.
module.exports = {
  LYRICSFILE_LIMITS,
  analyzeLrclibRecord,
  buildLrclibQueryPlan,
  buildLrclibSearchQueries,
  buildLrclibUrl,
  buildLrclibUserAgent,
  buildSearchParams,
  createLrclibClient,
  createLrclibRequestScheduler,
  durationDelta,
  deleteStoredLrclibSource,
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  fingerprintLrclibRecord,
  looksLikeChannelArtist,
  loadStoredLrclibArtifactSummary,
  normalizeLrclibRecord,
  parseLrcLines,
  parseLyricsfile,
  pickBestSyncedCandidate,
  rankSyncedCandidates,
  rankLrclibCandidateMatches,
  readJsonResponse,
  saveLrclibCandidate,
  saveLrclibRecord,
  searchLrclibCandidates,
  sharedLrclibRequestScheduler,
  signedDurationDelta,
  stripTrackDecorations,
  summarizeLrclibCandidate,
};

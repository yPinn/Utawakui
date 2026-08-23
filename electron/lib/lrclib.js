'use strict';

const {
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  searchLrclibCandidates,
} = require('./lrclib/acquisition.js');
const {
  analyzeLrclibRecord,
  rankLrclibCandidateMatches,
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
const { normalizeLrclibRecord } = require('./lrclib/record.js');
const { readJsonResponse } = require('./lrclib/response.js');
const {
  createLrclibRequestScheduler,
  sharedLrclibRequestScheduler,
} = require('./lrclib/scheduler.js');
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
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  looksLikeChannelArtist,
  normalizeLrclibRecord,
  parseLrcLines,
  parseLyricsfile,
  pickBestSyncedCandidate,
  rankSyncedCandidates,
  rankLrclibCandidateMatches,
  readJsonResponse,
  searchLrclibCandidates,
  sharedLrclibRequestScheduler,
  signedDurationDelta,
  stripTrackDecorations,
};

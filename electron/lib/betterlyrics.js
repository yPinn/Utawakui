'use strict';

const {
  createBetterLyricsAcquisitionProvider,
} = require('./betterlyrics/acquisition.js');
const {
  fingerprintBetterLyricsRecord,
} = require('./betterlyrics/candidate.js');
const {
  BETTER_LYRICS_API_BASE_URL,
  buildBetterLyricsUrl,
  createBetterLyricsClient,
  createBetterLyricsScheduler,
} = require('./betterlyrics/client.js');
const {
  deleteStoredBetterLyricsSource,
  loadStoredBetterLyricsArtifactSummary,
  saveBetterLyricsRecord,
} = require('./betterlyrics/storage.js');

module.exports = {
  BETTER_LYRICS_API_BASE_URL,
  buildBetterLyricsUrl,
  createBetterLyricsAcquisitionProvider,
  createBetterLyricsClient,
  createBetterLyricsScheduler,
  deleteStoredBetterLyricsSource,
  fingerprintBetterLyricsRecord,
  loadStoredBetterLyricsArtifactSummary,
  saveBetterLyricsRecord,
};

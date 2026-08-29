'use strict';

const {
  createNeteaseClient,
  normalizeNeteaseSong,
} = require('./netease/client.js');
const {
  createNeteaseAcquisitionProvider,
} = require('./netease/acquisition.js');
const {
  fingerprintNeteaseRecord,
  rankNeteaseCandidates,
  summarizeNeteaseCandidate,
} = require('./netease/candidate.js');
const {
  deleteStoredNeteaseSource,
  loadStoredNeteaseArtifactSummary,
  saveNeteaseRecord,
} = require('./netease/storage.js');
const { analyzeNeteaseLyrics } = require('./netease/yrc.js');

module.exports = {
  analyzeNeteaseLyrics,
  createNeteaseAcquisitionProvider,
  createNeteaseClient,
  deleteStoredNeteaseSource,
  fingerprintNeteaseRecord,
  loadStoredNeteaseArtifactSummary,
  normalizeNeteaseSong,
  rankNeteaseCandidates,
  saveNeteaseRecord,
  summarizeNeteaseCandidate,
};

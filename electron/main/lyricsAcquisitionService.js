'use strict';

const { getTrackLyricsState } = require('../lib/library');
const {
  createLrclibClient,
  fetchLrclibRecord,
  findLrclibSyncedLyrics,
  saveLrclibCandidate,
  saveLrclibRecord,
  searchLrclibCandidates,
} = require('../lib/lrclib');

function createLyricsAcquisitionService({
  requireFeatureGate,
  featureId,
  client = createLrclibClient(),
}) {
  function requireLyricsFlow() {
    requireFeatureGate(featureId);
  }

  async function searchCandidates(track, options = {}) {
    requireLyricsFlow();
    return searchLrclibCandidates(track, { ...options, client });
  }

  async function fetchRecord(recordId) {
    requireLyricsFlow();
    return fetchLrclibRecord(recordId, { client });
  }

  async function saveCandidate(options) {
    requireLyricsFlow();
    return saveLrclibCandidate({
      ...options,
      fetchRecord: (recordId) => fetchLrclibRecord(recordId, { client }),
    });
  }

  async function saveIfAbsent(track, trackDir) {
    const lyricsState = getTrackLyricsState(trackDir);
    if (lyricsState.sources.some((source) => source.kind === 'lrclib')) {
      return false;
    }

    requireLyricsFlow();
    const result = await findLrclibSyncedLyrics(track, { client });
    if (result.status !== 'available') return false;
    return saveLrclibRecord(trackDir, result.record).status === 'saved';
  }

  return { fetchRecord, saveCandidate, saveIfAbsent, searchCandidates };
}

module.exports = { createLyricsAcquisitionService };

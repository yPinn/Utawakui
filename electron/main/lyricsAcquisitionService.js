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
  let candidateSearchInFlight = null;
  let candidateSaveInFlight = null;

  function requireLyricsFlow() {
    requireFeatureGate(featureId);
  }

  async function searchCandidates(track, options = {}) {
    requireLyricsFlow();
    if (candidateSearchInFlight) {
      return {
        provider: 'lrclib',
        status: 'error',
        reason: 'busy',
        candidates: [],
        groups: null,
      };
    }
    const operation = searchLrclibCandidates(track, { ...options, client });
    candidateSearchInFlight = operation;
    try {
      return await operation;
    } finally {
      if (candidateSearchInFlight === operation) {
        candidateSearchInFlight = null;
      }
    }
  }

  async function fetchRecord(recordId) {
    requireLyricsFlow();
    return fetchLrclibRecord(recordId, { client });
  }

  async function saveCandidate(options) {
    requireLyricsFlow();
    if (candidateSaveInFlight) {
      return { provider: 'lrclib', status: 'error', reason: 'busy' };
    }
    const operation = saveLrclibCandidate({
      ...options,
      fetchRecord: (recordId) => fetchLrclibRecord(recordId, { client }),
    });
    candidateSaveInFlight = operation;
    try {
      return await operation;
    } finally {
      if (candidateSaveInFlight === operation) candidateSaveInFlight = null;
    }
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

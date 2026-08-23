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

const OPERATION_MESSAGES = Object.freeze({
  search: '[lyrics] LRCLIB search failed',
  save: '[lyrics] LRCLIB save failed',
  fetch: '[lyrics] LRCLIB fetch failed',
  'automatic-acquisition': '[lyrics] LRCLIB automatic acquisition failed',
});
const NON_RETRYABLE_REASONS = new Set([
  'invalid-json',
  'invalid-record',
  'invalid-request',
  'response-too-large',
]);

function isRetryableFailure(result) {
  if (NON_RETRYABLE_REASONS.has(result?.reason)) return false;
  if (result?.reason === 'http-error' && Number.isInteger(result.httpStatus)) {
    return result.httpStatus === 429 || result.httpStatus >= 500;
  }
  return true;
}

function providerFailureError(operation, result) {
  const httpStatus = Number.isInteger(result?.httpStatus)
    ? ` (HTTP ${result.httpStatus})`
    : '';
  return new Error(
    `LRCLIB ${operation} failed: ${result?.reason || 'unknown'}${httpStatus}`,
  );
}

function createLyricsAcquisitionService({
  requireFeatureGate,
  featureId,
  client = createLrclibClient(),
  logger = console,
}) {
  let candidateSearchInFlight = null;
  let candidateSaveInFlight = null;

  function requireLyricsFlow() {
    requireFeatureGate(featureId);
  }

  function writeLog(level, operation, error, context) {
    try {
      logger?.[level]?.(OPERATION_MESSAGES[operation], error, context);
    } catch {
      // Observability must never become a second provider failure.
    }
  }

  async function observeProviderOperation(operation, start) {
    try {
      const result = await start();
      if (result?.status === 'error' && result.reason !== 'busy') {
        writeLog('warn', operation, providerFailureError(operation, result), {
          reason: result.reason || 'unknown',
          ...(Number.isInteger(result.httpStatus)
            ? { httpStatus: result.httpStatus }
            : {}),
          retryable: isRetryableFailure(result),
        });
      }
      return result;
    } catch (error) {
      writeLog(
        'error',
        operation,
        providerFailureError(operation, { reason: 'exception' }),
        {
          reason: 'exception',
          retryable: true,
        },
      );
      throw error;
    }
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
    const operation = observeProviderOperation('search', () =>
      searchLrclibCandidates(track, { ...options, client }),
    );
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
    return observeProviderOperation('fetch', () =>
      fetchLrclibRecord(recordId, { client }),
    );
  }

  async function saveCandidate(options) {
    requireLyricsFlow();
    if (candidateSaveInFlight) {
      return { provider: 'lrclib', status: 'error', reason: 'busy' };
    }
    const operation = observeProviderOperation('save', () =>
      saveLrclibCandidate({
        ...options,
        fetchRecord: (recordId) => fetchLrclibRecord(recordId, { client }),
      }),
    );
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
    const result = await observeProviderOperation('automatic-acquisition', () =>
      findLrclibSyncedLyrics(track, { client }),
    );
    if (result.status !== 'available') return false;
    return saveLrclibRecord(trackDir, result.record).status === 'saved';
  }

  return { fetchRecord, saveCandidate, saveIfAbsent, searchCandidates };
}

module.exports = { createLyricsAcquisitionService };

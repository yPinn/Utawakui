'use strict';

const {
  rankLrclibCandidateMatches,
  summarizeLrclibCandidate,
} = require('./candidate.js');
const { fetchLrclibRecord } = require('./acquisition.js');
const { buildLrclibQueryPlan } = require('./query.js');
const { fingerprintLrclibRecord } = require('./record.js');
const { saveLrclibRecord } = require('./storage.js');

const SHA256_RE = /^[a-f0-9]{64}$/;

function providerFailure(result) {
  return {
    provider: 'lrclib',
    status: result.status === 'unavailable' ? 'unavailable' : 'error',
    reason: result.reason,
    ...(result.httpStatus ? { httpStatus: result.httpStatus } : {}),
  };
}

function refreshedCandidateSummary(track, record, query) {
  const plan = buildLrclibQueryPlan(track, query);
  const [match] = rankLrclibCandidateMatches(plan.identity, [record]);
  return match ? summarizeLrclibCandidate(match) : null;
}

async function saveLrclibCandidate({
  track,
  trackDir,
  candidateId,
  expectedFingerprint,
  query,
  fetchRecord = fetchLrclibRecord,
  persistRecord = saveLrclibRecord,
  validateCommit,
}) {
  if (!Number.isSafeInteger(candidateId) || candidateId <= 0) {
    throw new Error('lrclib candidate id is invalid');
  }
  if (!SHA256_RE.test(expectedFingerprint)) {
    throw new Error('lrclib preview fingerprint is invalid');
  }

  const fetched = await fetchRecord(candidateId);
  if (fetched.status !== 'ok') return providerFailure(fetched);

  const currentFingerprint = fingerprintLrclibRecord(fetched.record);
  if (currentFingerprint !== expectedFingerprint) {
    return {
      provider: 'lrclib',
      status: 'record-changed',
      candidate: refreshedCandidateSummary(track, fetched.record, query),
    };
  }

  const commitDenial =
    typeof validateCommit === 'function' ? validateCommit() : null;
  if (commitDenial) {
    return {
      provider: 'lrclib',
      status: 'unavailable',
      reason: commitDenial,
    };
  }

  return persistRecord(trackDir, fetched.record);
}

module.exports = { saveLrclibCandidate };

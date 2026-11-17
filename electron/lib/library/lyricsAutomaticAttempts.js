'use strict';

// Persistent retry policy for background lyrics acquisition, stored per track
// in lyrics/lyrics.json as `automatic`.
const { createHash } = require('node:crypto');

const HOUR_MS = 60 * 60 * 1000;
const TRANSIENT_BACKOFF_MS = Object.freeze([
  HOUR_MS,
  6 * HOUR_MS,
  24 * HOUR_MS,
]);
const MISS_RETRY_MS = 7 * 24 * HOUR_MS;
const MAX_MISSES = 3;
const MISS_REASONS = new Set([
  'no-exact-candidate',
  'provider-manual-only',
  'not-an-upgrade',
]);
const SATISFIED_REASONS = new Set(['current-t2']);
// Not the track's fault: the queue or the gate, so nothing is recorded.
const UNRECORDED_REASONS = new Set([
  'stale-track',
  'background-queue-full',
  'busy',
  'recent-attempt',
  'gate-closed',
]);

function attemptMetadataKey(track) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        track?.title ?? '',
        track?.artist ?? '',
        Number.isFinite(track?.duration) ? Math.round(track.duration) : null,
      ]),
    )
    .digest('hex')
    .slice(0, 16);
}

function normalizeAutomaticAttempt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const at = Date.parse(value.at);
  const count = (n) => (Number.isSafeInteger(n) && n >= 0 && n < 1000 ? n : 0);
  if (typeof value.metadataKey !== 'string' || !Number.isFinite(at))
    return null;
  if (value.userCleared === true)
    return {
      metadataKey: '',
      at: new Date(at).toISOString(),
      misses: 0,
      failures: 0,
      userCleared: true,
    };
  return {
    metadataKey: value.metadataKey.slice(0, 64),
    at: new Date(at).toISOString(),
    misses: count(value.misses),
    failures: count(value.failures),
  };
}

// Returns the next record, or undefined when the outcome changes nothing.
function nextAutomaticAttempt(previous, { track, result, at }) {
  const reason = result?.reason;
  if (SATISFIED_REASONS.has(reason)) return null;
  if (UNRECORDED_REASONS.has(reason)) return undefined;
  const metadataKey = attemptMetadataKey(track);
  // A saved source may still be upgraded to word timing, at the miss pace.
  if (result?.status === 'saved')
    return {
      metadataKey,
      at: new Date(at).toISOString(),
      misses: 0,
      failures: 0,
    };
  const base =
    previous?.metadataKey === metadataKey
      ? previous
      : { misses: 0, failures: 0 };
  const miss = MISS_REASONS.has(reason);
  return {
    metadataKey,
    at: new Date(at).toISOString(),
    misses: base.misses + (miss ? 1 : 0),
    failures: miss ? 0 : base.failures + 1,
  };
}

// Epoch milliseconds when the track may be tried again; Infinity for never.
function automaticAttemptDueAt(record, track) {
  // Removing every source opts the track out until a source is saved again.
  if (record?.userCleared) return Infinity;
  if (!record || record.metadataKey !== attemptMetadataKey(track)) return 0;
  const at = Date.parse(record.at);
  if (record.failures > 0)
    return (
      at +
      TRANSIENT_BACKOFF_MS[
        Math.min(record.failures, TRANSIENT_BACKOFF_MS.length) - 1
      ]
    );
  if (record.misses >= MAX_MISSES) return Infinity;
  return at + MISS_RETRY_MS;
}

module.exports = {
  attemptMetadataKey,
  automaticAttemptDueAt,
  nextAutomaticAttempt,
  normalizeAutomaticAttempt,
};

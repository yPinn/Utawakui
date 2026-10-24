'use strict';

const { S2_ESCALATION } = require('./severity');

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTS_PER_DAY = 3;
const MAX_TRACKED_FINGERPRINTS = 100;
const MAX_OCCURRENCES_PER_FINGERPRINT = 50;

function emptyThrottleState() {
  return { version: 1, seen: {}, sent: {}, day: '', dayCount: 0 };
}

function localDay(now) {
  const date = new Date(now);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function normalizeThrottleState(value) {
  const state = emptyThrottleState();
  if (!value || typeof value !== 'object' || value.version !== 1) return state;
  for (const [fingerprint, times] of Object.entries(value.seen ?? {})) {
    if (Array.isArray(times)) {
      state.seen[fingerprint] = times.filter(Number.isFinite);
    }
  }
  for (const [fingerprint, at] of Object.entries(value.sent ?? {})) {
    if (Number.isFinite(at)) state.sent[fingerprint] = at;
  }
  state.day = typeof value.day === 'string' ? value.day : '';
  state.dayCount = Number.isSafeInteger(value.dayCount) ? value.dayCount : 0;
  return state;
}

// Drops expired history and caps tracked fingerprints so the persisted file
// stays bounded even through a crash loop.
function prune(state, now) {
  const seen = {};
  for (const [fingerprint, times] of Object.entries(state.seen)) {
    const recent = times
      .filter((at) => now - at < DUPLICATE_WINDOW_MS)
      .slice(-MAX_OCCURRENCES_PER_FINGERPRINT);
    if (recent.length > 0) seen[fingerprint] = recent;
  }
  const sent = Object.fromEntries(
    Object.entries(state.sent).filter(
      ([, at]) => now - at < DUPLICATE_WINDOW_MS,
    ),
  );
  const keep = (entries) =>
    Object.fromEntries(entries.slice(-MAX_TRACKED_FINGERPRINTS));
  return {
    ...state,
    seen: keep(Object.entries(seen)),
    sent: keep(Object.entries(sent)),
  };
}

function recordOccurrence(state, fingerprint, now) {
  const next = prune(state, now);
  next.seen = {
    ...next.seen,
    [fingerprint]: [...(next.seen[fingerprint] ?? []), now].slice(
      -MAX_OCCURRENCES_PER_FINGERPRINT,
    ),
  };
  const times = next.seen[fingerprint];
  return {
    state: next,
    occurrences: times.length,
    recentS2: times.filter((at) => now - at < S2_ESCALATION.windowMs).length,
  };
}

// null when allowed; otherwise why the report is held back.
function sendBlockReason(state, fingerprint, now) {
  if (
    Number.isFinite(state.sent[fingerprint]) &&
    now - state.sent[fingerprint] < DUPLICATE_WINDOW_MS
  ) {
    return 'duplicate';
  }
  if (state.day === localDay(now) && state.dayCount >= MAX_REPORTS_PER_DAY) {
    return 'daily-limit';
  }
  return null;
}

function markSent(state, fingerprint, now) {
  const day = localDay(now);
  return {
    ...state,
    sent: { ...state.sent, [fingerprint]: now },
    day,
    dayCount: state.day === day ? state.dayCount + 1 : 1,
  };
}

module.exports = {
  DUPLICATE_WINDOW_MS,
  MAX_REPORTS_PER_DAY,
  emptyThrottleState,
  markSent,
  normalizeThrottleState,
  recordOccurrence,
  sendBlockReason,
};

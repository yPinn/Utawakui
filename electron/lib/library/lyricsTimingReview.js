'use strict';

const { createHash, randomUUID } = require('node:crypto');
const {
  normalizeLyricsDocument,
} = require('../../../src/utils/lyricsDocument.js');
const {
  createMediaVerifier,
  originalMedia,
} = require('../performanceSettings/media');
const { bindingsEqual } = require('../works/trackBinding');
const { tagContentAliases } = require('../tags/aliases');
const {
  readReview,
  writeReview,
  invalidateReview,
  failure,
} = require('./lyricsTimingReviewStore');
const { assertNoTransaction } = require('../reconciliation/transaction');

const digest = (value) => createHash('sha256').update(value).digest('hex');
function createLyricsTimingReview({
  sources,
  hashAudio,
  aliases = tagContentAliases,
  timeoutMs = 10000,
} = {}) {
  const media = createMediaVerifier(hashAudio),
    tokens = new Map();
  function inspect(trackId, filename, session) {
    const value = sources.inspect(trackId, filename, session);
    assertNoTransaction(value.dir);
    return value;
  }
  function run(operation) {
    let active = true,
      timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        active = false;
        reject(failure('LYRICS_SOURCE_STALE'));
      }, timeoutMs);
    });
    return Promise.race([
      Promise.resolve().then(() =>
        operation(() => {
          if (!active) throw failure('LYRICS_SOURCE_STALE');
        }),
      ),
      timeout,
    ]).finally(() => {
      active = false;
      clearTimeout(timer);
    });
  }
  async function capture(trackId, filename, session, check) {
    const value = inspect(trackId, filename, session);
    const checkSource = () => {
      check();
      inspect(trackId, filename, session);
    };
    let verified;
    try {
      verified = await media.verify(value, trackId, checkSource);
    } catch (error) {
      checkSource();
      invalidateReview(value);
      throw error;
    }
    checkSource();
    const timing = value.result.timing;
    if (!['missing', 'current'].includes(timing.status)) {
      invalidateReview(value);
      return { value, status: 'unusable' };
    }
    const doc = normalizeLyricsDocument({
      ...value.result,
      sourceFingerprint: timing.sourceFingerprint,
      normalizerProfileId: timing.normalizerProfileId,
    });
    const coverage = {
      total: doc.lines.length,
      timed: doc.lines.filter((line) => Number.isFinite(line.startMs)).length,
      segmented: doc.lines.filter(
        (line) =>
          line.segments?.length &&
          line.segments.every((segment) => Number.isFinite(segment.startMs)),
      ).length,
    };
    const snapshot = {
      sourceRevision: digest(
        `${value.sourceStamp}\0${timing.sourceFingerprint}`,
      ),
      timingRevision: value.timingRevision,
      documentId: doc.documentId,
      profileId: doc.normalizerProfileId,
      offsetMs: value.result.source.offsetMs ?? 0,
      mediaBinding: verified.binding,
      trackIdentity: verified.trackIdentity,
      coverage,
    };
    return {
      value,
      verified,
      snapshot,
      coverage,
      status: coverage.timed ? 'ready' : 'not-applicable',
    };
  }
  function projection(saved, captured, token) {
    return {
      status: saved.status,
      revision: saved.document?.revision ?? null,
      coverage: captured.coverage ?? null,
      confirmedAt: saved.document?.confirmedAt ?? null,
      ...(token ? { token } : {}),
    };
  }
  async function get(trackId, filename, session) {
    return run(async (check) => {
      const captured = await capture(trackId, filename, session, check);
      let saved = readReview(captured.value.trackDir, filename);
      if (['corrupt', 'unsupported'].includes(saved.status))
        return projection(saved, captured);
      if (captured.status !== 'ready')
        return projection({ status: captured.status }, captured);
      if (
        saved.status === 'confirmed' &&
        JSON.stringify(saved.document.snapshot) !==
          JSON.stringify(captured.snapshot)
      ) {
        let equivalent = false;
        const old = saved.document.snapshot,
          next = captured.snapshot;
        if (
          JSON.stringify({ ...old, mediaBinding: next.mediaBinding }) ===
            JSON.stringify(next) &&
          !bindingsEqual(old.mediaBinding, next.mediaBinding)
        ) {
          equivalent = (
            await aliases(captured.value.dir, trackId, next.mediaBinding.value)
          ).includes(old.mediaBinding.value);
          check();
          inspect(trackId, filename, session);
          if (
            originalMedia(captured.value.dir, trackId).stamp !==
            captured.verified.stamp
          )
            throw failure('LYRICS_SOURCE_STALE');
        }
        saved = writeReview(captured.value.trackDir, filename, saved, {
          ...saved.document,
          snapshot: equivalent ? captured.snapshot : old,
          state: equivalent ? 'confirmed' : 'expired',
          changedAt: Date.now(),
        });
      }
      const token = randomUUID();
      if (tokens.size >= 128) tokens.delete(tokens.keys().next().value);
      tokens.set(token, {
        trackId,
        filename,
        session: { ...session },
        snapshot: captured.snapshot,
        raw: saved.raw,
      });
      return projection(saved, captured, token);
    });
  }
  function mutate(trackId, filename, session, token, state) {
    return run(async (check) => {
      const baseline = tokens.get(token);
      if (
        !baseline ||
        baseline.trackId !== trackId ||
        baseline.filename !== filename ||
        JSON.stringify(baseline.session) !== JSON.stringify(session)
      )
        throw failure('LYRICS_SOURCE_STALE');
      const captured = await capture(trackId, filename, session, check);
      if (tokens.get(token) !== baseline) throw failure('LYRICS_SOURCE_STALE');
      if (captured.status !== 'ready') throw failure('LYRICS_SOURCE_UNUSABLE');
      const previous = readReview(captured.value.trackDir, filename);
      if (
        previous.raw !== baseline.raw ||
        JSON.stringify(captured.snapshot) !== JSON.stringify(baseline.snapshot)
      )
        throw failure('LYRICS_SOURCE_CONFLICT');
      if (state === 'revoked' && !previous.document) throw failure();
      if (previous.status === state) {
        tokens.delete(token);
        return projection(previous, captured);
      }
      const saved = writeReview(captured.value.trackDir, filename, previous, {
        state,
        snapshot:
          state === 'confirmed'
            ? captured.snapshot
            : previous.document.snapshot,
        confirmedAt:
          state === 'confirmed' ? Date.now() : previous.document.confirmedAt,
        changedAt: Date.now(),
      });
      tokens.delete(token);
      return projection(saved, captured);
    });
  }
  return {
    get,
    cancel(token) {
      if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token))
        throw failure();
      tokens.delete(token);
      return { status: 'cancelled' };
    },
    confirm: (...args) => mutate(...args, 'confirmed'),
    revoke: (...args) => mutate(...args, 'revoked'),
    invalidate: invalidateReview,
  };
}
module.exports = { createLyricsTimingReview };

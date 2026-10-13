'use strict';

const { randomUUID } = require('crypto');

const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;
const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function createLocalImportReviewSessionStore(options = {}) {
  const createId = options.createId || randomUUID;
  const now = options.now || Date.now;
  const ttlMs = options.ttlMs || DEFAULT_SESSION_TTL_MS;
  const sessions = new Map();

  function purgeExpired() {
    const currentTime = now();
    for (const [sessionId, session] of sessions) {
      if (session.expiresAt <= currentTime) sessions.delete(sessionId);
    }
  }

  function create(candidates) {
    purgeExpired();
    const privateCandidates = Array.isArray(candidates)
      ? candidates
          .filter(
            (candidate) =>
              typeof candidate?.sourcePath === 'string' &&
              typeof candidate?.sourceFormat === 'string',
          )
          .map(({ sourcePath, sourceFormat }) => ({
            sourcePath,
            sourceFormat,
          }))
      : [];
    if (privateCandidates.length === 0) return null;

    const sessionId = createId();
    if (!SESSION_ID_RE.test(sessionId)) {
      throw new Error('invalid local import review session id');
    }
    sessions.set(sessionId, {
      candidates: privateCandidates,
      expiresAt: now() + ttlMs,
    });
    return sessionId;
  }

  function has(sessionId) {
    purgeExpired();
    return (
      typeof sessionId === 'string' &&
      SESSION_ID_RE.test(sessionId) &&
      sessions.has(sessionId)
    );
  }

  function consume(sessionId) {
    if (!has(sessionId)) return null;
    const session = sessions.get(sessionId);
    sessions.delete(sessionId);
    return session.candidates.map((candidate) => ({ ...candidate }));
  }

  return { create, has, consume };
}

module.exports = {
  DEFAULT_SESSION_TTL_MS,
  createLocalImportReviewSessionStore,
};

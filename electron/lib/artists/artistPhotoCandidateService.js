'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { downloadValidatedArtwork } = require('../artwork/image');
const {
  createProviderRequestScheduler,
} = require('../providerRequestScheduler');
const {
  isArtistId,
  readArtistPhoto,
  writeArtistPhoto,
} = require('./artistPhotos');
const {
  isValidWorkerRequest,
  validateWorkerResult,
} = require('./ytMusicArtistPhotoRunner');

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 32;
const DEFAULT_RETRY_DELAY_MS = 250;
const DEFAULT_BREAKER_COOLDOWN_MS = 2 * 60 * 1000;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ACTIVE_IMAGE_DOWNLOADS = 3;
const DEFAULT_MAX_ACTIVE_CANDIDATE_INTENTS = 8;
const DEFAULT_PREVIEW_REUSE_DELAY_MS = 250;
const DEFAULT_MAX_CACHED_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_PORTRAIT_BYTES = 2 * 1024 * 1024;
const MAX_PORTRAIT_PIXELS = 2048 * 2048;
const MAX_OPERATIONAL_FAILURES = 3;
const CANDIDATE_ID_RE = /^[A-Za-z0-9_-]{20,64}$/u;
const PORTRAIT_HOSTS = new Set([
  'yt3.googleusercontent.com',
  'yt3.ggpht.com',
  'lh3.googleusercontent.com',
]);
const RETRYABLE_REASONS = new Set(['timeout', 'provider-unavailable']);
const OPERATIONAL_FAILURE_REASONS = new Set([
  'timeout',
  'provider-unavailable',
  'provider-rejected',
  'schema-error',
  'worker-failed',
]);
const PUBLIC_WORKER_REASONS = new Set([
  ...OPERATIONAL_FAILURE_REASONS,
  'rate-limited',
  'cancelled',
]);

function isAllowedYtMusicPortraitUrl(value) {
  try {
    const url = new URL(value);
    return Boolean(
      url.protocol === 'https:' &&
      PORTRAIT_HOSTS.has(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port,
    );
  } catch {
    return false;
  }
}

function isSearchContext(value) {
  return isValidWorkerRequest(value);
}

function fingerprintSearchContext(value) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function fingerprintTracksSnapshot(value) {
  if (!Array.isArray(value)) return null;
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') return null;
    return crypto.createHash('sha256').update(serialized).digest('hex');
  } catch {
    return null;
  }
}

function createOpaqueCandidateId() {
  return crypto.randomBytes(24).toString('base64url');
}

function wait(delayMs, signal) {
  if (!delayMs) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function createArtistPhotoCandidateService({
  artistIndexCache,
  runWorker,
  downloadImage = downloadValidatedArtwork,
  readPhoto = readArtistPhoto,
  writePhoto = writeArtistPhoto,
  now = Date.now,
  createCandidateId = createOpaqueCandidateId,
  ttlMs = DEFAULT_SESSION_TTL_MS,
  maxSessions = DEFAULT_MAX_SESSIONS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  breakerCooldownMs = DEFAULT_BREAKER_COOLDOWN_MS,
  rateLimitCooldownMs = DEFAULT_RATE_LIMIT_COOLDOWN_MS,
  maxActiveImageDownloads = DEFAULT_MAX_ACTIVE_IMAGE_DOWNLOADS,
  maxActiveCandidateIntents = DEFAULT_MAX_ACTIVE_CANDIDATE_INTENTS,
  previewReuseDelayMs = DEFAULT_PREVIEW_REUSE_DELAY_MS,
  maxCachedImageBytes = DEFAULT_MAX_CACHED_IMAGE_BYTES,
  scheduler = createProviderRequestScheduler({
    intervalMs: 750,
    maxPending: 4,
  }),
}) {
  if (
    typeof artistIndexCache?.getPhotoSearchContext !== 'function' ||
    typeof runWorker !== 'function' ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1 ||
    !Number.isSafeInteger(maxSessions) ||
    maxSessions < 1 ||
    !Number.isSafeInteger(maxActiveImageDownloads) ||
    maxActiveImageDownloads < 1 ||
    !Number.isSafeInteger(maxActiveCandidateIntents) ||
    maxActiveCandidateIntents < 1 ||
    !Number.isSafeInteger(previewReuseDelayMs) ||
    previewReuseDelayMs < 0 ||
    !Number.isSafeInteger(maxCachedImageBytes) ||
    maxCachedImageBytes < 1
  ) {
    throw new TypeError('invalid artist photo candidate service dependencies');
  }

  const sessions = new Map();
  const activeSearches = new Map();
  let consecutiveOperationalFailures = 0;
  let blockedUntil = 0;
  let activeImageDownloads = 0;
  let activeCandidateIntents = 0;
  let cachedImageBytes = 0;

  function searchKey(dir, artistId) {
    return `${path.resolve(dir)}\u0000${artistId}`;
  }

  function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    for (const candidate of session.candidates.values()) {
      cachedImageBytes -= candidate.image?.buffer?.byteLength ?? 0;
    }
    cachedImageBytes = Math.max(0, cachedImageBytes);
    sessions.delete(sessionId);
  }

  function purgeExpiredSessions() {
    const currentTime = now();
    for (const [sessionId, session] of sessions) {
      if (currentTime - session.createdAt >= ttlMs) deleteSession(sessionId);
    }
  }

  function hasActiveSession(candidateEntry) {
    if (sessions.get(candidateEntry.sessionId) !== candidateEntry.session) {
      return false;
    }
    if (now() - candidateEntry.session.createdAt >= ttlMs) {
      deleteSession(candidateEntry.sessionId);
      return false;
    }
    return true;
  }

  function createSession(dir, artistId, context, candidates) {
    purgeExpiredSessions();
    const sessionId = createOpaqueCandidateId();
    const sessionCandidates = new Map();
    for (const candidate of candidates) {
      let candidateId;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        candidateId = createCandidateId();
        if (
          CANDIDATE_ID_RE.test(candidateId) &&
          !sessionCandidates.has(candidateId)
        ) {
          break;
        }
        candidateId = null;
      }
      if (!candidateId) throw new Error('candidate id generation failed');
      sessionCandidates.set(candidateId, {
        observation: candidate,
        image: null,
        imagePromise: null,
        applying: false,
        previewing: false,
        lastPreviewAt: null,
      });
    }
    sessions.set(sessionId, {
      createdAt: now(),
      libraryRoot: path.resolve(dir),
      artistId,
      fingerprint: fingerprintSearchContext(context),
      candidates: sessionCandidates,
    });
    while (sessions.size > maxSessions) {
      deleteSession(sessions.keys().next().value);
    }
    return [...sessionCandidates].map(([candidateId, candidate]) => ({
      candidateId,
      name: candidate.observation.name,
    }));
  }

  function findCandidate(dir, artistId, candidateId) {
    purgeExpiredSessions();
    if (!CANDIDATE_ID_RE.test(candidateId || '')) return null;
    const libraryRoot = path.resolve(dir);
    for (const [sessionId, session] of sessions) {
      const candidate = session.candidates.get(candidateId);
      if (!candidate) continue;
      if (
        session.libraryRoot !== libraryRoot ||
        session.artistId !== artistId
      ) {
        return null;
      }
      return { sessionId, session, candidate };
    }
    return null;
  }

  function recordWorkerResult(result) {
    if (result.reason === 'rate-limited') {
      blockedUntil = Math.max(blockedUntil, now() + rateLimitCooldownMs);
      return;
    }
    if (
      result.status === 'error' &&
      OPERATIONAL_FAILURE_REASONS.has(result.reason)
    ) {
      consecutiveOperationalFailures += 1;
      if (consecutiveOperationalFailures >= MAX_OPERATIONAL_FAILURES) {
        blockedUntil = Math.max(blockedUntil, now() + breakerCooldownMs);
      }
      return;
    }
    if (result.status !== 'error') consecutiveOperationalFailures = 0;
  }

  async function runWithRetry(context, signal) {
    let result;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal.aborted) return { status: 'error', reason: 'cancelled' };
      try {
        result = await runWorker(context, { signal });
      } catch {
        result = { status: 'error', reason: 'worker-failed' };
      }
      const validated = validateWorkerResult(result);
      if (!validated) result = { status: 'error', reason: 'schema-error' };
      if (
        result.status !== 'error' ||
        !RETRYABLE_REASONS.has(result.reason) ||
        attempt === 1
      ) {
        break;
      }
      await wait(retryDelayMs, signal);
    }
    return result;
  }

  function currentTracks(tracksSource) {
    return typeof tracksSource === 'function' ? tracksSource() : tracksSource;
  }

  async function withCandidateIntent(operation) {
    if (activeCandidateIntents >= maxActiveCandidateIntents) {
      return { status: 'error', reason: 'busy' };
    }
    activeCandidateIntents += 1;
    try {
      return await operation();
    } finally {
      activeCandidateIntents -= 1;
    }
  }

  async function search(dir, tracksSource, artistId) {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    if (readPhoto(dir, artistId)) {
      return { status: 'error', reason: 'photo-present' };
    }
    const key = searchKey(dir, artistId);
    activeSearches.get(key)?.abort();
    const controller = new AbortController();
    activeSearches.set(key, controller);
    try {
      if (now() < blockedUntil) {
        return { status: 'error', reason: 'circuit-open' };
      }
      return await scheduler.schedule(
        async () => {
          const context = await artistIndexCache.getPhotoSearchContext(
            dir,
            currentTracks(tracksSource),
            artistId,
          );
          if (
            controller.signal.aborted ||
            activeSearches.get(key) !== controller
          ) {
            return { status: 'error', reason: 'cancelled' };
          }
          if (!isSearchContext(context)) {
            return { status: 'error', reason: 'invalid-artist' };
          }
          if (now() < blockedUntil) {
            return { status: 'error', reason: 'circuit-open' };
          }
          const result = await runWithRetry(context, controller.signal);
          recordWorkerResult(result);
          if (
            (result.status === 'ok' || result.status === 'partial') &&
            result.candidates.length > 0
          ) {
            const candidates = createSession(
              dir,
              artistId,
              context,
              result.candidates,
            );
            return {
              status: result.status,
              ...(result.status === 'partial' ? { reason: result.reason } : {}),
              candidates,
            };
          }
          if (result.status === 'no-match') {
            return { status: 'no-match', candidates: [] };
          }
          return {
            status: 'error',
            reason: PUBLIC_WORKER_REASONS.has(result.reason)
              ? result.reason
              : 'schema-error',
          };
        },
        { signal: controller.signal },
      );
    } catch (error) {
      return {
        status: 'error',
        reason:
          controller.signal.aborted || error?.name === 'AbortError'
            ? 'cancelled'
            : error?.name === 'QueueFullError'
              ? 'busy'
              : 'worker-failed',
      };
    } finally {
      if (activeSearches.get(key) === controller) activeSearches.delete(key);
    }
  }

  function cancel(artistId, dir = null) {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    if (dir) {
      activeSearches.get(searchKey(dir, artistId))?.abort();
    } else {
      for (const [key, controller] of activeSearches) {
        if (key.endsWith(`\u0000${artistId}`)) controller.abort();
      }
    }
    return { status: 'ok' };
  }

  function cacheCandidateImage(candidateEntry, image) {
    if (!hasActiveSession(candidateEntry)) return;
    const imageBytes = image.buffer?.byteLength ?? 0;
    if (imageBytes > maxCachedImageBytes) return;
    for (const sessionId of sessions.keys()) {
      if (cachedImageBytes + imageBytes <= maxCachedImageBytes) break;
      if (sessionId !== candidateEntry.sessionId) deleteSession(sessionId);
    }
    if (cachedImageBytes + imageBytes > maxCachedImageBytes) return;
    candidateEntry.candidate.image = image;
    cachedImageBytes += imageBytes;
  }

  async function ensureCandidateImage(candidateEntry, signal) {
    if (candidateEntry.candidate.image) {
      return { status: 'ok', image: candidateEntry.candidate.image };
    }
    if (candidateEntry.candidate.imagePromise) {
      return candidateEntry.candidate.imagePromise;
    }
    if (activeImageDownloads >= maxActiveImageDownloads) {
      return { status: 'error', reason: 'image-unavailable' };
    }

    activeImageDownloads += 1;
    candidateEntry.candidate.imagePromise = (async () => {
      let download;
      try {
        download = await downloadImage(
          candidateEntry.candidate.observation.portrait.url,
          {
            isAllowedUrl: isAllowedYtMusicPortraitUrl,
            maxBytes: MAX_PORTRAIT_BYTES,
            maxPixels: MAX_PORTRAIT_PIXELS,
            ...(signal ? { signal } : {}),
          },
        );
      } catch (error) {
        return {
          status: 'error',
          reason:
            signal?.aborted || error?.name === 'AbortError'
              ? 'cancelled'
              : 'image-unavailable',
        };
      }
      if (download.status !== 'ok') {
        return {
          status: 'error',
          reason: ['timeout', 'offline', 'cancelled'].includes(download.reason)
            ? download.reason
            : 'image-unavailable',
        };
      }
      cacheCandidateImage(candidateEntry, download.image);
      return { status: 'ok', image: download.image };
    })();
    try {
      return await candidateEntry.candidate.imagePromise;
    } finally {
      candidateEntry.candidate.imagePromise = null;
      activeImageDownloads -= 1;
    }
  }

  async function loadPreview(dir, artistId, candidateId, options = {}) {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    const entry = findCandidate(dir, artistId, candidateId);
    if (!entry) {
      return { status: 'error', reason: 'candidate-unavailable' };
    }
    return withCandidateIntent(async () => {
      const previewAge = now() - entry.candidate.lastPreviewAt;
      if (
        entry.candidate.previewing ||
        (entry.candidate.lastPreviewAt !== null &&
          previewAge < previewReuseDelayMs)
      ) {
        return { status: 'error', reason: 'busy' };
      }
      entry.candidate.previewing = true;
      try {
        const loaded = await ensureCandidateImage(entry, options.signal);
        if (loaded.status !== 'ok') return loaded;
        if (!hasActiveSession(entry)) {
          return { status: 'error', reason: 'candidate-unavailable' };
        }
        return {
          status: 'ok',
          candidateId,
          image: {
            mimeType: loaded.image.mimeType,
            buffer: loaded.image.buffer,
          },
        };
      } finally {
        entry.candidate.previewing = false;
        entry.candidate.lastPreviewAt = now();
      }
    });
  }

  async function apply(dir, tracksSource, artistId, candidateId, options = {}) {
    if (!isArtistId(artistId)) {
      return { status: 'error', reason: 'invalid-artist' };
    }
    const entry = findCandidate(dir, artistId, candidateId);
    if (!entry) {
      return { status: 'error', reason: 'candidate-unavailable' };
    }
    return withCandidateIntent(async () => {
      if (entry.candidate.applying) {
        return { status: 'error', reason: 'busy' };
      }
      entry.candidate.applying = true;
      try {
        const currentContext = await artistIndexCache.getPhotoSearchContext(
          dir,
          currentTracks(tracksSource),
          artistId,
        );
        if (
          !isSearchContext(currentContext) ||
          fingerprintSearchContext(currentContext) !== entry.session.fingerprint
        ) {
          return { status: 'error', reason: 'candidate-stale' };
        }
        if (readPhoto(dir, artistId)) {
          return { status: 'ok', changed: false };
        }
        const loaded = await ensureCandidateImage(entry, options.signal);
        if (loaded.status !== 'ok') return loaded;
        const finalTracks = currentTracks(tracksSource);
        const finalTracksFingerprint = fingerprintTracksSnapshot(finalTracks);
        const latestContext = await artistIndexCache.getPhotoSearchContext(
          dir,
          finalTracks,
          artistId,
          { fresh: true },
        );
        const confirmedTracksFingerprint = fingerprintTracksSnapshot(
          currentTracks(tracksSource),
        );
        if (!hasActiveSession(entry)) {
          return { status: 'error', reason: 'candidate-unavailable' };
        }
        if (
          !finalTracksFingerprint ||
          confirmedTracksFingerprint !== finalTracksFingerprint ||
          !isSearchContext(latestContext) ||
          fingerprintSearchContext(latestContext) !== entry.session.fingerprint
        ) {
          return { status: 'error', reason: 'candidate-stale' };
        }
        if (readPhoto(dir, artistId)) {
          return { status: 'ok', changed: false };
        }
        writePhoto(dir, artistId, {
          buffer: loaded.image.buffer,
          extension: loaded.image.extension,
          source: 'youtube-music',
          selection: 'user-confirmed',
        });
        deleteSession(entry.sessionId);
        return { status: 'ok', changed: true };
      } finally {
        entry.candidate.applying = false;
      }
    });
  }

  return { apply, cancel, loadPreview, search };
}

module.exports = {
  createArtistPhotoCandidateService,
  isAllowedYtMusicPortraitUrl,
};

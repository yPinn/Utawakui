'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson } = require('../lib/atomicWrite');
const {
  defaultSkipThresholdMs: DEFAULT_SKIP_THRESHOLD_MS,
} = require('../../shared/obsSessionValues.json');

const SESSIONS_DIRNAME = 'obs-sessions';

// Production observes explicit manual starts and confirmed HTML audio starts,
// keyed by a performance identity rather than trackId. OBS timecodes are captured
// on demand only while its connection and output are active. Arrangement history
// persists the returned occurrence independently of this legacy OBS convenience
// log's skip threshold. No continuous OBS polling.
//
// Session boundary (a simple first cut; spec.md §7.1 leaves it open): a session
// starts on the first track recorded while an output is active and ends
// (in-memory) on the next track change with both outputs inactive. A stop with no
// later track change leaves the last-written file as the complete record, without
// an explicit "session closed" marker.
function createSessionHistoryService({
  obsAdapter,
  userDataDir,
  logger = console,
  now = () => new Date(),
  generateSessionId = () => `sess_${crypto.randomUUID()}`,
  // A function, not a frozen value — Settings can change this while the
  // service is already running (see ObsIntegrationSettingsBlock.vue).
  getSkipThresholdMs = () => DEFAULT_SKIP_THRESHOLD_MS,
  onMarker = () => undefined,
  getMarkerContext = () => null,
}) {
  let session = null; // { id, startedAt, entries, filePath } | null
  // Same object reference as `session` for as long as one is active (see
  // startSession() below) — after streaming/recording stops and `session`
  // is nulled, this still points at that same (now-frozen-in-content)
  // object, so a just-ended session stays readable for export instead of
  // vanishing the instant the stream stops. Reset only when a genuinely
  // new session starts.
  let lastKnownSession = null;
  let lastTrackId = null;
  // The most recently recorded *track* entry, still provisional until the
  // next track change confirms it played long enough to keep — see
  // maybeRetractShortTrack(). Markers never touch this; only another track
  // change evaluates and clears it.
  let pendingTrackEntry = null; // { entry, startedAtMs } | null
  // Serializes recordTrackChange()/addMarkerInternal() calls so rapid
  // back-to-back events can never race each other's snapshot request or
  // file write.
  let pending = Promise.resolve();
  const observedPerformances = new Map();

  function sessionsDir() {
    return path.join(userDataDir, SESSIONS_DIRNAME);
  }

  function startSession() {
    const id = generateSessionId();
    session = {
      id,
      startedAt: now().toISOString(),
      entries: [],
      filePath: path.join(sessionsDir(), `${id}.json`),
    };
    lastKnownSession = session;
  }

  function persistSession() {
    try {
      fs.mkdirSync(sessionsDir(), { recursive: true });
      atomicWriteJson(session.filePath, {
        sessionId: session.id,
        startedAt: session.startedAt,
        entries: session.entries,
      });
    } catch (error) {
      logger.error?.('[session-history] Failed to persist session', error);
    }
  }

  // A track that played for less than the configured threshold before the
  // next track started is treated as a misclick/test play, not a real
  // performance — retracted rather than written wrong, per spec.md's
  // "略過門檻" decision. Only ever evaluated at the *next* track change;
  // see the session-boundary note above for why a session ending without
  // one more track change leaves the last entry as-is.
  function maybeRetractShortTrack() {
    if (!pendingTrackEntry || !session) return false;
    const { entry, startedAtMs } = pendingTrackEntry;
    pendingTrackEntry = null;
    const elapsedMs = now().getTime() - startedAtMs;
    if (elapsedMs >= getSkipThresholdMs()) return false;
    const index = session.entries.indexOf(entry);
    if (index === -1) return false;
    session.entries.splice(index, 1);
    return true;
  }

  async function snapshotOutput(active, request) {
    if (!active) return null;
    try {
      const value = await request();
      return { timecode: value.timecode, durationMs: value.durationMs };
    } catch (error) {
      logger.error?.('[session-history] Snapshot request failed', error);
      return null;
    }
  }

  async function captureBothOutputs(streamActive, recordActive) {
    return Promise.all([
      snapshotOutput(streamActive, () => obsAdapter.requestStreamSnapshot()),
      snapshotOutput(recordActive, () => obsAdapter.requestRecordSnapshot()),
    ]);
  }

  async function recordTrackChange(track, occurrence = null) {
    const status = obsAdapter.getStatus();
    const connected =
      !status.observed.lifecycle ||
      ['ready', 'degraded'].includes(status.observed.lifecycle);
    const streamActive = connected && status.observed.streaming.active;
    const recordActive = connected && status.observed.recording.active;
    if (!streamActive && !recordActive) {
      // The output stopped before the pending track ever got a chance to
      // hit the next track change while still live — still has to be
      // evaluated here, and persisted, or a too-short last track of a
      // session would ship in the exported chapter list unretracted.
      if (maybeRetractShortTrack()) persistSession();
      session = null;
      pendingTrackEntry = null;
      return occurrence
        ? {
            type: 'track',
            trackId: track.id,
            title: track.title,
            artist: track.artist ?? '',
            stream: null,
            record: null,
            ...occurrence,
          }
        : null;
    }
    maybeRetractShortTrack();
    if (!session) startSession();

    const [stream, record] = await captureBothOutputs(
      streamActive,
      recordActive,
    );

    const entry = {
      type: 'track',
      trackId: track.id,
      title: track.title,
      artist: track.artist ?? null,
      stream,
      record,
      occurredAt: now().toISOString(),
      ...(occurrence ?? {}),
    };
    session.entries.push(entry);
    pendingTrackEntry = { entry, startedAtMs: now().getTime() };
    persistSession();
    return entry;
  }

  async function addMarkerInternal(label) {
    const markerContext = getMarkerContext();
    const status = obsAdapter.getStatus();
    const connected =
      !status.observed.lifecycle ||
      ['ready', 'degraded'].includes(status.observed.lifecycle);
    const streamActive = connected && status.observed.streaming.active;
    const recordActive = connected && status.observed.recording.active;
    if (!streamActive && !recordActive) return null;
    if (!session) startSession();

    const [stream, record] = await captureBothOutputs(
      streamActive,
      recordActive,
    );

    const entry = {
      type: 'marker',
      label: typeof label === 'string' && label.trim() ? label.trim() : null,
      stream,
      record,
      occurredAt: now().toISOString(),
    };
    await onMarker({ ...entry, id: crypto.randomUUID() }, markerContext);
    session.entries.push(entry);
    persistSession();
    return entry;
  }

  // Compatibility adapter for legacy tests/consumers; production no longer
  // wires Output publication to recording. This fires on every
  // projection update (lyrics/queue changes included), not just track
  // changes, so this only acts when the resolved track id actually differs
  // from the last one observed.
  function handleProjectionChange(projection) {
    const track = projection?.snapshot?.playback?.track ?? null;
    const trackId = track?.id ?? null;
    if (trackId === lastTrackId) return;
    lastTrackId = trackId;
    if (!trackId) return;

    pending = pending
      .then(() => recordTrackChange(track))
      .catch((error) => {
        logger.error?.(
          '[session-history] Failed to record track change',
          error,
        );
      });
  }

  // Returns the recorded marker entry, or null when there was nothing to
  // mark against (not currently live/recording). Unlike
  // handleProjectionChange, the caller (obsHandlers.js's IPC handler) gets
  // the real outcome to relay back to the renderer — only the *internal*
  // pending chain swallows errors so one failed marker can't block a later
  // track change from recording.
  function addMarker(label) {
    const outcome = pending.then(() => addMarkerInternal(label));
    pending = outcome.then(
      () => undefined,
      (error) => {
        logger.error?.('[session-history] Failed to record marker', error);
      },
    );
    return outcome;
  }

  // Production records only confirmed audio starts (or explicit manual
  // starts). Stable identity survives pause, seek and projection refreshes.
  function observePerformance({ identity, track, itemId = null }) {
    if (
      typeof identity !== 'string' ||
      !identity ||
      identity.length > 512 ||
      !track?.id
    )
      return Promise.reject(new TypeError('invalid performance observation'));
    if (observedPerformances.has(identity))
      return observedPerformances.get(identity);
    const occurrence = {
      id: crypto.randomUUID(),
      itemId,
      occurredAt: now().toISOString(),
    };
    const outcome = pending.then(() => recordTrackChange(track, occurrence));
    observedPerformances.set(identity, outcome);
    if (observedPerformances.size > 2000)
      observedPerformances.delete(observedPerformances.keys().next().value);
    pending = outcome.catch((error) => {
      observedPerformances.delete(identity);
      logger.error?.('[session-history] Failed to record performance', error);
    });
    return outcome;
  }

  function cloneSession(value) {
    return value ? { ...value, entries: [...value.entries] } : null;
  }

  function getCurrentSession() {
    return cloneSession(session);
  }

  // For export UI: the live session if one is running, otherwise the most
  // recently completed one — so "the stream just ended, now export
  // chapters" has something to read instead of null. See lastKnownSession
  // above for why this doesn't need its own bookkeeping.
  function getLatestSession() {
    return cloneSession(session ?? lastKnownSession);
  }

  return {
    observePerformance,
    flush: () => pending,
    handleProjectionChange,
    addMarker,
    getCurrentSession,
    getLatestSession,
  };
}

module.exports = {
  createSessionHistoryService,
  DEFAULT_SKIP_THRESHOLD_MS,
};

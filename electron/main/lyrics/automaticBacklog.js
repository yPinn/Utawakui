'use strict';

// Revisits library tracks without lyrics, one at a time, through the same
// automatic acquisition queue and its request caps.
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: waitFor } = require('node:timers/promises');
const {
  findTrack,
  getTrackLyricsState,
  readAutomaticLyricsAttempt,
  resolveTrackDir,
} = require('../../lib/library');
const { loadIndex } = require('../../lib/library/metadataIndex');
const { isStoreTrackId } = require('../../lib/library/trackSidecarStore');
const {
  createTrackLanguagesService,
} = require('../../lib/library/trackLanguages');
const {
  automaticAttemptDueAt,
} = require('../../lib/library/lyricsAutomaticAttempts');

const START_DELAY_MS = 2 * 60 * 1000;
const IDLE_MS = 30 * 60 * 1000;
const MIN_WAIT_MS = 60 * 1000;
const WAIT_AFTER = new Set(['background-queue-full', 'busy', 'recent-attempt']);

function createLyricsBacklog({
  getLibraryDir,
  acquire,
  isEnabled,
  onSaved = () => {},
  logger,
  now = Date.now,
  wait = waitFor,
  startDelayMs = START_DELAY_MS,
  idleMs = IDLE_MS,
}) {
  let controller = null;
  let wakeController = null;
  // Tracks the queue refused without a record (missing audio) this session.
  const sessionSkips = new Set();

  function noVocalTracks(dir) {
    try {
      const { tracks } = createTrackLanguagesService({
        getLibraryContext: () => ({ dir, epoch: 0 }),
      }).list();
      return new Set(
        Object.keys(tracks).filter((id) =>
          tracks[id].languages.includes('zxx'),
        ),
      );
    } catch {
      return new Set();
    }
  }

  // Next due track without any lyrics source, or how long to wait for one.
  // Never-tried tracks go first, newest import first; then the oldest retry.
  function pickNext() {
    if (!isEnabled()) return { waitMs: idleMs };
    const dir = getLibraryDir();
    const index = loadIndex(dir).tracks;
    const skip = noVocalTracks(dir);
    const current = now();
    const due = [];
    let earliest = Infinity;
    for (const id of fs.readdirSync(path.join(dir, 'tracks'))) {
      if (!isStoreTrackId(id) || skip.has(id) || sessionSkips.has(id)) continue;
      const record = index[id];
      if (typeof record?.title !== 'string' || !record.title) continue;
      const trackDir = resolveTrackDir(dir, id);
      if (!trackDir || getTrackLyricsState(trackDir).sources.length) continue;
      const attempt = readAutomaticLyricsAttempt(trackDir);
      const dueAt = automaticAttemptDueAt(attempt, record);
      if (dueAt <= current)
        due.push({
          id,
          trackDir,
          attempt,
          dueAt,
          importedAt: record.importedAt,
        });
      else earliest = Math.min(earliest, dueAt);
    }
    due.sort(
      (a, b) =>
        Number(Boolean(a.attempt)) - Number(Boolean(b.attempt)) ||
        (a.attempt
          ? a.dueAt - b.dueAt
          : String(b.importedAt ?? '').localeCompare(
              String(a.importedAt ?? ''),
            )),
    );
    for (const { id, trackDir, attempt } of due) {
      // The acquisition queue keys retries on this exact track object.
      const track = findTrack(dir, id);
      const dueAt = track ? automaticAttemptDueAt(attempt, track) : Infinity;
      if (dueAt <= current) return { track, trackDir };
      earliest = Math.min(earliest, dueAt);
    }
    return {
      waitMs: Math.min(Math.max(earliest - current, MIN_WAIT_MS), idleMs),
    };
  }

  // Idle waits end early on wake(); quitting ends every wait.
  async function idle(ms, signal) {
    wakeController = new AbortController();
    const wake = wakeController;
    const forward = () => wake.abort();
    signal.addEventListener('abort', forward, { once: true });
    try {
      await wait(ms, undefined, { signal: wake.signal });
    } catch (error) {
      if (signal.aborted) throw error;
    } finally {
      signal.removeEventListener('abort', forward);
      if (wakeController === wake) wakeController = null;
    }
  }

  async function run(signal) {
    await wait(startDelayMs, undefined, { signal });
    while (!signal.aborted) {
      let next;
      try {
        next = pickNext();
      } catch {
        next = { waitMs: idleMs };
      }
      if (!next.track) {
        await idle(next.waitMs, signal);
        continue;
      }
      const result = await acquire(next.track, next.trackDir);
      // Reasons only; titles and artists never enter the log.
      logger?.debug?.('[lyrics] background backlog attempt', {
        status: result?.status,
        reason: result?.reason ?? null,
      });
      if (result?.status === 'saved') onSaved();
      if (result?.reason === 'stale-track') sessionSkips.add(next.track.id);
      if (WAIT_AFTER.has(result?.reason))
        await wait(MIN_WAIT_MS, undefined, { signal });
    }
  }

  // Library changes (imports, edits, corrections) may make a track due now.
  function wake() {
    wakeController?.abort();
  }

  function start() {
    if (controller) return;
    controller = new AbortController();
    run(controller.signal).catch(() => {
      // Aborted on quit, or a failed pass; the next start resumes.
    });
  }

  function stop() {
    controller?.abort();
    controller = null;
  }

  return { start, stop, wake, pickNext };
}

module.exports = { createLyricsBacklog };

'use strict';

const { VIDEO_ID_RE } = require('../youtube');
const { resolveTrackDir } = require('./paths');
const { loadIndex, saveIndexEntry } = require('./metadataIndex');

let backfillInProgress = false;
// Session-only failure memory (not persisted) — resets on restart, so a
// permanently dead video gets retried once per launch.
const backfillFailedIds = new Set();

// fetchMetadata is injected so this module stays yt-dlp-agnostic. Resolves
// to whether anything changed; only one pass runs at a time.
function notifyBackfillStatus(onStatus, payload) {
  if (typeof onStatus !== 'function') return;
  onStatus(payload);
}

async function runBackfillPass(dir, tracks, fetchMetadata, onStatus = null) {
  if (backfillInProgress) {
    notifyBackfillStatus(onStatus, {
      stage: 'running',
      isRunning: true,
    });
    return false;
  }

  const candidates = tracks.filter(
    (track) =>
      VIDEO_ID_RE.test(track.id) &&
      track.needsBackfill &&
      !backfillFailedIds.has(track.id),
  );
  if (candidates.length === 0) {
    notifyBackfillStatus(onStatus, {
      stage: 'idle',
      isRunning: false,
      total: 0,
      completed: 0,
    });
    return false;
  }

  backfillInProgress = true;
  let updated = false;
  let completed = 0;
  try {
    notifyBackfillStatus(onStatus, {
      stage: 'start',
      isRunning: true,
      total: candidates.length,
      completed,
    });
    for (const track of candidates) {
      const trackDir = resolveTrackDir(dir, track.id);
      notifyBackfillStatus(onStatus, {
        stage: 'track',
        isRunning: true,
        total: candidates.length,
        completed,
        trackId: track.id,
        title: track.title,
      });
      const result = await fetchMetadata(track.id, trackDir);
      completed += 1;
      if (!result || (!result.title && !result.assetsUpdated)) {
        backfillFailedIds.add(track.id);
        notifyBackfillStatus(onStatus, {
          stage: 'progress',
          isRunning: true,
          total: candidates.length,
          completed,
          trackId: track.id,
          title: track.title,
          updated: false,
        });
        continue;
      }
      const metadata = { ...result };
      delete metadata.assetsUpdated;
      try {
        if (metadata.title) {
          // Re-read fresh: a manual edit may have landed on this track
          // while the fetch above was in flight — don't clobber it.
          const currentEntry = loadIndex(dir).tracks[track.id];
          const toWrite = { ...metadata };
          if (currentEntry?.title) delete toWrite.title;
          if (currentEntry?.artist) delete toWrite.artist;
          if (Object.keys(toWrite).length > 0) {
            saveIndexEntry(dir, track.id, toWrite);
          }
        }
        updated = true;
      } catch {
        // Leave needsBackfill true (don't add to backfillFailedIds) so a
        // transient write failure gets retried on the next pass instead
        // of silently dropping this track's metadata for the session.
      }
      notifyBackfillStatus(onStatus, {
        stage: 'progress',
        isRunning: true,
        total: candidates.length,
        completed,
        trackId: track.id,
        title: metadata.title || track.title,
        updated: Boolean(result.title || result.assetsUpdated),
      });
    }
  } finally {
    backfillInProgress = false;
    notifyBackfillStatus(onStatus, {
      stage: 'done',
      isRunning: false,
      total: candidates.length,
      completed,
      updated,
    });
  }

  return updated;
}

module.exports = {
  runBackfillPass,
};

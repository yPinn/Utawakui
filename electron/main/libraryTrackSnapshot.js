'use strict';

const { listTracks } = require('../lib/library');

// Startup fans one library:list out into several derived reads (artist index,
// BGM standby). They reuse the list the renderer just received instead of
// rescanning; any library:updated notice or the age limit forces a rescan.
const SNAPSHOT_MAX_AGE_MS = 5_000;

function createLibraryTrackSnapshot({
  listLibraryTracks = listTracks,
  now = Date.now,
  maxAgeMs = SNAPSHOT_MAX_AGE_MS,
} = {}) {
  let snapshot = null;

  function listFresh(directory) {
    const tracks = listLibraryTracks(directory);
    snapshot = { directory, tracks, at: now() };
    return tracks;
  }

  function listRecent(directory) {
    if (snapshot?.directory === directory && now() - snapshot.at <= maxAgeMs) {
      return snapshot.tracks;
    }
    return listFresh(directory);
  }

  function invalidate() {
    snapshot = null;
  }

  return { listFresh, listRecent, invalidate };
}

module.exports = { createLibraryTrackSnapshot, SNAPSHOT_MAX_AGE_MS };

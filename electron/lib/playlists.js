'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('./atomicWrite');

// User-authored, unrecoverable data — NOT a key in library.json (that's
// derived/rebuildable metadata, see its own file-level comment) and NOT in
// config.json (machine-local settings only, never shareable data). Lives in
// the download dir because trackIds are filename stems relative to it, so
// playlists must travel with the tracks the same way library.json does.
//
// Ids are UUIDs, not array indices or names, specifically so a future named
// preset (docs/spec.md §2: 歌單+主題+顯示設定) can reference a playlist by
// stable id instead of embedding a copy of it.
const PLAYLISTS_FILENAME = 'playlists.json';
const PLAYLISTS_VERSION = 1;

// Guards against a runaway/garbage file, not a stated product limit —
// docs/spec.md §7 Q2 (具名 preset 數量上限) is still an open question.
const MAX_NAME_LENGTH = 200;
const MAX_PLAYLISTS = 500;
const MAX_TRACKS_PER_PLAYLIST = 5000;
const DEFAULT_PLAYLIST_NAME_PREFIX = '播放清單 #';

// Renamed aside as `<path>.corrupted-<timestamp>` rather than silently
// discarded — unlike library.json (rebuildable from the filesystem +
// network backfill), a hand-curated playlist can't be regenerated, so this
// follows config.js's corruption policy instead of its neighbour
// library.js's silent-empty-on-corrupt one.
function backupCorrupted(filePath) {
  const backupPath = `${filePath}.corrupted-${Date.now()}`;
  try {
    fs.renameSync(filePath, backupPath);
  } catch {
    // best-effort — if even the rename fails, just fall through to empty
  }
}

// Coerces one raw entry into a well-formed playlist or drops it entirely —
// keeps a single bad entry from taking down the whole file the way a
// top-level shape mismatch does.
function sanitizePlaylist(entry) {
  if (typeof entry !== 'object' || entry === null) return null;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return null;

  const name =
    typeof entry.name === 'string' ? entry.name.slice(0, MAX_NAME_LENGTH) : '';

  const rawTrackIds = Array.isArray(entry.trackIds) ? entry.trackIds : [];
  const trackIds = [
    ...new Set(
      rawTrackIds.filter((id) => typeof id === 'string' && id.length > 0),
    ),
  ].slice(0, MAX_TRACKS_PER_PLAYLIST);

  const rawAddedAt =
    typeof entry.addedAt === 'object' && entry.addedAt !== null
      ? entry.addedAt
      : {};
  const addedAt = {};
  for (const trackId of trackIds) {
    const value = rawAddedAt[trackId];
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
      addedAt[trackId] = value;
    }
  }

  return { id: entry.id, name, trackIds, addedAt };
}

function loadPlaylists(dir) {
  const filePath = path.join(dir, PLAYLISTS_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    return [];
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    backupCorrupted(filePath);
    return [];
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray(data.playlists)
  ) {
    backupCorrupted(filePath);
    return [];
  }

  return data.playlists
    .map(sanitizePlaylist)
    .filter((playlist) => playlist !== null)
    .slice(0, MAX_PLAYLISTS);
}

// mkdirSync first — unlike saveIndexEntry (library.js), which only ever
// runs after a successful download has already created the dir, this can
// be the very first write to a fresh download dir (e.g. creating a
// playlist before downloading anything), and atomicWriteJson itself does
// not create parent directories.
function writePlaylists(dir, playlists) {
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteJson(path.join(dir, PLAYLISTS_FILENAME), {
    version: PLAYLISTS_VERSION,
    playlists,
  });
}

function nextDefaultPlaylistName(playlists) {
  const used = new Set();
  const pattern = new RegExp(`^${DEFAULT_PLAYLIST_NAME_PREFIX}(\\d+)$`);
  for (const playlist of playlists) {
    const match = pattern.exec(playlist.name);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isSafeInteger(value) && value > 0) {
      used.add(value);
    }
  }

  let index = 1;
  while (used.has(index)) index += 1;
  return `${DEFAULT_PLAYLIST_NAME_PREFIX}${index}`;
}

function createPlaylist(dir, name) {
  const playlists = loadPlaylists(dir);
  const trimmedName =
    typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
  const playlist = {
    id: crypto.randomUUID(),
    name: trimmedName || nextDefaultPlaylistName(playlists),
    trackIds: [],
    addedAt: {},
  };
  // Appended, never sorted by name — a playlist jumping position right
  // after you name it would be disorienting.
  const next = [...playlists, playlist].slice(0, MAX_PLAYLISTS);
  writePlaylists(dir, next);
  return next;
}

function renamePlaylist(dir, id, name) {
  const playlists = loadPlaylists(dir);
  const index = playlists.findIndex((p) => p.id === id);
  if (index === -1) return playlists;

  const next = [...playlists];
  next[index] = {
    ...next[index],
    name: typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '',
  };
  writePlaylists(dir, next);
  return next;
}

function deletePlaylist(dir, id) {
  const playlists = loadPlaylists(dir);
  if (!playlists.some((p) => p.id === id)) return playlists;

  const next = playlists.filter((p) => p.id !== id);
  writePlaylists(dir, next);
  return next;
}

// Single write path for add/remove/reorder alike — the renderer computes
// the full resulting array and sends it, since there's one window and one
// writer. Deliberately does NOT filter trackIds against listTracks(dir):
// listTracks returns [] on a transient readdir failure, and intersecting
// against that would turn "external drive not mounted" into "playlist
// silently wiped." A trackId with no matching file is harmless — the
// renderer's own join simply won't render it, and because the renderer
// always sends back the array it rendered, a stale id is dropped for free
// on the next mutation. Same orphan doctrine as library.js.
function reorderPlaylists(dir, draggedId, targetId, position = 'before') {
  const playlists = loadPlaylists(dir);
  if (!draggedId || !targetId || draggedId === targetId) return playlists;

  const dragged = playlists.find((playlist) => playlist.id === draggedId);
  if (!dragged || !playlists.some((playlist) => playlist.id === targetId)) {
    return playlists;
  }

  const withoutDragged = playlists.filter(
    (playlist) => playlist.id !== draggedId,
  );
  const targetIndex = withoutDragged.findIndex(
    (playlist) => playlist.id === targetId,
  );
  if (targetIndex === -1) return playlists;

  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  const next = [...withoutDragged];
  next.splice(insertIndex, 0, dragged);

  if (
    next.map((playlist) => playlist.id).join('\0') ===
    playlists.map((playlist) => playlist.id).join('\0')
  ) {
    return playlists;
  }

  writePlaylists(dir, next);
  return next;
}

function setPlaylistTracks(dir, id, trackIds) {
  const playlists = loadPlaylists(dir);
  const index = playlists.findIndex((p) => p.id === id);
  if (index === -1) return playlists;

  const rawTrackIds = Array.isArray(trackIds) ? trackIds : [];
  const sanitizedTrackIds = [
    ...new Set(
      rawTrackIds.filter((t) => typeof t === 'string' && t.length > 0),
    ),
  ].slice(0, MAX_TRACKS_PER_PLAYLIST);

  const next = [...playlists];
  const now = new Date().toISOString();
  const previous = next[index];
  const addedAt = {};
  for (const trackId of sanitizedTrackIds) {
    if (previous.trackIds.includes(trackId) && previous.addedAt?.[trackId]) {
      addedAt[trackId] = previous.addedAt[trackId];
    } else if (!previous.trackIds.includes(trackId)) {
      addedAt[trackId] = now;
    }
  }

  next[index] = { ...previous, trackIds: sanitizedTrackIds, addedAt };
  writePlaylists(dir, next);
  return next;
}

// Only writes if something actually changed — otherwise deleting a track
// that's in no playlist would still rewrite playlists.json for nothing.
function removeTrackFromAllPlaylists(dir, trackId) {
  const playlists = loadPlaylists(dir);
  let changed = false;
  const next = playlists.map((playlist) => {
    if (!playlist.trackIds.includes(trackId)) return playlist;
    changed = true;
    return {
      ...playlist,
      trackIds: playlist.trackIds.filter((id) => id !== trackId),
      addedAt: Object.fromEntries(
        Object.entries(playlist.addedAt).filter(([id]) => id !== trackId),
      ),
    };
  });

  if (!changed) return playlists;
  writePlaylists(dir, next);
  return next;
}

module.exports = {
  createPlaylist,
  deletePlaylist,
  loadPlaylists,
  PLAYLISTS_FILENAME,
  reorderPlaylists,
  removeTrackFromAllPlaylists,
  renamePlaylist,
  setPlaylistTracks,
};

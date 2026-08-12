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
const PLAYLISTS_VERSION = 2;

// Guards against a runaway/garbage file, not a stated product limit —
// docs/spec.md §7 Q2 (具名 preset 數量上限) is still an open question.
const MAX_NAME_LENGTH = 200;
const MAX_PLAYLISTS = 500;
const MAX_TRACKS_PER_PLAYLIST = 5000;
const DEFAULT_PLAYLIST_NAME_PREFIX = '播放清單 #';

// 'album' collections are read-only (see upsertAlbum/setPlaylistKind below
// and main.js's playlists:set-tracks guard) — track order/membership comes
// from the source itself. Everything else (rename, delete, whole-playlist
// reorder) still applies equally to both kinds.
const PLAYLIST_KINDS = new Set(['playlist', 'album']);
const DEFAULT_PLAYLIST_KIND = 'playlist';

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

  const kind = PLAYLIST_KINDS.has(entry.kind)
    ? entry.kind
    : DEFAULT_PLAYLIST_KIND;

  const rawSource =
    typeof entry.source === 'object' && entry.source !== null
      ? entry.source
      : null;
  const source =
    rawSource &&
    typeof rawSource.platform === 'string' &&
    typeof rawSource.id === 'string'
      ? {
          platform: rawSource.platform.slice(0, MAX_NAME_LENGTH),
          id: rawSource.id.slice(0, MAX_NAME_LENGTH),
        }
      : undefined;

  return {
    id: entry.id,
    name,
    kind,
    ...(source ? { source } : {}),
    trackIds,
    addedAt,
  };
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

function createPlaylist(dir, name, options = {}) {
  const playlists = loadPlaylists(dir);
  const trimmedName =
    typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
  const kind = PLAYLIST_KINDS.has(options.kind)
    ? options.kind
    : DEFAULT_PLAYLIST_KIND;
  const source =
    options.source &&
    typeof options.source.platform === 'string' &&
    typeof options.source.id === 'string'
      ? {
          platform: options.source.platform.slice(0, MAX_NAME_LENGTH),
          id: options.source.id.slice(0, MAX_NAME_LENGTH),
        }
      : undefined;
  const playlist = {
    id: crypto.randomUUID(),
    name: trimmedName || nextDefaultPlaylistName(playlists),
    kind,
    ...(source ? { source } : {}),
    trackIds: [],
    addedAt: {},
  };
  // Appended, never sorted by name — a playlist jumping position right
  // after you name it would be disorienting.
  const next = [...playlists, playlist].slice(0, MAX_PLAYLISTS);
  writePlaylists(dir, next);
  return next;
}

// Read-only-collection write path for album imports. Looked up by
// source.platform + source.id (not name — the user may have renamed it)
// so re-importing the same album updates its track list in place instead
// of producing a duplicate; name is intentionally left untouched on an
// update. Builds the new-collection case inline rather than delegating to
// createPlaylist, since createPlaylist always starts trackIds at [] and
// this needs the imported track list set atomically at creation.
function upsertAlbum(dir, { name, source, trackIds } = {}) {
  const playlists = loadPlaylists(dir);
  const validSource =
    source &&
    typeof source.platform === 'string' &&
    typeof source.id === 'string'
      ? source
      : null;
  const existingIndex = validSource
    ? playlists.findIndex(
        (p) =>
          p.kind === 'album' &&
          p.source?.platform === validSource.platform &&
          p.source?.id === validSource.id,
      )
    : -1;

  const rawTrackIds = Array.isArray(trackIds) ? trackIds : [];
  const sanitizedTrackIds = [
    ...new Set(
      rawTrackIds.filter((id) => typeof id === 'string' && id.length > 0),
    ),
  ].slice(0, MAX_TRACKS_PER_PLAYLIST);
  const now = new Date().toISOString();

  if (existingIndex === -1) {
    const trimmedName =
      typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
    const addedAt = {};
    for (const trackId of sanitizedTrackIds) addedAt[trackId] = now;
    const playlist = {
      id: crypto.randomUUID(),
      name: trimmedName || nextDefaultPlaylistName(playlists),
      kind: 'album',
      ...(validSource ? { source: validSource } : {}),
      trackIds: sanitizedTrackIds,
      addedAt,
    };
    const next = [...playlists, playlist].slice(0, MAX_PLAYLISTS);
    writePlaylists(dir, next);
    return next;
  }

  const next = [...playlists];
  const previous = next[existingIndex];
  const addedAt = {};
  for (const trackId of sanitizedTrackIds) {
    addedAt[trackId] = previous.addedAt?.[trackId] || now;
  }
  next[existingIndex] = {
    ...previous,
    trackIds: sanitizedTrackIds,
    addedAt,
  };
  writePlaylists(dir, next);
  return next;
}

// Manual conversion between kinds — the escape hatch when the automatic
// heuristic (albumClassifier.js) gets an existing collection wrong.
// Deliberately does not touch name/trackIds/addedAt/source.
function setPlaylistKind(dir, id, kind) {
  const playlists = loadPlaylists(dir);
  const index = playlists.findIndex((p) => p.id === id);
  if (index === -1 || !PLAYLIST_KINDS.has(kind)) return playlists;
  if (playlists[index].kind === kind) return playlists;

  const next = [...playlists];
  next[index] = { ...next[index], kind };
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

// One-time migration for collections that predate the kind field:
// classifies each by its members' album metadata
// (electron/lib/albumClassifier.js) and stamps kind: 'album' | 'playlist'
// accordingly. Gated on the raw on-disk version — loadPlaylists doesn't
// track version at all, so this reads the file directly, same pattern as
// library.js's migrateTrackAlbumMetadata. Backs up the pre-migration file
// first: not corruption, but a schema change to unrecoverable user data
// deserves the same safety net as backupCorrupted. classify is injected
// (classifyCollectionKind) so this module stays free of any
// album-detection knowledge of its own.
function migratePlaylistKinds(dir, tracksById, classify) {
  const filePath = path.join(dir, PLAYLISTS_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return false;
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray(data.playlists) ||
    (typeof data.version === 'number' && data.version >= PLAYLISTS_VERSION)
  ) {
    return false;
  }

  try {
    fs.copyFileSync(filePath, `${filePath}.backup-v1-${Date.now()}`);
  } catch {
    // best-effort — a failed backup shouldn't block the migration itself
  }

  const playlists = data.playlists
    .map(sanitizePlaylist)
    .filter((playlist) => playlist !== null);

  const next = playlists.map((playlist) => {
    // Already has real provenance (shouldn't happen pre-migration, but
    // trust it over the heuristic rather than second-guessing it).
    if (playlist.source) return playlist;
    const memberTracks = playlist.trackIds
      .map((id) => tracksById.get(id))
      .filter(Boolean);
    return { ...playlist, kind: classify(memberTracks) };
  });

  writePlaylists(dir, next);
  return true;
}

module.exports = {
  createPlaylist,
  deletePlaylist,
  loadPlaylists,
  migratePlaylistKinds,
  PLAYLISTS_FILENAME,
  reorderPlaylists,
  removeTrackFromAllPlaylists,
  renamePlaylist,
  setPlaylistKind,
  setPlaylistTracks,
  upsertAlbum,
};

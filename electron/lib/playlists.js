'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('./atomicWrite');
const { hasControlCharacters } = require('./textGuards');
const { isBoundedTrackId } = require('./library/paths');
const { assertNoTransaction } = require('./reconciliation/transaction');
const {
  reconciliationState,
  resolveRedirect,
} = require('./reconciliation/state');
const {
  needsLocalReleaseReview,
} = require('./reconciliation/catalogAdmission');
const {
  validateReleaseInfo,
  updateReleaseInfo,
  reconcileReleaseMembership,
  observeReleaseInfo,
  createReleaseInfo,
} = require('./releases/schema');

// User-authored data: not library metadata and not machine-local config.
// Lives beside tracks; UUID ids stay stable for future preset references.
const PLAYLISTS_FILENAME = 'playlists.json';
const PLAYLISTS_VERSION = 4;
// The old kind migration must never reclassify an already-migrated v2 library.
const PLAYLIST_KINDS_VERSION = 2;

// Sanity guard for corrupted files, not a product limit.
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PLAYLISTS = 500;
const MAX_TRACKS_PER_PLAYLIST = 5000;
const DEFAULT_PLAYLIST_NAME_PREFIX = '播放清單 #';

// Album membership/order is source-owned; other management actions still apply.
const PLAYLIST_KINDS = new Set(['playlist', 'album']);
const DEFAULT_PLAYLIST_KIND = 'playlist';

// Coerces one raw entry into a well-formed playlist or drops it entirely —
// keeps a single bad entry from taking down the whole file the way a
// top-level shape mismatch does.
function sanitizePlaylist(entry) {
  if (typeof entry !== 'object' || entry === null) return null;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return null;

  const name =
    typeof entry.name === 'string' ? entry.name.slice(0, MAX_NAME_LENGTH) : '';

  const description =
    typeof entry.description === 'string'
      ? entry.description.slice(0, MAX_DESCRIPTION_LENGTH)
      : '';

  // Bare filename (e.g. 'cover.jpg') written by
  // electron/lib/library/playlistCovers.js's writePlaylistCoverFile — never
  // an absolute path, same "derive the URL at
  // the boundary" rule as track thumbnails. Absent means "no custom cover,
  // fall back to the derived track-thumbnail collage."
  const coverImage =
    typeof entry.coverImage === 'string' && entry.coverImage.length > 0
      ? entry.coverImage
      : undefined;

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

  const playlist = {
    id: entry.id,
    ...(typeof entry.performanceExportKey === 'string' &&
    /^[a-f0-9]{64}$/.test(entry.performanceExportKey)
      ? { performanceExportKey: entry.performanceExportKey }
      : {}),
    name,
    kind,
    ...(source ? { source } : {}),
    ...(coverImage ? { coverImage } : {}),
    description,
    trackIds,
    addedAt,
  };
  if (entry.releaseInfo !== undefined) {
    playlist.releaseInfo = validateReleaseInfo(entry.releaseInfo, playlist);
  }
  return playlist;
}

function readPlaylistDocument(dir) {
  const filePath = path.join(dir, PLAYLISTS_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
    return null;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (cause) {
    throw new Error('Invalid playlist document', { cause });
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray(data.playlists)
  ) {
    throw new Error('Invalid playlist document');
  }

  const version = data.version ?? 1;
  if (
    !Number.isInteger(version) ||
    version < 1 ||
    version > PLAYLISTS_VERSION
  ) {
    throw new Error('Unsupported playlist schema version');
  }
  return { data, raw, version };
}

function loadPlaylists(dir) {
  const document = readPlaylistDocument(dir);
  if (!document) return [];
  const state = reconciliationState(document.data);
  return document.data.playlists
    .map(sanitizePlaylist)
    .filter((playlist) => playlist !== null)
    .slice(0, MAX_PLAYLISTS)
    .map((playlist) => {
      const redirectedIds = Object.keys(state.redirects).filter(
        (id) => resolveRedirect(state.redirects, id) === playlist.id,
      );
      return redirectedIds.length ? { ...playlist, redirectedIds } : playlist;
    });
}

function resolvePlaylistId(dir, id) {
  const document = readPlaylistDocument(dir);
  return resolveRedirect(
    reconciliationState(document?.data ?? {}).redirects,
    id,
  );
}

function loadCatalogCollections(dir) {
  const document = readPlaylistDocument(dir);
  const pending = reconciliationState(document?.data ?? {}).pendingReleases;
  return [...loadPlaylists(dir), ...pending.map(sanitizePlaylist)];
}

// mkdirSync first — unlike saveIndexEntry (electron/lib/library/metadataIndex.js), which only ever
// runs after a successful download has already created the dir, this can
// be the very first write to a fresh download dir (e.g. creating a
// playlist before downloading anything), and atomicWriteJson itself does
// not create parent directories.
function writePlaylists(dir, playlists, reconciliation) {
  assertNoTransaction(dir);
  // Every writer must preserve the release schema, including legacy kind and
  // membership paths that do not enter the release editor's CAS helper.
  for (const playlist of playlists) {
    if (playlist.releaseInfo !== undefined) {
      validateReleaseInfo(playlist.releaseInfo, playlist);
    }
  }
  const previous = readPlaylistDocument(dir);
  if (previous && previous.version < PLAYLISTS_VERSION) {
    // A failed backup must not discard the only pre-migration user document.
    fs.copyFileSync(
      path.join(dir, PLAYLISTS_FILENAME),
      path.join(
        dir,
        `${PLAYLISTS_FILENAME}.backup-v${previous.version}-${Date.now()}`,
      ),
      fs.constants.COPYFILE_EXCL,
    );
  }
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteJson(path.join(dir, PLAYLISTS_FILENAME), {
    ...previous?.data,
    version: PLAYLISTS_VERSION,
    ...(reconciliation ? { reconciliation } : {}),
    playlists: playlists.map((entry) => {
      const original = previous?.data.playlists.find(
        (item) => item.id === entry.id,
      );
      const known = new Set([
        'id',
        'name',
        'description',
        'kind',
        'source',
        'coverImage',
        'trackIds',
        'addedAt',
        'releaseInfo',
        'performanceExportKey',
      ]);
      return {
        ...Object.fromEntries(
          Object.entries(original ?? {}).filter(([key]) => !known.has(key)),
        ),
        ...Object.fromEntries(
          Object.entries(entry).filter(([key]) => key !== 'redirectedIds'),
        ),
      };
    }),
  });
}

// Trusted Main-only catalog writer. All acquisition and media checks precede
// this short CAS commit in the shared library lane.
function writeReleaseCatalog(dir, collection, expectedRevision) {
  assertNoTransaction(dir);
  const playlists = loadPlaylists(dir);
  const document = readPlaylistDocument(dir);
  const state = reconciliationState(document?.data ?? {});
  const pendingIndex = state.pendingReleases.findIndex(
    (entry) => entry.id === collection.id,
  );
  if (pendingIndex >= 0) {
    const previous = state.pendingReleases[pendingIndex];
    if (
      expectedRevision !== (previous.releaseInfo?.revision ?? 0) ||
      JSON.stringify(collection.source) !== JSON.stringify(previous.source)
    )
      throw Object.assign(new Error('Release proposal changed.'), {
        code: 'RELEASE_INFO_CONFLICT',
      });
    validateReleaseInfo(collection.releaseInfo, collection);
    state.pendingReleases[pendingIndex] = {
      ...previous,
      ...collection,
      name: previous.name,
      description: previous.description,
    };
    writePlaylists(dir, playlists, state);
    return collection;
  }
  const index = playlists.findIndex((entry) => entry.id === collection.id);
  const invalid = () =>
    Object.assign(new Error('Release catalog changed.'), {
      code: 'RELEASE_INFO_CONFLICT',
    });
  if (index === -1) {
    if (
      expectedRevision !== null ||
      playlists.length >= MAX_PLAYLISTS ||
      playlists.some(
        (entry) =>
          entry.source?.id === collection.source?.id &&
          ['youtube', 'yt-music'].includes(entry.source?.platform),
      )
    )
      throw invalid();
  } else {
    const current = playlists[index];
    if (
      expectedRevision === null ||
      current.kind !== 'album' ||
      (current.releaseInfo?.revision ?? 0) !== expectedRevision ||
      JSON.stringify(current.source) !== JSON.stringify(collection.source)
    )
      throw invalid();
  }
  if (collection.kind !== 'album' || !collection.releaseInfo?.catalog)
    throw invalid();
  validateReleaseInfo(collection.releaseInfo, collection);
  if (index === -1 && needsLocalReleaseReview(playlists, collection)) {
    if (
      state.pendingReleases.length >= MAX_PLAYLISTS ||
      state.pendingReleases.some(
        (entry) => entry.source?.id === collection.source.id,
      )
    )
      throw invalid();
    state.pendingReleases.push(collection);
    writePlaylists(dir, playlists, state);
    return collection;
  }
  if (index === -1) playlists.push(collection);
  else {
    const current = playlists[index];
    collection = {
      ...collection,
      name: current.name,
      description: current.description,
    };
    if (Object.hasOwn(current, 'coverImage'))
      collection.coverImage = current.coverImage;
    else if (current.releaseInfo?.catalog) delete collection.coverImage;
    playlists[index] = collection;
  }
  writePlaylists(dir, playlists);
  return collection;
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
function upsertAlbum(
  dir,
  { name, source, trackIds, releaseObservations } = {},
) {
  const playlists = loadPlaylists(dir);
  const validSource =
    source &&
    typeof source.platform === 'string' &&
    typeof source.id === 'string'
      ? source
      : null;
  if (
    validSource &&
    reconciliationState(
      readPlaylistDocument(dir)?.data ?? {},
    ).pendingReleases.some(
      (entry) =>
        entry.source?.id === validSource.id &&
        (entry.source.platform === validSource.platform ||
          (['youtube', 'yt-music'].includes(entry.source.platform) &&
            ['youtube', 'yt-music'].includes(validSource.platform))),
    )
  )
    return playlists;
  const existingIndex = validSource
    ? playlists.findIndex(
        (p) =>
          p.kind === 'album' &&
          (p.source?.platform === validSource.platform ||
            (['youtube', 'yt-music'].includes(p.source?.platform) &&
              ['youtube', 'yt-music'].includes(validSource.platform) &&
              p.releaseInfo?.catalog?.manifest.playlistId ===
                validSource.id)) &&
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
    if (releaseObservations !== undefined) {
      Object.assign(
        playlist,
        observeReleaseInfo(playlist, releaseObservations),
      );
    }
    if (
      validSource &&
      ['youtube', 'yt-music'].includes(validSource.platform) &&
      /^OLAK5uy_[A-Za-z0-9_-]{1,120}$/.test(validSource.id) &&
      sanitizedTrackIds.length &&
      playlists.some(
        (local) =>
          local.kind === 'album' &&
          !local.source &&
          local.trackIds.length === sanitizedTrackIds.length &&
          local.trackIds.every((id) => sanitizedTrackIds.includes(id)),
      )
    ) {
      const state = reconciliationState(readPlaylistDocument(dir)?.data ?? {});
      if (state.pendingReleases.length >= MAX_PLAYLISTS)
        throw Object.assign(new Error('Release proposal limit reached.'), {
          code: 'RELEASE_INFO_CONFLICT',
        });
      state.pendingReleases.push(playlist);
      writePlaylists(dir, playlists, state);
      return playlists;
    }
    const next = [...playlists, playlist].slice(0, MAX_PLAYLISTS);
    writePlaylists(dir, next);
    return next;
  }

  const next = [...playlists];
  const previous = next[existingIndex];
  let memberIds = sanitizedTrackIds;
  if (previous.releaseInfo?.catalog) {
    const catalog = previous.releaseInfo.catalog;
    const sourceIds = new Set(
      catalog.manifest.slots.map((slot) => slot.videoId),
    );
    const merged = new Set([
      ...previous.trackIds,
      ...sanitizedTrackIds.filter((id) => sourceIds.has(id)),
    ]);
    const ordered = [
      ...new Set(
        catalog.manifest.slots
          .map(
            (slot) =>
              catalog.links[`slot-${slot.position}`]?.trackId ?? slot.videoId,
          )
          .filter((id) => merged.has(id)),
      ),
    ];
    memberIds = [
      ...ordered,
      ...[...merged].filter((id) => !ordered.includes(id)),
    ];
  }
  const addedAt = {};
  for (const trackId of memberIds) {
    addedAt[trackId] = previous.addedAt?.[trackId] || now;
  }
  next[existingIndex] = {
    ...reconcileReleaseMembership(previous, memberIds),
    addedAt,
  };
  if (releaseObservations !== undefined) {
    next[existingIndex] = observeReleaseInfo(
      next[existingIndex],
      previous.source?.platform !== validSource?.platform &&
        previous.releaseInfo?.catalog
        ? Object.fromEntries(
            Object.entries(releaseObservations).map(([key, fact]) => [
              key,
              fact?.provenance?.provider === validSource.platform &&
              fact.provenance.sourceId === previous.source.id
                ? {
                    ...fact,
                    provenance: {
                      ...fact.provenance,
                      provider: previous.source.platform,
                    },
                  }
                : fact,
            ]),
          )
        : releaseObservations,
    );
  }
  writePlaylists(dir, next);
  return next;
}

// Manual conversion between kinds — the escape hatch when the automatic
// heuristic (albumClassifier.js) gets an existing collection wrong.
// Deliberately does not touch name/trackIds/addedAt/source.
function setPlaylistKind(dir, id, kind, { bindings } = {}) {
  const playlists = loadPlaylists(dir);
  const index = playlists.findIndex((p) => p.id === id);
  if (index === -1 || !PLAYLIST_KINDS.has(kind)) return playlists;
  if (playlists[index].kind === kind) return playlists;

  const next = [...playlists];
  const previous = next[index];
  const releaseInfo =
    previous.releaseInfo ??
    createReleaseInfo(
      previous,
      kind === 'album' && !previous.source ? bindings : undefined,
    );
  next[index] = {
    ...previous,
    kind,
    ...(releaseInfo
      ? { releaseInfo: { ...releaseInfo, revision: releaseInfo.revision + 1 } }
      : {}),
  };
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

function setPlaylistDescription(dir, id, description) {
  const playlists = loadPlaylists(dir);
  const index = playlists.findIndex((p) => p.id === id);
  if (index === -1) return playlists;

  const next = [...playlists];
  next[index] = {
    ...next[index],
    description:
      typeof description === 'string'
        ? description.slice(0, MAX_DESCRIPTION_LENGTH)
        : '',
  };
  writePlaylists(dir, next);
  return next;
}

// filename is a bare basename like 'cover.jpg' (see
// electron/lib/library/playlistCovers.js's writePlaylistCoverFile, the only
// writer of that directory), or null/falsy
// to clear back to the derived track-thumbnail collage.
function setPlaylistCover(dir, id, filename) {
  const playlists = loadPlaylists(dir);
  const index = playlists.findIndex((p) => p.id === id);
  if (index === -1) return playlists;

  const next = [...playlists];
  const previous = next[index];
  if (filename) {
    next[index] = { ...previous, coverImage: filename };
  } else {
    const updated = { ...previous };
    delete updated.coverImage;
    next[index] = updated;
  }
  writePlaylists(dir, next);
  return next;
}

// Pure string builder, no filesystem access — filename must already be a
// validated bare basename (see electron/lib/library/playlistCovers.js's
// resolvePlaylistCoverPath, the read-side counterpart that re-checks it
// against what's actually on disk).
function buildPlaylistCoverUrl(playlistId, filename) {
  return `utawakui-media://playlist-cover/${encodeURIComponent(playlistId)}/${encodeURIComponent(filename)}`;
}

function deletePlaylist(dir, id) {
  const playlists = loadPlaylists(dir);
  if (!playlists.some((p) => p.id === id)) return playlists;

  const next = playlists.filter((p) => p.id !== id);
  writePlaylists(dir, next);
  return next;
}

// Single write path. Preserve orphan ids so transient drive failures cannot
// wipe playlists; missing tracks simply do not render until repaired.
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

// Session export is a single populated write. The stable operation key makes
// a lost IPC reply retry safe without creating another empty user playlist.
function savePerformancePlaylist(dir, { name, trackIds, exportKey } = {}) {
  const fail = () =>
    Object.assign(new Error('無法保存演出歌單，請檢查名稱與曲目預覽。'), {
      code: 'SESSION_PLAYLIST_INVALID',
      field: null,
      publicValidation: true,
    });
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > MAX_NAME_LENGTH ||
    hasControlCharacters(name) ||
    !Array.isArray(trackIds) ||
    !trackIds.length ||
    trackIds.length > MAX_TRACKS_PER_PLAYLIST ||
    !trackIds.every(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 256,
    ) ||
    typeof exportKey !== 'string' ||
    !/^[a-f0-9]{64}$/.test(exportKey)
  )
    throw fail();
  const playlists = loadPlaylists(dir);
  const existing = playlists.find((p) => p.performanceExportKey === exportKey);
  if (existing) return { playlistId: existing.id, playlists };
  if (playlists.length >= MAX_PLAYLISTS) throw fail();
  const now = new Date().toISOString(),
    ids = [...new Set(trackIds)];
  const playlist = {
    id: crypto.randomUUID(),
    name: name.trim(),
    kind: 'playlist',
    trackIds: ids,
    addedAt: Object.fromEntries(ids.map((id) => [id, now])),
    performanceExportKey: exportKey,
  };
  const next = [...playlists, playlist];
  writePlaylists(dir, next);
  return { playlistId: playlist.id, playlists: next };
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

  next[index] = {
    ...reconcileReleaseMembership(previous, sanitizedTrackIds),
    addedAt,
  };
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
      ...reconcileReleaseMembership(
        playlist,
        playlist.trackIds.filter((id) => id !== trackId),
      ),
      addedAt: Object.fromEntries(
        Object.entries(playlist.addedAt).filter(([id]) => id !== trackId),
      ),
    };
  });

  if (!changed) return playlists;
  writePlaylists(dir, next);
  return next;
}

// One-time migration for collections that predate the kind field: stamps
// kind: 'album' | 'playlist' from each collection's members' album metadata.
// Gated on the raw on-disk version (loadPlaylists does not track it), the same
// pattern as migrateTrackAlbumMetadata in library/metadataIndex.js. The shared
// writer requires a pre-migration backup. `classify` is injected
// (classifyCollectionKind) so this module holds no album-detection knowledge.
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
    (typeof data.version === 'number' && data.version >= PLAYLIST_KINDS_VERSION)
  ) {
    return false;
  }

  const resolvedTracksById =
    typeof tracksById === 'function' ? tracksById() : tracksById;
  if (!(resolvedTracksById instanceof Map)) return false;

  const playlists = data.playlists
    .map(sanitizePlaylist)
    .filter((playlist) => playlist !== null);

  const next = playlists.map((playlist) => {
    // Already has real provenance (shouldn't happen pre-migration, but
    // trust it over the heuristic rather than second-guessing it).
    if (playlist.source) return playlist;
    const memberTracks = playlist.trackIds
      .map((id) => resolvedTracksById.get(id))
      .filter(Boolean);
    return { ...playlist, kind: classify(memberTracks) };
  });

  writePlaylists(dir, next);
  return true;
}

// Main-only data operation. IPC admission and binding resolution are separate
// P2 responsibilities; this never accepts a renderer-provided source or path.
function updatePlaylistReleaseInfo(dir, id, intent, options = {}) {
  const playlists = loadPlaylists(dir);
  const index = playlists.findIndex((playlist) => playlist.id === id);
  if (index === -1) throw new Error('Release collection not found');
  const previous = playlists[index];
  const updated = updateReleaseInfo(previous, intent, options);
  if (updated === previous) return playlists;
  const next = [...playlists];
  next[index] = updated;
  writePlaylists(dir, next);
  return next;
}

// Main-only fill operation. Re-read at commit time; source identity and manual
// overrides win even when they changed while acquisition was running. For v3,
// patch raw rows so maintenance cannot normalize unrelated user data.
function fillPlaylistReleaseMetadata(dir, updates) {
  assertNoTransaction(dir);
  const document = readPlaylistDocument(dir);
  if (!document) return [];
  const raw = document.version >= 3;
  const playlists = raw ? document.data.playlists : loadPlaylists(dir);
  const changedIds = [];
  const next = playlists.map((entry) => {
    const collection = sanitizePlaylist(entry);
    if (collection?.kind !== 'album' || !collection.source) return entry;
    const update = updates.find(
      (candidate) =>
        candidate.collectionId === collection.id &&
        candidate.source?.id === collection.source.id &&
        candidate.source?.platform === collection.source.platform,
    );
    if (!update) return entry;
    const previous = collection.releaseInfo ?? createReleaseInfo(collection);
    const patch = {};
    for (const field of ['type', 'date']) {
      if (Object.hasOwn(previous.overrides, field)) continue;
      const saved = previous.observed[field]?.value;
      if (field === 'type' ? saved && saved !== 'unknown' : saved != null)
        continue;
      if (update.observed[field]) patch[field] = update.observed[field];
    }
    if (!Object.keys(patch).length) return entry;
    const updated = observeReleaseInfo(collection, patch);
    if (updated.releaseInfo.revision === previous.revision) return entry;
    changedIds.push(collection.id);
    return { ...entry, releaseInfo: updated.releaseInfo };
  });
  if (changedIds.length) {
    if (raw) {
      if (document.version < PLAYLISTS_VERSION)
        fs.copyFileSync(
          path.join(dir, PLAYLISTS_FILENAME),
          path.join(
            dir,
            `${PLAYLISTS_FILENAME}.backup-v${document.version}-${Date.now()}`,
          ),
          fs.constants.COPYFILE_EXCL,
        );
      atomicWriteJson(path.join(dir, PLAYLISTS_FILENAME), {
        ...document.data,
        version: PLAYLISTS_VERSION,
        playlists: next,
      });
    } else writePlaylists(dir, next);
  }
  return changedIds;
}

// Main-owned atomic creation: never persist an intermediate empty playlist.
function createLocalRelease(dir, { name, trackId, binding } = {}) {
  const invalid = () =>
    Object.assign(new Error('Invalid local release.'), {
      code: 'RELEASE_INFO_INVALID',
    });
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > MAX_NAME_LENGTH ||
    hasControlCharacters(name) ||
    !isBoundedTrackId(trackId)
  )
    throw invalid();
  const playlists = loadPlaylists(dir);
  if (playlists.length >= MAX_PLAYLISTS)
    throw Object.assign(new Error('Release collection limit reached.'), {
      code: 'RELEASE_LIMIT_REACHED',
    });
  const playlist = {
    id: crypto.randomUUID(),
    name: name.trim(),
    kind: 'album',
    trackIds: [trackId],
    addedAt: { [trackId]: new Date().toISOString() },
  };
  playlist.releaseInfo = {
    ...createReleaseInfo(playlist, { [trackId]: binding }),
    overrides: { type: 'single' },
    leadTrackId: trackId,
  };
  validateReleaseInfo(playlist.releaseInfo, playlist);
  const next = [...playlists, playlist];
  writePlaylists(dir, next);
  return { playlistId: playlist.id, playlists: next };
}

module.exports = {
  loadCatalogCollections,
  resolvePlaylistId,
  writeReleaseCatalog,
  buildPlaylistCoverUrl,
  createPlaylist,
  createLocalRelease,
  deletePlaylist,
  loadPlaylists,
  migratePlaylistKinds,
  PLAYLISTS_FILENAME,
  reorderPlaylists,
  removeTrackFromAllPlaylists,
  renamePlaylist,
  setPlaylistCover,
  setPlaylistDescription,
  setPlaylistKind,
  setPlaylistTracks,
  savePerformancePlaylist,
  upsertAlbum,
  updatePlaylistReleaseInfo,
  fillPlaylistReleaseMetadata,
};

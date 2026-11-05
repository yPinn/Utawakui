'use strict';

// Lazy so the catalog loads only when a message is built.
const t = (key, named) => require('./i18n').t(key, named);
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
const MAX_FOLDERS = 200;

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
// `layout`: undefined keeps the stored folders, null removes them.
function writePlaylists(dir, playlists, reconciliation, layout) {
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
  const base = { ...previous?.data };
  if (layout === null) delete base.layout;
  atomicWriteJson(path.join(dir, PLAYLISTS_FILENAME), {
    ...base,
    version: PLAYLISTS_VERSION,
    ...(reconciliation ? { reconciliation } : {}),
    ...(layout ? { layout } : {}),
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

// Default names use the language active when the playlist is created.
function nextDefaultPlaylistName(playlists) {
  const prefix = t('playlist.defaultNamePrefix');
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const used = new Set();
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);
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
  return `${prefix}${index}`;
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

// Sidebar folders: one level, each an ordered list of user playlists. A
// playlist sits in at most one folder or loose at the top level; albums stay
// in the library tier (dropping one into a folder copies it as a new
// playlist). `layout.order` places folders among loose playlists. Additive
// fields, so older builds read the file and keep them untouched.
// Folder colours rotate through the theme's three highlighter hues; each
// folder keeps the one it was created with.
const FOLDER_COLORS = 3;

function sanitizeFolder(entry, index) {
  if (typeof entry !== 'object' || entry === null) return null;
  if (typeof entry.id !== 'string' || entry.id.length === 0) return null;
  return {
    id: entry.id,
    name:
      typeof entry.name === 'string'
        ? entry.name.slice(0, MAX_NAME_LENGTH)
        : '',
    collapsed: entry.collapsed === true,
    color:
      Number.isInteger(entry.color) &&
      entry.color >= 0 &&
      entry.color < FOLDER_COLORS
        ? entry.color
        : index % FOLDER_COLORS,
  };
}

// `storedPlaylists` covers the first format, where a playlist named its
// folder and folders had no member list.
function resolveLayout(raw, playlists, storedPlaylists = []) {
  const stored = typeof raw === 'object' && raw !== null ? raw : {};
  const userIds = new Set(
    playlists
      .filter((entry) => entry.kind !== 'album')
      .map((entry) => entry.id),
  );
  const placed = new Set();
  const folders = [];
  const folderIds = new Set();
  for (const entry of Array.isArray(stored.folders) ? stored.folders : []) {
    const folder = sanitizeFolder(entry, folders.length);
    if (!folder || folderIds.has(folder.id)) continue;
    if (folders.length >= MAX_FOLDERS) break;
    const source = Array.isArray(entry.items)
      ? entry.items
      : storedPlaylists
          .filter((item) => item?.folderId === folder.id)
          .map((item) => item.id);
    const items = source.filter((id) => {
      if (!userIds.has(id) || placed.has(id)) return false;
      placed.add(id);
      return true;
    });
    folders.push({ ...folder, items });
    folderIds.add(folder.id);
  }
  const loose = [...userIds].filter((id) => !placed.has(id));
  const allowed = new Set([...folderIds, ...loose]);
  const order = [];
  const seen = new Set();
  for (const id of Array.isArray(stored.order) ? stored.order : []) {
    if (!allowed.has(id) || seen.has(id)) continue;
    order.push(id);
    seen.add(id);
  }
  for (const id of [...loose, ...folderIds]) {
    if (!seen.has(id)) order.push(id);
  }
  return { folders, order };
}

function readFolderState(dir) {
  const document = readPlaylistDocument(dir);
  const playlists = loadPlaylists(dir);
  const layout = resolveLayout(
    document?.data.layout,
    playlists,
    document?.data.playlists ?? [],
  );
  const items = new Map(layout.folders.map((folder) => [folder.id, folder]));
  const tree = layout.order.map((id) =>
    items.has(id) ? { id, children: [...items.get(id).items] } : { id },
  );
  return { playlists, layout, tree };
}

function loadPlaylistLayout(dir) {
  return readFolderState(dir).layout;
}

// User playlist slots follow the sidebar so other playlist lists keep the
// same order; album slots never move.
function writeFolderTree(dir, playlists, folders, tree) {
  const childrenOf = new Map(
    tree
      .filter((node) => node.children)
      .map((node) => [node.id, node.children]),
  );
  const stored = {
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      collapsed: folder.collapsed,
      color: folder.color,
      items: childrenOf.get(folder.id) ?? [],
    })),
    order: tree.map((node) => node.id),
  };
  const flat = tree.flatMap((node) => node.children ?? [node.id]);
  const byId = new Map(playlists.map((entry) => [entry.id, entry]));
  const slots = new Set(flat);
  let cursor = 0;
  const next = playlists.map((entry) =>
    slots.has(entry.id) ? byId.get(flat[cursor++]) : entry,
  );
  writePlaylists(dir, next, undefined, folders.length ? stored : null);
  return { playlists: next, layout: resolveLayout(stored, next) };
}

function nextDefaultFolderName(folders) {
  const base = t('playlist.folder.defaultName');
  const used = new Set(folders.map((folder) => folder.name));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function createPlaylistFolder(dir, name) {
  const { playlists, layout, tree } = readFolderState(dir);
  if (layout.folders.length >= MAX_FOLDERS) return { playlists, layout };
  const trimmed =
    typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
  const previous = layout.folders.at(-1);
  const folder = {
    id: crypto.randomUUID(),
    name: trimmed || nextDefaultFolderName(layout.folders),
    collapsed: true,
    color: previous ? (previous.color + 1) % FOLDER_COLORS : 0,
  };
  return writeFolderTree(
    dir,
    playlists,
    [...layout.folders, folder],
    [...tree, { id: folder.id, children: [] }],
  );
}

function updatePlaylistFolder(dir, id, patch) {
  const { playlists, layout, tree } = readFolderState(dir);
  const index = layout.folders.findIndex((folder) => folder.id === id);
  if (index === -1) return { playlists, layout };
  const updated = { ...layout.folders[index], ...patch };
  if (
    updated.name === layout.folders[index].name &&
    updated.collapsed === layout.folders[index].collapsed
  ) {
    return { playlists, layout };
  }
  const folders = [...layout.folders];
  folders[index] = updated;
  return writeFolderTree(dir, playlists, folders, tree);
}

// A blank name keeps the current one; an unnamed folder row would vanish.
function renamePlaylistFolder(dir, id, name) {
  const trimmed =
    typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
  if (!trimmed) return readFolderState(dir);
  return updatePlaylistFolder(dir, id, { name: trimmed });
}

function setPlaylistFolderCollapsed(dir, id, collapsed) {
  return updatePlaylistFolder(dir, id, { collapsed: collapsed === true });
}

// Only one folder stays open in place: opening one closes the rest, and
// `null` closes them all.
function expandPlaylistFolder(dir, id) {
  const { playlists, layout, tree } = readFolderState(dir);
  if (id !== null && !layout.folders.some((folder) => folder.id === id)) {
    return { playlists, layout };
  }
  const folders = layout.folders.map((folder) => ({
    ...folder,
    collapsed: folder.id !== id,
  }));
  if (
    folders.every(
      (folder, index) => folder.collapsed === layout.folders[index].collapsed,
    )
  ) {
    return { playlists, layout };
  }
  return writeFolderTree(dir, playlists, folders, tree);
}

// The folder goes together with its playlists; a playlist the user wants
// to keep is moved out first. `deletedIds` lets callers clear their files.
function deletePlaylistFolder(dir, id) {
  const { playlists, layout, tree } = readFolderState(dir);
  const folder = layout.folders.find((entry) => entry.id === id);
  if (!folder) return { playlists, layout, deletedIds: [] };
  const deleted = new Set(folder.items);
  const result = writeFolderTree(
    dir,
    playlists.filter((playlist) => !deleted.has(playlist.id)),
    layout.folders.filter((entry) => entry.id !== id),
    tree.filter((node) => node.id !== id),
  );
  return { ...result, deletedIds: [...deleted] };
}

// Rows arrive as an id or `{ id }`.
function rowId(value) {
  const id = typeof value === 'string' ? value : value?.id;
  return typeof id === 'string' && id ? id : null;
}

function locateNode(tree, id) {
  for (let index = 0; index < tree.length; index += 1) {
    if (tree[index].id === id) return { index };
    const child = tree[index].children?.indexOf(id) ?? -1;
    if (child !== -1) return { index, child };
  }
  return null;
}

// position: 'before' | 'after' a row, or 'inside' (end of) a folder. A
// playlist dropped next to a folder member joins that folder; folders stay
// top-level, so a folder dropped on a member lands beside its folder.
function movePlaylistItem(dir, draggedValue, targetValue, position = 'before') {
  const { playlists, layout, tree } = readFolderState(dir);
  const unchanged = { playlists, layout };
  const draggedId = rowId(draggedValue);
  const targetId = rowId(targetValue);
  if (!draggedId || !targetId || draggedId === targetId) return unchanged;
  if (!['before', 'after', 'inside'].includes(position)) return unchanged;
  const from = locateNode(tree, draggedId);
  const to = locateNode(tree, targetId);
  if (!from || !to) return unchanged;
  const targetIsFolder =
    to.child === undefined && Boolean(tree[to.index].children);
  const draggingFolder =
    from.child === undefined && Boolean(tree[from.index].children);
  if (position === 'inside' && (!targetIsFolder || draggingFolder)) {
    return unchanged;
  }
  if (draggingFolder && tree[to.index].id === draggedId) return unchanged;

  const next = tree.map((node) =>
    node.children ? { id: node.id, children: [...node.children] } : node,
  );
  let moved = { id: draggedId };
  if (from.child === undefined) [moved] = next.splice(from.index, 1);
  else next[from.index].children.splice(from.child, 1);

  const offset = position === 'after' ? 1 : 0;
  if (position === 'inside') {
    next.find((node) => node.id === targetId).children.push(draggedId);
  } else if (draggingFolder || to.child === undefined) {
    const anchorId = draggingFolder ? tree[to.index].id : targetId;
    const anchor = next.findIndex((node) => node.id === anchorId);
    next.splice(anchor + offset, 0, moved);
  } else {
    const folder = next.find((node) => node.id === tree[to.index].id);
    const anchor = folder.children.indexOf(targetId);
    folder.children.splice(anchor + offset, 0, draggedId);
  }

  if (JSON.stringify(next) === JSON.stringify(tree)) return unchanged;
  return writeFolderTree(dir, playlists, layout.folders, next);
}

// A new playlist placed next to a sidebar row, empty or already filled (an
// album copied into a folder). It stays loose when the target is gone.
function createPlaylistAt(
  dir,
  { name, trackIds = [], target, position = 'inside' } = {},
) {
  const playlists = loadPlaylists(dir);
  if (playlists.length >= MAX_PLAYLISTS) {
    const { layout } = readFolderState(dir);
    return { playlists, layout, createdId: null };
  }
  const trimmed =
    typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '';
  const ids = [
    ...new Set(
      (Array.isArray(trackIds) ? trackIds : []).filter(
        (id) => typeof id === 'string' && id.length > 0,
      ),
    ),
  ].slice(0, MAX_TRACKS_PER_PLAYLIST);
  const now = new Date().toISOString();
  const playlist = {
    id: crypto.randomUUID(),
    name: trimmed || nextDefaultPlaylistName(playlists),
    kind: DEFAULT_PLAYLIST_KIND,
    trackIds: ids,
    addedAt: Object.fromEntries(ids.map((id) => [id, now])),
  };
  writePlaylists(dir, [...playlists, playlist]);
  const placed = movePlaylistItem(dir, playlist.id, target, position);
  return {
    playlists: placed.playlists,
    layout: placed.layout,
    createdId: playlist.id,
  };
}

// Single write path. Preserve orphan ids so transient drive failures cannot
// wipe playlists; missing tracks simply do not render until repaired.
function reorderPlaylists(dir, draggedId, targetId, position = 'before') {
  return movePlaylistItem(dir, draggedId, targetId, position).playlists;
}

// Session export is a single populated write. The stable operation key makes
// a lost IPC reply retry safe without creating another empty user playlist.
function savePerformancePlaylist(dir, { name, trackIds, exportKey } = {}) {
  const fail = () =>
    Object.assign(new Error(t('session.main.playlistInvalid')), {
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
  createPlaylistAt,
  createPlaylistFolder,
  deletePlaylistFolder,
  expandPlaylistFolder,
  loadPlaylistLayout,
  movePlaylistItem,
  renamePlaylistFolder,
  setPlaylistFolderCollapsed,
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

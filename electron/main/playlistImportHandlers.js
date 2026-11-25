'use strict';

const { randomUUID } = require('node:crypto');
const {
  createPlaylistAt,
  loadPlaylists,
  setPlaylistTracks,
} = require('../lib/playlists');
const { hasControlCharacters } = require('../lib/textGuards');
const { t } = require('../lib/i18n');
const { PlatformVideoError } = require('../lib/youtubeDesktopAuthorization');
const {
  buildPlaylistImportRows,
  readSpotifyPlaylistFile,
} = require('../lib/playlistImport');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');
const { spotifyPlaylistId } = require('../lib/spotifyPlaylistReader');

const REVIEW_TTL = 15 * 60 * 1000;

function requireImport(condition, code = 'STALE') {
  if (!condition) throw new PlatformVideoError(code);
}

function registerPlaylistImportHandlers({
  ipcMain,
  dialog,
  getMainWindow,
  getLibraryScope,
  listLibraryTracks,
  platformVideos,
  getSpotifyAuthorizedAt = () => null,
  spotify = { configured: false },
  searchPlaylistTrack,
  recordDiagnostic,
  readSpotifyFile = readSpotifyPlaylistFile,
  createPlaylist = createPlaylistAt,
}) {
  let draft = null;
  let draftTimer;
  let spotifyBinding = null;
  const accepted = new Map();

  function clear(current) {
    if (current !== draft) return;
    clearTimeout(draftTimer);
    current?.controller?.abort();
    draft = null;
  }

  function currentDraft(id) {
    requireImport(draft && draft.id === id);
    const scope = getLibraryScope();
    requireImport(
      draft.scope.dir === scope.dir && draft.scope.epoch === scope.epoch,
    );
    if (draft.source === 'youtube')
      platformVideos.assertPlaylistAuthorization(draft.authorization);
    return draft;
  }

  async function begin(source, input) {
    const useOtherAccount = input?.oneTime === true;
    const playlistId =
      source === 'spotify-link'
        ? spotifyPlaylistId(typeof input === 'string' ? input : input?.link)
        : null;
    if (source === 'spotify-link') {
      requireImport(spotify.configured, 'SPOTIFY_NOT_CONFIGURED');
      requireImport(playlistId, 'SPOTIFY_LINK');
    }
    clear(draft);
    const current = { id: randomUUID(), scope: getLibraryScope() };
    draft = current;
    draftTimer = setTimeout(() => clear(current), REVIEW_TTL);
    draftTimer.unref();
    try {
      if (source === 'spotify-link') {
        current.controller = new AbortController();
        current.lists = [
          await spotify.readPlaylist(
            playlistId,
            current.controller.signal,
            useOtherAccount,
          ),
        ];
        current.controller = null;
      } else if (source === 'spotify') {
        const picked = await dialog.showOpenDialog(
          getMainWindow() ?? undefined,
          {
            properties: ['openFile'],
            filters: [
              {
                name: t('import.playlists.spotifyFile'),
                extensions: ['json', 'csv'],
              },
            ],
          },
        );
        currentDraft(current.id);
        if (picked.canceled || !picked.filePaths?.[0]) {
          clear(current);
          return null;
        }
        current.lists = await readSpotifyFile(picked.filePaths[0]);
        requireImport(current.lists, 'FILE');
      } else {
        const result = await platformVideos.listYoutubePlaylists();
        current.lists = result.entries;
        current.authorization = result.revision;
        current.truncated = result.truncated;
      }
      current.source = source;
      currentDraft(current.id);
      return {
        id: current.id,
        entries: current.lists.map(({ id, name }) => ({ id, name })),
        truncated: Boolean(current.truncated),
      };
    } catch (error) {
      clear(current);
      throw error;
    }
  }

  async function preview({ id, entryId } = {}) {
    const current = currentDraft(id);
    requireImport(!current.saved && !current.pending);
    const entry = current.lists?.find((entry) => entry.id === entryId);
    requireImport(entry);
    current.pending = true;
    current.preview = null;
    try {
      const { tracks, truncated } =
        current.source === 'youtube'
          ? await platformVideos.readYoutubePlaylist(
              entry.id,
              current.authorization,
            )
          : entry;
      currentDraft(id);
      const rows = buildPlaylistImportRows(
        tracks,
        listLibraryTracks(current.scope.dir),
      );
      const token = randomUUID();
      current.preview = {
        token,
        tracks,
        rows,
        canSearch: current.source !== 'youtube',
        remote: new Map(),
        candidates: rows.map(({ candidates }) =>
          candidates.map(({ id }) => id),
        ),
      };
      return { token, rows, truncated, canSearch: current.preview.canSearch };
    } finally {
      current.pending = false;
    }
  }

  async function find({ id, token, index } = {}) {
    const current = currentDraft(id);
    const review = current.preview;
    requireImport(
      review && review.token === token && review.canSearch && !current.accepted,
    );
    const track = Number.isSafeInteger(index) && review.tracks[index];
    requireImport(
      track?.title && !track.unavailable && !current.finding,
      'SELECTION',
    );
    current.finding = true;
    try {
      const result = await searchPlaylistTrack(track);
      requireImport(currentDraft(id).preview === review);
      const options = (result.candidates ?? []).flatMap((candidate) => {
        const id = candidate.playbackVideoId || candidate.id;
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/u.test(id))
          return [];
        return [
          {
            id,
            title: candidate.title,
            artist: candidate.artist,
            album: candidate.album,
            duration: candidate.duration,
            playbackKind: candidate.playbackKind,
            remote: true,
          },
        ];
      });
      review.remote.set(index, options);
      return options;
    } finally {
      current.finding = false;
    }
  }

  function accept({ id, token, name, selections } = {}) {
    const current = currentDraft(id);
    const review = current.preview;
    requireImport(
      review && review.token === token && review.canSearch && !current.finding,
    );
    if (current.accepted && accepted.has(current.accepted))
      return accepted.get(current.accepted).plan;
    requireImport(
      Array.isArray(selections) &&
        selections.length === review.rows.length &&
        typeof name === 'string' &&
        name.trim() &&
        name.trim().length <= 200 &&
        !hasControlCharacters(name),
      'SELECTION',
    );
    const available = new Set(
      listLibraryTracks(current.scope.dir).map(({ id }) => id),
    );
    const chosen = new Map();
    for (const [index, selected] of selections.entries()) {
      if (selected === '') continue;
      const option =
        review.rows[index].candidates.find(
          (option) => option.id === selected,
        ) ?? review.remote.get(index)?.find((option) => option.id === selected);
      requireImport(
        option && (option.remote || available.has(selected)),
        'SELECTION',
      );
      if (!chosen.has(selected))
        chosen.set(selected, {
          ...option,
          alreadyDownloaded: available.has(selected),
        });
    }
    requireImport(chosen.size > 0 && chosen.size <= 500, 'SELECTION');
    requireImport(accepted.size < 50, 'BATCH_LIMIT');
    const plan = {
      id: randomUUID(),
      title: name.trim(),
      libraryEpoch: current.scope.epoch,
      tracks: [...chosen.values()],
    };
    current.accepted = plan.id;
    accepted.set(plan.id, {
      plan,
      scope: current.scope,
      playlistId: null,
      savedIds: [],
    });
    return plan;
  }

  function finalize(batchId) {
    const batch = accepted.get(batchId);
    const scope = getLibraryScope();
    requireImport(
      batch &&
        batch.scope.dir === scope.dir &&
        batch.scope.epoch === scope.epoch,
    );
    const available = new Set(listLibraryTracks(scope.dir).map(({ id }) => id));
    const trackIds = batch.plan.tracks
      .map(({ id }) => id)
      .filter((id) => available.has(id));
    if (batch.playlistId) {
      const current = loadPlaylists(scope.dir).find(
        ({ id }) => id === batch.playlistId,
      );
      requireImport(
        current &&
          current.kind === 'playlist' &&
          current.trackIds.length === batch.savedIds.length &&
          current.trackIds.every((id, index) => id === batch.savedIds[index]),
        'BATCH_CHANGED',
      );
      if (
        trackIds.length !== batch.savedIds.length ||
        trackIds.some((id, index) => id !== batch.savedIds[index])
      )
        setPlaylistTracks(scope.dir, batch.playlistId, trackIds);
    } else if (trackIds.length) {
      const result = createPlaylist(scope.dir, {
        name: batch.plan.title,
        trackIds,
      });
      requireImport(result.createdId, 'LIMIT');
      batch.playlistId = result.createdId;
    }
    batch.savedIds = trackIds;
    return { playlistId: batch.playlistId };
  }

  function save({ id, token, name, selections } = {}) {
    const current = currentDraft(id);
    if (current.saved?.token === token)
      return { playlistId: current.saved.playlistId };
    const review = current.preview;
    requireImport(!current.accepted);
    requireImport(review && token === review.token);
    requireImport(
      typeof name === 'string' &&
        name.trim() &&
        name.trim().length <= 200 &&
        !hasControlCharacters(name) &&
        Array.isArray(selections) &&
        selections.length === review.candidates.length &&
        selections.every(
          (selected, index) =>
            selected === '' || review.candidates[index].includes(selected),
        ),
      'SELECTION',
    );
    const trackIds = [...new Set(selections.filter(Boolean))];
    requireImport(trackIds.length, 'SELECTION');
    const available = new Set(
      listLibraryTracks(current.scope.dir).map(({ id }) => id),
    );
    requireImport(trackIds.every((id) => available.has(id)));
    const result = createPlaylist(current.scope.dir, { name, trackIds });
    requireImport(result.createdId, 'LIMIT');
    current.saved = { token, playlistId: result.createdId };
    current.lists = null;
    current.preview = null;
    return { playlistId: result.createdId };
  }

  ipcMain.handle('playlist-import:clear', (_event, id) => {
    if (draft?.id === id) clear(draft);
  });
  const spotifyStatus = () => ({
    configured: spotify.configured,
    lastAuthorizedAt: getSpotifyAuthorizedAt(),
    profile: null,
    ...spotify.getAccountStatus?.(),
  });
  ipcMain.handle('playlist-import:spotify-status', spotifyStatus);
  ipcMain.handle('playlist-import:cancel-spotify-bind', () =>
    spotifyBinding?.abort(),
  );
  ipcMain.handle('playlist-import:clear-spotify-profile', () => {
    spotify.clearProfile?.();
  });
  ipcMain.handle('playlist-import:cancel-spotify', () => {
    if (draft?.controller) clear(draft);
  });
  ipcMain.handle('playlist-import:release', (_event, id) => {
    accepted.delete(id);
    if (draft?.accepted === id) draft.accepted = null;
  });
  const actions = {
    'bind-spotify': async () => {
      requireImport(!spotifyBinding, 'busy');
      const controller = new AbortController();
      spotifyBinding = controller;
      try {
        await spotify.connect(controller.signal);
        return spotifyStatus();
      } finally {
        spotifyBinding = null;
      }
    },
    'unbind-spotify': () => {
      requireImport(!spotifyBinding, 'busy');
      spotify.disconnect();
      return spotifyStatus();
    },
    'choose-spotify': () => begin('spotify'),
    'list-youtube': () => begin('youtube'),
    'spotify-link': (input) => begin('spotify-link', input),
    preview,
    find,
    accept,
    finalize,
    save,
  };
  for (const [operation, action] of Object.entries(actions)) {
    ipcMain.handle(`playlist-import:${operation}`, (_event, payload) =>
      runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'playlist-import',
            operation,
            code: 'PLAYLIST_IMPORT_FAILED',
          },
          publicError: { code: 'PLAYLIST_IMPORT_FAILED' },
        },
        async () => {
          try {
            return { ok: true, value: await action(payload) };
          } catch (error) {
            if (
              operation === 'find' &&
              ['FEATURE_DEPENDENCY_MISSING', 'PROVIDER_SEARCH_FAILED'].includes(
                error?.code,
              ) &&
              typeof error.publicMessage === 'string'
            ) {
              return {
                ok: false,
                error: {
                  code: error.code,
                  message: error.publicMessage,
                  context: error.context,
                },
              };
            }
            if (!(error instanceof PlatformVideoError)) throw error;
            const bindingError =
              operation === 'bind-spotify' &&
              ['SPOTIFY_ACCESS', 'SPOTIFY_UNAVAILABLE'].includes(error.code);
            const messageCode = {
              STALE: 'PLAYLIST_IMPORT_STALE',
              FILE: 'PLAYLIST_IMPORT_FILE',
              SELECTION: 'PLAYLIST_IMPORT_SELECTION',
              LIMIT: 'PLAYLIST_IMPORT_LIMIT',
              BATCH_LIMIT: 'PLAYLIST_IMPORT_BATCH_LIMIT',
              BATCH_CHANGED: 'PLAYLIST_IMPORT_BATCH_CHANGED',
              SPOTIFY_LINK: 'PLAYLIST_IMPORT_SPOTIFY_LINK',
              SPOTIFY_BIND_FAILED: 'PLAYLIST_IMPORT_SPOTIFY_BIND_FAILED',
              SPOTIFY_NOT_CONFIGURED: 'PLAYLIST_IMPORT_SPOTIFY_NOT_CONFIGURED',
              SPOTIFY_ACCESS: 'PLAYLIST_IMPORT_SPOTIFY_ACCESS',
              SPOTIFY_UNAVAILABLE: 'PLAYLIST_IMPORT_SPOTIFY_UNAVAILABLE',
              SPOTIFY_RATE: 'PLAYLIST_IMPORT_SPOTIFY_RATE',
              SPOTIFY_RECONNECT: 'PLAYLIST_IMPORT_SPOTIFY_RECONNECT',
              busy: 'PLATFORM_VIDEO_BUSY',
              cancelled: 'PLATFORM_VIDEO_CANCELLED',
              timedOut: 'PLAYLIST_IMPORT_SPOTIFY_TIMEOUT',
              authRequired: 'PLATFORM_VIDEO_AUTH_REQUIRED',
              notConfigured: 'PLATFORM_VIDEO_NOT_CONFIGURED',
              unavailable: 'PLATFORM_VIDEO_UNAVAILABLE',
              secureStorage: 'PLATFORM_VIDEO_SECURE_STORAGE',
            }[bindingError ? 'SPOTIFY_BIND_FAILED' : error.code];
            if (!messageCode) throw error;
            return {
              ok: false,
              error: {
                code: messageCode,
                message: t(`errors.${messageCode}.message`),
              },
            };
          }
        },
      ),
    );
  }
}

module.exports = { registerPlaylistImportHandlers };

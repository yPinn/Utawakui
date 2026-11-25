import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPlaylists, setPlaylistTracks } from '../lib/playlists.js';
import { registerPlaylistImportHandlers } from './playlistImportHandlers.js';

const { PlatformVideoError } = createRequire(import.meta.url)(
  '../lib/youtubeDesktopAuthorization.js',
);

let directory;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'playlist-import-'));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

const tracks = [
  { id: 'track_a', title: 'First', artist: 'Artist', album: 'Album' },
  { id: 'track_live', title: 'First', artist: 'Artist', album: 'Live album' },
  { id: 'abcdefghijk', title: 'Video saved locally' },
];
function setup(overrides = {}) {
  const filePath = path.join(directory, 'Playlist1.json');
  const scope = { dir: directory, epoch: 1 };
  const handlers = new Map();
  const platformVideos = {
    listYoutubePlaylists: vi.fn(async () => ({
      entries: [{ id: 'PL_owned', name: 'Private' }],
      revision: 7,
    })),
    readYoutubePlaylist: vi.fn(async () => ({
      tracks: [{ videoId: 'abcdefghijk', title: 'Official video' }],
    })),
    assertPlaylistAuthorization: vi.fn(),
  };
  const listLibraryTracks = vi.fn(() => tracks);
  const showOpenDialog = vi.fn(async () => ({ filePaths: [filePath] }));
  const searchPlaylistTrack = vi.fn();
  registerPlaylistImportHandlers({
    ipcMain: { handle: (name, action) => handlers.set(name, action) },
    dialog: { showOpenDialog },
    getMainWindow: () => null,
    getLibraryScope: () => ({ ...scope }),
    listLibraryTracks,
    platformVideos,
    searchPlaylistTrack,
    ...overrides,
  });
  const invoke = (name, value) =>
    handlers.get(`playlist-import:${name}`)(null, value);
  return {
    filePath,
    invoke,
    listLibraryTracks,
    platformVideos,
    scope,
    searchPlaylistTrack,
    showOpenDialog,
  };
}

describe('playlist import', () => {
  it('binds and unbinds Spotify independently of any import draft', async () => {
    let bound = false;
    const spotify = {
      configured: true,
      connect: vi.fn(async () => {
        bound = true;
      }),
      disconnect: vi.fn(() => {
        bound = false;
      }),
      getAccountStatus: () => ({ bound }),
    };
    const { invoke } = setup({ spotify });
    expect(await invoke('bind-spotify')).toMatchObject({
      ok: true,
      value: { bound: true },
    });
    expect(spotify.connect).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(await invoke('unbind-spotify')).toMatchObject({
      ok: true,
      value: { bound: false },
    });
    expect(spotify.disconnect).toHaveBeenCalledOnce();
  });

  it('returns Spotify configuration and the last authorization time without account credentials', () => {
    const lastAuthorizedAt = 1_700_000_000_000;
    const { invoke } = setup({
      spotify: { configured: true },
      getSpotifyAuthorizedAt: () => lastAuthorizedAt,
    });
    expect(invoke('spotify-status')).toEqual({
      configured: true,
      lastAuthorizedAt,
      profile: null,
    });
  });

  it('admits Spotify playlist metadata by ID and clears a cancelled authorization', async () => {
    const playlistId = 'abcdefghijklmnopqrstUV';
    const url = `https://open.spotify.com/playlist/${playlistId}?si=tracking`;
    const readPlaylist = vi.fn(async () => ({
      id: playlistId,
      name: 'Shared',
      tracks: [{ title: 'First', artist: 'Artist', album: 'Album' }],
    }));
    const { invoke } = setup({ spotify: { configured: true, readPlaylist } });
    expect(
      (await invoke('spotify-link', 'https://spot.invalid/playlist')).error
        .code,
    ).toBe('PLAYLIST_IMPORT_SPOTIFY_LINK');
    const source = (await invoke('spotify-link', url)).value;
    expect(readPlaylist).toHaveBeenCalledWith(
      playlistId,
      expect.any(AbortSignal),
      false,
    );
    expect(source.entries).toEqual([{ id: playlistId, name: 'Shared' }]);
    expect(
      (await invoke('preview', { id: source.id, entryId: playlistId })).value
        .rows[0].selected,
    ).toBe('track_a');
    readPlaylist.mockImplementationOnce(async (_id, signal) => {
      await new Promise((resolve) =>
        signal.addEventListener('abort', resolve, { once: true }),
      );
      throw new PlatformVideoError('cancelled');
    });
    const pending = invoke('spotify-link', url);
    await invoke('cancel-spotify');
    expect((await pending).error.code).toBe('PLATFORM_VIDEO_CANCELLED');
    expect(
      (await invoke('preview', { id: source.id, entryId: playlistId })).error
        .code,
    ).toBe('PLAYLIST_IMPORT_STALE');
  });
  it('reads CSV locally, excludes unconfirmed audio IDs and writes linked downloads in source order', async () => {
    const {
      invoke,
      listLibraryTracks,
      searchPlaylistTrack,
      showOpenDialog,
      scope,
    } = setup();
    const csv = path.join(directory, 'Shared mix.csv');
    fs.writeFileSync(
      csv,
      '\uFEFF"Track name",Artist,Album\r\n"Missing, ""take""",Singer,Studio\r\nFirst,Artist,Album\r\n',
    );
    showOpenDialog.mockResolvedValueOnce({ filePaths: [csv] });
    const source = (await invoke('choose-spotify')).value;
    expect(source.entries).toEqual([{ id: '0', name: 'Shared mix' }]);
    const id = source.id;
    const review = (await invoke('preview', { id, entryId: '0' })).value;
    expect(review.rows.map(({ title, selected }) => [title, selected])).toEqual(
      [
        ['Missing, "take"', ''],
        ['First', 'track_a'],
      ],
    );
    const remote = 'missingSong';
    const request = {
      id,
      token: review.token,
      name: 'Shared mix',
      selections: [remote, 'track_a'],
    };
    expect((await invoke('accept', request)).error.code).toBe(
      'PLAYLIST_IMPORT_SELECTION',
    );
    searchPlaylistTrack.mockResolvedValueOnce({
      candidates: [
        { id: remote, title: 'Studio take' },
        { id: 'untrusted://value' },
      ],
    });
    expect(
      (await invoke('find', { id, token: review.token, index: 0 })).value,
    ).toMatchObject([{ id: remote, remote: true }]);
    expect(searchPlaylistTrack).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Missing, "take"', artist: 'Singer' }),
    );
    const { value: plan } = await invoke('accept', request);
    expect(plan.libraryEpoch).toBe(1);
    expect(
      plan.tracks.map(({ id, alreadyDownloaded }) => [id, alreadyDownloaded]),
    ).toEqual([
      [remote, false],
      ['track_a', true],
    ]);
    expect((await invoke('accept', request)).value.id).toBe(plan.id);
    await invoke('clear', id);
    const finalized = await invoke('finalize', plan.id);
    const playlistId = finalized.value.playlistId;
    expect(loadPlaylists(directory)[0].trackIds).toEqual(['track_a']);
    listLibraryTracks.mockReturnValue([
      ...tracks,
      { id: remote, title: 'Studio take' },
    ]);
    expect(await invoke('finalize', plan.id)).toEqual(finalized);
    expect(loadPlaylists(directory)[0].trackIds).toEqual([remote, 'track_a']);
    setPlaylistTracks(scope.dir, playlistId, ['track_a']);
    expect((await invoke('finalize', plan.id)).error.code).toBe(
      'PLAYLIST_IMPORT_BATCH_CHANGED',
    );
    scope.epoch++;
    expect((await invoke('finalize', plan.id)).error.code).toBe(
      'PLAYLIST_IMPORT_STALE',
    );
    expect(loadPlaylists(directory)[0].trackIds).toEqual(['track_a']);
  });
  it('previews a Spotify export and saves only confirmed local tracks in source order', async () => {
    const { filePath, invoke, listLibraryTracks } = setup();
    const first = {
      track: { trackName: 'First', artistName: 'Artist', albumName: 'Album' },
    };
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        playlists: [
          {
            name: 'Spotify mix',
            items: [first, { episode: { episodeName: 'Podcast' } }, first],
          },
        ],
      }),
    );
    const source = (await invoke('choose-spotify')).value;
    expect(source.entries).toEqual([{ id: '0', name: 'Spotify mix' }]);
    const review = (await invoke('preview', { id: source.id, entryId: '0' }))
      .value;
    expect(
      review.rows.map(({ selected, unavailable }) => [selected, unavailable]),
    ).toEqual([
      ['track_a', false],
      ['', true],
      ['track_a', false],
    ]);
    expect(review.rows[0].candidates.map(({ id }) => id)).toEqual([
      'track_a',
      'track_live',
    ]);
    const input = {
      id: source.id,
      token: review.token,
      name: 'My playlist',
      selections: ['track_live', '', 'track_a'],
    };
    const forged = await invoke('save', {
      ...input,
      selections: ['abcdefghijk', '', 'track_a'],
    });
    expect(forged.error.code).toBe('PLAYLIST_IMPORT_SELECTION');
    listLibraryTracks.mockReturnValueOnce(
      tracks.filter(({ id }) => id !== 'track_a'),
    );
    expect((await invoke('save', input)).error.code).toBe(
      'PLAYLIST_IMPORT_STALE',
    );
    expect(loadPlaylists(directory)).toEqual([]);
    const saved = await invoke('save', input);
    expect(saved.ok).toBe(true);
    expect(await invoke('save', input)).toEqual(saved);
    expect(loadPlaylists(directory)).toMatchObject([
      { name: 'My playlist', trackIds: ['track_live', 'track_a'] },
    ]);
    expect(loadPlaylists(directory)[0].source).toBeUndefined();
    await invoke('clear', source.id);
  });

  it('validates the chosen YouTube list and checks account and library scope again before saving', async () => {
    const { invoke, platformVideos, scope } = setup();
    const source = (await invoke('list-youtube')).value;
    const id = source.id;
    expect(
      (await invoke('preview', { id, entryId: 'PL_forged' })).error.code,
    ).toBe('PLAYLIST_IMPORT_STALE');
    expect(platformVideos.readYoutubePlaylist).not.toHaveBeenCalled();
    const { token, rows } = (
      await invoke('preview', { id, entryId: 'PL_owned' })
    ).value;
    expect(rows[0].selected).toBe('abcdefghijk');
    expect(platformVideos.readYoutubePlaylist).toHaveBeenCalledWith(
      'PL_owned',
      7,
    );
    const input = {
      id,
      token,
      name: 'Local copy',
      selections: ['abcdefghijk'],
    };
    platformVideos.assertPlaylistAuthorization.mockImplementationOnce(() => {
      throw new PlatformVideoError('authRequired');
    });
    expect((await invoke('save', input)).error.code).toBe(
      'PLATFORM_VIDEO_AUTH_REQUIRED',
    );
    scope.epoch++;
    expect((await invoke('save', input)).error.code).toBe(
      'PLAYLIST_IMPORT_STALE',
    );
    expect(loadPlaylists(directory)).toEqual([]);
    await invoke('clear', id);
  });

  it('treats picker cancellation and unrelated JSON as separate outcomes', async () => {
    const { filePath, invoke, showOpenDialog } = setup();
    showOpenDialog.mockResolvedValueOnce({ canceled: true });
    expect(await invoke('choose-spotify')).toEqual({ ok: true, value: null });
    fs.writeFileSync(filePath, JSON.stringify({ streamingHistory: [] }));
    expect((await invoke('choose-spotify')).error.code).toBe(
      'PLAYLIST_IMPORT_FILE',
    );
  });
});

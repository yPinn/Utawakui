import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import {
  createSpotifyPlaylistReader,
  spotifyPlaylistId,
} from './spotifyPlaylistReader.js';

const id = 'abcdefghijklmnopqrstUV';
const signal = () => new AbortController().signal;
function setup(overrides = {}) {
  const token = {
    access_token: 'ephemeral-access',
    scope: 'playlist-read-private',
  };
  const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(token));
  const authorize = vi.fn(async () => ({
    code: 'test-code',
    code_verifier: 'test-verifier',
    redirect_uri: 'http://127.0.0.1:54630/oauth/callback',
  }));
  const recordAuthorization = vi.fn();
  const service = createSpotifyPlaylistReader({
    clientId: 'a'.repeat(32),
    fetchImpl,
    authorize,
    recordAuthorization,
    ...overrides,
  });
  return { service, fetchImpl, authorize, recordAuthorization };
}

it('accepts a full playlist URL and derives only the Spotify ID', () => {
  expect(
    spotifyPlaylistId(
      `https://open.spotify.com/intl-pt-BR/playlist/${id}?si=private-query`,
    ),
  ).toBe(id);
  for (const value of [
    `https://open.spotify.com.evil.example/playlist/${id}`,
    `https://abc@open.spotify.com/playlist/${id}`,
    `https://open.spotify.com/album/${id}`,
    'https://spotify.link/example',
  ]) {
    expect(spotifyPlaylistId(value)).toBeNull();
  }
});

it('binds without a playlist and reuses encrypted credentials after a restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spotify-account-'));
  const accountFile = path.join(directory, 'account.bin');
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: vi.fn((value) => Buffer.from(value).reverse()),
    decryptString: (value) => Buffer.from(value).reverse().toString(),
  };
  try {
    const first = setup({ accountFile, safeStorage });
    first.fetchImpl
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'initial-access',
          refresh_token: 'initial-refresh',
          scope: 'playlist-read-private user-read-private',
        }),
      )
      .mockResolvedValueOnce(Response.json({ display_name: 'Linked user' }));
    await first.service.connect(signal());
    const bound = first.service.getAccountStatus();
    expect(bound).toMatchObject({
      bound: true,
      savedAt: expect.any(Number),
      profile: { name: 'Linked user' },
    });
    expect(JSON.stringify(bound)).not.toContain('initial-refresh');
    expect(first.fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      'https://accounts.spotify.com/api/token',
      'https://api.spotify.com/v1/me',
    ]);

    const restarted = setup({ accountFile, safeStorage });
    expect(restarted.service.getAccountStatus()).toEqual(bound);
    const rotation = Promise.withResolvers();
    restarted.fetchImpl
      .mockReset()
      .mockReturnValueOnce(rotation.promise)
      .mockResolvedValueOnce(Response.json({ name: 'Private mix' }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    const controller = new AbortController();
    const cancelledRead = expect(
      restarted.service.readPlaylist(id, controller.signal),
    ).rejects.toMatchObject({ code: 'cancelled' });
    const retry = restarted.service.readPlaylist(id, signal());
    controller.abort();
    rotation.resolve(
      Response.json({
        access_token: 'renewed-access',
        refresh_token: 'rotated-refresh',
      }),
    );
    await cancelledRead;
    await retry;
    expect(restarted.fetchImpl).toHaveBeenCalledTimes(3);
    expect(restarted.authorize).not.toHaveBeenCalled();
    expect(restarted.fetchImpl.mock.calls[0][1].body.get('refresh_token')).toBe(
      'initial-refresh',
    );
    expect(restarted.service.getAccountStatus()).toEqual(bound);

    restarted.fetchImpl
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'one-time-access',
          scope: 'playlist-read-private',
        }),
      )
      .mockResolvedValueOnce(Response.json({ name: 'Other mix' }))
      .mockResolvedValueOnce(Response.json({ items: [] }));
    await restarted.service.readPlaylist(id, signal(), true);
    expect(restarted.authorize).toHaveBeenCalledOnce();
    expect(restarted.service.getAccountStatus()).toEqual(bound);

    restarted.fetchImpl
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({ error: 'invalid_grant' }, { status: 400 }),
      );
    await expect(
      restarted.service.readPlaylist(id, signal()),
    ).rejects.toMatchObject({ code: 'SPOTIFY_RECONNECT' });
    expect(restarted.fetchImpl.mock.calls[0][1].body.get('refresh_token')).toBe(
      'rotated-refresh',
    );
    expect(restarted.service.getAccountStatus()).toMatchObject({
      bound: false,
      profile: null,
    });
    expect(fs.existsSync(accountFile)).toBe(false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('uses readonly PKCE and fixed pagination, returning only ordered metadata', async () => {
  const { service, fetchImpl, authorize, recordAuthorization } = setup();
  fetchImpl
    .mockResolvedValueOnce(Response.json({ name: 'Test mix' }))
    .mockResolvedValueOnce(
      Response.json({
        items: [
          {
            item: {
              type: 'track',
              name: 'First',
              artists: [{ name: 'Artist' }],
              album: { name: 'Album' },
              duration_ms: 210000,
            },
          },
        ],
        next: 'https://untrusted.invalid/query',
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        items: [
          { track: { type: 'track', name: 'Second' } },
          { item: { type: 'episode', name: 'Podcast' } },
        ],
        next: null,
      }),
    );
  expect(await service.readPlaylist(id, signal())).toMatchObject({
    id,
    name: 'Test mix',
    truncated: false,
    tracks: [
      { title: 'First', artist: 'Artist', album: 'Album', duration: 210 },
      { title: 'Second' },
      { title: 'Podcast', unavailable: true },
    ],
  });
  expect(authorize).toHaveBeenCalledWith(
    expect.objectContaining({
      authorizationUrl: 'https://accounts.spotify.com/authorize',
      params: expect.objectContaining({
        scope: 'playlist-read-private user-read-private',
      }),
    }),
  );
  expect(recordAuthorization.mock.calls).toEqual([[expect.any(Number)]]);
  const token = fetchImpl.mock.calls[0][1];
  expect(token.body.get('client_secret')).toBeNull();
  expect(
    fetchImpl.mock.calls
      .slice(1)
      .map(([url, options]) => [url, options.method]),
  ).toEqual([
    [`https://api.spotify.com/v1/playlists/${id}?fields=name`, undefined],
    [
      `https://api.spotify.com/v1/playlists/${id}/items?limit=50&offset=0`,
      undefined,
    ],
    [
      `https://api.spotify.com/v1/playlists/${id}/items?limit=50&offset=50`,
      undefined,
    ],
  ]);
});

it('keeps only the authorized display name and provider avatar in memory', async () => {
  const { service, fetchImpl } = setup();
  const avatarUrl = 'https://i.scdn.co/image/abcd1234';
  fetchImpl
    .mockReset()
    .mockResolvedValueOnce(
      Response.json({
        access_token: 'ephemeral-access',
        scope: 'user-read-private playlist-read-private',
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        display_name: 'Studio',
        email: 'private@example.test',
        images: [{ url: 'https://example.test/image' }, { url: avatarUrl }],
      }),
    )
    .mockResolvedValueOnce(Response.json({ name: 'Mix' }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  await service.readPlaylist(id, signal());
  expect(fetchImpl.mock.calls[1][0]).toBe('https://api.spotify.com/v1/me');
  expect(service.getAccountStatus().profile).toEqual({
    name: 'Studio',
    avatarUrl,
  });
  service.clearProfile();
  expect(service.getAccountStatus().profile).toBeNull();
});

it('reports Spotify ownership restrictions without trying an alternate/private endpoint', async () => {
  const { service, fetchImpl, recordAuthorization } = setup();
  fetchImpl
    .mockResolvedValueOnce(Response.json({ name: 'Visible title' }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(service.readPlaylist(id, signal())).rejects.toMatchObject({
    code: 'SPOTIFY_ACCESS',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(recordAuthorization).toHaveBeenCalledOnce();
});

it('does not record rejected or cancelled authorization', async () => {
  const { service, fetchImpl, recordAuthorization } = setup();
  fetchImpl.mockReset().mockResolvedValue(
    Response.json({
      access_token: 'wrong-scope',
      scope: 'playlist-modify-private',
    }),
  );
  await expect(service.readPlaylist(id, signal())).rejects.toMatchObject({
    code: 'SPOTIFY_ACCESS',
  });
  const controller = new AbortController();
  controller.abort();
  await expect(
    service.readPlaylist(id, controller.signal),
  ).rejects.toMatchObject({
    code: 'cancelled',
  });
  expect(recordAuthorization).not.toHaveBeenCalled();
});

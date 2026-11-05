import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSessionPlatformVideos,
  parsePlatformVideo,
} from './sessionPlatformVideos.js';
import { PlatformVideoError } from './youtubeDesktopAuthorization.js';
import { registerSessionPlatformVideoHandlers } from '../main/sessionPlatformVideoHandlers.js';

const channelId = `UC${'a'.repeat(22)}`;
const videoId = 'abcdefghijk';
const longTitle = `直播回放 ${'演出場次'.repeat(55)} 👩‍🎤`;
let directory;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-video-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

function setup(configured = true, getTwitchVod) {
  const token = {
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 60_000,
  };
  const get = vi.fn(async (resource) => {
    const snippet = {
      channelId,
      title: longTitle,
      actualStartTime: '2026-10-21T12:00:00Z',
    };
    if (resource === 'channels')
      return { items: [{ id: channelId, snippet: { title: 'Show' } }] };
    if (resource === 'liveBroadcasts')
      return {
        items: [
          { id: videoId, snippet, status: { lifeCycleStatus: 'complete' } },
          { id: 'scheduled00', snippet, status: { lifeCycleStatus: 'ready' } },
        ],
      };
    return { items: [{ id: videoId, snippet }] };
  });
  const youtube = {
    configured,
    get,
    authorize: vi.fn(async () => token),
    refresh: vi.fn(async () => token),
    revoke: vi.fn(async () => {}),
  };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value, 'utf8').reverse(),
    decryptString: (value) => Buffer.from(value).reverse().toString('utf8'),
  };
  const openExternal = vi.fn(async () => {});
  const service = createSessionPlatformVideos({
    directory,
    safeStorage,
    youtube,
    openExternal,
    getTwitchVod,
  });
  return { service, youtube, openExternal, safeStorage };
}

describe('session platform video pairing', () => {
  it.each([
    ['twitch', 'https://twitch.tv/videos/123?t=10s', '123'],
    ['twitch', 'https://twitch.tv.evil.example/videos/123', null],
    ['twitch', 'https://twitch.tv/creator/clip/123', null],
    ['twitch', 'https://twitch.tv:8443/videos/123', null],
    ['youtube', 'https://youtu.be/abcdefghijk?si=discarded', videoId],
    ['youtube', 'https://www.youtube.com/live/abcdefghijk', videoId],
    [
      'youtube',
      'https://www.youtube.com@evil.example/watch?v=abcdefghijk',
      null,
    ],
    ['youtube', 'http://www.youtube.com/watch?v=abcdefghijk', null],
  ])('validates %s URL %s', (platform, url, expected) => {
    expect(parsePlatformVideo(platform, url)).toBe(expected);
  });

  it('saves and opens a manual Twitch VOD locally without account authorization', async () => {
    const { service, youtube, openExternal } = setup(false);
    await service.save(
      'one',
      'twitch',
      { url: 'https://twitch.tv/videos/123?t=10s' },
      () => {},
    );
    expect(setup(false).service.sessionPairs('one')).toMatchObject([
      { videoId: '123', verified: false },
    ]);
    expect(service.sessionPairs('other')).toEqual([]);
    await service.open('one', 'twitch');
    expect(openExternal).toHaveBeenCalledWith(
      'https://www.twitch.tv/videos/123',
    );
    expect(youtube.get).not.toHaveBeenCalled();
    expect(service.remove('one', 'twitch')).toEqual([]);
  });

  it('refreshes Twitch details for the saved VOD and keeps the link when metadata is absent', async () => {
    const lookup = vi.fn(async () => ({
      metadataStatus: 'ready',
      title: longTitle,
      channelName: 'Singer',
      videoDate: '2026-10-20T12:00:00Z',
      durationSeconds: 3723,
    }));
    const { service } = setup(false, lookup);
    await service.save(
      'one',
      'twitch',
      { url: 'https://twitch.tv/videos/123' },
      () => {},
    );
    expect(lookup).toHaveBeenCalledWith('123');
    expect(setup(false).service.sessionPairs('one')).toMatchObject([
      {
        videoId: '123',
        title: longTitle,
        channelName: 'Singer',
        videoDate: '2026-10-20T12:00:00.000Z',
        durationSeconds: 3723,
      },
    ]);
    lookup.mockResolvedValueOnce({ metadataStatus: 'notFound' });
    expect(await service.refreshMetadata('one', () => {})).toMatchObject([
      {
        videoId: '123',
        metadataStatus: 'notFound',
        title: '',
      },
    ]);
  });

  it('verifies the selected YouTube channel and cleans verified links on disconnect', async () => {
    const { service, youtube } = setup();
    const status = await service.connect();
    expect(status.channel).toEqual({ id: channelId, name: 'Show' });
    expect(JSON.stringify(status)).not.toContain('test-refresh');
    expect(await service.candidates('2026-10-21')).toMatchObject([
      { videoId, title: longTitle },
    ]);
    await service.save('one', 'youtube', { candidateId: videoId }, () => {});
    await service.save(
      'one',
      'twitch',
      { url: 'https://twitch.tv/videos/123' },
      () => {},
    );
    expect(service.sessionPairs('one')).toMatchObject([
      { platform: 'youtube', verified: true, title: longTitle },
      { platform: 'twitch', verified: false },
    ]);
    youtube.get.mockResolvedValueOnce({
      items: [{ id: videoId, snippet: { channelId: `UC${'b'.repeat(22)}` } }],
    });
    await expect(
      service.save('one', 'youtube', { candidateId: videoId }, () => {}),
    ).rejects.toMatchObject({ code: 'wrongChannel' });
    expect((await service.disconnect()).revoked).toBe(true);
    expect(youtube.revoke).toHaveBeenCalledWith('test-refresh');
    expect(service.sessionPairs('one')).toMatchObject([{ platform: 'twitch' }]);
    expect(
      fs.existsSync(path.join(directory, 'youtube-desktop-account.bin')),
    ).toBe(false);
  });

  it('cannot recreate a verified link from a response that arrives after disconnect', async () => {
    const { service, youtube } = setup();
    await service.connect();
    let finish;
    youtube.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service.save(
      'one',
      'youtube',
      { candidateId: videoId },
      () => {},
    );
    await Promise.resolve();
    await service.disconnect();
    finish({ items: [{ id: videoId, snippet: { channelId } }] });
    await expect(pending).rejects.toMatchObject({ code: 'authRequired' });
    expect(service.sessionPairs('one')).toEqual([]);
  });

  it('rejects active or unavailable sessions before opening links', async () => {
    const { service } = setup(false);
    const handlers = new Map();
    registerSessionPlatformVideoHandlers({
      ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
      service,
      operationContext: () => ({
        directory,
        store: {
          getSession: (id) =>
            id === 'old' ? { endedAt: '2026-10-20' } : { endedAt: null },
        },
      }),
    });
    const save = handlers.get('session-platform-video:save');
    const intent = { platform: 'twitch', url: 'https://twitch.tv/videos/123' };
    expect(await save(null, { ...intent, sessionId: 'current' })).toMatchObject(
      {
        ok: false,
        error: { code: 'PLATFORM_VIDEO_MISSING_SESSION' },
      },
    );
    expect(await save(null, { ...intent, sessionId: 'old' })).toMatchObject({
      ok: true,
      value: [{ platform: 'twitch', videoId: '123' }],
    });
  });

  it('forgets API-derived links when the saved authorization is revoked', async () => {
    const { service } = setup();
    await service.connect();
    await service.save('one', 'youtube', { candidateId: videoId }, () => {});
    const restarted = setup();
    restarted.youtube.refresh.mockRejectedValueOnce(
      new PlatformVideoError('authRequired'),
    );
    await expect(restarted.service.candidates()).rejects.toMatchObject({
      code: 'authRequired',
    });
    expect(restarted.service.sessionPairs('one')).toEqual([]);
  });

  it('expires old authorized data while retaining manual pairings', async () => {
    const { service } = setup();
    await service.connect();
    await service.save('one', 'youtube', { candidateId: videoId }, () => {});
    await service.save(
      'one',
      'twitch',
      { url: 'https://twitch.tv/videos/123' },
      () => {},
    );
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 30 * 24 * 60 * 60 * 1000);
    expect(service.status().channel).toBeNull();
    expect(service.sessionPairs('one')).toMatchObject([{ platform: 'twitch' }]);
    expect(
      fs.existsSync(path.join(directory, 'youtube-desktop-account.bin')),
    ).toBe(false);
  });
});

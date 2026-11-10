import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerTrackVideoHandlers } from './trackVideoHandlers.js';
import { trackVideoSource } from '../lib/library/trackVideo.js';

describe('track video IPC', () => {
  let dir;
  let trackDir;
  let call;
  let sender;
  let getProviderRunner;
  let run;
  let epoch;
  let requireProvider;
  let openExternal;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'track-video-'));
    trackDir = path.join(dir, 'tracks', 'track-1');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'fixture');
    epoch = 0;
    const methods = new Map();
    const webContents = { mainFrame: {} };
    sender = { sender: webContents, senderFrame: webContents.mainFrame };
    run = vi.fn(async () => ({
      formats: [
        {
          format_id: '137',
          ext: 'mp4',
          vcodec: 'avc1.640028',
          acodec: 'none',
          height: 1080,
        },
        {
          format_id: '398',
          ext: 'mp4',
          vcodec: 'avc1.640032',
          acodec: 'none',
          height: 1440,
        },
      ],
    }));
    getProviderRunner = vi.fn(async () => run);
    requireProvider = vi.fn();
    openExternal = vi.fn();
    registerTrackVideoHandlers({
      ipcMain: { handle: (channel, handler) => methods.set(channel, handler) },
      dialog: { showOpenDialog: vi.fn() },
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      getScope: () => ({ dir, epoch }),
      getFfmpeg: () => 'unused',
      getProviderRunner,
      requireProvider,
      openExternal,
    });
    call = (method, intent = {}, event = sender) =>
      methods.get(`track-video:${method}`)(event, {
        trackId: 'track-1',
        ...intent,
      });
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('allows only the main frame and confirmed, canonical video IDs', async () => {
    const videoId = 'abcdefghijk';
    expect(
      await call(
        'formats',
        { videoId, permitted: true },
        { ...sender, senderFrame: {} },
      ),
    ).toEqual({ status: 'invalid-intent' });
    expect(
      await call('formats', {
        videoId: 'https://example.org/1',
        permitted: true,
      }),
    ).toEqual({ status: 'invalid-intent' });
    expect(getProviderRunner).not.toHaveBeenCalled();
    const offer = await call('formats', { videoId });
    expect(offer).toMatchObject({ status: 'ok', defaultId: '137' });
    expect(run.mock.calls[0][0]).toBe(
      `https://www.youtube.com/watch?v=${videoId}`,
    );
    expect(
      await call('download', {
        token: offer.token,
        formatId: '--other',
        permitted: true,
      }),
    ).toEqual({ status: 'invalid-intent' });
    expect(run).toHaveBeenCalledTimes(1);
    epoch += 1;
    expect(
      await call('download', {
        token: offer.token,
        formatId: '137',
        permitted: true,
      }),
    ).toEqual({ status: 'stale' });
  });

  it('rechecks the provider gate at download time', async () => {
    const offer = await call('formats', {
      videoId: 'abcdefghijk',
      permitted: true,
    });
    requireProvider.mockImplementation(() => {
      throw Object.assign(new Error(), { code: 'provider-disabled' });
    });
    expect(
      await call('download', {
        token: offer.token,
        formatId: '137',
        permitted: true,
      }),
    ).toEqual({ status: 'provider-disabled' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('reports transfer progress and discards a cancelled download', async () => {
    const offer = await call('formats', {
      videoId: 'abcdefghijk',
      permitted: true,
    });
    run.mockImplementationOnce(async (_url, { output }, execution) => {
      fs.writeFileSync(`${output}.part`, 'partial');
      execution.onStdoutLine('UTAWAKUI_MV 500 2000 NA');
      await new Promise((resolve) =>
        execution.signal.addEventListener('abort', resolve, { once: true }),
      );
    });
    const finished = call('download', {
      token: offer.token,
      formatId: '137',
      permitted: true,
    });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(await call('status')).toEqual({ status: 'download', progress: 25 });
    await call('cancel');
    expect(await finished).toEqual({ status: 'cancelled' });
    expect(fs.readdirSync(trackDir)).toEqual(['audio.mp3']);
  });

  it('prefills a recorded YouTube source and distinguishes Topic audio from an MV candidate', async () => {
    fs.writeFileSync(
      path.join(trackDir, 'info.json'),
      JSON.stringify({
        extractor_key: 'Youtube',
        id: 'abcdefghijk',
        channel: 'Artist - Topic',
        title: 'Song',
      }),
    );
    expect(await call('get', { includeSource: true })).toMatchObject({
      source: { id: 'abcdefghijk', kind: 'audio' },
    });
    run.mockResolvedValueOnce({
      title: 'Song (Official Music Video)',
      formats: [],
    });
    expect(await call('formats', { videoId: 'abcdefghijk' })).toMatchObject({
      status: 'ok',
      kind: 'mv',
      choices: [],
    });
  });

  it('opens a canonical preview without permitting a download', async () => {
    expect(await call('preview', { videoId: 'https://example.org' })).toEqual({
      status: 'invalid-intent',
    });
    expect(await call('preview', { videoId: 'abcdefghijk' })).toEqual({
      status: 'ok',
    });
    expect(openExternal).toHaveBeenCalledExactlyOnceWith(
      'https://www.youtube.com/watch?v=abcdefghijk',
    );
    expect(getProviderRunner).not.toHaveBeenCalled();
    const offer = await call('formats', { videoId: 'abcdefghijk' });
    expect(
      await call('download', { token: offer.token, formatId: '137' }),
    ).toEqual({ status: 'invalid-intent' });
  });

  it('exposes only the attached revision and invalidates its binding after audio replacement', async () => {
    const revision = '12345678-1234-1234-1234-123456789abc';
    const { binding } = trackVideoSource(dir, 'track-1');
    fs.writeFileSync(path.join(trackDir, `video-${revision}.mp4`), 'video');
    fs.writeFileSync(
      path.join(trackDir, 'video.json'),
      JSON.stringify({ version: 1, binding, revision }),
    );
    expect(await call('get')).toMatchObject({
      video: {
        available: true,
        url: `utawakui-media://track-video/track-1/${revision}`,
      },
    });
    fs.appendFileSync(path.join(trackDir, 'audio.mp3'), ' replaced');
    expect(await call('get')).toMatchObject({
      video: { available: false, url: null },
    });
    expect(await call('remove')).toEqual({ status: 'ok', video: null });
    expect(fs.readdirSync(trackDir)).toEqual(['audio.mp3']);
  });
});

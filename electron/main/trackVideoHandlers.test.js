import fs from 'node:fs';
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
  let onChange;
  let chooseFile;
  let inspectVideo;
  let estimateAlignment;
  let protectedTrackIds;
  let handlers;

  function pickFile() {
    const file = path.join(dir, 'source.mp4');
    fs.writeFileSync(file, 'video');
    chooseFile.mockResolvedValueOnce({ canceled: false, filePaths: [file] });
    return call('pick');
  }

  beforeEach(() => {
    const scratch = path.resolve('tasks');
    fs.mkdirSync(scratch, { recursive: true });
    dir = fs.mkdtempSync(path.join(scratch, 'track-video-'));
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
    onChange = vi.fn();
    chooseFile = vi.fn();
    inspectVideo = vi.fn(async () => ({
      width: 1920,
      height: 1080,
      duration: 24,
      sizeBytes: 5,
      hasAudio: true,
    }));
    estimateAlignment = vi.fn(async () => null);
    protectedTrackIds = [];
    handlers = registerTrackVideoHandlers({
      ipcMain: { handle: (channel, handler) => methods.set(channel, handler) },
      dialog: { showOpenDialog: chooseFile },
      getMainWindow: () => ({ isDestroyed: () => false, webContents }),
      getScope: () => ({ dir, epoch }),
      getFfmpeg: () => 'unused',
      getProviderRunner,
      requireProvider,
      openExternal,
      onChange,
      getProtectedTrackIds: () => protectedTrackIds,
      inspectVideo,
      estimateAlignment,
    });
    call = (method, intent = {}, event = sender) =>
      methods.get(`track-video:${method}`)(event, {
        trackId: 'track-1',
        ...intent,
      });
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('keeps videos of playing or queued tracks during cleanup', async () => {
    estimateAlignment.mockResolvedValueOnce({
      offsetMs: 0,
      segments: null,
      autoApply: true,
    });
    await pickFile();
    protectedTrackIds = ['track-1'];
    expect(handlers.cleanupLibraryVideos()).toMatchObject({ removedCount: 0 });
    expect(fs.readdirSync(trackDir)).toContain('video.json');

    protectedTrackIds = [];
    expect(handlers.cleanupLibraryVideos()).toMatchObject({ removedCount: 1 });
    expect(fs.readdirSync(trackDir)).toEqual(['audio.mp3']);
  });

  it('publishes a fixed offset immediately after importing a verified MP4', async () => {
    estimateAlignment.mockResolvedValueOnce({
      offsetMs: 0,
      segments: null,
      autoApply: true,
    });
    const result = await pickFile();
    expect(result).toMatchObject({
      status: 'ok',
      video: { available: true, offsetMs: 0 },
    });
    expect((await call('get')).video).toEqual(result.video);
    expect(fs.readdirSync(trackDir)).toEqual([
      'audio.mp3',
      `video-${result.video.revision}.mp4`,
      'video.json',
    ]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('track-1');
  });

  it('publishes high-confidence download segments from the same source reference audio', async () => {
    const segments = [
      { startMs: 0, endMs: 12000, offsetMs: 750 },
      { startMs: 14000, endMs: 24000, offsetMs: 2750 },
    ];
    const { formats } = await run();
    run.mockResolvedValueOnce({
      formats: [
        ...formats,
        {
          format_id: '251',
          ext: 'webm',
          protocol: 'https',
          vcodec: 'none',
          acodec: 'opus',
        },
      ],
    });
    const videoId = 'abcdefghijk';
    const offer = await call('formats', { videoId });
    const transfer = async (_url, { output }) =>
      fs.writeFileSync(output, 'media');
    run.mockImplementationOnce(transfer).mockImplementationOnce(transfer);
    inspectVideo.mockResolvedValueOnce({
      width: 1920,
      height: 1080,
      duration: 27,
      sizeBytes: 5,
      hasAudio: false,
    });
    estimateAlignment.mockResolvedValueOnce({
      offsetMs: 750,
      segments,
      autoApply: true,
    });
    const result = await call('download', {
      token: offer.token,
      formatId: '137',
      permitted: true,
    });
    expect(result).toMatchObject({
      status: 'ok',
      video: { available: true, offsetMs: 750, syncSegments: segments },
    });
    expect(estimateAlignment).toHaveBeenCalledWith(
      expect.objectContaining({
        referencePath: expect.stringMatching(/reference\.webm$/u),
      }),
    );
    expect(run.mock.calls.at(-1)).toEqual([
      `https://www.youtube.com/watch?v=${videoId}`,
      expect.objectContaining({ format: '251' }),
      expect.anything(),
    ]);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('track-1');
  });

  it('keeps the installed video during partial review and allows manual publication', async () => {
    estimateAlignment.mockResolvedValueOnce({
      offsetMs: 750,
      segments: null,
      autoApply: true,
    });
    const { video } = await pickFile();
    const segments = [
      { startMs: 0, endMs: 12000, offsetMs: 750 },
      { startMs: 15000, endMs: 21000, offsetMs: 2750 },
    ];
    estimateAlignment.mockResolvedValueOnce({
      offsetMs: 750,
      segments,
      autoApply: false,
    });
    const candidate = await pickFile();
    expect(candidate).toMatchObject({
      status: 'candidate',
      reason: 'partial-match',
      segmentCount: 2,
      suggestedOffsetMs: 750,
    });
    expect((await call('get')).video).toEqual(video);
    expect(onChange).toHaveBeenCalledTimes(1);
    await expect(
      call('save', {
        token: candidate.token,
        offsetMs: 800,
        useSegments: true,
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      video: {
        offsetMs: 800,
        syncSegments: [
          { startMs: 0, endMs: 12000, offsetMs: 800 },
          { startMs: 15000, endMs: 21000, offsetMs: 2800 },
        ],
      },
    });
  });

  it('returns an unmatched candidate with a reason and removes only its stage when abandoned', async () => {
    const candidate = await pickFile();
    expect(candidate).toMatchObject({
      status: 'candidate',
      reason: 'insufficient-match',
      suggestedOffsetMs: null,
    });
    expect(onChange).not.toHaveBeenCalled();
    expect((await call('get')).video).toBeNull();
    await call('cancel');
    expect(fs.readdirSync(trackDir)).toEqual(['audio.mp3']);
  });

  it('returns an approximate fixed offset and review range for import and saved-video alignment', async () => {
    const reviewRange = { startMs: 18000, endMs: 22000 };
    const estimate = {
      offsetMs: 12832,
      segments: null,
      autoApply: false,
      reviewRange,
    };
    estimateAlignment.mockResolvedValueOnce(estimate);
    const candidate = await pickFile();
    expect(candidate).toMatchObject({
      status: 'candidate',
      reason: 'partial-offset',
      suggestedOffsetMs: 12832,
      reviewRange,
    });
    expect(onChange).not.toHaveBeenCalled();
    const { video } = await call('save', {
      token: candidate.token,
      offsetMs: 0,
    });
    estimateAlignment.mockResolvedValueOnce(estimate);
    await expect(
      call('align', { revision: video.revision }),
    ).resolves.toMatchObject({
      status: 'ok',
      suggestedOffsetMs: 12832,
      reviewRange,
    });
    expect((await call('get')).video.offsetMs).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not publish a verified result after the library changes', async () => {
    estimateAlignment.mockImplementationOnce(async () => {
      epoch += 1;
      return { offsetMs: 750, segments: null, autoApply: true };
    });
    await expect(pickFile()).resolves.toEqual({ status: 'stale' });
    expect(onChange).not.toHaveBeenCalled();
    expect(fs.readdirSync(trackDir)).toEqual(['audio.mp3']);
  });

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
      throw Object.assign(new Error(), { code: 'FEATURE_GATE_REQUIRED' });
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

  it('updates the saved offset in place and rejects a stale or invalid edit', async () => {
    const revision = '12345678-1234-1234-1234-123456789abc';
    const { binding } = trackVideoSource(dir, 'track-1');
    const manifestPath = path.join(trackDir, 'video.json');
    const videoFile = path.join(trackDir, `video-${revision}.mp4`);
    const manifest = {
      version: 1,
      binding,
      revision,
      offsetMs: 250,
      width: 1920,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.writeFileSync(videoFile, 'video');
    const before = (await call('get')).video;
    expect(await call('set-offset', { revision, offsetMs: 120001 })).toEqual({
      status: 'invalid-intent',
    });
    expect(await call('set-offset', { revision, offsetMs: -75 })).toEqual({
      status: 'ok',
      video: { ...before, offsetMs: -75 },
    });
    expect((await call('get')).video).toMatchObject({
      revision,
      offsetMs: -75,
    });
    expect(fs.readFileSync(videoFile, 'utf8')).toBe('video');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('track-1');
    expect(
      await call('set-offset', {
        revision: '22345678-1234-1234-1234-123456789abc',
        offsetMs: 0,
      }),
    ).toEqual({ status: 'stale' });
    fs.appendFileSync(path.join(trackDir, 'audio.mp3'), ' replaced');
    expect(await call('set-offset', { revision, offsetMs: 0 })).toEqual({
      status: 'stale',
    });
    expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).toEqual({
      ...manifest,
      offsetMs: -75,
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shifts saved segments with the base offset and rejects a shift past the video', async () => {
    const revision = '12345678-1234-1234-1234-123456789abc';
    const { binding } = trackVideoSource(dir, 'track-1');
    const manifestPath = path.join(trackDir, 'video.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        binding,
        revision,
        offsetMs: 750,
        duration: 24,
        syncSegments: [
          { startMs: 0, endMs: 12000, offsetMs: 750 },
          { startMs: 15000, endMs: 21000, offsetMs: 2750 },
        ],
      }),
    );
    fs.writeFileSync(path.join(trackDir, `video-${revision}.mp4`), 'video');

    expect(await call('set-offset', { revision, offsetMs: 500 })).toMatchObject(
      {
        status: 'ok',
        video: {
          offsetMs: 500,
          syncSegments: [
            { startMs: 0, endMs: 12000, offsetMs: 500 },
            { startMs: 15000, endMs: 21000, offsetMs: 2500 },
          ],
        },
      },
    );
    expect(await call('set-offset', { revision, offsetMs: 1500 })).toEqual({
      status: 'invalid-intent',
    });
    expect(
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')).syncSegments[1],
    ).toEqual({ startMs: 15000, endMs: 21000, offsetMs: 2500 });
  });

  it('rejects a stale revision and raw reference URL before starting alignment', async () => {
    const revision = '12345678-1234-1234-1234-123456789abc';
    expect(
      await call('align', { revision, videoId: 'https://example.org' }),
    ).toEqual({ status: 'invalid-intent' });
    expect(await call('align', { revision, videoId: 'DOuhvBJqKVY' })).toEqual({
      status: 'stale',
    });
    expect(getProviderRunner).not.toHaveBeenCalled();
  });
});

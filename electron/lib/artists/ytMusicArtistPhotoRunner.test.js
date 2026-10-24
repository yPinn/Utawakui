import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { runYtMusicArtistPhotoWorker } from './ytMusicArtistPhotoRunner.js';

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdin = new EventEmitter();
    this.stdin.end = vi.fn((chunk) => {
      if (chunk) this.stdin.emit('data', Buffer.from(chunk));
      queueMicrotask(() => this.stdin.emit('end'));
    });
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.kill = vi.fn(() => {
      queueMicrotask(() => this.emit('close', null, 'SIGTERM'));
      return true;
    });
  }

  complete(result, code = 0) {
    if (result !== undefined) {
      this.stdout.end(`${JSON.stringify(result)}\n`);
    } else {
      this.stdout.end();
    }
    this.stderr.end();
    queueMicrotask(() => this.emit('close', code, null));
  }
}

function validRequest() {
  return {
    artistName: '艾熱 AIR',
    recordings: [
      { videoId: 'abcdefghijk', channelId: 'UC_channel_1' },
      { videoId: 'lmnopqrstuv', channelId: null },
    ],
  };
}

function validResult() {
  return {
    status: 'ok',
    candidates: [
      {
        rank: 1,
        name: '艾熱 AIR',
        browseId: 'UCcandidate',
        portrait: {
          url: 'https://yt3.googleusercontent.com/avatar=s240-c-k-c0x00ffffff-no-rj',
          width: 240,
          height: 240,
        },
        evidence: {
          exactName: true,
          matchedChannelCount: 2,
          matchedVideoCount: 1,
        },
      },
    ],
  };
}

function runWithChild(child, overrides = {}) {
  const spawnImpl = vi.fn(() => child);
  const promise = runYtMusicArtistPhotoWorker({
    pythonPath: 'C:\\managed\\python.exe',
    workerPath: 'C:\\app\\resources\\provider\\artist_photo_ytmusic_worker.py',
    request: validRequest(),
    spawnImpl,
    timeoutMs: 15_000,
    ...overrides,
  });
  return { promise, spawnImpl };
}

describe('runYtMusicArtistPhotoWorker', () => {
  it('spawns one isolated hidden worker and sends the bounded request on stdin', async () => {
    const child = new FakeChild();
    let input = '';
    child.stdin.on('data', (chunk) => {
      input += chunk.toString('utf8');
    });
    child.stdin.on('end', () => child.complete(validResult()));

    const { promise, spawnImpl } = runWithChild(child);

    await expect(promise).resolves.toEqual(validResult());
    expect(spawnImpl).toHaveBeenCalledWith(
      'C:\\managed\\python.exe',
      ['-I', 'C:\\app\\resources\\provider\\artist_photo_ytmusic_worker.py'],
      expect.objectContaining({
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: expect.objectContaining({ PYTHONNOUSERSITE: '1' }),
      }),
    );
    const spawnOptions = spawnImpl.mock.calls[0][2];
    expect(spawnOptions.env).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(JSON.parse(input)).toEqual(validRequest());
    expect(spawnImpl.mock.calls[0][1].join(' ')).not.toContain('艾熱');
  });

  it.each([
    [{ artistName: '', recordings: [] }, 'request'],
    [
      {
        artistName: 'Artist',
        recordings: Array.from({ length: 4 }, (_, index) => ({
          videoId: `abcdefghij${index}`,
          channelId: null,
        })),
      },
      'request',
    ],
    [
      {
        artistName: 'Artist',
        recordings: [{ videoId: 'not-valid', channelId: null }],
      },
      'request',
    ],
  ])('rejects an invalid bounded request %#', async (request, message) => {
    await expect(
      runYtMusicArtistPhotoWorker({
        pythonPath: 'C:\\managed\\python.exe',
        workerPath:
          'C:\\app\\resources\\provider\\artist_photo_ytmusic_worker.py',
        request,
        spawnImpl: vi.fn(),
      }),
    ).rejects.toThrow(message);
  });

  it('fails closed on malformed output, extra candidates, or a non-allowlisted portrait URL', async () => {
    const outputs = [
      'not-json\n',
      `${JSON.stringify({
        ...validResult(),
        candidates: Array.from({ length: 4 }, (_, index) => ({
          ...validResult().candidates[0],
          rank: index + 1,
        })),
      })}\n`,
      `${JSON.stringify({
        ...validResult(),
        candidates: [
          {
            ...validResult().candidates[0],
            portrait: {
              url: 'https://example.test/private-query',
              width: 240,
              height: 240,
            },
          },
        ],
      })}\n`,
    ];

    for (const output of outputs) {
      const child = new FakeChild();
      child.stdin.on('end', () => {
        child.stdout.end(output);
        child.stderr.end();
        queueMicrotask(() => child.emit('close', 0, null));
      });
      const { promise } = runWithChild(child);
      await expect(promise).resolves.toEqual({
        status: 'error',
        reason: 'schema-error',
      });
    }
  });

  it('kills output that exceeds the stdout cap without exposing its content', async () => {
    const child = new FakeChild();
    child.stdin.on('end', () => child.stdout.write('sensitive'.repeat(100)));
    const { promise } = runWithChild(child, { maxStdoutBytes: 32 });

    await expect(promise).resolves.toEqual({
      status: 'error',
      reason: 'schema-error',
    });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('returns bounded errors for abnormal exit and never includes stderr or paths', async () => {
    const child = new FakeChild();
    child.stdin.on('end', () => {
      child.stderr.end('C:\\private\\cookies.txt artist=secret');
      child.stdout.end();
      queueMicrotask(() => child.emit('close', 7, null));
    });
    const logger = { warn: vi.fn() };
    const { promise } = runWithChild(child, { logger });

    const result = await promise;
    expect(result).toEqual({ status: 'error', reason: 'worker-failed' });
    expect(JSON.stringify(result)).not.toMatch(/private|secret|cookies/i);
    expect(logger.warn).toHaveBeenCalledWith(
      '[artist-photo] Worker emitted stderr',
      null,
      { reason: 'stderr-output' },
    );
  });

  it('kills a timed out worker and returns a fixed timeout reason', async () => {
    const child = new FakeChild();
    const setTimer = vi.fn((callback) => {
      queueMicrotask(callback);
      return { unref: vi.fn() };
    });
    const { promise } = runWithChild(child, {
      setTimer,
      clearTimer: vi.fn(),
    });

    await expect(promise).resolves.toEqual({
      status: 'error',
      reason: 'timeout',
    });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('kills the worker when the caller aborts', async () => {
    const child = new FakeChild();
    const controller = new AbortController();
    const { promise } = runWithChild(child, { signal: controller.signal });

    controller.abort();

    await expect(promise).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('does not settle cancellation until the child close event confirms exit', async () => {
    const child = new FakeChild();
    child.kill = vi.fn(() => true);
    const controller = new AbortController();
    const { promise } = runWithChild(child, { signal: controller.signal });
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });

    controller.abort();
    await Promise.resolve();

    expect(child.kill).toHaveBeenCalledOnce();
    expect(resolved).toBe(false);
    child.emit('close', null, 'SIGTERM');
    await expect(promise).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
  });

  it('keeps the termination fallback armed when child error precedes close', async () => {
    const child = new FakeChild();
    child.kill = vi.fn(() => false);
    const controller = new AbortController();
    const { promise } = runWithChild(child, { signal: controller.signal });
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });

    controller.abort();
    child.emit('error', new Error('kill delivery failed'));
    await Promise.resolve();

    expect(resolved).toBe(false);
    child.emit('close', null, 'SIGTERM');
    await expect(promise).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
  });

  it('force-kills after a bounded grace period when normal kill fails', async () => {
    const child = new FakeChild();
    child.kill = vi.fn((signal) => {
      if (signal === 'SIGKILL') {
        queueMicrotask(() => child.emit('close', null, 'SIGKILL'));
        return true;
      }
      return false;
    });
    const timers = [];
    const setTimer = vi.fn((callback) => {
      const handle = { unref: vi.fn() };
      timers.push({ callback, handle });
      return handle;
    });
    const controller = new AbortController();
    const { promise } = runWithChild(child, {
      signal: controller.signal,
      setTimer,
      clearTimer: vi.fn(),
    });

    controller.abort();
    expect(child.kill).toHaveBeenNthCalledWith(1);
    expect(timers).toHaveLength(2);
    timers[1].callback();

    await expect(promise).resolves.toEqual({
      status: 'error',
      reason: 'cancelled',
    });
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });

  it('settles with a bounded failure when the child never emits close', async () => {
    const child = new FakeChild();
    child.kill = vi.fn(() => false);
    const timers = [];
    const setTimer = vi.fn((callback) => {
      const handle = { unref: vi.fn() };
      timers.push({ callback, handle });
      return handle;
    });
    const controller = new AbortController();
    const { promise } = runWithChild(child, {
      signal: controller.signal,
      setTimer,
      clearTimer: vi.fn(),
    });

    controller.abort();
    timers[1].callback();
    timers[2].callback();

    await expect(promise).resolves.toEqual({
      status: 'error',
      reason: 'worker-failed',
    });
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });

  it('drops child output immediately after termination starts', async () => {
    const child = new FakeChild();
    child.kill = vi.fn(() => true);
    const concat = vi.spyOn(Buffer, 'concat');
    const controller = new AbortController();
    const { promise } = runWithChild(child, { signal: controller.signal });

    controller.abort();
    child.stdout.write(Buffer.alloc(1024));
    child.stderr.write(Buffer.alloc(1024));

    expect(concat).not.toHaveBeenCalled();
    child.emit('close', null, 'SIGTERM');
    await expect(promise).resolves.toMatchObject({ reason: 'cancelled' });
    concat.mockRestore();
  });
});

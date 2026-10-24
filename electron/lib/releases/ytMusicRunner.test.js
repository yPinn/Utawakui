import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { runReleaseCatalogWorker } from './ytMusicRunner.js';
it('runs a fixed worker with a bounded anonymous environment and validates returned metadata', async () => {
  let options, input;
  const execFileImpl = vi.fn((file, args, settings, callback) => {
    options = settings;
    const child = new EventEmitter();
    child.stdin = {
      end: (value) => {
        input = JSON.parse(value);
        callback(null, '{"status":"no-match"}', '');
        child.emit('close', 0);
      },
      on: vi.fn(),
    };
    return child;
  });
  const result = await runReleaseCatalogWorker({
    pythonPath: 'C:/runtime/python.exe',
    workerPath: 'E:/resources/release_catalog_worker.py',
    request: { action: 'resolve', videoId: 'rgNdeflYdYw' },
    execFileImpl,
  });
  expect(result).toEqual({ status: 'no-match' });
  expect(input).toEqual({ action: 'resolve', videoId: 'rgNdeflYdYw' });
  expect(options).toMatchObject({
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 2097152,
  });
  expect(options.env).not.toHaveProperty('HTTP_PROXY');
  expect(options.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
});
it('rejects malformed requests before spawning and contains stderr or worker failures', async () => {
  const spawn = vi.fn();
  const base = {
    pythonPath: 'C:/python.exe',
    workerPath: 'C:/worker.py',
    execFileImpl: spawn,
  };
  await expect(
    runReleaseCatalogWorker({
      ...base,
      request: { action: 'resolve', videoId: 'https://bad.test' },
    }),
  ).rejects.toThrow();
  expect(spawn).not.toHaveBeenCalled();
  const execFileImpl = (file, args, settings, cb) => {
    const child = new EventEmitter();
    child.stdin = {
      on: vi.fn(),
      end: () => {
        cb(Error('private path'), '', 'private provider body');
        child.emit('close', 1);
      },
    };
    return child;
  };
  expect(
    await runReleaseCatalogWorker({
      ...base,
      execFileImpl,
      request: { action: 'resolve', videoId: 'rgNdeflYdYw' },
    }),
  ).toEqual({ status: 'error', reason: 'worker-failed' });
});
it('does not release the process lifecycle barrier on an early abort callback', async () => {
  const controller = new AbortController();
  const child = new EventEmitter();
  child.kill = vi.fn();
  child.stdin = { on: vi.fn(), end: vi.fn() };
  let callback;
  const execFileImpl = (file, args, options, cb) => {
    callback = cb;
    return child;
  };
  const pending = runReleaseCatalogWorker({
    pythonPath: 'C:/python.exe',
    workerPath: 'C:/worker.py',
    request: { action: 'resolve', videoId: 'rgNdeflYdYw' },
    signal: controller.signal,
    execFileImpl,
  });
  let settled = false;
  pending.then(() => {
    settled = true;
  });
  controller.abort();
  callback(Object.assign(Error(), { name: 'AbortError' }), '', '');
  await new Promise((resolve) => setImmediate(resolve));
  expect(settled).toBe(false);
  child.emit('close', 1);
  expect(await pending).toEqual({ status: 'error', reason: 'cancelled' });
});
function responseWorker(value, { stderr = '', error = null } = {}) {
  return (file, args, options, callback) => {
    const child = new EventEmitter();
    child.kill = vi.fn(() => queueMicrotask(() => child.emit('close', 1)));
    child.stdin = {
      on: vi.fn(),
      end: () => {
        callback(
          error,
          typeof value === 'string' ? value : JSON.stringify(value),
          stderr,
        );
        child.emit('close', 0);
      },
    };
    return child;
  };
}
const base = {
  pythonPath: 'C:/runtime/python.exe',
  workerPath: 'E:/app/worker.py',
};
it('admits only bounded source candidates and rejects malformed public worker protocol', async () => {
  const candidate = {
    browseId: 'MPREb_test',
    title: 'Album',
    artist: 'Artist',
    year: '2021',
  };
  const request = { action: 'search', query: 'Artist Album' };
  expect(
    await runReleaseCatalogWorker({
      ...base,
      request,
      execFileImpl: responseWorker({ status: 'ok', candidates: [candidate] }),
    }),
  ).toEqual({ status: 'ok', candidates: [candidate] });
  for (const value of [
    '{broken',
    { status: 'wrong' },
    { status: 'ok', candidates: Array(6).fill(candidate) },
    {
      status: 'ok',
      candidates: [{ ...candidate, browseId: 'https://private' }],
    },
    { status: 'ok', candidates: [{ ...candidate, title: 'bad\ntext' }] },
    { status: 'ok', manifest: { path: 'private' } },
  ])
    expect(
      await runReleaseCatalogWorker({
        ...base,
        request,
        execFileImpl: responseWorker(value),
      }),
    ).toEqual({ status: 'error', reason: 'schema-error' });
  for (const reason of ['schema-error', 'provider-unavailable', 'private-body'])
    expect(
      await runReleaseCatalogWorker({
        ...base,
        request,
        execFileImpl: responseWorker({ status: 'error', reason }),
      }),
    ).toEqual({
      status: 'error',
      reason: reason === 'private-body' ? 'worker-failed' : reason,
    });
});
it('verifies returned source manifest and refuses relative launch paths or invalid requests', async () => {
  const request = { action: 'resolve', videoId: 'rgNdeflYdYw' };
  const manifest = {
    playlistId: 'OLAK5uy_test',
    browseId: 'MPREb_test',
    title: 'Album',
    artist: '',
    type: 'single',
    year: null,
    reportedTotal: 1,
    completeness: 'complete',
    slots: [
      {
        position: 1,
        videoId: 'rgNdeflYdYw',
        title: 'Song',
        artist: '',
        duration: null,
        available: true,
      },
    ],
  };
  expect(
    await runReleaseCatalogWorker({
      ...base,
      request,
      execFileImpl: responseWorker({ status: 'ok', manifest }),
    }),
  ).toEqual({ status: 'ok', manifest });
  await expect(
    runReleaseCatalogWorker({ ...base, pythonPath: 'relative', request }),
  ).rejects.toThrow('absolute');
  for (const input of [
    { action: 'search', query: '' },
    { action: 'search', query: 'x'.repeat(201) },
    { action: 'search', query: 'x\n' },
    { action: 'resolve', videoId: 'rgNdeflYdYw', url: 'private' },
    { action: 'unknown' },
  ])
    await expect(
      runReleaseCatalogWorker({ ...base, request: input }),
    ).rejects.toThrow();
  expect(
    await runReleaseCatalogWorker({
      ...base,
      request,
      signal: AbortSignal.abort(),
    }),
  ).toEqual({ status: 'error', reason: 'cancelled' });
  expect(
    await runReleaseCatalogWorker({
      ...base,
      request,
      execFileImpl: () => {
        throw Error('spawn');
      },
    }),
  ).toEqual({ status: 'error', reason: 'worker-failed' });
});
it('forces a bounded shutdown when the child never closes', async () => {
  vi.useFakeTimers();
  try {
    const child = new EventEmitter();
    child.kill = vi.fn();
    child.stdin = { on: vi.fn(), end: vi.fn() };
    const pending = runReleaseCatalogWorker({
      ...base,
      request: { action: 'search', query: 'Artist' },
      execFileImpl: () => child,
    });
    await vi.advanceTimersByTimeAsync(32000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(await pending).toEqual({ status: 'error', reason: 'worker-failed' });
  } finally {
    vi.useRealTimers();
  }
});

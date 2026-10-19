import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerLyricsAcousticEstimateHandlers } from './acousticEstimateHandlers.js';
let dir;
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});
describe('main-owned acoustic estimate read boundary', () => {
  it('records private operational failures without leaking context', async () => {
    const handle = vi.fn(),
      recordDiagnostic = vi.fn();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-acoustic-ipc-'));
    fs.mkdirSync(path.join(dir, 'tracks/track-a'), { recursive: true });
    const error = new Error('private-path-secret');
    registerLyricsAcousticEstimateHandlers({
      ipcMain: { handle },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
      readLyrics: () => {
        throw error;
      },
      recordDiagnostic,
    });
    expect(await handle.mock.calls[0][1](null, 'track-a', 'main.lrc')).toEqual({
      status: 'unavailable',
    });
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'lyrics-acoustic', error }),
    );
  });
  it('registers only a read operation and rejects unknown tracks/sources', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-acoustic-ipc-'));
    const handle = vi.fn();
    registerLyricsAcousticEstimateHandlers({
      ipcMain: { handle },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
    });
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0][0]).toBe('lyrics:get-acoustic-estimate');
    const read = handle.mock.calls[0][1];
    expect(await read(null, null, {})).toEqual({ status: 'unavailable' });
    expect(await read(null, '../private', '../main.lrc')).toEqual({
      status: 'unavailable',
    });
    fs.mkdirSync(path.join(dir, 'tracks/track-a/lyrics'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tracks/track-a/audio.mp3'), 'synthetic');
    fs.writeFileSync(
      path.join(dir, 'tracks/track-a/info.json'),
      JSON.stringify({ title: 'synthetic' }),
    );
    fs.writeFileSync(
      path.join(dir, 'tracks/track-a/lyrics/main.lrc'),
      '[00:01]你好',
    );
    expect(await read(null, 'track-a', '../main.lrc')).toEqual({
      status: 'unavailable',
    });
    expect(await read(null, 'track-a', 'main.lrc')).toEqual({
      status: 'missing',
    });
  });
});

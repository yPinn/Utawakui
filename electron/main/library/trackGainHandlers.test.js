import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerLibraryTrackGainHandlers } from './trackGainHandlers.js';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-gain-ipc-'));
  dirs.push(dir);
  const audio = path.join(dir, 'tracks', 'one', 'audio.wav');
  fs.mkdirSync(path.dirname(audio), { recursive: true });
  fs.writeFileSync(audio, 'fixture audio');
  const handlers = new Map();
  const recordDiagnostic = vi.fn();
  registerLibraryTrackGainHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    getLibraryContext: () => ({ dir, epoch: 0 }),
    recordDiagnostic,
  });
  return { handlers, recordDiagnostic };
}

describe('track gain IPC', () => {
  it('reads and saves through the bound edit token', async () => {
    const { handlers } = setup();
    const open = await handlers.get('library:track-gain-get')(null, 'one');
    expect(open).toMatchObject({ ok: true, gainDb: 0 });
    await expect(
      handlers.get('library:track-gain-save')(null, 'one', open.editToken, -3),
    ).resolves.toMatchObject({ ok: true, gainDb: -3 });
  });

  it('reports bounded statuses instead of throwing for expected rejections', async () => {
    const { handlers, recordDiagnostic } = setup();
    await expect(
      handlers.get('library:track-gain-get')(null, 'missing'),
    ).resolves.toEqual({ ok: false, status: 'missing' });
    await expect(
      handlers.get('library:track-gain-save')(null, 'one', 'bad-token', 1),
    ).resolves.toEqual({ ok: false, status: 'invalid' });
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });
});

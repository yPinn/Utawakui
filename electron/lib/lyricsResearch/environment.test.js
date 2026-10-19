import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResearchEnvironment, verifyInstalled } from './environment.js';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function root() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'research-env-'));
  roots.push(directory);
  return directory;
}
describe('isolated research environment filesystem', () => {
  it('requires FFmpeg before any network work and leaves existing installs untouched on failure', async () => {
    const directory = root(),
      download = vi.fn().mockRejectedValue(Error('network'));
    const probe = vi.fn();
    let ffmpeg = null;
    const environment = createResearchEnvironment({
      root: directory,
      getFfmpegPath: () => ffmpeg,
      probe,
      download,
    });
    const options = {
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    };
    await expect(environment.prepare(options)).rejects.toThrow('FFmpeg');
    expect(download).not.toHaveBeenCalled();
    fs.mkdirSync(path.join(directory, 'installed'));
    fs.writeFileSync(path.join(directory, 'installed/sentinel'), 'old');
    ffmpeg = 'C:/ffmpeg.exe';
    await expect(environment.prepare(options)).rejects.toThrow('network');
    expect(fs.readdirSync(directory)).toEqual(['installed']);
    expect(
      fs.readFileSync(path.join(directory, 'installed/sentinel'), 'utf8'),
    ).toBe('old');
    expect(probe).not.toHaveBeenCalled();
  });
  it('waits for transport cleanup after abort and never publishes partial installs', async () => {
    const directory = root();
    const controller = new AbortController();
    const environment = createResearchEnvironment({
      root: directory,
      getFfmpegPath: () => 'C:/ffmpeg.exe',
      probe: vi.fn(),
      download: async (_artifact, file, { signal }) => {
        fs.writeFileSync(file, 'partial');
        controller.abort();
        signal.throwIfAborted();
      },
    });
    await expect(
      environment.prepare({ signal: controller.signal, onProgress: vi.fn() }),
    ).rejects.toThrow();
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(environment.exists()).toBe(false);
  });
  it('rejects damaged installations instead of executing them; removal stays in its root', async () => {
    const directory = root(),
      probe = vi.fn();
    const environment = createResearchEnvironment({
      root: directory,
      getFfmpegPath: () => 'C:/ffmpeg.exe',
      probe,
    });
    fs.mkdirSync(path.join(directory, 'installed'));
    fs.writeFileSync(path.join(directory, 'keep'), 'untouched');
    await expect(
      verifyInstalled(path.join(directory, 'installed')),
    ).rejects.toThrow();
    await expect(
      environment.verify({ signal: new AbortController().signal }),
    ).rejects.toThrow();
    expect(probe).not.toHaveBeenCalled();
    await environment.remove({ signal: new AbortController().signal });
    expect(environment.exists()).toBe(false);
    expect(fs.readFileSync(path.join(directory, 'keep'), 'utf8')).toBe(
      'untouched',
    );
    expect(() => createResearchEnvironment({ root: 'relative' })).toThrow();
  });
});

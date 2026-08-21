import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import {
  buildPythonYtdlpArgs,
  createPythonYtdlpRunner,
} from './pythonYtdlp.js';

function makeProcess({ stdout = '', stderr = '', code = 0 } = {}) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  queueMicrotask(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', code);
  });
  return proc;
}

describe('buildPythonYtdlpArgs', () => {
  it('maps Utawakui yt-dlp options to an allowlisted Python CLI invocation', () => {
    expect(
      buildPythonYtdlpArgs('https://www.youtube.com/watch?v=Sw2SuVkxw78', {
        dumpSingleJson: true,
        skipDownload: true,
        noPlaylist: true,
        quiet: true,
        noWarnings: true,
        flatPlaylist: true,
        output: 'audio.%(ext)s',
        format: 'bestaudio/best',
        extractorArgs: 'youtube:player_client=mweb',
        jsRuntimes: 'node:C:\\App\\electron.exe',
        remoteComponents: 'ejs:github',
        pluginDirs: 'C:\\AppData\\provider\\plugins',
        cacheDir: 'C:\\AppData\\provider\\cache',
        writeInfoJson: true,
        writeThumbnail: true,
        writeSubs: true,
        writeAutoSubs: false,
        subLangs: 'ja',
        subFormat: 'vtt',
        cookiesFromBrowser: 'firefox',
        impersonate: 'chrome',
      }),
    ).toEqual([
      '-m',
      'yt_dlp',
      '--dump-single-json',
      '--skip-download',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      '--flat-playlist',
      '--output',
      'audio.%(ext)s',
      '--format',
      'bestaudio/best',
      '--extractor-args',
      'youtube:player_client=mweb',
      '--js-runtimes',
      'node:C:\\App\\electron.exe',
      '--remote-components',
      'ejs:github',
      '--plugin-dirs',
      'C:\\AppData\\provider\\plugins',
      '--cache-dir',
      'C:\\AppData\\provider\\cache',
      '--write-info-json',
      '--write-thumbnail',
      '--write-subs',
      '--sub-langs',
      'ja',
      '--sub-format',
      'vtt',
      '--cookies-from-browser',
      'firefox',
      '--impersonate',
      'chrome',
      'https://www.youtube.com/watch?v=Sw2SuVkxw78',
    ]);
  });

  it('rejects unknown option keys instead of forwarding arbitrary yt-dlp flags', () => {
    expect(() =>
      buildPythonYtdlpArgs('https://example.test/video', {
        exec: 'powershell',
      }),
    ).toThrow('unsupported yt-dlp option: exec');
  });

  it('omits disabled subtitle flags instead of passing false values', () => {
    expect(
      buildPythonYtdlpArgs('https://example.test/video', {
        writeSubs: false,
        writeAutoSubs: false,
      }),
    ).toEqual(['-m', 'yt_dlp', 'https://example.test/video']);
  });

  it('repeats extractor-args when multiple extractor namespaces are configured', () => {
    expect(
      buildPythonYtdlpArgs('https://example.test/video', {
        extractorArgs: [
          'youtube:player_client=mweb',
          'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4417',
        ],
      }),
    ).toEqual([
      '-m',
      'yt_dlp',
      '--extractor-args',
      'youtube:player_client=mweb',
      '--extractor-args',
      'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4417',
      'https://example.test/video',
    ]);
  });
});

describe('createPythonYtdlpRunner', () => {
  it('runs python -m yt_dlp with isolated env and parses dumpSingleJson output', async () => {
    const spawnImpl = vi.fn(() =>
      makeProcess({
        stdout: '{"id":"Sw2SuVkxw78","title":"Song"}\n',
      }),
    );
    const runner = createPythonYtdlpRunner({
      pythonPath: 'C:\\Runtime\\python.exe',
      pluginDirs: 'C:\\Runtime\\plugins',
      cacheDir: 'C:\\Runtime\\cache',
      nodeRuntime: 'C:\\App\\electron.exe',
      providerBaseUrl: 'http://127.0.0.1:4417',
      spawnImpl,
    });

    await expect(
      runner('https://www.youtube.com/watch?v=Sw2SuVkxw78', {
        dumpSingleJson: true,
        skipDownload: true,
      }),
    ).resolves.toEqual({ id: 'Sw2SuVkxw78', title: 'Song' });

    expect(spawnImpl).toHaveBeenCalledWith(
      'C:\\Runtime\\python.exe',
      expect.arrayContaining([
        '--plugin-dirs',
        'C:\\Runtime\\plugins',
        '--cache-dir',
        'C:\\Runtime\\cache',
        '--remote-components',
        'ejs:github',
        '--js-runtimes',
        'node:C:\\App\\electron.exe',
        '--extractor-args',
        'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4417',
      ]),
      expect.objectContaining({
        windowsHide: true,
        env: expect.objectContaining({
          ELECTRON_RUN_AS_NODE: '1',
          PYTHONNOUSERSITE: '1',
        }),
      }),
    );
  });

  it('concretizes the default bare node runtime to Electron-as-Node', async () => {
    const spawnImpl = vi.fn(() => makeProcess({ stdout: 'ok' }));
    const runner = createPythonYtdlpRunner({
      pythonPath: 'C:\\Runtime\\python.exe',
      nodeRuntime: 'C:\\App\\electron.exe',
      spawnImpl,
    });

    await runner('https://example.test/video', { jsRuntimes: 'node' });

    expect(spawnImpl.mock.calls[0][1]).toContain('node:C:\\App\\electron.exe');
  });

  it('keeps an explicit non-default JavaScript runtime untouched', async () => {
    const spawnImpl = vi.fn(() => makeProcess({ stdout: 'ok' }));
    const runner = createPythonYtdlpRunner({
      pythonPath: 'C:\\Runtime\\python.exe',
      nodeRuntime: 'C:\\App\\electron.exe',
      spawnImpl,
    });

    await runner('https://example.test/video', {
      jsRuntimes: 'deno:C:\\Tools\\deno.exe',
    });

    expect(spawnImpl.mock.calls[0][1]).toContain('deno:C:\\Tools\\deno.exe');
    expect(spawnImpl.mock.calls[0][1]).not.toContain(
      'node:C:\\App\\electron.exe',
    );
  });

  it('rejects with stderr attached when yt-dlp exits nonzero', async () => {
    const runner = createPythonYtdlpRunner({
      pythonPath: 'python.exe',
      spawnImpl: vi.fn(() =>
        makeProcess({
          stderr: 'ERROR: unable to download video data: HTTP Error 403',
          code: 1,
        }),
      ),
    });

    await expect(
      runner('https://example.test/video', { skipDownload: true }),
    ).rejects.toMatchObject({
      stderr: 'ERROR: unable to download video data: HTTP Error 403',
      code: 1,
    });
  });
});

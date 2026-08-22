import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import lyricsHandlersModule from './lyricsHandlers.js';

const { registerLyricsHandlers } = lyricsHandlersModule;

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

describe('lyrics timing IPC', () => {
  let dir;
  let trackDir;
  let ipcMain;
  let notifyLibraryUpdated;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-lyrics-ipc-'));
    trackDir = path.join(dir, 'tracks', 'track-a');
    fs.mkdirSync(path.join(trackDir, 'lyrics'), { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
    fs.writeFileSync(
      path.join(trackDir, 'lyrics', 'main.lrc'),
      '[00:01.00]Hello',
    );

    ipcMain = createIpcMain();
    notifyLibraryUpdated = vi.fn();
    registerLyricsHandlers({
      ipcMain,
      dialog: { showOpenDialog: vi.fn() },
      getConfig: () => ({}),
      resolveDownloadDir: () => dir,
      getMainWindow: () => null,
      notifyLibraryUpdated,
      requireFeatureGate: vi.fn(),
      featureIds: { LYRICS_FLOW: 'lyrics-flow' },
    });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loads source identity and saves a bounded main-derived timing sidecar', async () => {
    const loaded = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const document = {
      schemaVersion: 1,
      documentId: 'lyr_document_01',
      normalizerProfileId: loaded.timing.normalizerProfileId,
      source: {
        filename: 'main.lrc',
        sha256: loaded.timing.sourceFingerprint,
      },
      lines: [
        {
          lineId: 'line_01',
          text: 'Hello',
          startMs: 1000,
          endMs: null,
        },
      ],
    };

    await expect(
      ipcMain.handlers.get('lyrics:save-timing')(
        null,
        'track-a',
        'main.lrc',
        loaded.timing.sourceFingerprint,
        document,
      ),
    ).resolves.toMatchObject({
      status: 'current',
      document: { documentId: 'lyr_document_01', granularity: 'T1' },
    });
    expect(notifyLibraryUpdated).toHaveBeenCalledOnce();
    expect(
      fs.existsSync(path.join(trackDir, 'lyrics', 'timing', 'main.lrc.json')),
    ).toBe(true);
  });

  it('rejects unknown tracks, unsafe filenames, and stale source fingerprints', async () => {
    const save = ipcMain.handlers.get('lyrics:save-timing');
    const document = {
      schemaVersion: 1,
      documentId: 'lyr_document_01',
      normalizerProfileId: 'lyrics-source-v1',
      source: { filename: 'main.lrc', sha256: 'a'.repeat(64) },
      lines: [],
    };

    await expect(
      save(null, 'missing', 'main.lrc', 'a'.repeat(64), document),
    ).rejects.toThrow(/unknown track/i);
    await expect(
      save(null, 'track-a', '../main.lrc', 'a'.repeat(64), document),
    ).rejects.toThrow();
    await expect(
      save(null, 'track-a', 'main.lrc', 'a'.repeat(64), document),
    ).rejects.toThrow(/changed/i);
    expect(notifyLibraryUpdated).not.toHaveBeenCalled();
  });

  it('rejects stale, duplicate, and unknown-target reading identities before work', async () => {
    const loaded = await ipcMain.handlers.get('lyrics:get-track')(
      null,
      'track-a',
      'main.lrc',
    );
    const setLine = ipcMain.handlers.get('lyrics:set-reading-line');
    const identity = {
      documentId: 'lyr_document_01',
      sourceFingerprint: loaded.timing.sourceFingerprint,
      targetLineId: 'line_01',
      lines: [{ lineId: 'line_01', text: 'Hello' }],
    };

    await expect(
      setLine(null, 'track-a', 'main.lrc', {
        ...identity,
        sourceFingerprint: 'a'.repeat(64),
      }),
    ).rejects.toThrow(/stale or invalid/);
    await expect(
      setLine(null, 'track-a', 'main.lrc', {
        ...identity,
        lines: [
          { lineId: 'line_01', text: 'Hello' },
          { lineId: 'line_01', text: 'Again' },
        ],
      }),
    ).rejects.toThrow(/lines are invalid/);
    await expect(
      setLine(null, 'track-a', 'main.lrc', {
        ...identity,
        targetLineId: 'missing_line',
      }),
    ).rejects.toThrow(/target line is invalid/);
  });
});

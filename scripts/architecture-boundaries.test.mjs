import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('architecture ownership boundaries', () => {
  it('keeps app-wide presentation contracts outside the Overlay delivery tree', () => {
    for (const relativePath of [
      'src/components/output/MangaFrameSvg.vue',
      'src/components/output/ObsTemplateMockup.vue',
      'src/composables/usePerformerViewState.js',
      'src/utils/performerView.js',
    ]) {
      expect(read(relativePath)).not.toContain('overlay/shared/');
    }

    for (const filename of [
      'lyricsPresentation.mjs',
      'mangaFrameContract.mjs',
      'state.mjs',
    ]) {
      expect(existsSync(resolve(root, 'shared/presentation', filename))).toBe(
        true,
      );
    }
  });

  it('removes unreferenced OBS wrapper views', () => {
    expect(existsSync(resolve(root, 'src/views/ObsLyricsView.vue'))).toBe(
      false,
    );
    expect(existsSync(resolve(root, 'src/views/ObsSetlistView.vue'))).toBe(
      false,
    );
  });

  it('keeps featureDependencies.js as a small compatibility barrel', () => {
    const barrel = read('electron/lib/featureDependencies.js');
    expect(barrel.split(/\r?\n/u).length).toBeLessThan(100);
    for (const filename of [
      'registry.js',
      'download.js',
      'archive.js',
      'manifests.js',
      'providerRuntime.js',
      'ffmpeg.js',
      'models.js',
      'service.js',
    ]) {
      expect(
        existsSync(resolve(root, 'electron/lib/featureDependencies', filename)),
      ).toBe(true);
    }
  });

  it('keeps Output HTTP delivery separate from WebSocket state ownership', () => {
    const entry = read('electron/lib/outputServer.js');
    const httpDelivery = read('electron/lib/outputServer/http.js');

    expect(entry).toContain("require('./outputServer/http')");
    expect(entry.split(/\r?\n/u).length).toBeLessThan(700);
    expect(httpDelivery).not.toContain("require('ws')");
    expect(httpDelivery).not.toContain('createOutputClientDelivery');
    expect(httpDelivery).toContain('createOutputHttpHandler');
  });

  it('keeps the Lyrics IPC facade split by product responsibility', () => {
    const facade = read('electron/main/lyricsHandlers.js');
    const acquisition = read('electron/main/lyrics/acquisitionHandlers.js');
    const documents = read('electron/main/lyrics/documentHandlers.js');
    const readings = read('electron/main/lyrics/readingHandlers.js');

    expect(facade.split(/\r?\n/u).length).toBeLessThan(120);
    for (const filename of [
      'acquisitionHandlers.js',
      'documentHandlers.js',
      'readingHandlers.js',
    ]) {
      expect(existsSync(resolve(root, 'electron/main/lyrics', filename))).toBe(
        true,
      );
    }
    expect(facade).not.toContain("require('../lib/");
    expect(acquisition).not.toContain('worker_threads');
    expect(acquisition).not.toContain('importManualLyrics');
    expect(documents).not.toContain('probeMusixmatchLyrics');
    expect(documents).not.toContain('worker_threads');
    expect(readings).not.toContain('../lib/lrclib');
    expect(readings).not.toContain('../lib/musixmatch');
  });

  it('keeps durable architecture guidance aligned with the composition root', () => {
    const guidance = read('AGENTS.md');
    expect(guidance).not.toContain('now ~210 lines');
    expect(guidance).not.toContain('ytdlpHandlers.js');
  });
});

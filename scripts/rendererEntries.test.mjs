import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import entries from '../shared/rendererEntries.json';
import viteConfig from '../vite.config.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

describe('renderer entry and window ownership boundary', () => {
  it('builds the single colocated prompter entry and keeps the main entry at root', () => {
    expect(entries).toEqual({
      main: 'index.html',
      prompter: 'src/entries/prompter/index.html',
    });
    expect(viteConfig.build.rollupOptions.input).toEqual({
      main: path.join(root, entries.main),
      prompter: path.join(root, entries.prompter),
    });
    expect(read(entries.prompter)).toContain('src="./main.js"');
    expect(read('src/entries/prompter/main.js')).toContain(
      "registerRendererSurfaceRoot('performer')",
    );
    for (const retired of [
      'performer-view.html',
      'src/performer-main.js',
      'electron/main/windowState.js',
      'electron/main/performerWindow.js',
    ]) {
      expect(existsSync(path.join(root, retired)), retired).toBe(false);
    }
  });

  it('keeps window roles separate from their unchanged preload and IPC capabilities', () => {
    const main = read('electron/main.js');
    expect(main).toContain("require('./main/windows/mainWindow')");
    expect(main).toContain("require('./main/windows/prompterWindow')");
    expect(main).toContain('devServerUrl(rendererEntries.prompter)');
    expect(main).toContain("'dist', rendererEntries.prompter");
    expect(main).toMatch(
      /preloadPath:\s*resolveRuntimeEntry\(\s*path.resolve\(__dirname,\s*'\.\.'\),\s*'performerPreload',?\s*\)/u,
    );
    expect(read('electron/main/windows/prompterWindow.js')).toContain(
      "'performer-view:snapshot'",
    );
    expect(read('electron/performerPreload.js')).toContain(
      "exposeInMainWorld('UtawakuiPerformer'",
    );
    expect(viteConfig.build.rollupOptions.input).not.toHaveProperty('output');
  });
});

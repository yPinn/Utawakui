import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_DESTINATIONS } from '../utils/appDestinationRegistry.js';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('contextual capability boundaries during Phase 2', () => {
  const appSource = readSource('../App.vue');
  const internalViewsBranch = appSource.match(
    /const\s+internalViews\s*=\s*internalWorkbenchesEnabled\s*\?\s*\{([\s\S]*?)\n\s*\}\s*:\s*\{\};/u,
  )?.[1];

  it('keeps the verified legacy entries until the three-destination cutover', () => {
    expect(APP_DESTINATIONS.map(({ id }) => id)).toEqual([
      'setlist',
      'lyrics',
      'output',
      'import',
    ]);

    expect(appSource).toContain('lyrics: LyricsView');
    expect(appSource).toContain('import: ImportPage');
  });

  it('keeps Separation attached to track and Lyrics contexts instead of a Page', () => {
    const lyricsHeaderSource = readSource(
      '../components/lyrics/LyricsWorkspaceHeader.vue',
    );
    const playerToolsSource = readSource(
      '../components/playback/PlayerToolsPanel.vue',
    );

    expect(lyricsHeaderSource).toContain('<SeparationPresetControl');
    expect(playerToolsSource).toContain('<SeparationPresetControl');
    expect(APP_DESTINATIONS.some(({ id }) => id === 'separation')).toBe(false);
    expect(
      existsSync(new URL('../pages/SeparationPage.vue', import.meta.url)),
    ).toBe(false);
  });

  it('keeps Provider acquisition inside Import and provider review dev-only', () => {
    const importWorkspaceSource = readSource(
      '../components/import/ImportWorkspace.vue',
    );
    const importViewSource = readSource('../views/ImportView.vue');
    expect(importWorkspaceSource).toContain('<ImportView />');
    expect(importViewSource).toContain('<ProviderImportPanel />');
    expect(internalViewsBranch).toContain(
      "'lyrics-provider-review': defineAsyncComponent",
    );
    expect(APP_DESTINATIONS.some(({ id }) => id === 'provider')).toBe(false);
    expect(appSource).toMatch(
      /const\s+internalWorkbenchesEnabled\s*=\s*import\.meta\.env\.DEV;/u,
    );
    expect(
      existsSync(new URL('../pages/ProviderPage.vue', import.meta.url)),
    ).toBe(false);
  });

  it('keeps Music Analysis as an internal workbench rather than a product destination', () => {
    expect(internalViewsBranch).toContain(
      "'music-analysis': defineAsyncComponent",
    );
    expect(APP_DESTINATIONS.some(({ id }) => id === 'music-analysis')).toBe(
      false,
    );
    expect(
      existsSync(new URL('../pages/AnalysisPage.vue', import.meta.url)),
    ).toBe(false);
  });
});

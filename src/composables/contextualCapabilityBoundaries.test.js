import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_DESTINATIONS } from '../utils/appDestinationRegistry.js';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('contextual capability boundaries after the destination cutover', () => {
  const appSource = readSource('../App.vue');
  const internalViewsBranch = appSource.match(
    /const\s+internalViews\s*=\s*internalWorkbenchesEnabled\s*\?\s*\{([\s\S]*?)\n\s*\}\s*:\s*\{\};/u,
  )?.[1];

  it('keeps capability workspaces out of the four public destinations', () => {
    expect(APP_DESTINATIONS.map(({ id }) => id)).toEqual([
      'library',
      'performance',
      'display',
      'settings',
    ]);

    expect(appSource).not.toContain('lyrics: LyricsView');
    expect(appSource).not.toContain('import: ImportPage');
    expect(appSource).toContain('library: LibraryPage');
    expect(appSource).toContain('performance: PerformancePage');
    expect(appSource).toContain('display: DisplayPage');
    expect(appSource).toContain('settings: SettingsPage');
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

  it('keeps Provider acquisition inside the Import Dock and provider review dev-only', () => {
    const importDockSource = readSource(
      '../components/import/ImportDockContent.vue',
    );
    const importReviewSource = readSource(
      '../components/import/ImportReviewModal.vue',
    );
    expect(importDockSource).toContain('<ImportReviewModal');
    expect(importReviewSource).toContain('<ImportCollectionReview />');
    expect(importReviewSource).not.toContain('ProviderImportPanel');
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

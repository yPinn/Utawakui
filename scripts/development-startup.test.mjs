import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config.js';

const appSource = readFileSync(
  new URL('../src/App.vue', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(
  new URL('../electron/main.js', import.meta.url),
  'utf8',
);
const windowStateSource = readFileSync(
  new URL('../electron/main/windowState.js', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const PUBLIC_INACTIVE_VIEWS = [
  'OutputView',
  'LyricsView',
  'ImportView',
  'SettingsView',
];
const INTERNAL_VIEWS = [
  ['lyrics-provider-review', 'LyricsProviderReviewView'],
  ['demo', 'DemoView'],
  ['music-analysis', 'MusicAnalysisView'],
];

describe('development startup contract', () => {
  it('keeps the initial Setlist view eager and lazy-loads every inactive view', () => {
    expect(appSource).toContain(
      "import SetlistView from './views/SetlistView.vue';",
    );

    for (const viewName of PUBLIC_INACTIVE_VIEWS) {
      expect(appSource).not.toMatch(
        new RegExp(`import\\s+${viewName}\\s+from`, 'u'),
      );
      expect(appSource).toMatch(
        new RegExp(`const\\s+${viewName}\\s*=\\s*defineAsyncComponent`, 'u'),
      );
      expect(appSource).toContain(`import('./views/${viewName}.vue')`);
    }

    expect(appSource).toContain(
      'const internalWorkbenchesEnabled = import.meta.env.DEV;',
    );
    expect(appSource).toContain(
      'const internalViews = internalWorkbenchesEnabled',
    );
    for (const [viewId, viewName] of INTERNAL_VIEWS) {
      expect(appSource).not.toMatch(
        new RegExp(`const\\s+${viewName}\\s*=`, 'u'),
      );
      expect(appSource).toMatch(
        new RegExp(
          `['"]?${viewId}['"]?:\\s*defineAsyncComponent\\([\\s\\S]*?import\\('\\./views/${viewName}\\.vue'\\)`,
          'u',
        ),
      );
    }
  });

  it('does not watch generated artifacts during development', () => {
    expect(viteConfig.server?.watch?.ignored).toEqual(
      expect.arrayContaining([
        '**/.tmp/**',
        '**/coverage/**',
        '**/release/**',
        '**/release-*/**',
      ]),
    );
  });

  it('preserves terminal scrollback when Vite starts or reloads', () => {
    expect(viteConfig.clearScreen).toBe(false);
  });

  it('keeps normal dev lean and exposes an explicit DevTools launch command', () => {
    expect(packageJson.scripts.dev).not.toContain('--devtools');
    expect(packageJson.scripts['dev:tools']).toContain(
      'electron . --dev --devtools',
    );
  });

  it('keeps the lyrics-provider review bridge and IPC registration dev-only', () => {
    expect(windowStateSource).toContain(
      "isDev ? ['--internal-workbenches-enabled=1'] : []",
    );
    expect(mainSource).toMatch(
      /if \(windowState\.isDev\) \{[\s\S]*?require\('\.\/lib\/lyricsProviderCorpusReview'\)[\s\S]*?registerLyricsProviderCorpusReviewHandlers/u,
    );
    expect(mainSource).toMatch(
      /registerLyricsProviderCorpusReviewHandlers\(\{[\s\S]*?writeClipboardText:[\s\S]*?clipboard\.writeText[\s\S]*?openExternal:[\s\S]*?shell\.openExternal/u,
    );
  });
});

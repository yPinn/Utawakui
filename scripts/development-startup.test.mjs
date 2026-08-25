import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config.js';

const appSource = readFileSync(
  new URL('../src/App.vue', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const INACTIVE_VIEWS = [
  'OutputView',
  'LyricsView',
  'ImportView',
  'SettingsView',
  'DemoView',
  'MusicAnalysisView',
];

describe('development startup contract', () => {
  it('keeps the initial Setlist view eager and lazy-loads every inactive view', () => {
    expect(appSource).toContain(
      "import SetlistView from './views/SetlistView.vue';",
    );

    for (const viewName of INACTIVE_VIEWS) {
      expect(appSource).not.toMatch(
        new RegExp(`import\\s+${viewName}\\s+from`, 'u'),
      );
      expect(appSource).toMatch(
        new RegExp(`const\\s+${viewName}\\s*=\\s*defineAsyncComponent`, 'u'),
      );
      expect(appSource).toContain(`import('./views/${viewName}.vue')`);
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

  it('keeps normal dev lean and exposes an explicit DevTools launch command', () => {
    expect(packageJson.scripts.dev).not.toContain('--devtools');
    expect(packageJson.scripts['dev:tools']).toContain(
      'electron . --dev --devtools',
    );
  });
});

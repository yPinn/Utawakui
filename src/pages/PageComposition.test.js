import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readPage(filename) {
  const url = new URL(filename, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

describe('destination Page composition', () => {
  it('gives Library a thin Page owner around the existing Setlist composition', () => {
    const source = readPage('./LibraryPage.vue');

    expect(source).toContain(
      "import SetlistPage from '../components/playlists/SetlistPage.vue';",
    );
    expect(source).toMatch(/<template>\s*<SetlistPage\s*\/>\s*<\/template>/u);
  });

  it('gives Display a thin Page owner around the existing Output composition', () => {
    const source = readPage('./DisplayPage.vue');

    expect(source).toContain(
      "import OutputPage from '../components/output/OutputPage.vue';",
    );
    expect(source).toMatch(/<template>\s*<OutputPage\s*\/>\s*<\/template>/u);
  });

  it('gives Settings a Page owner inside the existing utility layout shell', () => {
    const source = readPage('./SettingsPage.vue');

    expect(source).toContain(
      "import SettingsView from '../views/SettingsView.vue';",
    );
    expect(source).toMatch(/<template>\s*<SettingsView\s*\/>\s*<\/template>/u);
    expect(source).not.toContain('AppUtilityPage');
  });
});

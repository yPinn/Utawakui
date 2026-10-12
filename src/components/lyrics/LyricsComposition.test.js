import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readComponent(filename) {
  const url = new URL(filename, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

describe('lyrics contextual compositions', () => {
  it('keeps the legacy Lyrics destination as a thin authoring adapter', () => {
    const source = readComponent('./LyricsWorkspace.vue');

    expect(source).toContain(
      "import LyricsAuthoringWorkspace from './LyricsAuthoringWorkspace.vue';",
    );
    expect(source).toMatch(
      /<template>\s*<LyricsAuthoringWorkspace\s*\/>\s*<\/template>/u,
    );
    expect(source).not.toContain('useLyrics(');
  });

  it('keeps acquisition and correction controls in the Library authoring composition', () => {
    const source = readComponent('./LyricsAuthoringWorkspace.vue');

    expect(source).toContain('<LyricsWorkspaceHeader');
    expect(source).toContain('<LyricsPreparationBar');
    expect(source).toContain('<LyricsTimingToolbar');
    expect(source).toContain('<LyricsSegmentEditor');
    expect(source).toContain('<LyricsTrackPickerModal');
    expect(source).toContain('<LyricsSourceManagerModal');
    expect(source).toContain('<LyricsLiveTool');
    expect(source).not.toContain("from './LyricsDocumentPanel.vue'");
    expect(source).not.toContain("from './LyricsLiveControls.vue'");
  });

  it('owns the reader and synchronization controls in a reusable live tool', () => {
    const source = readComponent('./LyricsLiveTool.vue');

    expect(source).toContain(
      "import LyricsDocumentPanel from './LyricsDocumentPanel.vue';",
    );
    expect(source).toContain(
      "import LyricsLiveControls from './LyricsLiveControls.vue';",
    );
    expect(source).toContain('<LyricsDocumentPanel');
    expect(source).toContain('<LyricsLiveControls');
    expect(source).not.toContain('LyricsWorkspaceHeader');
    expect(source).not.toContain('LyricsPreparationBar');
    expect(source).not.toContain('LyricsSourceManagerModal');
    expect(source).not.toContain('LyricsTimingToolbar');
  });
});

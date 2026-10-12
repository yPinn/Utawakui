import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readComponent(filename) {
  const url = new URL(filename, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

describe('lyrics contextual compositions', () => {
  it('removes the legacy destination adapters after contextual cutover', () => {
    const workspaceUrl = new URL('./LyricsWorkspace.vue', import.meta.url);
    const viewUrl = new URL('../../views/LyricsView.vue', import.meta.url);

    expect(existsSync(workspaceUrl)).toBe(false);
    expect(existsSync(viewUrl)).toBe(false);
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

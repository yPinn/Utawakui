import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const appSource = readSource('../App.vue');
const libraryPageSource = readSource('../pages/LibraryPage.vue');
const viewSource = readSource('../views/LyricsView.vue');
const workspaceSource = readSource('../components/lyrics/LyricsWorkspace.vue');
const authoringSource = readSource(
  '../components/lyrics/LyricsAuthoringWorkspace.vue',
);
const liveToolSource = readSource('../components/lyrics/LyricsLiveTool.vue');
const documentSource = readSource(
  '../components/lyrics/LyricsDocumentPanel.vue',
);

const productionLyricsSources = [
  'LyricsDocumentPanel.vue',
  'LyricsAuthoringWorkspace.vue',
  'LyricsLiveControls.vue',
  'LyricsLiveTool.vue',
  'LyricsLrclibCandidateRow.vue',
  'LyricsLrclibSearchPanel.vue',
  'LyricsLrclibSearchWorkspace.vue',
  'LyricsManualImportPanel.vue',
  'LyricsPreparationBar.vue',
  'LyricsProviderIcon.vue',
  'LyricsSegmentEditor.vue',
  'LyricsSourceManagerModal.vue',
  'LyricsTrackPickerModal.vue',
  'LyricsWorkspace.vue',
  'LyricsWorkspaceHeader.vue',
].map((filename) => ({
  filename,
  source: readSource(`../components/lyrics/${filename}`),
}));

const legacyTokens = [
  '--ui-radius',
  '--ui-z-dropdown',
  '--ui-font-weight-strong',
  '--ui-font-weight-heavy',
  '--ui-line-height-headline',
  '--ui-motion-fast',
  '--ui-motion-ease',
];

describe('Lyrics Token v2 surface cutover', () => {
  it('keeps Lyrics in Folder workspace mode with feature-owned scroll regions', () => {
    expect(appSource).not.toContain('lyrics: LyricsView');
    expect(libraryPageSource).toContain("surfaceId: 'lyrics'");
    expect(libraryPageSource).toContain("pageMode: 'workspace'");
    expect(libraryPageSource).toContain(
      "import('../components/lyrics/LyricsAuthoringWorkspace.vue')",
    );
    expect(viewSource).toContain('<LyricsWorkspace />');
    expect(authoringSource).toMatch(
      /\.lyrics-workspace\s*\{(?=[^}]*display:\s*flex)(?=[^}]*flex:\s*1)(?=[^}]*min-height:\s*0)[^}]*\}/su,
    );
    expect(authoringSource).toContain('class="lyrics-stage"');
    expect(documentSource).toContain('<UiScrollRegion');
    expect(documentSource).toContain('id="lyrics-document-reader"');
  });

  it('uses only formal v2 token names throughout the production Lyrics surface', () => {
    for (const { filename, source } of productionLyricsSources) {
      for (const token of legacyTokens) {
        expect(source, `${filename}: ${token}`).not.toContain(`var(${token})`);
      }
    }

    expect(authoringSource).toContain('var(--ui-radius-md)');
    expect(documentSource).toContain('var(--ui-layer-overlay)');
    expect(documentSource).toContain('var(--ui-radius-md)');
    expect(
      productionLyricsSources.find(
        ({ filename }) => filename === 'LyricsLrclibCandidateRow.vue',
      ).source,
    ).toContain('var(--ui-motion-duration-fast)');
    expect(
      productionLyricsSources.find(
        ({ filename }) => filename === 'LyricsWorkspaceHeader.vue',
      ).source,
    ).toContain('var(--ui-line-height-heading)');
  });

  it('preserves the authoring, acquisition, reader, timing, and live-control anatomy', () => {
    for (const component of [
      'LyricsWorkspaceHeader',
      'LyricsPreparationBar',
      'LyricsTimingToolbar',
      'LyricsSegmentEditor',
      'LyricsTrackPickerModal',
      'LyricsSourceManagerModal',
    ]) {
      expect(authoringSource).toContain(`<${component}`);
    }
    for (const component of ['LyricsDocumentPanel', 'LyricsLiveControls']) {
      expect(liveToolSource).toContain(`<${component}`);
    }

    const sourceManager = productionLyricsSources.find(
      ({ filename }) => filename === 'LyricsSourceManagerModal.vue',
    ).source;
    expect(sourceManager).toContain('<LyricsLrclibSearchWorkspace');
    expect(sourceManager).toContain('<LyricsManualImportPanel');
    expect(sourceManager).toContain('<LyricsLrclibSearchPanel');
  });

  it('keeps the Internal Tools provider review outside the production Lyrics slice', () => {
    expect(viewSource).not.toContain('components/lyrics-provider');
    expect(workspaceSource).not.toContain('components/lyrics-provider');
    expect(
      productionLyricsSources.some(({ filename }) =>
        filename.includes('ProviderReview'),
      ),
    ).toBe(false);
  });
});

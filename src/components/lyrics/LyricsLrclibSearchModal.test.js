import fs from 'fs';
import { describe, expect, it } from 'vitest';

function source(filename) {
  return fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
}

describe('LRCLIB search modal contract', () => {
  it('uses one modal shell and switches to a dedicated search workspace', () => {
    const manager = source('./LyricsSourceManagerModal.vue');
    const panel = source('./LyricsLrclibSearchPanel.vue');

    expect(manager.match(/<UiModal/g)).toHaveLength(1);
    expect(manager).toContain('<LyricsLrclibSearchWorkspace');
    expect(manager).toContain("activeView === 'lrclib'");
    expect(manager).toContain('@back="returnToSources"');
    expect(manager).toMatch(
      /function handleModalClose\(\) \{\s+activeView\.value = 'sources';\s+emit\('close'\);/,
    );
    expect(panel).toContain("emit('openSearch')");
    expect(panel).not.toContain('searchLyricsCandidates');
  });

  it('keeps editable title and artist fields in an explicit submit form', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const button = source('../ui/UiButton.vue');

    expect(workspace).toContain('<form');
    expect(workspace).toContain('@submit.prevent="handleSearch()"');
    expect(workspace).toContain('v-model="titleDraft"');
    expect(workspace).toContain('v-model="artistDraft"');
    expect(workspace).toContain('onUnmounted(clearCandidateSearch)');
    expect(workspace).toContain('submissionPending');
    expect(workspace).toContain('trackContext.id');
    expect(workspace).toContain('歌曲名稱');
    expect(workspace).toContain('歌手');
    expect(workspace).toContain('擴大搜尋');
    expect(workspace).not.toContain('@input="handleSearch');
    expect(button).toContain(':type="type"');
  });

  it('renders grouped bounded results with accessible status and disclosures', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const row = source('./LyricsLrclibCandidateRow.vue');

    expect(workspace).toContain('最佳符合');
    expect(workspace).toContain('相近結果');
    expect(workspace).toContain('aria-live="polite"');
    expect(workspace).toContain('lyrics-lrclib-search__skeleton');
    expect(row).toContain('<details');
    expect(row).toContain('dir="auto"');
    expect(row).toContain('presentedCandidate.previewLines');
    expect(row).toContain('presentedCandidate.language');
    expect(row).toContain("candidate.saveState === 'update-available'");
    expect(row).toContain('retrievedAtLabel(presentedCandidate.retrievedAt)');
    expect(row).not.toContain('previewFingerprint');
  });

  it('stacks query and candidate layouts at the established narrow breakpoint', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const row = source('./LyricsLrclibCandidateRow.vue');

    expect(workspace).toContain('@media (max-width: 680px)');
    expect(row).toContain('@media (max-width: 680px)');
    expect(workspace).toContain('overflow-y: auto');
  });
});

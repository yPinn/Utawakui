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
    expect(workspace.match(/<UiTextField/g)).toHaveLength(2);
    expect(workspace).not.toContain('<input');
    expect(workspace).toContain('擴大搜尋');
    expect(workspace).not.toContain('@input="handleSearch');
    expect(workspace).toContain('onMounted(() =>');
    expect(workspace).toContain('handleSearch()');
    expect(button).toContain(':type="type"');
  });

  it('renders grouped bounded results without exposing provider diagnostics', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const row = source('./LyricsLrclibCandidateRow.vue');

    expect(workspace).toContain('最佳符合');
    expect(workspace).toContain('相近結果');
    expect(workspace).toContain('aria-live="polite"');
    expect(workspace).toContain('lyrics-lrclib-search__skeleton');
    expect(row).not.toContain('<details');
    expect(row).toContain('dir="auto"');
    expect(row).toContain('presentedCandidate.previewLines');
    expect(row).toContain('candidateImportMessage');
    expect(row).toContain('previewLineHasTiming(line)');
    expect(row).toContain("candidate.saveState === 'update-available'");
    expect(row).not.toContain('LRCLIB id');
    expect(row).not.toContain('資料量');
    expect(row).not.toContain('技術層級');
    expect(row).not.toContain('符合依據');
    expect(row).not.toContain('上次保存');
    expect(row).not.toContain('capabilityTechnicalLabel');
    expect(row).not.toContain('candidateDataLabel');
    expect(row).not.toContain('matchReasonLabels');
    expect(row).not.toContain('previewFingerprint');
  });

  it('keeps the collapsed preview and saved state on one compact row', () => {
    const row = source('./LyricsLrclibCandidateRow.vue');

    const previewRowIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__preview-row"',
    );
    const previewIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__preview-line"',
    );
    const savedStatusIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__saved-status"',
    );

    expect(previewRowIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeGreaterThan(previewRowIndex);
    expect(savedStatusIndex).toBeGreaterThan(previewIndex);
    expect(row).toMatch(
      /v-if="\s*!expanded &&\s*\(presentedCandidate\.previewLines\?\.\[0\] \|\| candidate\.alreadySaved\)\s*"/s,
    );
    expect(row).toContain('class="lyrics-lrclib-candidate-row__saved-status"');
    expect(row).toContain('<UiChip tone="success">已保存</UiChip>');
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__preview-row\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*var\(--ui-space-2\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__preview-line\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 50%;[^}]*margin:\s*0;/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__saved-status\s*\{[^}]*flex:\s*0 0 auto;[^}]*margin-inline-start:\s*auto;/s,
    );
    expect(row).toContain('v-else-if="candidate.alreadySaved"');
  });

  it('prevents accidental chrome selection while keeping text fields selectable', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const textField = source('../ui/UiTextField.vue');

    expect(workspace).toMatch(
      /\.lyrics-lrclib-search\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s,
    );
    expect(textField).toMatch(
      /\.ui-text-field\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;/s,
    );
  });

  it('lets untimed preview rows replace the timestamp grid without a specificity conflict', () => {
    const row = source('./LyricsLrclibCandidateRow.vue');

    expect(row).toContain('class="lyrics-lrclib-candidate-preview__line"');
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-preview__line\s*\{[^}]*grid-template-columns:\s*var\(--ui-space-7\) minmax\(0, 1fr\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-preview__line--untimed\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-preview__text\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s,
    );
    expect(row).not.toContain('.lyrics-lrclib-candidate-preview__lines li {');
  });

  it('stacks query and candidate layouts at the established narrow breakpoint', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const row = source('./LyricsLrclibCandidateRow.vue');

    expect(workspace).toContain('@media (max-width: 680px)');
    expect(row).toContain('@media (max-width: 680px)');
    expect(workspace).toContain('overflow-y: auto');
  });
});

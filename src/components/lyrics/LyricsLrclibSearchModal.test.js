import fs from 'fs';
import { describe, expect, it } from 'vitest';

function source(filename) {
  return fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
}

describe('online lyrics search modal contract', () => {
  it('uses one modal shell and switches to a provider-scoped search workspace', () => {
    const manager = source('./LyricsSourceManagerModal.vue');
    const panel = source('./LyricsLrclibSearchPanel.vue');
    const providerIcon = source('./LyricsProviderIcon.vue');

    expect(manager.match(/<UiModal/g)).toHaveLength(1);
    expect(manager).toContain('<LyricsLrclibSearchWorkspace');
    expect(manager).toContain('activeProviderId.value = providerId');
    expect(manager).toContain("all: Object.freeze({ id: 'all'");
    expect(manager).toContain('provider-id="all"');
    expect(manager).toContain('provider-label="所有線上來源"');
    expect(manager).toContain('provider-id="netease"');
    expect(manager).toContain('provider-label="網易雲音樂"');
    expect(manager).toContain(':provider-id="activeProvider.id"');
    expect(manager).toContain('@back="returnToSources"');
    expect(manager).toContain('lyrics-source-manager__online-list');
    expect(manager).toContain('線上搜尋');
    expect(manager).not.toContain('同時搜尋可用來源');
    expect(manager).not.toContain('只有完整有效的逐字時間');
    expect(manager).toMatch(
      /function handleModalClose\(\) \{\s+activeView\.value = 'sources';\s+emit\('close'\);/,
    );
    expect(panel).toContain("emit('openSearch')");
    expect(panel).not.toContain('description');
    expect(panel).not.toContain('<UiChip');
    expect(panel).not.toContain('searchLyricsCandidates');
    expect(panel).toContain('<LyricsProviderIcon');
    expect(panel).toContain(':provider-id="providerId"');
    expect(providerIcon).toContain("providerId === 'lrclib'");
    expect(providerIcon).toContain("providerId === 'netease'");
    expect(providerIcon).toContain('<Disc3');
    expect(providerIcon).toContain('LRC');
    expect(providerIcon).not.toMatch(/https?:\/\//);
  });

  it('keeps source tier left and signed offset right in a compact divided slot', () => {
    const manager = source('./LyricsSourceManagerModal.vue');

    expect(manager).toContain('normalizeLyricsDocument');
    expect(manager).toContain('function sourceTierLabel(source)');
    expect(manager).toContain('formatLyricsSourceOffset');
    expect(manager).toContain('class="lyrics-source-manager__row-meta"');
    expect(manager).toContain('class="lyrics-source-manager__row-tier"');
    expect(manager).toContain('class="lyrics-source-manager__row-offset"');
    expect(
      manager.indexOf('class="lyrics-source-manager__row-tier"'),
    ).toBeLessThan(
      manager.indexOf('class="lyrics-source-manager__row-offset"'),
    );
    expect(manager).not.toMatch(/>\s*歌詞 offset\s*</);
    expect(manager).toContain('function sourceOffsetMs(source)');
    expect(manager).toContain('Math.round(state.offsetSeconds * 1000)');
    expect(manager).toContain(
      'formatLyricsSourceOffset(sourceOffsetMs(source))',
    );
    expect(manager).toMatch(
      /\.lyrics-source-manager__row\s*\{[^}]*--ui-lyrics-source-meta-width:\s*6rem;/s,
    );
    expect(manager).not.toMatch(
      /\.lyrics-source-manager__row\s*\{[^}]*justify-content:\s*space-between;/s,
    );
    expect(manager).toMatch(
      /\.lyrics-source-manager__row-label\s*\{[^}]*flex:\s*1;/s,
    );
    expect(manager).toMatch(
      /\.lyrics-source-manager__row-meta\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--ui-space-5\) minmax\(0, 1fr\);[^}]*column-gap:\s*0;[^}]*flex:\s*0 0 var\(--ui-lyrics-source-meta-width\);[^}]*width:\s*var\(--ui-lyrics-source-meta-width\);/s,
    );
    expect(manager).not.toMatch(
      /\.lyrics-source-manager__row-meta\s*\{[^}]*border-inline-start:/s,
    );
    expect(manager).toMatch(
      /\.lyrics-source-manager__row-offset\s*\{[^}]*padding-inline-start:\s*var\(--ui-space-2\);[^}]*border-inline-start:\s*var\(--ui-border-width\) solid var\(--ui-color-border\);[^}]*font-variant-numeric:\s*tabular-nums;[^}]*text-align:\s*end;[^}]*white-space:\s*nowrap;/s,
    );
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
    expect(workspace).toContain('searchLyricsProviderCandidates');
    expect(workspace).toContain('saveLyricsProviderCandidate');
    expect(workspace).toContain('props.providerId');
    expect(workspace).not.toContain('只搜尋，不會修改曲目資訊');
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
    const group = source('./LyricsProviderRecordingGroup.vue');

    expect(workspace).toContain('最佳符合');
    expect(workspace).toContain('相近結果');
    expect(workspace).toContain('<LyricsProviderRecordingGroup');
    expect(workspace).toContain(':key="group.recordingKey"');
    expect(group).toContain('recommendedCandidateKey');
    expect(group).toContain('v-for="candidate in orderedCandidates"');
    expect(group).not.toContain('alternativesVisible');
    expect(group).not.toContain('顯示其他');
    expect(group).not.toContain('隱藏其他');
    expect(group).toContain(':key="candidate.candidateKey"');
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
    expect(row).toContain('showProvider');
  });

  it('keeps a compact provider-before-time summary in the upper-right', () => {
    const row = source('./LyricsLrclibCandidateRow.vue');

    const titleRowIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__title-row"',
    );
    const titleIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__title"',
    );
    const recommendationIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__recommendation"',
    );
    const subtitleIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__subtitle"',
    );
    const summaryIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__summary"',
    );
    const summaryDetailsIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__summary-details"',
    );
    const providerSlotIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__provider-slot"',
    );
    const providerIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__provider"',
    );
    const durationIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__duration"',
    );
    const previewRowIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__preview-row"',
    );
    const previewIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__preview-line"',
    );
    const savedStatusIndex = row.indexOf(
      'class="lyrics-lrclib-candidate-row__saved-status"',
    );
    const capabilityIndex = row.indexOf(':tone="capabilityTone"');

    expect(titleRowIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeGreaterThan(titleRowIndex);
    expect(recommendationIndex).toBeGreaterThan(titleIndex);
    expect(recommendationIndex).toBeLessThan(subtitleIndex);
    expect(summaryIndex).toBeGreaterThan(recommendationIndex);
    expect(summaryDetailsIndex).toBeGreaterThan(summaryIndex);
    expect(providerSlotIndex).toBeGreaterThan(summaryDetailsIndex);
    expect(providerIndex).toBeGreaterThan(providerSlotIndex);
    expect(durationIndex).toBeGreaterThan(providerIndex);
    expect(providerIndex).toBeLessThan(previewRowIndex);
    expect(previewRowIndex).toBeGreaterThan(-1);
    expect(previewIndex).toBeGreaterThan(previewRowIndex);
    expect(savedStatusIndex).toBeGreaterThan(previewIndex);
    expect(capabilityIndex).toBeGreaterThan(savedStatusIndex);
    expect(row).toContain(
      'v-if="!expanded && presentedCandidate.previewLines?.[0]"',
    );
    expect(row).toContain('class="lyrics-lrclib-candidate-row__saved-status"');
    expect(row).toContain('<UiChip tone="success">已保存</UiChip>');
    expect(row).toContain('class="lyrics-lrclib-candidate-row__metadata"');
    expect(row).toContain("recommended ? '，推薦' : ''");
    expect(row).toContain('aria-hidden="true"');
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__title-row\s*\{[^}]*min-width:\s*0;[^}]*display:\s*flex;[^}]*align-items:\s*flex-start;[^}]*gap:\s*var\(--ui-space-2\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__title\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*0 1 auto;/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__recommendation\s*\{[^}]*flex:\s*0 0 auto;/s,
    );
    expect(row).not.toMatch(
      /\.lyrics-lrclib-candidate-row__summary\s*\{[^}]*gap:/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__summary-details\s*\{[^}]*display:\s*flex;[^}]*flex:\s*0 0 auto;[^}]*align-items:\s*center;/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__provider-slot\s*\{[^}]*flex:\s*0 0 var\(--ui-lyrics-provider-slot-width\);[^}]*width:\s*var\(--ui-lyrics-provider-slot-width\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__duration\s*\{[^}]*flex:\s*0 0 var\(--ui-lyrics-duration-slot-width\);[^}]*width:\s*var\(--ui-lyrics-duration-slot-width\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__duration--divided\s*\{[^}]*border-inline-start:\s*var\(--ui-border-width\) solid var\(--ui-color-border\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row\s*\{[^}]*--ui-lyrics-provider-slot-width:\s*5\.5rem;[^}]*--ui-lyrics-duration-slot-width:\s*5\.5rem;/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__preview-row\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*var\(--ui-space-2\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__preview-line\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 50%;[^}]*margin:\s*0;/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__metadata\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*var\(--ui-space-2\);[^}]*margin-inline-start:\s*auto;/s,
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

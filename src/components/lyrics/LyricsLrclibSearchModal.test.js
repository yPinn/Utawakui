import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';

function source(filename) {
  return readCatalogSource(new URL(filename, import.meta.url));
}

describe('online lyrics search modal contract', () => {
  it('uses the formal button for candidate expansion without overriding interaction paint', () => {
    const row = source('./LyricsLrclibCandidateRow.vue');
    expect(row).not.toContain('<button');
    expect(row).toContain(':icon="expanded ? ChevronDown : ChevronRight"');
    expect(row).toContain(':aria-controls="previewId"');
    expect(row).toContain(':id="previewId"');
    expect(row).not.toContain('__toggle:focus-visible');
    expect(row).not.toContain('__chevron');
    expect(row).toContain('tag="ol"');
    expect(row).toContain('tone="canvas"');
  });
  it('reuses the shared text field for source labels instead of styling a native input', () => {
    const manager = source('./LyricsSourceManagerModal.vue');
    expect(manager).toContain('<UiTextField');
    expect(manager).toContain('label="歌詞來源標籤"');
    expect(manager).not.toContain('<input');
    expect(manager).not.toContain('lyrics-source-manager__input');
  });
  it('keeps a single wide/small shell with stable local and search panes', () => {
    const manager = source('./LyricsSourceManagerModal.vue');
    expect(manager.match(/<UiModal/g)).toHaveLength(1);
    expect(manager).toContain('#header-actions');
    expect(manager).toContain('max-block-size="small"');
    expect(manager).toContain('body-mode="workspace"');
    expect(manager).toContain('v-if="searchMounted"');
    expect(manager).toContain('v-show="searchOpen"');
    expect(manager).toContain('provider-id="all"');
    expect(manager).toContain('@container lyrics-manager (min-width: 40rem)');
    expect(manager).toContain('@media (min-width: 64rem)');
    expect(manager).toContain('grid-template-columns: 16rem minmax(0, 1fr)');
    expect(manager).toContain('searchTriggerRef.value?.$el?.focus?.()');
  });

  it('shows timing and nonzero signed offset alongside a reusable source selection button', () => {
    const manager = source('./LyricsSourceManagerModal.vue');
    expect(manager).toContain('lyricsSourceDisplayTier');
    expect(manager).toContain('v-if="sourceOffsetMs(source)"');
    expect(manager).toContain(
      'formatLyricsSourceOffset(sourceOffsetMs(source))',
    );
    expect(manager).toContain('@click="selectSource(source.filename)"');
    expect(manager).toContain('aria-pressed');
    expect(manager).toMatch(
      /:deep\(\.lyrics-source-manager__local-content\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/u,
    );
  });
  it('keeps editable title and artist fields in an explicit submit form', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const button = source('../ui/UiButton.vue');

    expect(workspace).toContain('tag="form"');
    expect(workspace).toContain('@submit.prevent="handleSearch()"');
    expect(workspace).toContain('v-model="titleDraft"');
    expect(workspace).toContain('v-model="artistDraft"');
    expect(workspace).toContain('onUnmounted(clearCandidateSearch)');
    expect(workspace).toContain('submissionPending');
    expect(workspace).toContain('trackContext.id');
    expect(workspace).toContain('searchLyricsProviderCandidates');
    expect(workspace).toContain('saveLyricsProviderCandidate');
    expect(workspace).toContain('props.providerId');
    expect(workspace).toContain('可用原文、羅馬字或常用譯名搜尋。');
    expect(workspace).toContain('歌曲名稱');
    expect(workspace).toContain('演唱者（選填）');
    expect(workspace).not.toContain('label="歌手"');
    expect(
      workspace.match(/:aria-describedby="`\$\{providerId\}-query-help`"/g),
    ).toHaveLength(2);
    expect(workspace).toContain(':id="`${providerId}-query-help`"');
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

    expect(workspace).toContain('較符合的錄音版本');
    expect(workspace).toContain('其他可能版本');
    expect(workspace).not.toContain('最佳符合');
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

  it('reuses surfaces, loading skeletons and scroll-safe layout across the modal views', () => {
    const manager = source('./LyricsSourceManagerModal.vue');
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const manualImport = source('./LyricsManualImportPanel.vue');
    for (const view of [manager, workspace, manualImport]) {
      expect(view).toContain('<UiSurface');
      expect(view).not.toContain('<input');
      expect(view).not.toContain('<textarea');
    }
    expect(manager).toContain('tag="li"');
    expect(manualImport).toContain('tag="form"');
    expect(workspace).toContain('<UiSkeleton');
    expect(workspace).toContain('<UiScrollLayout');
    expect(workspace).not.toContain('<UiScrollRegion');
    expect(workspace).not.toContain('padding-right: var(--ui-space-1)');
    expect(workspace).not.toContain('skeleton span');
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
    expect(savedStatusIndex).toBeGreaterThan(durationIndex);
    expect(capabilityIndex).toBeGreaterThan(savedStatusIndex);
    expect(row).not.toContain('lyrics-lrclib-candidate-row__preview-row');
    expect(row).not.toContain('lyrics-lrclib-candidate-row__preview-line');
    expect(row).toContain('class="lyrics-lrclib-candidate-row__saved-status"');
    expect(row).toContain('<UiChip tone="success">已儲存</UiChip>');
    expect(row).toContain('class="lyrics-lrclib-candidate-row__metadata"');
    expect(row).toMatch(/props\.recommended\s*\?\s*'建議來源'/u);
    expect(row).toContain('建議來源');
    expect(row).not.toMatch(/>\s*推薦\s*</);
    expect(row).toContain('aria-hidden="true"');
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__title-row\s*\{[^}]*min-width:\s*0;[^}]*display:\s*flex;[^}]*align-items:\s*baseline;[^}]*gap:\s*var\(--ui-space-2\);/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__title\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*0 1 auto;/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__recommendation\s*\{[^}]*flex:\s*0 0 auto;/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__summary\s*\{[^}]*display:\s*grid;[^}]*gap:\s*var\(--ui-space-1\);/s,
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
      /\.lyrics-lrclib-candidate-row\s*\{[^}]*--ui-lyrics-provider-slot-width:\s*5\.5rem;[^}]*--ui-lyrics-duration-slot-width:\s*7\.5rem;/s,
    );
    expect(row).toMatch(
      /\.lyrics-lrclib-candidate-row__metadata\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*var\(--ui-space-2\);[^}]*margin-inline-start:\s*auto;/s,
    );
    expect(row).not.toContain('v-else-if="candidate.alreadySaved"');
    expect(row).not.toContain('已保存');
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

  it('extends the workspace clip boundary for its top-start focus ring', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');

    expect(workspace).toMatch(
      /\.lyrics-lrclib-search\s*\{[\s\S]*?--lyrics-lrclib-search-focus-safe-inset:\s*var\(--ui-focus-safe-inset\);/u,
    );
    expect(workspace).toMatch(
      /\.lyrics-lrclib-search\s*\{[^}]*overflow:\s*clip;[^}]*overflow-clip-margin:\s*var\(--lyrics-lrclib-search-focus-safe-inset\);/su,
    );
    expect(workspace).not.toContain('lyrics-lrclib-search__toolbar');
    expect(workspace).not.toContain('lyrics-lrclib-search__result-meta');
    expect(workspace).toContain('<UiStack');
    expect(workspace).toContain('aria-label="搜尋操作"');
    expect(workspace).toMatch(
      /\.lyrics-lrclib-search__results\s*\{[^}]*min-height:\s*0;/u,
    );
    expect(workspace).toMatch(
      /\.lyrics-lrclib-search__results\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\);/u,
    );
    expect(workspace).toMatch(
      /\.lyrics-lrclib-search__results :deep\(\.lyrics-lrclib-search__results-viewport\)\s*\{\s*block-size:\s*auto;/u,
    );
  });

  it('renders support copy only when needed and reserves scroll-safe result padding', () => {
    const row = source('./LyricsLrclibCandidateRow.vue');
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');

    expect(row.indexOf('aria-label="歌詞預覽"')).toBeLessThan(
      row.indexOf('class="lyrics-lrclib-candidate-row__warning-slot"'),
    );
    expect(row).toMatch(
      /v-if="timelineMessage \|\| visibleWarnings.length"\s+class="lyrics-lrclib-candidate-row__warning-slot"/u,
    );
    expect(workspace).toContain(
      '--ui-scroll-layout-padding-inline-end: var(--ui-space-2)',
    );
    expect(workspace).toContain(
      '--ui-scroll-layout-padding-block-end: var(--ui-space-2)',
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

  it('reflows the query and candidate layouts based on the actual search pane', () => {
    const workspace = source('./LyricsLrclibSearchWorkspace.vue');
    const row = source('./LyricsLrclibCandidateRow.vue');

    expect(workspace).toContain('@container lyrics-search (width < 38rem)');
    expect(row).toContain('@container lyrics-search (width < 32rem)');
    expect(workspace).toContain('<UiScrollLayout');
    expect(workspace).toContain(
      'viewport-class="lyrics-lrclib-search__results-viewport"',
    );
  });
});

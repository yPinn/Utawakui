import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Import preparation composition contract', () => {
  it('mounts Import inside the retained Preparation Dock instead of a Library page', () => {
    const app = readSource('../../App.vue');
    const libraryPage = readSource('../../pages/LibraryPage.vue');

    expect(app).toContain('const PreparationDockPanel = defineAsyncComponent(');
    expect(app).toContain(
      "() => import('./components/preparation/PreparationDockPanel.vue')",
    );
    expect(app).toContain('RIGHT_DOCK_SURFACE_PREPARATION');
    expect(app).toContain('<PreparationDockPanel');
    expect(app).toContain(':active="preparationExpanded"');
    expect(libraryPage).not.toContain('ImportWorkspace');
    expect(libraryPage).not.toContain("surfaceId: 'import'");
  });

  it('keeps quick input and task state in the Dock while collection review uses a wide modal', () => {
    const dock = readSource('./ImportDockContent.vue');
    const modal = readSource('./ImportReviewModal.vue');

    expect(dock).toContain('import { useImportSession }');
    expect(dock).toContain('import { useLocalImport }');
    expect(dock).not.toContain('AppRightDockPanel');
    expect(dock).toContain('<ImportReviewModal');
    expect(dock).toContain('<ImportSourceRow');
    expect(dock).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue';",
    );
    expect(dock).not.toContain("import UiButton from '../ui/UiButton.vue';");
    expect(dock).toContain('label="選擇音訊檔"');
    expect(dock).toContain('<ImportSourceField');
    expect(readSource('./ImportSourceField.vue')).toContain(
      'label="搜尋外部來源"',
    );
    expect(dock).toContain('label="到 YT Music 尋找更多結果"');
    expect(dock).toContain('row-action');
    expect(dock).not.toContain(':action-icon="ListChecks"');
    expect(dock).not.toContain('ListChecks,');
    expect(dock).not.toContain('subtitle="本機與外部來源"');
    expect(dock).toContain('const showLocalStatus = computed(');
    expect(dock).toContain('localImportState.conversionReview');
    expect(dock).toContain('title="需要相容轉檔"');
    expect(dock).toContain('action-label="轉成 FLAC 並匯入"');
    expect(dock).toContain('@action="convertPendingFiles"');
    expect(dock).toContain(':action-disabled="localImportState.isConverting"');
    expect(dock).toContain('const showExternalStatus = computed(');
    expect(dock).not.toContain("state.statusScope === 'object'");
    expect(dock).toContain('() => props.active');
    expect(dock).toContain('reviewOpen.value = false');
    expect(dock).toContain("candidate.status || 'pending'");
    expect(dock).toContain("status === 'downloading'");
    expect(dock).toContain('label: `停止下載');
    expect(dock).toContain(
      ':action-disabled="candidateActionDisabled(entry.source)"',
    );
    expect(modal).toContain('<UiModal');
    expect(modal).toContain('size="wide"');
    expect(modal).toContain('max-block-size="medium"');
    expect(modal).toContain('body-mode="workspace"');
    expect(modal).toContain(':selectable="false"');
    expect(modal).not.toContain('fixed-height');
    expect(modal).toContain('<ImportCollectionReview v-else');
    expect(modal).toContain('<ImportBatchReview');
    expect(modal).toContain('#footer');
    expect(modal).not.toContain('ProviderImportPanel');
    expect(modal).not.toContain('selectionSummary');
    expect(modal).not.toContain('<UiHint');
  });

  it('keeps the summary fixed and gives collection rows one workspace scroll owner', () => {
    const review = readSource('./ImportCollectionReview.vue');
    const layout = readSource('../preparation/PreparationReviewLayout.vue');
    const selection = readSource('./ImportCollectionSelectionList.vue');
    const status = readSource('./ImportCollectionTrackStatus.vue');

    expect(review).not.toContain('<UiSegmentedControl');
    expect(selection).toContain('<UiTrackRow');
    expect(selection).toContain('state-surface');
    expect(selection).toContain('overflow="ellipsis"');
    expect(review).toContain('<UiIconButton');
    expect(review).not.toContain("import UiButton from '../ui/UiButton.vue';");
    expect(review).not.toContain('filter-tab');
    expect(review).not.toContain('preview-panel');
    expect(review).not.toContain('<input');
    expect(review).not.toContain('UiScrollRegion');
    expect(review).toContain('<PreparationReviewLayout');
    expect(layout.match(/<UiScrollLayout\b/gu)).toHaveLength(1);
    expect(layout).toContain('user-select: text');
    expect(selection).toContain('hide-duration');
    expect(selection).not.toContain('UiScrollLayout');

    expect(selection).toContain('<UiCheckbox');
    expect(selection).toContain('<ImportCollectionTrackStatus');
    expect(selection).not.toContain('<TrackTable');
    expect(selection).not.toContain('variant="review"');
    expect(status).toContain('<UiStatusIcon');
    expect(status).not.toContain('QueueTrackButton');
  });

  it('reuses the shared track object primitive without importing Queue behavior', () => {
    const row = readSource('./ImportSourceRow.vue');

    expect(row).toContain("import UiTrackRow from '../ui/UiTrackRow.vue';");
    expect(row).toContain('<UiTrackRow');
    expect(row).toContain('state-surface');
    expect(row).not.toContain('QueueTrackButton');
    expect(row).not.toContain('UiTrackThumb');
    expect(row).not.toContain('draggable');
    expect(row).not.toContain('togglePlayback');
  });
});

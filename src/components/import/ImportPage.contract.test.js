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
    expect(dock).toContain('label="搜尋外部來源"');
    expect(dock).toContain('label="到 YT Music 尋找更多結果"');
    expect(dock).not.toContain('subtitle="本機與外部來源"');
    expect(dock).toContain('const showLocalStatus = computed(');
    expect(dock).toContain('const showExternalStatus = computed(');
    expect(dock).toContain('() => props.active');
    expect(dock).toContain('reviewOpen.value = false');
    expect(dock).toContain("candidate.status || 'pending'");
    expect(modal).toContain('<UiModal');
    expect(modal).toContain('size="wide"');
    expect(modal).toContain('max-block-size="medium"');
    expect(modal).not.toContain('fixed-height');
    expect(modal).toContain('<ImportCollectionReview />');
    expect(modal).toContain('<template #footer>');
    expect(modal).not.toContain('ProviderImportPanel');
  });

  it('keeps collection confirmation in shared controls inside the modal-owned body', () => {
    const review = readSource('./ImportCollectionReview.vue');
    const status = readSource('./ImportCollectionTrackStatus.vue');

    expect(review).toContain('<UiSegmentedControl');
    expect(review).toContain('<TrackTable');
    expect(review).toContain('variant="review"');
    expect(review).toContain('<UiButton');
    expect(review).not.toContain('filter-tab');
    expect(review).not.toContain('preview-panel');
    expect(review).not.toContain('<input');
    expect(review).not.toContain('UiScrollRegion');
    expect(review).not.toContain('UiScrollLayout');

    expect(review).toContain('<UiCheckbox');
    expect(review).toContain('<ImportCollectionTrackStatus');
    expect(review).not.toContain('<UiTrackRow');
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

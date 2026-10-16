import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Import collection review composition', () => {
  it('uses UiTrackRow inside the existing modal scroll owner', () => {
    const source = readSource('./ImportCollectionReview.vue');

    expect(source).toContain('<UiSegmentedControl');
    expect(source).toContain("import UiTrackRow from '../ui/UiTrackRow.vue';");
    expect(source).toContain('<UiTrackRow');
    expect(source).toContain('<ul');
    expect(source).toContain('aria-label="匯入曲目確認"');
    expect(source).toContain('<template #lead>');
    expect(source).toContain('<UiCheckbox');
    expect(source).toContain('<template #trail>');
    expect(source).toContain('<ImportCollectionTrackStatus');
    expect(source).toContain('state-surface');
    expect(source).toContain('overflow="ellipsis"');
    expect(source).not.toContain('<TrackTable');
    expect(source).not.toContain('variant="review"');
    expect(source).not.toContain('ImportCollectionTrackRow');
    expect(source).toContain('@update:model-value="setActiveFilter"');
    expect(source).not.toContain('filter-tab');
    expect(source).not.toContain('preview-panel');
    expect(source).not.toContain('<input');
    expect(source).not.toContain('UiScrollRegion');
    expect(source).not.toContain('UiScrollLayout');
  });

  it('keeps bulk operations compact without removing their accessible names', () => {
    const source = readSource('./ImportCollectionReview.vue');

    expect(source).toContain(
      "import UiIconButton from '../ui/UiIconButton.vue';",
    );
    expect(source).not.toContain("import UiButton from '../ui/UiButton.vue';");
    expect(source.match(/<UiIconButton\b/gu)).toHaveLength(3);
    expect(source).toContain('label="選取未下載"');
    expect(source).toContain(`:label="allSelected ? '取消全選' : '全選'"`);
    expect(source).toContain('label="重試未完成曲目"');
  });

  it('keeps normal identity success quiet while preserving actionable row states', () => {
    const statusSource = readSource('./ImportCollectionTrackStatus.vue');

    expect(statusSource).toContain("!== 'identified'");
    expect(statusSource).toContain('<UiStatusIcon');
    expect(statusSource).toContain(':spinning="status === \'downloading\'"');
  });

  it('switches from selection chrome to the compact execution queue after work starts', () => {
    const source = readSource('./ImportCollectionReview.vue');

    expect(source).toContain(
      "import ImportCollectionExecutionList from './ImportCollectionExecutionList.vue';",
    );
    expect(source).toContain('const executionMode = computed(');
    expect(source).toContain('<ImportCollectionExecutionList');
    expect(source).toContain('v-if="executionMode"');
    expect(source).toContain('@cancel="cancelTrackDownload"');
    expect(source).toContain('@retry-failed="retryFailedTracks"');
    expect(source).toContain('v-else');
  });
});

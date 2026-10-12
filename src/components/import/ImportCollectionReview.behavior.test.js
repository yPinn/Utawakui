import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Import collection review composition', () => {
  it('uses the existing modal body as its scroll owner', () => {
    const source = readSource('./ImportCollectionReview.vue');

    expect(source).toContain('<UiSegmentedControl');
    expect(source).toContain(
      "import TrackTable from '../track/TrackTable.vue';",
    );
    expect(source).toContain('<TrackTable');
    expect(source).toContain('variant="review"');
    expect(source).not.toContain('<ul');
    expect(source).not.toContain('ImportCollectionTrackRow');
    expect(source).toContain('@update:model-value="setActiveFilter"');
    expect(source).not.toContain('filter-tab');
    expect(source).not.toContain('preview-panel');
    expect(source).not.toContain('<input');
    expect(source).not.toContain('UiScrollRegion');
    expect(source).not.toContain('UiScrollLayout');
  });

  it('keeps normal identity success quiet while preserving actionable row states', () => {
    const statusSource = readSource('./ImportCollectionTrackStatus.vue');

    expect(statusSource).toContain("!== 'identified'");
    expect(statusSource).toContain('<UiStatusIcon');
    expect(statusSource).toContain(':spinning="status === \'downloading\'"');
  });
});

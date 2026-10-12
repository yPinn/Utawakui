import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./PreparationDockPanel.vue', import.meta.url),
  'utf8',
);
const importSource = readFileSync(
  new URL('../import/ImportDockContent.vue', import.meta.url),
  'utf8',
);
const separationSource = readFileSync(
  new URL('../separation/SeparationDockContent.vue', import.meta.url),
  'utf8',
);

describe('PreparationDockPanel', () => {
  it('owns the only Dock shell and switches feature content with the shared segmented control', () => {
    expect(source).toContain('<AppRightDockPanel');
    expect(source).toContain('title="曲目準備"');
    expect(source).toContain('collapse-label="摺疊曲目準備"');
    expect(source).toContain('<UiSegmentedControl');
    expect(source).toContain("{ id: 'import', label: '匯入' }");
    expect(source).toContain("{ id: 'separation', label: '伴奏處理' }");
    expect(source).toContain('<ImportDockContent');
    expect(source).toContain('<SeparationDockContent');
    expect(importSource).not.toContain('AppRightDockPanel');
    expect(separationSource).not.toContain('AppRightDockPanel');
    expect(separationSource).not.toContain('useSeparationQueue');
    expect(separationSource).toContain(
      'separationController: { type: Object, required: true }',
    );
  });

  it('remembers the selected preparation tab for the current app session', () => {
    expect(source).toContain(
      "const activePreparationTab = shallowRef('import')",
    );
    expect(source).toContain('v-model="activePreparationTab"');
    expect(source).toContain(':separation-controller="separationController"');
  });
});

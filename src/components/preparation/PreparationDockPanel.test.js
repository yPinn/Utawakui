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
const queueSource = readFileSync(
  new URL('../queue/QueuePanel.vue', import.meta.url),
  'utf8',
);

describe('PreparationDockPanel', () => {
  it('reuses the Queue Dock fixed tab-header recipe without a parallel segmented chrome', () => {
    expect(source).toContain('<AppRightDockPanel');
    expect(source).toContain('collapse-label="摺疊曲目準備"');
    expect(source).toContain("import UiTabs from '../ui/UiTabs.vue';");
    expect(source).toContain('<template #identity>');
    expect(source).toContain('<UiTabs');
    expect(source).toContain('variant="bar"');
    expect(source).toContain('tab-id-prefix="preparation-dock"');
    expect(source).toContain('panel-id-prefix="preparation-dock"');
    expect(source).toContain('@update:active-id="selectTab"');
    expect(source).toContain("{ id: 'import', label: '匯入' }");
    expect(source).toContain("{ id: 'separation', label: '伴奏處理' }");
    expect(queueSource).toContain("import UiTabs from '../ui/UiTabs.vue';");
    expect(queueSource).toContain('variant="bar"');
    expect(source).not.toContain('UiSegmentedControl');
    expect(source).not.toContain('separationQueueSummary');
    expect(source).not.toContain('subtitle');
  });

  it('owns the only Dock shell while feature content remains shell-free', () => {
    expect(source).toContain('<ImportDockContent');
    expect(source).toContain('<SeparationDockContent');
    expect(importSource).not.toContain('AppRightDockPanel');
    expect(separationSource).not.toContain('AppRightDockPanel');
    expect(separationSource).not.toContain('useSeparationQueue');
    expect(separationSource).toContain(
      'separationController: { type: Object, required: true }',
    );
  });

  it('receives the shared preparation tab from the shell', () => {
    expect(source).toContain(
      "activePreparationTab: { type: String, default: 'import' }",
    );
    expect(source).toContain(':active-id="activePreparationTab"');
    expect(source).toContain(':separation-controller="separationController"');
  });

  it('links both tabpanels and resets the shared Dock scroll position after switching', () => {
    expect(source).toContain('ref="dockPanel"');
    expect(source).toContain('function selectTab(tabId)');
    expect(source).toContain("emit('update:activePreparationTab', tabId)");
    expect(source).toContain('() => props.activePreparationTab');
    expect(source).toContain('dockPanel.value?.scrollTo({ top: 0 })');
    expect(source).toContain('id="preparation-dock-import-panel"');
    expect(source).toContain('aria-labelledby="preparation-dock-import-tab"');
    expect(source).toContain('id="preparation-dock-separation-panel"');
    expect(source).toContain(
      'aria-labelledby="preparation-dock-separation-tab"',
    );
    expect(source.match(/role="tabpanel"/gu)).toHaveLength(2);
  });

  it('collapses before a Preparation artist destination changes the workspace', () => {
    expect(source).toContain("'collapse', 'update:activePreparationTab'");
    expect(source).toContain('@navigate="emit(\'collapse\')"');
  });
});

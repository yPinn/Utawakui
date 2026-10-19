import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SeparationDockContent.vue', import.meta.url),
  'utf8',
);

describe('SeparationDockContent copy and controls', () => {
  it('presents a concise accompaniment workflow without implementation jargon', () => {
    expect(source).toContain('label="來源"');
    expect(source).toContain('label="模式"');
    expect(source).toContain('加入處理佇列');
    expect(source).toContain('<SeparationPreparationList');
    expect(source).toContain('<SeparationToolbarList');
    expect(source).toContain('selectedSourceId');
    expect(source).toContain('sourceOptions');
    expect(source).toContain('startUnpreparedTracks');
    expect(source).toContain('restartPreparedTracks');
    expect(source).toContain(':hint="storageHint"');
    expect(source).toContain('estimate.knownTracks === estimate.totalTracks');
    expect(source).toContain('此來源沒有曲目');
    expect(source).not.toContain('prepareAgain');
    expect(source).not.toContain('尚未加入處理');
    expect(source).not.toContain('useSeparationQueue');
    expect(source).not.toContain('onMounted(initialize)');
    expect(source).not.toContain('曲庫總容量');
    expect(source).not.toContain('準備清單');
    expect(source).not.toContain('尚無歌曲');
    expect(source).not.toContain('separation-queue-panel__intro');
    expect(source).not.toContain('把目前播放清單加入後');
    expect(source).not.toMatch(/模型|runtime|recipe|執行提供者/u);
  });

  it('keeps accessible icon actions and delegates lifecycle controls to the queue sections', () => {
    expect(source.match(/<UiIconButton\b/gu)).toHaveLength(2);
    expect(source).not.toContain('<UiButton');
    expect(source).toContain('label="加入處理佇列"');
    expect(source).not.toContain('separation-dock-content__controls');
    expect(source).toContain('label="預覽伴奏處理歌單"');
    expect(source).toContain(':paused="isPaused"');
    expect(source).toContain(':pausing="isPausing"');
    expect(source).toContain('@pause="pause"');
    expect(source).toContain('@resume="resume"');
    expect(source).toContain('@retry="retry"');
    expect(source).toContain('@clear-pending="clearPending"');
    expect(source).toContain('@clear-completed="clearCompleted"');
  });

  it('keeps source selection above one compact action row', () => {
    const workspace = source.slice(
      source.indexOf('<div class="separation-dock-content__setup">'),
      source.indexOf('<UiNotice'),
    );

    expect(workspace).toContain('id="separation-dock-source"');
    expect(workspace).toContain('class="separation-dock-content__source"');
    expect(workspace).toContain(
      '<div class="separation-dock-content__actions">',
    );
    expect(workspace.indexOf('id="separation-dock-source"')).toBeLessThan(
      workspace.indexOf('id="separation-dock-mode"'),
    );
    expect(source).toContain("import UiCombobox from '../ui/UiCombobox.vue';");
    expect(workspace).toContain('<UiCombobox');
    expect(workspace).toContain(':items="sourceOptions"');
    expect(workspace).toContain(':editable="false"');
    expect(workspace).toContain(
      'class="separation-dock-content__source-option"',
    );
    expect(workspace).toContain('item.primaryLabel ?? item.label');
    expect(workspace).toContain('item.secondaryLabel');
    expect(workspace).toContain('<UiSelect');
    expect(workspace).toContain(':options="modeOptions"');
    expect(workspace).toContain('@click="startUnpreparedTracks"');
    expect(workspace).toContain(':loading="isStarting"');
    expect(workspace).toContain('加入處理佇列');
    expect(workspace.indexOf('id="separation-dock-mode"')).toBeLessThan(
      workspace.indexOf('label="預覽伴奏處理歌單"'),
    );
    expect(workspace.indexOf('label="預覽伴奏處理歌單"')).toBeLessThan(
      workspace.indexOf('label="加入處理佇列"'),
    );
    expect(source).toContain('grid-template-columns: minmax(0, 1fr) auto auto');
    expect(workspace).not.toContain('separation-dock-content__source-row');
    expect(source).toMatch(
      /\.separation-dock-content__source-option-primary\s*\{[^}]*color:\s*var\(--ui-color-text\);[^}]*font-weight:\s*var\(--ui-type-label-weight\);[^}]*line-height:\s*var\(--ui-type-label-line-height\);/s,
    );
    expect(source).toMatch(
      /\.separation-dock-content__source-option-secondary\s*\{[^}]*color:\s*var\(--ui-color-text-muted\);[^}]*font-size:\s*var\(--ui-type-caption-size\);[^}]*font-weight:\s*var\(--ui-type-caption-weight\);/s,
    );
  });

  it('loads artist destinations and forwards row navigation to the Dock shell', () => {
    expect(source).toContain(
      "import { useArtistIndex } from '../../composables/useArtistIndex.js';",
    );
    expect(source).toContain('ensureArtistIndex();');
    expect(source).toContain("const emit = defineEmits(['navigate']);");
    expect(source).toContain('@navigate="navigateFromPreview"');
    expect(source).toContain("emit('navigate', destination)");
    expect(source).toContain('@navigate="emit(\'navigate\', $event)"');
  });

  it('renders ordered, active, unfinished, and completed sections', () => {
    expect(source).toContain(':active-items="activeItems"');
    expect(source).toContain(':pending-items="pendingItems"');
    expect(source).toContain(':attention-items="attentionItems"');
    expect(source).toContain(':completed-items="completedItems"');
    expect(source).toContain('@move="move"');
    expect(source).toContain('@remove="remove"');
    expect(source).toContain('@retry="retry"');
    expect(source).toContain('@clear-pending="clearPending"');
    expect(source).toContain('@cancel-active="cancelActive"');
  });
});

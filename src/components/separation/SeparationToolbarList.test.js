import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SeparationToolbarList.vue', import.meta.url),
  'utf8',
);

describe('SeparationToolbarList', () => {
  it('shows ordered active, pending, attention, and complete history states', () => {
    expect(source).toContain('處理中');
    expect(source).toContain('接下來');
    expect(source).toContain('未完成');
    expect(source).toContain('已完成');
    expect(source).toContain('separationItemLabel(item)');
    expect(source).toContain('index + 1');
    expect(source).toContain('[...props.completedItems].reverse()');
    expect(source).not.toContain('slice(-3)');
  });

  it('shows the active percentage once in the progress copy', () => {
    const activeSection = source.slice(
      source.indexOf('<section v-if="activeItems.length > 0"'),
      source.indexOf('<section v-if="pendingItems.length > 0"'),
    );
    const activeTrail = activeSection.slice(
      activeSection.indexOf('<template #trail>'),
      activeSection.indexOf('</template>'),
    );

    expect(activeTrail).not.toContain('separationItemLabel(item)');
    expect(activeTrail).toContain(':icon="Ellipsis"');
    expect(activeSection).toContain('label="進度"');
    expect(activeSection).toContain(':value-text="separationItemLabel(item)"');
    expect(activeSection).toContain(
      ':indeterminate="!Number.isFinite(item.percent)"',
    );
  });

  it('shares Queue drag and menu conventions without playback semantics', () => {
    expect(source).toContain(
      "import { useDragReorder } from '../../composables/useDragReorder.js'",
    );
    expect(source).toContain(
      "import UiContextMenu from '../ui/UiContextMenu.vue'",
    );
    expect(source).toContain("import UiSeparator from '../ui/UiSeparator.vue'");
    expect(source).toContain(':icon="Ellipsis"');
    expect(source).toContain(':draggable="pendingItems.length > 1"');
    expect(source).toContain('@contextmenu.prevent.stop="openItemMenu');
    expect(source).toContain('@dragstart="handlePendingDragStart');
    expect(source).toContain('@dragover="updatePendingDropTarget');
    expect(source).toContain('@drop="dropPendingItem');
    expect(source).toContain('separation-toolbar-list__drop-indicator');
    expect(source).toContain('<UiContextMenu');
    expect(source).toContain("label: '移除',");
    expect(source).toContain("emit('move', itemId, offset)");
    expect(source).toContain("emit('remove', item.itemId)");
    expect(source).toContain("emit('retry', item.itemId)");
    expect(source).toContain("emit('cancelActive')");
    expect(source).toContain("emit('clearCompleted')");
    expect(source).not.toContain('expandedItemId');
    expect(source).not.toContain('toggleActions');
    expect(source).not.toContain('artwork-clickable');
    expect(source).not.toContain("label: '往前移'");
    expect(source).not.toContain("label: '往後移'");
    expect(source).not.toContain('ChevronUp');
    expect(source).not.toContain('ChevronDown');
    expect(source).not.toMatch(
      /\.separation-toolbar-list__menu\s*\{[^}]*(?:opacity:\s*0|visibility:\s*hidden)/su,
    );
  });
});

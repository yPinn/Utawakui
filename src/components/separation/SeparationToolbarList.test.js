import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import SeparationToolbarList from './SeparationToolbarList.vue';

for (const [component, filename] of [
  [SeparationToolbarList, './SeparationToolbarList.vue'],
  [AppRightDockSection, '../layout/AppRightDockSection.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const source = readFileSync(
  new URL('./SeparationToolbarList.vue', import.meta.url),
  'utf8',
);

describe('SeparationToolbarList', () => {
  it('groups active, pending, attention, and complete history states', () => {
    expect(source).toContain('處理中');
    expect(source).toContain('接下來');
    expect(source).toContain('未完成');
    expect(source).toContain('已完成');
    expect(source).toContain('separationItemLabel(item)');
    expect(source).toContain('[...props.completedItems].reverse()');
    expect(source).not.toContain('slice(-3)');
  });

  it('lets list position carry pending order and uses shared icons for terminal states', () => {
    const pendingSection = source.slice(
      source.indexOf('<AppRightDockSection v-if="pendingItems.length > 0"'),
      source.indexOf('<AppRightDockSection v-if="attentionItems.length > 0"'),
    );

    expect(source).toContain(
      "import UiStatusIcon from '../ui/UiStatusIcon.vue';",
    );
    expect(source).toContain('ITEM_STATUS_PRESENTATION');
    expect(source).not.toContain('index + 1');
    expect(source).not.toContain('separation-toolbar-list__order');
    expect(pendingSection).not.toContain('separationItemLabel(item)');
    expect(pendingSection).not.toContain('<UiStatusIcon');
    expect(source.match(/<UiStatusIcon\b/gu)).toHaveLength(2);
  });

  it('shows the active percentage once in the progress copy', () => {
    const activeSection = source.slice(
      source.indexOf('<AppRightDockSection v-if="activeItems.length > 0"'),
      source.indexOf('<AppRightDockSection v-if="pendingItems.length > 0"'),
    );
    const activeTrail = activeSection.slice(
      activeSection.indexOf('<template #trail>'),
      activeSection.indexOf('</template>'),
    );

    expect(activeTrail).not.toContain('separationItemLabel(item)');
    expect(activeTrail).not.toContain('UiIconButton');
    expect(activeSection).toContain('label="進度"');
    expect(activeSection).toContain(':value-text="separationItemLabel(item)"');
    expect(activeSection).toContain(
      ':indeterminate="!Number.isFinite(item.percent)"',
    );
    expect(activeSection.indexOf('<UiProgress')).toBeLessThan(
      activeSection.indexOf('<TrackIdentityRow'),
    );
    expect(activeSection).toContain(
      'class="separation-toolbar-list__active-status"',
    );
  });

  it('places pause and resume controls in the queue section headers', () => {
    const activeSection = source.slice(
      source.indexOf('<AppRightDockSection v-if="activeItems.length > 0"'),
      source.indexOf('<AppRightDockSection v-if="pendingItems.length > 0"'),
    );
    const pendingSection = source.slice(
      source.indexOf('<AppRightDockSection v-if="pendingItems.length > 0"'),
      source.indexOf('<AppRightDockSection v-if="attentionItems.length > 0"'),
    );

    expect(source).toContain('paused: { type: Boolean, default: false }');
    expect(source).toContain('pausing: { type: Boolean, default: false }');
    expect(activeSection).toContain('<template #trailing>');
    expect(activeSection).toContain(':icon="Pause"');
    expect(activeSection).toContain("pausing ? '等待暫停' : '完成這首後暫停'");
    expect(activeSection).toContain("emit('pause')");
    expect(pendingSection).toContain(':icon="Play"');
    expect(pendingSection).toContain('label="繼續處理"');
    expect(pendingSection).toContain("emit('resume')");
    expect(source).not.toContain('label="繼續"');
  });

  it('shares Queue drag and menu conventions without playback semantics', () => {
    expect(source).toContain(
      "import { useDragReorder } from '../../composables/useDragReorder.js'",
    );
    expect(source).toContain(
      "import UiContextMenu from '../ui/UiContextMenu.vue'",
    );
    expect(source).toContain(
      "import AppRightDockSection from '../layout/AppRightDockSection.vue'",
    );
    expect(source).toContain("import UiSeparator from '../ui/UiSeparator.vue'");
    expect(source).not.toContain('Ellipsis');
    expect(source).toContain('heading="接下來"');
    expect(source).toContain('清除待處理');
    expect(source).toContain("emit('clearPending')");
    expect(source).toContain('icon: ListMinus');
    const pendingSection = source.slice(
      source.indexOf('<AppRightDockSection v-if="pendingItems.length > 0"'),
      source.indexOf('<AppRightDockSection v-if="attentionItems.length > 0"'),
    );
    const completedSection = source.slice(
      source.indexOf('v-if="completedItemsNewestFirst.length > 0"'),
      source.indexOf('<UiContextMenu'),
    );
    expect(pendingSection).toContain(':icon="ListMinus"');
    expect(pendingSection).toContain('label="清除待處理"');
    expect(completedSection).toContain(
      '<UiButton @click="emit(\'clearCompleted\')">清除紀錄</UiButton>',
    );
    expect(source).not.toContain('ListX');
    expect(source).toContain('skipped: Object.freeze({ icon: BadgeCheck');
    expect(source).not.toContain('Trash2');
    expect(source).not.toContain('danger: true');
    expect(source).toContain(':draggable="pendingItems.length > 1"');
    expect(source).toContain('@contextmenu.prevent.stop="openItemMenu');
    expect(source).toContain('@keydown="openItemMenuFromKeyboard');
    expect(source).toContain("event.key === 'ContextMenu'");
    expect(source).toContain("event.key === 'F10'");
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
    expect(source).not.toContain('separation-toolbar-list__menu');
    expect(source).not.toContain('separation-toolbar-list__heading');
    expect(source).not.toContain('color: var(--ui-color-text-muted)');
  });

  it('uses the shared Right Dock track-row anatomy and density', () => {
    expect(source).toContain(
      "import TrackIdentityRow from '../track/TrackIdentityRow.vue';",
    );
    expect(source.match(/<TrackIdentityRow\b/gu)).toHaveLength(4);
    expect(source.match(/navigation="artist"/gu)).toHaveLength(4);
    expect(
      source.match(/@navigate="emit\('navigate', \$event\)"/gu),
    ).toHaveLength(4);
    expect(source).not.toContain('<UiTrackRow');
    expect(source.match(/class="[^"]*right-dock-track[^"]*"/gu)).toHaveLength(
      4,
    );
    expect(source.match(/\n\s+state-surface\n/gu)).toHaveLength(3);
    expect(source).not.toContain('--ui-track-row-min-height');
    expect(source).not.toContain('--ui-track-row-thumb-size');
    expect(source).not.toContain('--ui-track-row-padding-inline');
  });

  it('emits one clear-pending intent from the pending section action', () => {
    const onClearPending = vi.fn();
    const { app, root } = mount(SeparationToolbarList, {
      pendingItems: [
        {
          itemId: 'item-2',
          trackId: 'track-2',
          status: 'pending',
        },
      ],
      trackFor: () => ({
        id: 'track-2',
        title: '接下來的歌',
        artist: '歌手',
      }),
      onClearPending,
    });
    const clearButton = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '清除待處理',
    )[0];

    expect(clearButton).toBeTruthy();
    trigger(clearButton, 'onClick');
    expect(onClearPending).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('emits one clear-history intent from the completed section text action', () => {
    const onClearCompleted = vi.fn();
    const { app, root } = mount(SeparationToolbarList, {
      completedItems: [
        {
          itemId: 'item-done',
          trackId: 'track-done',
          status: 'completed',
        },
      ],
      trackFor: () => ({
        id: 'track-done',
        title: '完成的歌',
        artist: '歌手',
      }),
      onClearCompleted,
    });
    const clearButton = findAll(
      root,
      (node) => node.type === 'button' && textContent(node) === '清除紀錄',
    )[0];

    expect(clearButton).toBeTruthy();
    trigger(clearButton, 'onClick');
    expect(onClearCompleted).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('emits queue lifecycle intents from the matching section action', () => {
    const trackFor = (item) => ({
      id: item.trackId,
      title: item.status === 'pending' ? '接下來的歌' : '處理中的歌',
      artist: '歌手',
    });
    const onPause = vi.fn();
    const running = mount(SeparationToolbarList, {
      activeItems: [
        {
          itemId: 'item-active',
          trackId: 'track-active',
          status: 'running',
          percent: 35,
        },
      ],
      pendingItems: [
        {
          itemId: 'item-next',
          trackId: 'track-next',
          status: 'pending',
        },
      ],
      trackFor,
      onPause,
    });
    const pauseButton = findAll(
      running.root,
      (node) =>
        node.type === 'button' && textContent(node) === '完成這首後暫停',
    )[0];

    expect(pauseButton).toBeTruthy();
    trigger(pauseButton, 'onClick');
    expect(onPause).toHaveBeenCalledOnce();
    running.app.unmount();

    const onResume = vi.fn();
    const paused = mount(SeparationToolbarList, {
      paused: true,
      pendingItems: [
        {
          itemId: 'item-next',
          trackId: 'track-next',
          status: 'pending',
        },
      ],
      trackFor,
      onResume,
    });
    const resumeButton = findAll(
      paused.root,
      (node) => node.type === 'button' && textContent(node) === '繼續處理',
    )[0];

    expect(resumeButton).toBeTruthy();
    trigger(resumeButton, 'onClick');
    expect(onResume).toHaveBeenCalledOnce();
    paused.app.unmount();
  });
});

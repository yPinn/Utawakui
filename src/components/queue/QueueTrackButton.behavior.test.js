import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import RightDockTrackArtworkCue from './RightDockTrackArtworkCue.vue';
import RightDockTrackMenuButton from './RightDockTrackMenuButton.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import QueueTrackButton from './QueueTrackButton.vue';

for (const [component, filename] of [
  [QueueTrackButton, './QueueTrackButton.vue'],
  [UiTrackRow, '../ui/UiTrackRow.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
  [RightDockTrackArtworkCue, './RightDockTrackArtworkCue.vue'],
  [RightDockTrackMenuButton, './RightDockTrackMenuButton.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function render(props) {
  return renderToString(
    createSSRApp({ render: () => h(QueueTrackButton, props) }),
  );
}

const track = {
  id: 'queue-standard-row',
  title: 'Walpurgis -prologue-',
  artist: 'Aimer',
  duration: 143,
  thumbnailUrl: 'utawakui-media://track/queue-standard-row/artwork',
};

describe('QueueTrackButton standard Track Row adapter', () => {
  it('renders the shared 52/40 row with plain metadata and no duration', async () => {
    const html = await render({ track, active: true, current: true });

    expect(html).toContain('<li');
    expect(html).toContain('ui-track--interactive');
    expect(html).toContain('ui-track--active');
    expect(html).toContain('ui-track--current');
    expect(html).not.toContain('<li role="button"');
    expect(html).not.toContain('<li tabindex="0"');
    expect(html).not.toContain('aria-pressed');
    expect(html).toContain('class="ui-track__action"');
    expect(html).toContain(`aria-label="選取：${track.title}"`);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('width:var(--ui-track-row-thumb-size)');
    expect(html).toContain('height:var(--ui-track-row-thumb-size)');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('ui-track__title-text');
    expect(html).toContain('ui-track__artist');
    expect(html).not.toContain('ui-text-btn');
    expect(html).not.toContain('ui-marquee');
    expect(html).not.toContain('ui-track__duration');
    expect(html).not.toContain('2:23');
    expect(html).toContain(`${track.title}的更多選項`);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('調整順序：');
  });

  it('projects player state into matching artwork play and pause affordances', async () => {
    const pausedHtml = await render({ track, playing: false });
    const playingHtml = await render({ track, playing: true });

    expect(pausedHtml).toContain(`播放：${track.title}`);
    expect(pausedHtml).toContain('lucide-play');
    expect(pausedHtml).not.toContain('lucide-pause');
    expect(playingHtml).toContain(`暫停：${track.title}`);
    expect(playingHtml).toContain('lucide-pause');
    expect(playingHtml).not.toContain('lucide-play');
  });

  it('keeps selection and playback separate from reorder and menu actions', () => {
    const select = vi.fn();
    const activate = vi.fn();
    const togglePlayback = vi.fn();
    const openMenu = vi.fn();
    const dragStart = vi.fn();
    const mounted = mount(QueueTrackButton, {
      track,
      active: true,
      draggable: true,
      onSelect: select,
      onActivate: activate,
      onTogglePlayback: togglePlayback,
      onOpenMenu: openMenu,
      onDragStart: dragStart,
    });
    const row = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('queue-track'),
    )[0];
    const buttons = findAll(row, (node) => node.type === 'button');
    const primaryAction = buttons.find((node) =>
      String(node.props?.class ?? '').includes('ui-track__action'),
    );
    const artworkButton = buttons.find((node) =>
      String(node.props?.class ?? '').includes('ui-track__artwork-action'),
    );
    const menuButton = buttons.find(
      (node) => textContent(node) === `${track.title}的更多選項`,
    );
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();

    expect(row.type).toBe('li');
    expect(row.props.role).toBeUndefined();
    expect(row.props.tabindex).toBeUndefined();
    expect(row.props.draggable).toBe(true);
    expect(String(row.props.class)).toContain('ui-track--active');
    expect(buttons).toHaveLength(3);
    expect(primaryAction.parent).toBe(row);
    expect(artworkButton.parent).toBe(row);
    expect(primaryAction.props['aria-label']).toBe(`選取：${track.title}`);
    expect(primaryAction.props['aria-pressed']).toBeUndefined();
    expect(artworkButton.props['aria-label']).toBeUndefined();
    expect(textContent(artworkButton)).toContain(`播放：${track.title}`);
    expect(
      buttons.some((button) => textContent(button).startsWith('調整順序：')),
    ).toBe(false);
    expect(menuButton.props['aria-haspopup']).toBe('menu');
    expect(menuButton.props['aria-expanded']).toBe('false');

    trigger(primaryAction, 'onClick', { type: 'click' });
    expect(select).toHaveBeenCalledWith(track);
    expect(activate).not.toHaveBeenCalled();

    trigger(primaryAction, 'onDblclick', { type: 'dblclick' });
    trigger(artworkButton, 'onClick', { stopPropagation });
    trigger(primaryAction, 'onKeydown', {
      target: primaryAction,
      currentTarget: primaryAction,
      key: 'Enter',
      preventDefault,
    });

    expect(activate).toHaveBeenCalledTimes(2);
    expect(activate).toHaveBeenNthCalledWith(1, track);
    expect(activate).toHaveBeenNthCalledWith(2, track);
    expect(togglePlayback).toHaveBeenCalledOnce();
    expect(togglePlayback).toHaveBeenCalledWith(track);
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();

    const rowDragEvent = {
      target: { closest: vi.fn(() => null) },
      preventDefault: vi.fn(),
    };
    trigger(row, 'onPointerdown', rowDragEvent);
    trigger(row, 'onDragstart', rowDragEvent);
    expect(dragStart).toHaveBeenCalledWith(rowDragEvent);
    expect(rowDragEvent.preventDefault).not.toHaveBeenCalled();

    const nestedActionPointerEvent = {
      target: {
        closest: vi.fn((selector) =>
          selector === '.ui-icon-btn, .ui-track__artwork-action' ? {} : null,
        ),
      },
    };
    trigger(row, 'onPointerdown', nestedActionPointerEvent);
    const nestedActionDragEvent = {
      target: { closest: vi.fn(() => null) },
      preventDefault: vi.fn(),
    };
    trigger(row, 'onDragstart', nestedActionDragEvent);
    expect(nestedActionDragEvent.preventDefault).toHaveBeenCalledOnce();
    expect(dragStart).toHaveBeenCalledOnce();

    const menuEvent = {
      type: 'click',
      currentTarget: menuButton,
      stopPropagation: vi.fn(),
    };
    trigger(menuButton, 'onClick', menuEvent);
    expect(openMenu).toHaveBeenCalledWith({ track, event: menuEvent });
    expect(menuEvent.stopPropagation).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledTimes(2);
    mounted.app.unmount();
  });

  it('keeps drag icons out while the whole reorderable row stays draggable', async () => {
    const html = await render({
      track,
      draggable: true,
      dropPosition: 'before',
    });

    expect(html).not.toContain('調整順序：');
    expect(html).not.toContain('aria-keyshortcuts="ArrowUp ArrowDown"');
    expect(html).not.toContain('queue-track__drag-guide');
    expect(html).not.toContain('lucide-grip-vertical');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('ui-separator');
    expect(html).toContain('ui-separator--accent');
    expect(html).toContain('queue-track__drop-indicator--before');
    expect(html).toContain(`${track.title}的更多選項`);
  });

  it('opens the same menu intent from the row context menu', () => {
    const openMenu = vi.fn();
    const mounted = mount(QueueTrackButton, {
      track,
      menuOpen: true,
      onOpenMenu: openMenu,
    });
    const row = findAll(mounted.root, (node) =>
      String(node.props?.class ?? '').includes('queue-track'),
    )[0];
    const menuButton = findAll(row, (node) => node.type === 'button').find(
      (node) => textContent(node) === `${track.title}的更多選項`,
    );
    const event = {
      type: 'contextmenu',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    expect(menuButton.props['aria-expanded']).toBe('true');
    expect(String(row.props.class)).toContain('right-dock-track--menu-open');
    trigger(row, 'onContextmenu', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(openMenu).toHaveBeenCalledWith({ track, event });
    mounted.app.unmount();
  });
});

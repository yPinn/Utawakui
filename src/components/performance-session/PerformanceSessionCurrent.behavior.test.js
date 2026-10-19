import { nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import PerformanceSessionCurrent from './PerformanceSessionCurrent.vue';
import QueueSection from '../queue/QueueSection.vue';
import QueueTrackButton from '../queue/QueueTrackButton.vue';
import RightDockTrackArtworkCue from '../queue/RightDockTrackArtworkCue.vue';
import RightDockTrackMenuButton from '../queue/RightDockTrackMenuButton.vue';
import TrackArtistCredits from '../track/TrackArtistCredits.vue';
import TrackArtworkContent from '../ui/TrackArtworkContent.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';

// Keep the real section, row and controls; replace only browser-positioned menu rendering.
vi.mock('../ui/UiActionMenu.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      inheritAttrs: false,
      props: {
        open: { type: Boolean, default: false },
        anchor: { type: Object, default: null },
        content: { type: Object, default: null },
      },
      emits: ['select', 'close'],
      setup:
        (props, { emit }) =>
        () =>
          h('menu-probe', {
            ...props,
            onSelect: (value) => emit('select', value),
          }),
    }),
  };
});
for (const [component, file] of [
  [PerformanceSessionCurrent, './PerformanceSessionCurrent.vue'],
  [QueueSection, '../queue/QueueSection.vue'],
  [QueueTrackButton, '../queue/QueueTrackButton.vue'],
  [RightDockTrackArtworkCue, '../queue/RightDockTrackArtworkCue.vue'],
  [RightDockTrackMenuButton, '../queue/RightDockTrackMenuButton.vue'],
  [TrackArtistCredits, '../track/TrackArtistCredits.vue'],
  [TrackArtworkContent, '../ui/TrackArtworkContent.vue'],
  [UiTrackRow, '../ui/UiTrackRow.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, file, import.meta.url);

const current = {
  itemId: 'one',
  trackId: 'song',
  displayTitle: 'Stage',
  displayArtist: 'Artist',
  mode: 'library-track',
};
const button = (root, label) =>
  findAll(
    root,
    (n) =>
      n.type === 'button' &&
      (n.props['aria-label'] ?? textContent(n)) === label,
  )[0];
const menu = (root) => findAll(root, (n) => n.type === 'menu-probe')[0];

describe('arrangement current shared row intents', () => {
  it('keeps selection separate from cover, Enter and double-click toggle, then resets menu for the next occurrence of the same track', async () => {
    const toggle = vi.fn();
    const props = reactive({
      current: { ...current },
      phase: 'paused',
      confirmed: true,
      onToggle: toggle,
    });
    const view = mount(PerformanceSessionCurrent, props);
    const action = button(view.root, '選取：Stage');
    trigger(action, 'onClick', {});
    await nextTick();
    expect(toggle).not.toHaveBeenCalled();
    expect(
      findAll(view.root, (n) =>
        String(n.props.class).includes('ui-track--active'),
      ),
    ).toHaveLength(1);
    trigger(button(view.root, '播放：Stage'), 'onClick', {
      stopPropagation: vi.fn(),
    });
    trigger(action, 'onDblclick', {});
    trigger(action, 'onKeydown', { key: 'Enter', preventDefault: vi.fn() });
    expect(toggle).toHaveBeenCalledTimes(3);
    trigger(button(view.root, 'Stage的更多選項'), 'onClick', {
      type: 'click',
      currentTarget: action,
      stopPropagation: vi.fn(),
    });
    await nextTick();
    expect(menu(view.root).props.open).toBe(true);
    props.current = { ...current, itemId: 'two' };
    await nextTick();
    expect(menu(view.root).props.open).toBe(false);
    expect(
      findAll(view.root, (n) =>
        String(n.props.class).includes('ui-track--active'),
      ),
    ).toHaveLength(0);
    view.app.unmount();
  });
  it('rejects stale toggle/complete intents while busy, permits stop, then permits confirmed completion', async () => {
    const toggle = vi.fn(),
      complete = vi.fn(),
      stop = vi.fn();
    const props = reactive({
      current,
      busy: true,
      confirmed: false,
      onToggle: toggle,
      onComplete: complete,
      onStop: stop,
    });
    const view = mount(PerformanceSessionCurrent, props);
    const probe = menu(view.root);
    trigger(probe, 'onSelect', 'toggle');
    trigger(probe, 'onSelect', 'complete');
    trigger(button(view.root, '停止'), 'onClick');
    expect(toggle).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
    expect(button(view.root, '標記完成').props.disabled).toBe(true);
    props.busy = false;
    props.confirmed = true;
    await nextTick();
    trigger(probe, 'onSelect', 'complete');
    expect(complete).toHaveBeenCalledOnce();
    props.current = { ...current, mode: 'manual' };
    await nextTick();
    trigger(probe, 'onSelect', 'toggle');
    expect(toggle).not.toHaveBeenCalled();
    expect(button(view.root, '播放：Stage')).toBeUndefined();
    expect(textContent(view.root)).toContain('手動進行中');
    view.app.unmount();
  });
});

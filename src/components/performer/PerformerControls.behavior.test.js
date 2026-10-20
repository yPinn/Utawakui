import { describe, expect, it, vi } from 'vitest';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import PerformerActionBar from './PerformerActionBar.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import PerformerDisplayControls from './PerformerDisplayControls.vue';
import PerformerSyncControls from './PerformerSyncControls.vue';

for (const [component, filename] of [
  [UiButton, '../ui/UiButton.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiButtonGroup, '../ui/UiButtonGroup.vue'],
  [UiPopover, '../ui/UiPopover.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [PerformerActionBar, './PerformerActionBar.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiScrollLayout, '../ui/UiScrollLayout.vue'],
  [UiSegmentedControl, '../ui/UiSegmentedControl.vue'],
  [PerformerDisplayControls, './PerformerDisplayControls.vue'],
  [PerformerSyncControls, './PerformerSyncControls.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function button(root, label) {
  return findAll(
    root,
    (node) => node.type === 'button' && textContent(node).includes(label),
  )[0];
}

describe('Performer controls', () => {
  it.each([
    ['paused', '播放', 'play'],
    ['playing', '暫停', 'pause'],
  ])(
    'groups %s transport, sync and display with separators',
    (status, label, action) => {
      const control = vi.fn();
      const mounted = mount(PerformerActionBar, {
        frame: {
          trackId: 'a',
          playbackStatus: status,
          lyricsOffset: { available: true, milliseconds: 0 },
        },
        onControl: control,
      });
      trigger(button(mounted.root, label), 'onClick');
      expect(control).toHaveBeenCalledWith(action);
      expect(
        findAll(mounted.root, (node) =>
          String(node.props.class ?? '').includes('ui-separator--vertical'),
        ),
      ).toHaveLength(2);
      const group = findAll(
        mounted.root,
        (node) => node.props['aria-label'] === '歌詞時間偏移',
      )[0];
      expect(findAll(group, (node) => node.type === 'button')).toHaveLength(3);
      mounted.app.unmount();
    },
  );
  it('emits reading selections from the shared display settings', () => {
    const update = vi.fn();
    const mounted = mount(PerformerDisplayControls, {
      readingVariant: 'off',
      readingVariants: ['off', 'furigana', 'romaji'],
      'onUpdate:readingVariant': update,
    });
    trigger(button(mounted.root, '假名'), 'onClick');
    expect(update).toHaveBeenCalledWith('furigana');
    trigger(button(mounted.root, '羅馬字'), 'onClick');
    expect(update).toHaveBeenCalledWith('romaji');
    mounted.app.unmount();
  });
  it('emits only the three fixed sync actions and retry', () => {
    const onAction = vi.fn();
    const mounted = mount(PerformerSyncControls, {
      offset: {
        milliseconds: -200,
        available: true,
        saving: false,
        error: '同步調整未儲存，請再試一次。',
      },
      onAction,
    });

    for (const [label, action] of [
      ['延後 0.1 秒', 'delay'],
      ['歸零', 'reset'],
      ['提前 0.1 秒', 'advance'],
      ['重試', 'retry'],
    ]) {
      trigger(button(mounted.root, label), 'onClick');
      expect(onAction).toHaveBeenLastCalledWith(action);
    }
  });

  it('disables adjustment buttons while unavailable or saving', () => {
    const mounted = mount(PerformerSyncControls, {
      offset: {
        milliseconds: 0,
        available: false,
        saving: true,
        error: '',
      },
    });
    for (const label of ['延後 0.1 秒', '歸零', '提前 0.1 秒']) {
      expect(button(mounted.root, label).props.disabled).toBe(true);
    }
  });

  it('emits the selected reading-distance scale', () => {
    const onUpdate = vi.fn();
    const mounted = mount(PerformerDisplayControls, {
      readingScale: 'desk',
      'onUpdate:readingScale': onUpdate,
    });

    trigger(button(mounted.root, '舞台'), 'onClick');
    expect(onUpdate).toHaveBeenCalledWith('stage');
  });
});

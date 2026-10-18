import { describe, expect, it, vi } from 'vitest';
import UiButton from '../ui/UiButton.vue';
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

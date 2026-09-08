import { describe, expect, it, vi } from 'vitest';
import ObsSpoutOutputSettings from './ObsSpoutOutputSettings.vue';
import SettingsActionRow from '../settings/SettingsActionRow.vue';
import SettingsBlock from '../settings/SettingsBlock.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [ObsSpoutOutputSettings, './ObsSpoutOutputSettings.vue'],
  [SettingsActionRow, '../settings/SettingsActionRow.vue'],
  [SettingsBlock, '../settings/SettingsBlock.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiChip, '../ui/UiChip.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

function createStatus(lifecycle = 'stopped') {
  return {
    supported: true,
    desired: {
      running: lifecycle !== 'stopped',
      frameRateProfile: 'standard',
      surface: {
        senderName: 'Utawakui.Lyrics',
        width: 1920,
        height: 1080,
        framesPerSecond: 60,
      },
    },
    observed: { lifecycle },
    effective: { surface: lifecycle === 'sending' ? {} : null },
    error: null,
  };
}

function buttonByText(root, label) {
  return findAll(
    root,
    (node) => node.type === 'button' && textContent(node).trim() === label,
  )[0];
}

describe('ObsSpoutOutputSettings behavior', () => {
  it('emits only the bounded profile ids and shows the selected FPS', () => {
    const setFrameRateProfile = vi.fn();
    const start = vi.fn();
    const view = mount(ObsSpoutOutputSettings, {
      status: createStatus(),
      onSetFrameRateProfile: setFrameRateProfile,
      onStart: start,
    });
    const reduced = buttonByText(view.root, '30 FPS');
    const standard = buttonByText(view.root, '60 FPS');

    expect(reduced.props['aria-pressed']).toBe(false);
    expect(standard.props['aria-pressed']).toBe(true);
    expect(String(standard.props.class)).toContain('ui-btn--active');
    trigger(reduced, 'onClick');
    trigger(buttonByText(view.root, '啟動輸出'), 'onClick');

    expect(setFrameRateProfile).toHaveBeenCalledWith('reduced');
    expect(start).toHaveBeenCalledOnce();
    view.app.unmount();
  });

  it('locks FPS while sending and exposes stop as the lifecycle action', () => {
    const stop = vi.fn();
    const view = mount(ObsSpoutOutputSettings, {
      status: createStatus('sending'),
      onStop: stop,
    });

    expect(buttonByText(view.root, '30 FPS').props.disabled).toBe(true);
    expect(buttonByText(view.root, '60 FPS').props.disabled).toBe(true);
    expect(buttonByText(view.root, '啟動輸出')).toBeUndefined();
    trigger(buttonByText(view.root, '停止輸出'), 'onClick');
    expect(stop).toHaveBeenCalledOnce();
    view.app.unmount();
  });

  it('shows bounded runtime failures received through status events', () => {
    const status = createStatus('error');
    status.error = { message: 'Utawakui.Lyrics 已被使用。' };
    const view = mount(ObsSpoutOutputSettings, { status });

    expect(textContent(view.root)).toContain('錯誤');
    expect(textContent(view.root)).toContain('Utawakui.Lyrics 已被使用。');
    view.app.unmount();
  });
});

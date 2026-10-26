import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Component from './LyricsExperimentalQueueSettings.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import {
  attachClientRender,
  mount,
  findAll,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
vi.mock('../ui/UiCheckbox.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['modelValue', 'label', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('label', [
            props.label,
            h('input', {
              checked: props.modelValue,
              disabled: props.disabled,
              onChange: (event) =>
                emit('update:modelValue', event.target.checked),
            }),
          ]),
    },
  };
});
vi.mock('../ui/UiButton.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      setup:
        (_props, { slots }) =>
        () =>
          h('button', slots.default?.()),
    },
  };
});
vi.mock('../ui/UiHint.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      setup:
        (_props, { slots }) =>
        () =>
          h('p', slots.default?.()),
    },
  };
});
let mounted, snapshot, bridge;
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await nextTick();
};
const input = () => findAll(mounted.root, (node) => node.type === 'input')[0];
beforeEach(() => {
  attachClientRender(
    SettingsDocumentItem,
    './SettingsDocumentItem.vue',
    import.meta.url,
  );
  attachClientRender(
    Component,
    './LyricsExperimentalQueueSettings.vue',
    import.meta.url,
  );
  vi.useFakeTimers();
  snapshot = { enabled: false, allowed: true, items: [] };
  bridge = {
    getExperimentalLyricsStatus: vi.fn(async () => structuredClone(snapshot)),
    setExperimentalLyricsEnabled: vi.fn(async (value) => {
      snapshot.enabled = value;
    }),
    cancelExperimentalLyrics: vi.fn(),
    retryExperimentalLyrics: vi.fn(),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
});
afterEach(() => {
  mounted?.app.unmount();
  mounted = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('experimental lyrics global preference', () => {
  it('does not render song history or per-song actions, regardless of queue size or status', async () => {
    snapshot.items = Array.from({ length: 100 }, (_, index) => ({
      trackId: `song-${index}`,
      title: `歌曲紀錄-${index}`,
      status: ['running', 'ready', 'failed', 'skipped', 'cancelled'][index % 5],
    }));
    mounted = mount(Component);
    await flush();
    expect(findAll(mounted.root, (node) => node.type === 'h3')).toHaveLength(1);
    expect(textContent(mounted.root)).not.toContain('歌曲紀錄');
    expect(textContent(mounted.root)).not.toContain('取消分析');
    expect(textContent(mounted.root)).not.toContain('重試分析');
    expect(textContent(mounted.root)).toContain('結果、重試與套用請至歌詞頁');
    expect(bridge.cancelExperimentalLyrics).not.toHaveBeenCalled();
    expect(bridge.retryExperimentalLyrics).not.toHaveBeenCalled();
  });
  it('starts unchecked and only persists an explicit preference change', async () => {
    mounted = mount(Component);
    await flush();
    expect(input().props.checked).toBe(false);
    expect(bridge.setExperimentalLyricsEnabled).not.toHaveBeenCalled();
    expect(textContent(mounted.root)).toContain('不會自動下載工具');
    trigger(input(), 'onChange', { target: { checked: true } });
    await flush();
    expect(bridge.setExperimentalLyricsEnabled).toHaveBeenCalledWith(true);
    expect(input().props.checked).toBe(true);
  });
  it('keeps the gate prerequisite current and releases polling on unmount', async () => {
    snapshot.allowed = false;
    mounted = mount(Component);
    await flush();
    expect(input().props.disabled).toBe(true);
    expect(textContent(mounted.root)).toContain('請先啟用音訊處理功能');
    snapshot.allowed = true;
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(input().props.disabled).toBe(false);
    mounted.app.unmount();
    mounted = null;
    const reads = bridge.getExperimentalLyricsStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(bridge.getExperimentalLyricsStatus).toHaveBeenCalledTimes(reads);
    expect(bridge.setExperimentalLyricsEnabled).not.toHaveBeenCalled();
  });
  it('keeps an enabled preference switch available to turn off after the gate closes', async () => {
    snapshot = { enabled: true, allowed: false, items: [] };
    mounted = mount(Component);
    await flush();
    expect(input().props.disabled).toBe(false);
    trigger(input(), 'onChange', { target: { checked: false } });
    await flush();
    expect(bridge.setExperimentalLyricsEnabled).toHaveBeenCalledWith(false);
  });
  it('prevents overlapping saves and restores interaction after completion', async () => {
    let finish;
    bridge.setExperimentalLyricsEnabled.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mounted = mount(Component);
    await flush();
    trigger(input(), 'onChange', { target: { checked: true } });
    await flush();
    expect(input().props.disabled).toBe(true);
    trigger(input(), 'onChange', { target: { checked: false } });
    expect(bridge.setExperimentalLyricsEnabled).toHaveBeenCalledTimes(1);
    finish();
    await flush();
    expect(input().props.disabled).toBe(false);
  });
  it('does not claim loading after an unknown preference fails to read, and recovers locally', async () => {
    bridge.getExperimentalLyricsStatus
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(Error('private read'));
    mounted = mount(Component);
    await flush();
    expect(textContent(mounted.root)).toContain('讀取中');
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(textContent(mounted.root)).toContain('無法讀取');
    expect(textContent(mounted.root)).not.toContain('讀取中');
    expect(input().props.disabled).toBe(true);
    const retry = findAll(
      mounted.root,
      (node) =>
        node.type === 'button' && textContent(node).includes('重新讀取'),
    )[0];
    trigger(retry, 'onClick');
    await flush();
    expect(textContent(mounted.root)).not.toContain('無法讀取');
    expect(input().props.disabled).toBe(false);
  });
  it('keeps the failure bounded without exposing private details', async () => {
    bridge.setExperimentalLyricsEnabled.mockRejectedValueOnce(
      Error('private path'),
    );
    mounted = mount(Component);
    await flush();
    trigger(input(), 'onChange', { target: { checked: true } });
    await flush();
    expect(textContent(mounted.root)).toContain('伴奏與原有歌詞仍可使用');
    expect(textContent(mounted.root)).not.toContain('private path');
    expect(input().props.checked).toBe(false);
    expect(input().props.disabled).toBe(false);
  });
});

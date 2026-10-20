import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Component from './LyricsExperimentalQueueSettings.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiChip from '../ui/UiChip.vue';
import {
  attachClientRender,
  mount,
  findAll,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({
    state: { tracks: [{ id: 'song', title: '測試歌曲' }] },
  }),
}));
vi.mock('../ui/UiCheckbox.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['modelValue', 'label', 'hint', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('label', [
            props.label,
            props.hint,
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
vi.mock('../ui/UiSelect.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['modelValue', 'options', 'label', 'hint', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h('label', [
            props.label,
            props.hint,
            h(
              'select',
              {
                value: props.modelValue,
                disabled: props.disabled,
                onChange: (event) =>
                  emit('update:modelValue', event.target.value),
              },
              props.options.map((o) =>
                h('option', { value: o.value }, o.label),
              ),
            ),
          ]),
    },
  };
});
let mounted, snapshot, bridge;
const flush = async () => {
  await nextTick();
  await nextTick();
  await nextTick();
};
const button = (text) =>
  findAll(
    mounted.root,
    (node) => node.type === 'button' && textContent(node).includes(text),
  )[0];
beforeEach(() => {
  attachClientRender(
    SettingsDocumentItem,
    './SettingsDocumentItem.vue',
    import.meta.url,
  );
  attachClientRender(UiChip, '../ui/UiChip.vue', import.meta.url);
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('experimental lyrics settings workflow', () => {
  it('explains an unknown language and sends a manual choice as one-task intent only', async () => {
    snapshot = {
      enabled: true,
      allowed: true,
      items: [
        { trackId: 'song', status: 'skipped', reason: 'language-unknown' },
      ],
    };
    mounted = mount(Component);
    await flush();
    expect(textContent(mounted.root)).toContain('來源語言未知');
    const select = findAll(mounted.root, (node) => node.type === 'select')[0];
    trigger(select, 'onChange', { target: { value: 'ja' } });
    await flush();
    trigger(button('重試分析'), 'onClick');
    await flush();
    expect(bridge.retryExperimentalLyrics).toHaveBeenCalledWith('song', 'ja');
    expect(bridge.setExperimentalLyricsEnabled).not.toHaveBeenCalled();
  });
  it('distinguishes native T2 and does not offer unnecessary re-analysis', async () => {
    snapshot.items = [
      { trackId: 'song', status: 'skipped', reason: 'native-t2' },
    ];
    mounted = mount(Component);
    await flush();
    expect(textContent(mounted.root)).toContain('已有逐字時間');
    expect(button('重試分析')).toBeUndefined();
    expect(
      findAll(mounted.root, (node) => node.type === 'select'),
    ).toHaveLength(0);
  });
  it('starts unchecked, performs only explicit opt-in and never downloads', async () => {
    mounted = mount(Component);
    await flush();
    const input = findAll(mounted.root, (node) => node.type === 'input')[0];
    expect(input.props.checked).toBe(false);
    expect(bridge.setExperimentalLyricsEnabled).not.toHaveBeenCalled();
    expect(textContent(mounted.root)).toContain('不會自動下載工具');
    trigger(input, 'onChange', { target: { checked: true } });
    await flush();
    expect(bridge.setExperimentalLyricsEnabled).toHaveBeenCalledWith(true);
    expect(input.props.checked).toBe(true);
  });
  it('polls bounded progress and exposes independent cancellation and retry', async () => {
    snapshot = {
      enabled: true,
      allowed: true,
      items: [{ trackId: 'song', status: 'running' }],
    };
    mounted = mount(Component);
    await flush();
    expect(textContent(mounted.root)).toContain('測試歌曲');
    trigger(button('取消分析'), 'onClick');
    await flush();
    expect(bridge.cancelExperimentalLyrics).toHaveBeenCalledWith('song');
    snapshot.items[0].status = 'failed';
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(textContent(mounted.root)).toContain('伴奏仍可使用');
    trigger(button('重試分析'), 'onClick');
    await flush();
    expect(bridge.retryExperimentalLyrics).toHaveBeenCalledWith('song');
  });
  it('retains the audio-processing prerequisite without activating it or downloading', async () => {
    snapshot.allowed = false;
    mounted = mount(Component);
    await flush();
    const input = findAll(mounted.root, (node) => node.type === 'input')[0];
    expect(input.props.disabled).toBe(true);
    expect(input.props.checked).toBe(false);
    expect(textContent(mounted.root)).toContain('請先啟用音訊處理功能');
    expect(bridge.setExperimentalLyricsEnabled).not.toHaveBeenCalled();
  });
  it('keeps cancellation failure bounded and the original lyrics/accompaniment available', async () => {
    snapshot.items = [{ trackId: 'song', status: 'running' }];
    bridge.cancelExperimentalLyrics.mockRejectedValueOnce(
      Error('private path'),
    );
    mounted = mount(Component);
    await flush();
    trigger(button('取消分析'), 'onClick');
    await flush();
    expect(textContent(mounted.root)).toContain('伴奏與原有歌詞仍可使用');
    expect(textContent(mounted.root)).not.toContain('private path');
    expect(button('取消分析')).toBeDefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import Component from './LyricsExperimentalQueueSettings.vue';
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
vi.mock('./SettingsSection.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['title'],
      setup:
        (props, { slots }) =>
        () =>
          h('section', [props.title, slots.default?.()]),
    },
  };
});
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
  it('starts unchecked, performs only explicit opt-in and never downloads', async () => {
    mounted = mount(Component);
    await flush();
    const input = findAll(mounted.root, (node) => node.type === 'input')[0];
    expect(input.props.checked).toBe(false);
    expect(bridge.setExperimentalLyricsEnabled).not.toHaveBeenCalled();
    expect(textContent(mounted.root)).toContain('不會自動下載模型');
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
    trigger(button('取消詞塊分析'), 'onClick');
    await flush();
    expect(bridge.cancelExperimentalLyrics).toHaveBeenCalledWith('song');
    snapshot.items[0].status = 'failed';
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(textContent(mounted.root)).toContain('伴奏仍可用');
    trigger(button('重試詞塊分析'), 'onClick');
    await flush();
    expect(bridge.retryExperimentalLyrics).toHaveBeenCalledWith('song');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, shallowRef } from 'vue';
import Component from './LyricsResearchSettingsBlock.vue';
import PreviewTools from './LyricsResearchPreviewTools.vue';
import SettingsSection from './SettingsSection.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiChip from '../ui/UiChip.vue';
import {
  attachClientRender,
  mount,
  findAll,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
const state = vi.hoisted(() => ({}));
vi.mock('../../composables/lyrics/useLyricsResearch.js', () => ({
  useLyricsResearch: () => state.owner,
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => state.library,
}));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => state.player,
}));
vi.mock('./LyricsExperimentalQueueSettings.vue', async () => {
  const { h } = await import('vue');
  return { default: { setup: () => () => h('div', '伴奏完成後自動產生詞塊') } };
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
      props: ['modelValue', 'options'],
      emits: ['update:modelValue'],
      setup:
        (props, { emit }) =>
        () =>
          h(
            'select',
            {
              value: props.modelValue,
              onChange: (e) => emit('update:modelValue', e.target.value),
            },
            props.options.map((o) => h('option', { value: o.value }, o.label)),
          ),
    },
  };
});
attachClientRender(
  Component,
  './LyricsResearchSettingsBlock.vue',
  import.meta.url,
);
attachClientRender(
  PreviewTools,
  './LyricsResearchPreviewTools.vue',
  import.meta.url,
);
for (const [component, path] of [
  [SettingsSection, './SettingsSection.vue'],
  [SettingsDocumentItem, './SettingsDocumentItem.vue'],
  [UiDisclosure, '../ui/UiDisclosure.vue'],
  [UiChip, '../ui/UiChip.vue'],
])
  attachClientRender(component, path, import.meta.url);
let mounted;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {
    Utawakui: { onLibraryUpdated: vi.fn(() => vi.fn()) },
  });
  state.owner = {
    status: shallowRef({ status: 'missing' }),
    busy: shallowRef(false),
    error: shallowRef(''),
    preview: shallowRef(null),
    inspection: shallowRef(null),
    refresh: vi.fn(),
    inspect: vi.fn(),
    action: vi.fn(),
    cancel: vi.fn(),
    clearPreview: vi.fn(),
  };
  state.library = {
    state: { tracks: [{ id: 'song', title: '歌曲' }] },
    initialize: vi.fn(),
  };
  state.player = {
    state: { track: null, currentTime: 0 },
    playTrack: vi.fn(async () => true),
    play: vi.fn(),
    seek: vi.fn(),
  };
});
afterEach(() => {
  mounted?.app.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function button(text) {
  return findAll(mounted.root, (node) => {
    if (node.type !== 'button' || !textContent(node).includes(text))
      return false;
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.type === 'details' && !parent.props.open) return false;
    }
    return true;
  })[0];
}
async function disclose(text, open) {
  const details = findAll(
    mounted.root,
    (node) =>
      node.type === 'details' &&
      textContent(
        node.children.find((child) => child.type === 'summary'),
      ).includes(text),
  )[0];
  expect(details).toBeDefined();
  trigger(details, 'onToggle', { currentTarget: { open } });
  await nextTick();
}
async function open() {
  mounted = mount(Component);
  await disclose('片段預覽', true);
  await nextTick();
  await nextTick();
}
describe('integrated experimental lyrics settings', () => {
  it('uses the real settings row and disclosure while keeping the rights notice outside collapsed content', async () => {
    mounted = mount(Component);
    await nextTick();
    const details = findAll(mounted.root, (n) => n.type === 'details');
    expect(details).toHaveLength(2);
    expect(details.every((n) => !n.props.open)).toBe(true);
    const notice = findAll(
      mounted.root,
      (n) => n.type === 'p' && textContent(n).includes('散布授權'),
    )[0];
    expect(notice).toBeDefined();
    expect(
      details.some((n) => findAll(n, (child) => child === notice).length),
    ).toBe(false);
    const state = findAll(
      mounted.root,
      (n) => n.type === 'span' && n.props.class?.includes('ui-chip__label'),
    )[0];
    expect(textContent(state)).toContain('未下載');
  });
  it('reads environment status without downloads or inference and collapses advanced tools', async () => {
    mounted = mount(Component);
    await nextTick();
    expect(state.owner.refresh).toHaveBeenCalledTimes(1);
    expect(state.owner.action).not.toHaveBeenCalled();
    expect(textContent(mounted.root)).toContain('0.78 GB');
    expect(textContent(mounted.root)).toContain('人工驗證');
    expect(button('產生預覽')).toBeUndefined();
    expect(button('移除')).toBeUndefined();
    expect(state.library.initialize).not.toHaveBeenCalled();
    trigger(button('下載工具'), 'onClick');
    expect(state.owner.action).toHaveBeenCalledWith('prepare');
  });
  it.each([
    ['unverified', '檢查工具', 'verify'],
    ['damaged', '重新下載修復', 'prepare'],
  ])('offers the correct next action for %s', async (status, label, action) => {
    state.owner.status.value = { status };
    mounted = mount(Component);
    await nextTick();
    trigger(button(label), 'onClick');
    expect(state.owner.action).toHaveBeenCalledWith(action);
    expect(state.library.initialize).not.toHaveBeenCalled();
  });
  it('keeps cancellation visible with advanced tools closed', async () => {
    state.owner.busy.value = true;
    mounted = mount(Component);
    await nextTick();
    trigger(button('取消'), 'onClick');
    expect(state.owner.cancel).toHaveBeenCalled();
    expect(button('產生預覽')).toBeUndefined();
  });
  it('keeps repair, verification and removal inside collapsed environment management', async () => {
    state.owner.status.value = { status: 'ready' };
    mounted = mount(Component);
    await nextTick();
    expect(textContent(mounted.root)).toContain('可使用');
    expect(textContent(mounted.root)).toContain('伴奏完成後自動產生詞塊');
    expect(button('檢查工具')).toBeUndefined();
    await disclose(
      '工具管理與詳細說明',
      !findAll(mounted.root, (n) => n.type === 'details')[0].props.open,
    );
    await nextTick();
    trigger(button('檢查工具'), 'onClick');
    trigger(button('重新下載修復'), 'onClick');
    trigger(button('移除工具'), 'onClick');
    expect(state.owner.action.mock.calls).toEqual([
      ['verify'],
      ['prepare'],
      ['remove'],
    ]);
    await disclose(
      '工具管理與詳細說明',
      !findAll(mounted.root, (n) => n.type === 'details')[0].props.open,
    );
    await nextTick();
    expect(button('移除工具')).toBeUndefined();
    expect(state.library.initialize).not.toHaveBeenCalled();
  });
  it('refreshes status even with research tools closed and stops polling when unmounted', async () => {
    mounted = mount(Component);
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.owner.refresh).toHaveBeenCalledTimes(2);
    mounted.app.unmount();
    mounted = null;
    await vi.advanceTimersByTimeAsync(1000);
    expect(state.owner.refresh).toHaveBeenCalledTimes(2);
  });
  it('discards the old preview and unsubscribes when advanced tools close', async () => {
    const unsubscribe = vi.fn();
    window.Utawakui.onLibraryUpdated.mockReturnValue(unsubscribe);
    await open();
    expect(state.library.initialize).toHaveBeenCalledTimes(1);
    state.owner.clearPreview.mockClear();
    await disclose(
      '片段預覽',
      !findAll(mounted.root, (n) => n.type === 'details')[1].props.open,
    );
    await nextTick();
    expect(state.owner.clearPreview).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(button('產生預覽')).toBeUndefined();
  });
  it('does not reuse the previous song inspection after tools reopen', async () => {
    state.owner.status.value = { status: 'ready' };
    state.owner.inspection.value = {
      sourceLabel: 'old-source.vtt',
      lines: [{ index: 0, text: '舊歌', startMs: 1000, endMs: 2000 }],
    };
    await open();
    expect(button('產生預覽').props.disabled).toBe(true);
    expect(textContent(mounted.root)).not.toContain('old-source.vtt');
    const select = findAll(mounted.root, (n) => n.type === 'select')[0];
    trigger(select, 'onChange', { target: { value: 'song' } });
    await nextTick();
    expect(button('產生預覽').props.disabled).toBe(false);
    await disclose(
      '片段預覽',
      !findAll(mounted.root, (n) => n.type === 'details')[1].props.open,
    );
    await nextTick();
    await disclose(
      '片段預覽',
      !findAll(mounted.root, (n) => n.type === 'details')[1].props.open,
    );
    await nextTick();
    expect(button('產生預覽').props.disabled).toBe(true);
  });
  it('keeps cancellation available and shows explicit research/T1/T2 preview states', async () => {
    await open();
    state.owner.busy.value = true;
    await nextTick();
    trigger(button('取消'), 'onClick');
    expect(state.owner.cancel).toHaveBeenCalled();
    state.owner.busy.value = false;
    state.owner.preview.value = {
      offsetMs: 0,
      lines: [
        {
          lineId: 'a',
          text: '歌詞',
          startMs: 1000,
          endMs: 2000,
          mode: 'T1',
          chunks: [],
          content: 'contradiction',
        },
        {
          lineId: 'b',
          text: '今天',
          startMs: 2000,
          endMs: 3000,
          mode: 'research',
          chunks: [
            { from: 0, to: 1, startMs: 2000 },
            { from: 1, to: 2, startMs: 2500 },
          ],
          content: 'possible-missing-lyrics',
        },
        {
          lineId: 'c',
          text: '原生',
          startMs: 3000,
          endMs: 4000,
          mode: 'T2',
          chunks: [],
          segments: [{ text: '原生', startMs: 3000, endMs: 4000 }],
        },
      ],
    };
    await nextTick();
    const text = textContent(mounted.root);
    expect(text).toContain('整句顯示');
    expect(text).toContain('原有逐字時間');
    expect(text).toContain('2.50s');
    expect(text).toContain('已改為整句顯示');
    expect(text).toContain('可能有缺漏歌詞');
  });
  it('sends selected song, language and line only; plays through the existing player', async () => {
    await open();
    state.owner.status.value = { status: 'ready' };
    state.owner.inspection.value = {
      sourceLabel: 'main.vtt',
      lines: [{ index: 0, text: '歌詞', startMs: 1000, endMs: 3000 }],
    };
    await nextTick();
    const select = findAll(mounted.root, (n) => n.type === 'select')[0];
    trigger(select, 'onChange', { target: { value: 'song' } });
    await nextTick();
    trigger(button('產生預覽'), 'onClick');
    expect(state.owner.action).toHaveBeenCalledWith('preview', {
      trackId: 'song',
      language: 'zh',
      lineIndex: 0,
    });
    state.owner.preview.value = {
      offsetMs: 200,
      lines: [
        {
          lineId: 'a',
          text: '歌詞',
          startMs: 1000,
          endMs: 3000,
          mode: 'T1',
          chunks: [],
        },
      ],
    };
    await nextTick();
    trigger(button('從本句播放'), 'onClick');
    await nextTick();
    await nextTick();
    expect(state.player.playTrack).toHaveBeenCalledWith(
      state.library.state.tracks[0],
    );
    expect(state.player.seek).toHaveBeenCalledWith(0.8);
  });
});

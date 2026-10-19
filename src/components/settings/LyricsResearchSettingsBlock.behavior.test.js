import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, shallowRef } from 'vue';
import Component from './LyricsResearchSettingsBlock.vue';
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
vi.mock('./SettingsSection.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['title'],
      setup:
        (props, { slots }) =>
        () =>
          h('section', [props.title, slots.actions?.(), slots.default?.()]),
    },
  };
});
vi.mock('./SettingsDocumentItem.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['title', 'description'],
      setup:
        (props, { slots }) =>
        () =>
          h('article', [
            props.title,
            props.description,
            slots.actions?.(),
            slots.default?.(),
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
let mounted;
beforeEach(() => {
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
  vi.unstubAllGlobals();
});
function button(text) {
  return findAll(
    mounted.root,
    (node) => node.type === 'button' && textContent(node).includes(text),
  )[0];
}
async function open() {
  mounted = mount(Component);
  trigger(button('開啟研究試用'), 'onClick');
  await nextTick();
  await nextTick();
}
describe('separate in-App research entry', () => {
  it('is collapsed without downloads, opens independently of feature gates and names pending timing', async () => {
    mounted = mount(Component);
    expect(state.owner.refresh).not.toHaveBeenCalled();
    expect(state.owner.action).not.toHaveBeenCalled();
    trigger(button('開啟研究試用'), 'onClick');
    await nextTick();
    await nextTick();
    expect(state.owner.refresh).toHaveBeenCalledTimes(1);
    expect(textContent(mounted.root)).toContain('0.78 GB');
    expect(textContent(mounted.root)).toContain('人工驗收');
    expect(button('產生本段').props.disabled).toBe(true);
    trigger(button('手動下載'), 'onClick');
    expect(state.owner.action).toHaveBeenCalledWith('prepare');
  });
  it('keeps cancellation available and shows explicit research/T1/T2 preview states', async () => {
    await open();
    state.owner.busy.value = true;
    await nextTick();
    trigger(button('取消並等待清理'), 'onClick');
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
    expect(text).toContain('T1');
    expect(text).toContain('T2');
    expect(text).toContain('2.50s');
    expect(text).toContain('已收起研究詞塊');
    expect(text).toContain('疑似漏詞');
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
    trigger(button('產生本段'), 'onClick');
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

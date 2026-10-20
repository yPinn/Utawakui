import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, shallowRef } from 'vue';
import Component from './LyricsSourceAnalysis.vue';
import {
  attachClientRender,
  mount,
  findAll,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

const mocks = vi.hoisted(() => ({ domain: {}, queue: {} }));
vi.mock('../../composables/useLyrics.js', () => ({
  useLyrics: () => mocks.domain,
}));
vi.mock('../../composables/lyrics/useExperimentalLyricsQueue.js', () => ({
  useExperimentalLyricsQueue: () => mocks.queue,
}));
vi.mock('../ui/UiButton.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['disabled'],
      setup:
        (p, { slots }) =>
        () =>
          h('button', { disabled: p.disabled }, slots.default?.()),
    },
  };
});
vi.mock('../ui/UiHint.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      setup:
        (_, { slots }) =>
        () =>
          h('p', slots.default?.()),
    },
  };
});
vi.mock('../ui/UiSelect.vue', async () => {
  const { h } = await import('vue');
  return {
    default: {
      props: ['modelValue', 'options', 'disabled', 'label'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit }) =>
        () =>
          h('label', [
            p.label,
            h(
              'select',
              {
                value: p.modelValue,
                disabled: p.disabled,
                onChange: (e) => emit('update:modelValue', e.target.value),
              },
              p.options.map((o) => h('option', { value: o.value }, o.label)),
            ),
          ]),
    },
  };
});
let mounted, owner;
const flush = async () => {
  await nextTick();
  await nextTick();
  await nextTick();
};
const button = (label) =>
  findAll(
    mounted.root,
    (n) => n.type === 'button' && textContent(n).trim() === label,
  )[0];
beforeEach(() => {
  vi.useFakeTimers();
  owner = {
    estimate: shallowRef({ status: 'missing' }),
    prepared: shallowRef({ status: 'missing' }),
    applied: shallowRef(false),
    needsReanalysis: shallowRef(false),
    setApplied: vi.fn((v) => {
      owner.applied.value = v;
    }),
  };
  Object.assign(mocks.domain, {
    state: reactive({
      selectedTrackId: 'song',
      selectedSourceFilename: 'active.lrc',
      offsetSeconds: -0.5,
      offsetSave: {},
      timingSave: {},
    }),
    lyricsDocument: shallowRef({
      lines: [{ startMs: 1000, endMs: 5000, text: '今天唱歌' }],
    }),
    selectedSource: shallowRef({
      filename: 'active.lrc',
      kind: 'lrclib',
      label: 'Aimer',
    }),
    experimentalLyrics: owner,
  });
  Object.assign(mocks.queue, {
    state: shallowRef({
      enabled: true,
      allowed: true,
      environmentStatus: 'ready',
      items: [],
    }),
    error: shallowRef(''),
    refresh: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  });
  attachClientRender(Component, './LyricsSourceAnalysis.vue', import.meta.url);
});
afterEach(() => {
  mounted?.app.unmount();
  vi.useRealTimers();
});
function setup() {
  const props = reactive({ active: true, disabled: false });
  mounted = mount(Component, props);
  return props;
}

describe('selected source analysis in available lyrics', () => {
  it('starts only the current source with a one-job language and keeps selection/offset untouched', async () => {
    setup();
    await flush();
    const before = JSON.stringify(mocks.domain.state);
    trigger(findAll(mounted.root, (n) => n.type === 'select')[0], 'onChange', {
      target: { value: 'ja' },
    });
    await flush();
    trigger(button('分析詞塊'), 'onClick');
    await flush();
    expect(mocks.queue.retry).toHaveBeenCalledWith('song', 'ja', 'active.lrc');
    expect(JSON.stringify(mocks.domain.state)).toBe(before);
    expect(owner.setApplied).not.toHaveBeenCalled();
  });
  it('shares manual application, exposes partial fallback, and never applies automatically', async () => {
    owner.prepared.value = {
      status: 'ready',
      lines: [{ status: 'ready' }, { status: 'unsupported' }],
    };
    setup();
    await flush();
    expect(textContent(mounted.root)).toContain('T1+');
    expect(textContent(mounted.root)).toContain('1 句模型詞塊');
    expect(textContent(mounted.root)).toContain('其餘沿用來源');
    expect(owner.setApplied).not.toHaveBeenCalled();
    trigger(button('套用詞塊'), 'onClick');
    await flush();
    expect(owner.setApplied).toHaveBeenCalledWith(true);
    trigger(button('停用詞塊'), 'onClick');
    expect(owner.setApplied).toHaveBeenLastCalledWith(false);
    owner.needsReanalysis.value = true;
    owner.prepared.value = { status: 'stale' };
    await flush();
    expect(textContent(mounted.root)).toContain('校時已變更，請重新分析');
    expect(button('套用詞塊')).toBeUndefined();
  });
  it('cancels a track job, preserves the old estimate after failure, and stops polling on close', async () => {
    const props = setup();
    await flush();
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [
        { trackId: 'song', sourceFilename: 'active.lrc', status: 'running' },
      ],
    };
    await flush();
    trigger(button('取消分析'), 'onClick');
    await flush();
    expect(mocks.queue.cancel).toHaveBeenCalledWith('song');
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [{ trackId: 'song', status: 'failed' }],
    };
    owner.prepared.value = { status: 'ready', lines: [{ status: 'ready' }] };
    await flush();
    expect(textContent(mounted.root)).toContain('原有歌詞與伴奏仍可使用');
    expect(button('套用詞塊').props.disabled).toBe(false);
    props.active = false;
    await flush();
    const count = mocks.queue.refresh.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.queue.refresh).toHaveBeenCalledTimes(count);
  });
  it('keeps native T2 and blocks analysis during offset saves, missing tools or disabled opt-in', async () => {
    setup();
    await flush();
    mocks.domain.state.offsetSave.isSaving = true;
    await flush();
    expect(button('分析詞塊').props.disabled).toBe(true);
    mocks.domain.state.offsetSave.isSaving = false;
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      environmentStatus: 'missing',
    };
    await flush();
    expect(button('分析詞塊').props.disabled).toBe(true);
    expect(textContent(mounted.root)).toContain('設定');
    mocks.domain.lyricsDocument.value = {
      lines: [{ startMs: 1000, endMs: 5000, segments: [{}] }],
    };
    await flush();
    expect(textContent(mounted.root)).toContain('來源 T2');
    expect(button('分析詞塊')).toBeUndefined();
    expect(mocks.queue.retry).not.toHaveBeenCalled();
    expect(owner.setApplied).not.toHaveBeenCalled();
  });
});

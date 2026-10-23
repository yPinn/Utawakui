import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, shallowRef } from 'vue';
import Component from './LyricsSourceAnalysis.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import LyricsPhrasePreview from './LyricsPhrasePreview.vue';
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
    estimate: shallowRef({ status: 'missing', sourceRevision: 'v1' }),
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
  attachClientRender(UiProgress, '../ui/UiProgress.vue', import.meta.url);
  attachClientRender(UiDisclosure, '../ui/UiDisclosure.vue', import.meta.url);
  attachClientRender(Component, './LyricsSourceAnalysis.vue', import.meta.url);
  attachClientRender(
    LyricsPhrasePreview,
    './LyricsPhrasePreview.vue',
    import.meta.url,
  );
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
  it('shows a declined mixed-source reason only for the current source revision', async () => {
    setup();
    await flush();
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [
        {
          trackId: 'song',
          sourceFilename: 'active.lrc',
          sourceRevision: 'v1',
          jobId: 'declined',
          status: 'skipped',
          reason: 'unsupported-lyrics',
        },
      ],
    };
    await flush();
    expect(textContent(mounted.root)).toContain('目前沒有可分析的單語句');
    owner.estimate.value = { status: 'missing', sourceRevision: 'v2' };
    await flush();
    expect(textContent(mounted.root)).not.toContain('目前沒有可分析的單語句');
  });
  it('permits another source to queue and ignores stale-version progress', async () => {
    setup();
    await flush();
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [
        {
          trackId: 'song',
          sourceFilename: 'other.lrc',
          sourceRevision: 'v1',
          jobId: 'other',
          status: 'running',
          progress: { stage: 'alignment', completed: 1, total: 2 },
        },
        {
          trackId: 'song',
          sourceFilename: 'active.lrc',
          sourceRevision: 'old',
          jobId: 'old',
          status: 'running',
        },
      ],
    };
    await flush();
    expect(button('分析歌詞').props.disabled).toBe(false);
    expect(button('取消分析')).toBeUndefined();
    expect(findAll(mounted.root, (n) => n.type === 'progress')).toHaveLength(0);
    trigger(button('分析歌詞'), 'onClick');
    await flush();
    expect(mocks.queue.retry).toHaveBeenCalledWith(
      'song',
      'auto',
      'active.lrc',
    );
  });
  it('offers English and shows actual per-stage progress with indeterminate preparation', async () => {
    setup();
    await flush();
    expect(textContent(mounted.root)).toContain('英文');
    expect(textContent(mounted.root)).toContain('主要語言提示');
    trigger(findAll(mounted.root, (n) => n.type === 'select')[0], 'onChange', {
      target: { value: 'en' },
    });
    await flush();
    trigger(button('分析歌詞'), 'onClick');
    await flush();
    expect(mocks.queue.retry).toHaveBeenCalledWith('song', 'en', 'active.lrc');
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      stage: 'verify',
      items: [
        {
          trackId: 'song',
          sourceFilename: 'active.lrc',
          sourceRevision: 'v1',
          jobId: 'job-active',
          status: 'running',
        },
      ],
    };
    await flush();
    let meter = findAll(mounted.root, (n) => n.type === 'progress')[0];
    expect(meter.props.value).toBeUndefined();
    expect(meter.props['aria-label']).toBe('檢查環境');
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [
        {
          trackId: 'song',
          sourceFilename: 'active.lrc',
          sourceRevision: 'v1',
          jobId: 'job-active',
          status: 'running',
          progress: { stage: 'alignment', completed: 2, total: 5 },
        },
      ],
    };
    await flush();
    meter = findAll(mounted.root, (n) => n.type === 'progress')[0];
    expect(meter.props.value).toBe(2);
    expect(meter.props.max).toBe(5);
    expect(textContent(mounted.root)).toContain('2 / 5 段音訊');
    expect(button('取消分析')).toBeDefined();
    expect(
      findAll(mounted.root, (n) => n.type === 'details')[0].props.open,
    ).toBe(false);
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [
        {
          trackId: 'song',
          sourceFilename: 'active.lrc',
          sourceRevision: 'v1',
          jobId: 'job-active',
          status: 'cancelled',
        },
      ],
    };
    await flush();
    expect(findAll(mounted.root, (n) => n.type === 'progress')).toHaveLength(0);
  });
  it('starts only the current source with a one-job language and keeps selection/offset untouched', async () => {
    setup();
    await flush();
    const before = JSON.stringify(mocks.domain.state);
    trigger(findAll(mounted.root, (n) => n.type === 'select')[0], 'onChange', {
      target: { value: 'ja' },
    });
    await flush();
    trigger(button('分析歌詞'), 'onClick');
    await flush();
    expect(mocks.queue.retry).toHaveBeenCalledWith('song', 'ja', 'active.lrc');
    expect(JSON.stringify(mocks.domain.state)).toBe(before);
    expect(owner.setApplied).not.toHaveBeenCalled();
  });
  it('shows a short omission warning while keeping application a manual action', async () => {
    owner.estimate.value = {
      status: 'ready',
      validation: { missingLyrics: 1 },
    };
    owner.prepared.value = { status: 'ready', lines: [{ status: 'ready' }] };
    setup();
    await flush();
    expect(textContent(mounted.root)).toContain('疑似漏詞 1 句');
    expect(owner.setApplied).not.toHaveBeenCalled();
  });

  it('shares manual application, exposes partial fallback, and never applies automatically', async () => {
    owner.prepared.value = {
      status: 'ready',
      lines: [{ status: 'ready' }, { status: 'unsupported' }],
    };
    setup();
    await flush();
    expect(textContent(mounted.root)).toContain('分析未套用');
    expect(textContent(mounted.root)).toContain('僅分段提示');
    expect(textContent(mounted.root)).toContain('未涵蓋部分沿用原歌詞');
    expect(owner.setApplied).not.toHaveBeenCalled();
    trigger(button('套用分析'), 'onClick');
    await flush();
    expect(owner.setApplied).toHaveBeenCalledWith(true);
    trigger(button('停用分析'), 'onClick');
    expect(owner.setApplied).toHaveBeenLastCalledWith(false);
    owner.prepared.value = {
      status: 'ready',
      lines: [
        {
          status: 'ready',
          fineTiming: { version: 1, units: [{ unitId: 'fine' }] },
        },
      ],
    };
    await flush();
    expect(textContent(mounted.root)).toContain('1 句含細時間');
    const previousApplyCalls = owner.setApplied.mock.calls.length;
    owner.estimate.value = {
      ...owner.estimate.value,
      compatibility: { rule: 'normalizer-v2-v3-exact-v1' },
    };
    await flush();
    expect(textContent(mounted.root)).toContain('沿用既有分析，時間未變');
    expect(owner.setApplied).toHaveBeenCalledTimes(previousApplyCalls);
    owner.needsReanalysis.value = true;
    owner.prepared.value = { status: 'stale' };
    await flush();
    expect(textContent(mounted.root)).toContain('校時已變更，請重新分析');
    expect(button('套用分析')).toBeUndefined();
  });
  it('cancels the source job, preserves the old estimate after failure, and stops polling on close', async () => {
    const props = setup();
    await flush();
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [
        {
          trackId: 'song',
          sourceFilename: 'active.lrc',
          sourceRevision: 'v1',
          jobId: 'job-active',
          status: 'running',
        },
      ],
    };
    await flush();
    trigger(button('取消分析'), 'onClick');
    await flush();
    expect(mocks.queue.cancel).toHaveBeenCalledWith('song', 'job-active');
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [
        {
          trackId: 'song',
          sourceFilename: 'active.lrc',
          sourceRevision: 'v1',
          jobId: 'job-active',
          status: 'failed',
        },
      ],
    };
    owner.prepared.value = { status: 'ready', lines: [{ status: 'ready' }] };
    await flush();
    expect(textContent(mounted.root)).toContain('原有歌詞與伴奏仍可使用');
    expect(button('套用分析').props.disabled).toBe(false);
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
    expect(button('分析歌詞').props.disabled).toBe(true);
    mocks.domain.state.offsetSave.isSaving = false;
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      environmentStatus: 'missing',
    };
    await flush();
    expect(button('分析歌詞').props.disabled).toBe(true);
    expect(textContent(mounted.root)).toContain('設定');
    mocks.domain.lyricsDocument.value = {
      lines: [{ startMs: 1000, endMs: 5000, segments: [{}] }],
    };
    await flush();
    expect(textContent(mounted.root)).toContain('來源 T2');
    expect(button('分析歌詞')).toBeUndefined();
    expect(mocks.queue.retry).not.toHaveBeenCalled();
    expect(owner.setApplied).not.toHaveBeenCalled();
  });
  it('shows offset invalidation instead of an older cancelled-job notice', async () => {
    setup();
    mocks.queue.state.value = {
      ...mocks.queue.state.value,
      items: [
        {
          trackId: 'song',
          sourceFilename: 'active.lrc',
          sourceRevision: 'v1',
          jobId: 'job-active',
          status: 'cancelled',
        },
      ],
    };
    owner.needsReanalysis.value = true;
    owner.prepared.value = { status: 'stale' };
    await flush();
    expect(textContent(mounted.root)).toContain('校時已變更，請重新分析');
    expect(button('套用分析')).toBeUndefined();
  });
});

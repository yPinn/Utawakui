import { h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import Component from './FfmpegSourceModal.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
const state = vi.hoisted(() => ({}));
vi.mock('../../composables/useFeatureDependencies.js', () => ({
  useFeatureDependencies: () => state.owner,
}));
vi.mock('../../composables/useAppDiagnostics.js', () => ({
  useAppDiagnostics: () => ({
    recordError: () => ({ message: '來源未變更，請再試一次。' }),
  }),
}));
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('div', [slots['header-actions']?.(), slots.default?.()]),
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('button', slots.default?.()),
  },
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('p', slots.default?.()),
  },
}));
vi.mock('../ui/UiNotice.vue', () => ({
  default: { props: ['message'], setup: (p) => () => h('p', p.message) },
}));
let mounted, setSource;
beforeEach(() => {
  state.owner = {
    state: reactive({
      byId: {
        'ffmpeg-gyan-essentials': { source: 'managed', installed: false },
      },
      progressById: {},
      preparingIds: new Set(),
      errorsById: {},
    }),
    prepareDependency: vi.fn(async () => {}),
  };
  setSource = vi.fn(async () => {});
  vi.stubGlobal('window', { Utawakui: { setFfmpegSource: setSource } });
  attachClientRender(Component, './FfmpegSourceModal.vue', import.meta.url);
  attachClientRender(UiRadioGroup, '../ui/UiRadioGroup.vue', import.meta.url);
  mounted = mount(Component, {
    open: true,
    initialDetection: { ok: true, path: 'C:\\tools\\ffmpeg.exe' },
  });
});
afterEach(() => {
  mounted?.app.unmount();
  vi.unstubAllGlobals();
});
const button = (text) =>
  findAll(
    mounted.root,
    (n) => n.type === 'button' && textContent(n).includes(text),
  )[0];
it('keeps an unprepared managed source selected without claiming it is ready or downloading automatically', () => {
  const radios = findAll(
    mounted.root,
    (n) => n.type === 'input' && n.props.type === 'radio',
  );
  expect(radios).toHaveLength(2);
  expect(radios[1].props.checked).toBe(true);
  expect(textContent(mounted.root)).toContain('尚未下載');
  expect(textContent(mounted.root)).not.toContain('使用中');
  expect(state.owner.prepareDependency).not.toHaveBeenCalled();
});
it('only prepares managed tools after the explicit apply action', async () => {
  trigger(button('準備並使用'), 'onClick');
  await nextTick();
  await nextTick();
  expect(setSource).toHaveBeenCalledExactlyOnceWith(false);
  expect(state.owner.prepareDependency).toHaveBeenCalledExactlyOnceWith(
    'ffmpeg-gyan-essentials',
  );
});
it('selects a system candidate without changing the source until applied', async () => {
  const radio = findAll(
    mounted.root,
    (n) => n.type === 'input' && n.props.value === 'system',
  )[0];
  trigger(radio, 'onChange');
  await nextTick();
  expect(setSource).not.toHaveBeenCalled();
  trigger(button('使用此版本'), 'onClick');
  await nextTick();
  expect(setSource).toHaveBeenCalledExactlyOnceWith(true);
  expect(state.owner.prepareDependency).not.toHaveBeenCalled();
});
it('keeps a failed source change retryable without claiming it was applied', async () => {
  setSource.mockRejectedValueOnce(new Error('private failure'));
  trigger(button('準備並使用'), 'onClick');
  await nextTick();
  await nextTick();
  expect(textContent(mounted.root)).toContain('來源未變更');
  expect(textContent(mounted.root)).not.toContain('private failure');
  expect(state.owner.prepareDependency).not.toHaveBeenCalled();
  trigger(button('準備並使用'), 'onClick');
  await nextTick();
  await nextTick();
  expect(state.owner.prepareDependency).toHaveBeenCalledOnce();
});

it('does not switch or download while the saved source is unknown', async () => {
  delete state.owner.state.byId['ffmpeg-gyan-essentials'];
  await nextTick();
  expect(button('準備並使用').props.disabled).toBe(true);
  trigger(button('準備並使用'), 'onClick');
  await nextTick();
  expect(setSource).not.toHaveBeenCalled();
  expect(state.owner.prepareDependency).not.toHaveBeenCalled();
});

it('distinguishes an installed applied source from the uncommitted radio selection', async () => {
  state.owner.state.byId['ffmpeg-gyan-essentials'].installed = true;
  await nextTick();
  const radios = findAll(
    mounted.root,
    (n) => n.type === 'input' && n.props.type === 'radio',
  );
  expect(textContent(mounted.root)).toContain('已套用');
  trigger(
    radios.find((n) => n.props.value === 'system'),
    'onChange',
  );
  await nextTick();
  expect(state.owner.state.byId['ffmpeg-gyan-essentials'].source).toBe(
    'managed',
  );
  expect(textContent(mounted.root)).toContain('已套用');
  expect(setSource).not.toHaveBeenCalled();
});

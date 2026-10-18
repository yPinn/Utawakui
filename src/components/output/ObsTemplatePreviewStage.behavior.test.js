import { h, nextTick, onMounted, onUnmounted, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stage from './ObsTemplatePreviewStage.vue';
import Thumbnail from './ObsTemplateThumbnail.vue';
import Caption from './ObsPreviewCaption.vue';
import Backdrop from './ObsPreviewBackdropToggle.vue';
import UiStack from '../ui/UiStack.vue';
import UiChip from '../ui/UiChip.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

const lifecycle = vi.hoisted(() => ({
  mounts: 0,
  unmounts: 0,
  loadGate: null,
}));
vi.mock('./ObsTemplateMockup.vue', async () => {
  await lifecycle.loadGate;
  return {
    default: {
      props: ['preset'],
      setup(props) {
        onMounted(() => lifecycle.mounts++);
        onUnmounted(() => lifecycle.unmounts++);
        return () => h('div', { 'data-live-preview': props.preset.id });
      },
    },
  };
});
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'icon', 'active', 'disabled'],
    emits: ['click'],
    setup(props, { emit }) {
      return () =>
        h('button', {
          'aria-label': props.label,
          disabled: props.disabled,
          onClick: () => emit('click'),
        });
    },
  },
}));

for (const [component, file] of [
  [Stage, './ObsTemplatePreviewStage.vue'],
  [Thumbnail, './ObsTemplateThumbnail.vue'],
  [Caption, './ObsPreviewCaption.vue'],
  [Backdrop, './ObsPreviewBackdropToggle.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiChip, '../ui/UiChip.vue'],
])
  attachClientRender(component, file, import.meta.url);

const presets = [
  { id: 'kinetic-pop', kind: 'lyrics' },
  { id: 'ornate-vertical', kind: 'lyrics' },
];
const apps = [];
function setup() {
  const selected = shallowRef(presets[0]);
  const rendered = mount({
    setup: () => () => h(Stage, { preset: selected.value }),
  });
  apps.push(rendered.app);
  const live = () =>
    findAll(rendered.root, (node) =>
      Boolean(node.props?.['data-live-preview']),
    );
  const canvas = () =>
    findAll(
      rendered.root,
      (node) =>
        node.props?.class === 'obs-template-preview-stage__canvas-group',
    )[0];
  const play = () =>
    findAll(
      rendered.root,
      (node) =>
        node.type === 'button' && /動態預覽/.test(node.props['aria-label']),
    )[0];
  return { ...rendered, selected, live, canvas, play };
}
async function settlePreview() {
  await vi.dynamicImportSettled();
  await nextTick();
}

beforeEach(() => {
  vi.useFakeTimers();
  lifecycle.mounts = 0;
  lifecycle.unmounts = 0;
});
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('static-first selected template preview', () => {
  it('switches images without constructing live previews', async () => {
    const view = setup();
    expect(findAll(view.root, (n) => n.type === 'img')).toHaveLength(1);
    expect(findAll(view.root, (n) => n.type === 'img')[0].props.loading).toBe(
      'eager',
    );
    view.selected.value = presets[1];
    await nextTick();
    expect(findAll(view.root, (n) => n.type === 'img')[0].props.src).toContain(
      'ornate-vertical',
    );
    expect(view.live()).toHaveLength(0);
    expect(lifecycle.mounts).toBe(0);
    expect(view.play().props['aria-label']).toBe('播放動態預覽');
  });

  it('cancels brief hover and pending hover when switching templates', async () => {
    const view = setup();
    trigger(view.canvas(), 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(249);
    expect(view.live()).toHaveLength(0);
    trigger(view.canvas(), 'onPointerleave');
    await vi.advanceTimersByTimeAsync(500);
    trigger(view.canvas(), 'onPointerenter', { pointerType: 'mouse' });
    view.selected.value = presets[1];
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    expect(lifecycle.mounts).toBe(0);
  });

  it('discards an import that finishes after selection changes', async () => {
    let release;
    lifecycle.loadGate = new Promise((resolve) => {
      release = resolve;
    });
    const view = setup();
    trigger(view.canvas(), 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(250);
    view.selected.value = presets[1];
    await nextTick();
    release();
    await settlePreview();
    lifecycle.loadGate = null;
    expect(lifecycle.mounts).toBe(0);
    expect(view.live()).toHaveLength(0);
  });

  it('mounts one live preview after dwell and disposes it on pointer leave', async () => {
    const view = setup();
    trigger(view.canvas(), 'onPointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(250);
    await settlePreview();
    expect(view.live()).toHaveLength(1);
    expect(findAll(view.root, (n) => n.type === 'img')).toHaveLength(1);
    trigger(view.canvas(), 'onPointerleave');
    await nextTick();
    expect(view.live()).toHaveLength(0);
    expect(lifecycle.unmounts).toBe(1);
  });

  it('supports manual playback outside hover and resets on selection', async () => {
    const view = setup();
    trigger(view.play(), 'onClick');
    await settlePreview();
    trigger(view.canvas(), 'onPointerleave');
    await nextTick();
    expect(view.live()).toHaveLength(1);
    trigger(view.play(), 'onClick');
    await nextTick();
    expect(view.live()).toHaveLength(0);
    trigger(view.play(), 'onClick');
    await settlePreview();
    view.selected.value = presets[1];
    await nextTick();
    expect(view.live()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores touch and reduced-motion hover while preserving explicit playback', async () => {
    const view = setup();
    trigger(view.canvas(), 'onPointerenter', { pointerType: 'touch' });
    expect(vi.getTimerCount()).toBe(0);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    trigger(view.canvas(), 'onPointerenter', { pointerType: 'mouse' });
    expect(vi.getTimerCount()).toBe(0);
    trigger(view.play(), 'onClick');
    await settlePreview();
    expect(view.live()).toHaveLength(1);
  });

  it('keeps image decode failures lightweight and clears timers on unmount', async () => {
    const view = setup();
    trigger(findAll(view.root, (n) => n.type === 'img')[0], 'onError');
    await nextTick();
    expect(findAll(view.root, (n) => n.type === 'img')).toHaveLength(0);
    expect(lifecycle.mounts).toBe(0);
    trigger(view.canvas(), 'onPointerenter', { pointerType: 'mouse' });
    expect(vi.getTimerCount()).toBe(1);
    apps.pop().unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

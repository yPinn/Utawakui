import { h, nextTick, onUnmounted, shallowRef } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stage from './ObsTemplatePreviewStage.vue';
import Thumbnail from './ObsTemplateThumbnail.vue';
import Caption from './ObsPreviewCaption.vue';
import Backdrop from './ObsPreviewBackdropToggle.vue';
import UiHint from '../ui/UiHint.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

const lifecycle = vi.hoisted(() => ({ unmounts: 0 }));
vi.mock('./ObsTemplateMockup.vue', () => ({
  default: {
    props: ['preset', 'animated'],
    setup(props) {
      onUnmounted(() => lifecycle.unmounts++);
      return () =>
        h('div', {
          'data-live-preview': props.preset.id,
          'data-animated': props.animated,
        });
    },
  },
}));

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
  [UiHint, '../ui/UiHint.vue'],
])
  attachClientRender(component, file, import.meta.url);

const presets = [
  { id: 'kinetic-pop', kind: 'lyrics' },
  { id: 'ornate-vertical', kind: 'lyrics' },
];
const apps = [];
let preference;
function setup({ initiallyActive = true } = {}) {
  const selected = shallowRef(presets[0]);
  const active = shallowRef(initiallyActive);
  const rendered = mount({
    setup: () => () =>
      h(Stage, { preset: selected.value, active: active.value }),
  });
  apps.push(rendered.app);
  const live = () =>
    findAll(rendered.root, (node) =>
      Boolean(node.props?.['data-live-preview']),
    );
  const images = () => findAll(rendered.root, (node) => node.type === 'img');
  return { ...rendered, selected, active, live, images };
}

async function settlePreview() {
  await nextTick();
  await vi.dynamicImportSettled();
  await nextTick();
}

beforeEach(() => {
  preference = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal('window', { matchMedia: () => preference });
  lifecycle.unmounts = 0;
});

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
});

describe('preview backdrop control', () => {
  it.each([
    { workbench: true, order: ['checker', 'white', 'black', 'checker'] },
    { workbench: false, order: ['dark', 'light', 'checker', 'dark'] },
  ])(
    'cycles the preview backdrops in order for $workbench',
    async ({ workbench, order }) => {
      const value = shallowRef(null);
      const { root, app } = mount({
        setup: () => () =>
          h(Backdrop, {
            workbench,
            modelValue: value.value,
            'onUpdate:modelValue': (next) => {
              value.value = next;
            },
          }),
      });
      apps.push(app);
      const button = () => findAll(root, (node) => node.type === 'button')[0];
      expect(button().props['data-backdrop']).toBe(order[0]);
      for (const next of order.slice(1)) {
        trigger(button(), 'onClick');
        await nextTick();
        expect(value.value).toBe(next);
        expect(button().props['data-backdrop']).toBe(next);
      }
    },
  );
});

describe('automatic selected template preview', () => {
  it('shows a static image while loading, then replaces it with one animated preview', async () => {
    const view = setup();
    expect(view.images()[0].props.loading).toBe('eager');
    expect(view.live()).toHaveLength(0);
    await settlePreview();
    expect(view.images()).toHaveLength(0);
    expect(view.live()).toHaveLength(1);
    expect(view.live()[0].props).toMatchObject({
      'data-live-preview': 'kinetic-pop',
      'data-animated': true,
    });
    expect(findAll(view.root, (node) => node.type === 'button')).toHaveLength(
      0,
    );
  });

  it('previews the latest selection and keeps animation off when the pane is hidden', async () => {
    const view = setup();
    await settlePreview();
    view.selected.value = presets[1];
    await settlePreview();
    expect(view.live()).toHaveLength(1);
    expect(view.live()[0].props['data-live-preview']).toBe('ornate-vertical');

    view.active.value = false;
    await settlePreview();
    expect(view.live()).toHaveLength(0);
    expect(view.images()[0].props.src).toContain('ornate-vertical');
    expect(lifecycle.unmounts).toBe(2);
  });

  it('discards an in-flight preview when its pane closes', async () => {
    const view = setup();
    view.active.value = false;
    await settlePreview();
    expect(view.live()).toHaveLength(0);
    expect(view.images()).toHaveLength(1);
    expect(lifecycle.unmounts).toBe(0);
  });

  it('starts on reveal and respects changes to the reduced-motion preference', async () => {
    preference.matches = true;
    const view = setup({ initiallyActive: false });
    await settlePreview();
    expect(view.live()).toHaveLength(0);
    view.active.value = true;
    await settlePreview();
    expect(view.live()).toHaveLength(0);

    preference.matches = false;
    preference.dispatchEvent(new Event('change'));
    await settlePreview();
    expect(view.live()).toHaveLength(1);

    preference.matches = true;
    preference.dispatchEvent(new Event('change'));
    await settlePreview();
    expect(view.live()).toHaveLength(0);
    expect(view.images()).toHaveLength(1);
  });
});

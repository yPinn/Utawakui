import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outputAppearanceFieldsForTemplate } from '../../../shared/outputAppearance.mjs';
import { localizeAppearanceField } from '../../utils/outputPanelCopy.js';
import UiHint from '../ui/UiHint.vue';
import UiStack from '../ui/UiStack.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsCutoutPortraitEditor from './ObsCutoutPortraitEditor.vue';
import ObsCutoutPortraitPhotoField from './ObsCutoutPortraitPhotoField.vue';
import ObsCutoutPortraitThumb from './ObsCutoutPortraitThumb.vue';

vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    inheritAttrs: false,
    props: ['label', 'loading', 'disabled'],
    setup:
      (props, { attrs }) =>
      () =>
        h('button', {
          'aria-label': props.label,
          disabled: props.loading || props.disabled,
          onClick: attrs.onClick,
        }),
  },
}));

for (const [component, path] of [
  [ObsAppearanceControlRow, './ObsAppearanceControlRow.vue'],
  [ObsCutoutPortraitPhotoField, './ObsCutoutPortraitPhotoField.vue'],
  [ObsCutoutPortraitThumb, './ObsCutoutPortraitThumb.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
]) {
  attachClientRender(component, path, import.meta.url);
}

const fields = outputAppearanceFieldsForTemplate('cutout-dialogue')
  .filter(({ group }) => group === 'portrait')
  .map(localizeAppearanceField);

describe('cutout portrait editor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['', '/artist/track-1'],
    ['photo-1', '/custom/photo-1'],
  ])(
    'previews the draft photo and color before the remaining fields (%s)',
    async (photoId, path) => {
      const html = await renderToString(
        createSSRApp({
          render: () =>
            h(ObsCutoutPortraitEditor, {
              fields,
              trackId: 'track-1',
              values: {
                cutoutArtistName: 'Reze',
                cutoutPortraitPhoto: photoId,
                cutoutPortraitColor: '#f3d648',
              },
            }),
        }),
      );

      expect(html).toContain(`src="utawakui-media://cutout-portrait${path}"`);
      expect(html).toContain('--ui-track-thumb-background:#f3d648');
      expect(html).toMatch(
        /id="output-appearance-cutoutPortraitPhoto".*id="output-appearance-cutoutArtistName".*id="output-appearance-cutoutPortraitColor"/s,
      );
      expect(html.match(/obs-appearance-control-row--stacked/g)).toHaveLength(
        3,
      );
    },
  );

  it('updates the draft preview after import, color changes and restore', async () => {
    const picker = Promise.withResolvers();
    vi.stubGlobal('window', {
      Utawakui: { chooseOutputPortrait: () => picker.promise },
    });
    const state = reactive({ modelValue: '', background: '#f3d648' });
    const onBusy = vi.fn();
    const { app, root } = mount({
      setup: () => () =>
        h(ObsCutoutPortraitPhotoField, {
          ...state,
          id: 'photo',
          label: 'Portrait',
          trackId: 'track-1',
          'onUpdate:busy': onBusy,
          'onUpdate:modelValue': (value) => (state.modelValue = value),
        }),
    });
    const image = () => findAll(root, (node) => node.type === 'img')[0];
    const buttons = () => findAll(root, (node) => node.type === 'button');
    const thumbnail = () =>
      findAll(
        root,
        (node) => node.props.style?.['--ui-track-thumb-background'],
      )[0];

    expect(image().props.src).toMatch(/\/artist\/track-1$/);
    trigger(buttons()[0], 'onClick');
    await nextTick();
    expect(buttons()[0].props.disabled).toBe(true);
    expect(onBusy).toHaveBeenLastCalledWith(true);
    expect(image().props.src).toMatch(/\/artist\/track-1$/);

    picker.resolve({ status: 'ok', id: 'photo-2' });
    await picker.promise;
    await nextTick();
    expect(image().props.src).toMatch(/\/custom\/photo-2$/);
    expect(onBusy).toHaveBeenLastCalledWith(false);

    state.background = '#654321';
    await nextTick();
    expect(thumbnail().props.style['--ui-track-thumb-background']).toBe(
      '#654321',
    );
    trigger(buttons()[1], 'onClick');
    await nextTick();
    expect(image().props.src).toMatch(/\/artist\/track-1$/);
    expect(thumbnail().props.style['--ui-track-thumb-background']).toBe(
      '#654321',
    );
    app.unmount();
  });
});

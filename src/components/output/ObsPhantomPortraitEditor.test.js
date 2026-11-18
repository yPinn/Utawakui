import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outputAppearanceFieldsForTemplate } from '../../../shared/outputAppearance.mjs';
import { localizeAppearanceField } from '../../utils/outputPanelCopy.js';
import UiHint from '../ui/UiHint.vue';
import UiStack from '../ui/UiStack.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsPhantomPortraitEditor from './ObsPhantomPortraitEditor.vue';
import ObsPhantomPortraitPhotoField from './ObsPhantomPortraitPhotoField.vue';
import ObsPhantomPortraitThumb from './ObsPhantomPortraitThumb.vue';

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

vi.mock('./ObsPhantomPortraitImageModal.vue', () => ({
  default: {
    props: ['photo'],
    emits: ['apply', 'close'],
    setup:
      (props, { emit }) =>
      () =>
        h('div', { 'data-photo-draft': props.photo.id }, [
          h('button', { onClick: () => emit('close') }, 'close'),
          h('button', { onClick: () => emit('apply', 'photo-2') }, 'apply'),
        ]),
  },
}));

for (const [component, path] of [
  [ObsAppearanceControlRow, './ObsAppearanceControlRow.vue'],
  [ObsPhantomPortraitPhotoField, './ObsPhantomPortraitPhotoField.vue'],
  [ObsPhantomPortraitThumb, './ObsPhantomPortraitThumb.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiStatusIcon, '../ui/UiStatusIcon.vue'],
  [UiTrackThumb, '../ui/UiTrackThumb.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, path, import.meta.url);
}

const fields = outputAppearanceFieldsForTemplate('phantom-thieves')
  .filter(({ group }) => group === 'portrait')
  .map(localizeAppearanceField);

describe('phantom portrait editor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['', null],
    ['photo-1', '/custom/photo-1'],
  ])(
    'previews the draft photo and color before the remaining fields (%s)',
    async (photoId, path) => {
      const html = await renderToString(
        createSSRApp({
          render: () =>
            h(ObsPhantomPortraitEditor, {
              fields,
              values: {
                phantomArtistName: 'Reze',
                phantomPortraitPhoto: photoId,
                phantomPortraitColor: '#f3d648',
              },
            }),
        }),
      );

      if (path) {
        expect(html).toContain(
          `src="utawakui-media://phantom-portrait${path}"`,
        );
      } else {
        expect(html).not.toContain('<img');
        expect(html).toContain('lucide-user-round');
        expect(html).toContain('未設定自訂照片');
      }
      expect(html).toContain('--ui-track-thumb-background:#f3d648');
      expect(html).toMatch(
        /id="output-appearance-phantomPortraitPhoto".*id="output-appearance-phantomArtistName".*id="output-appearance-phantomPortraitColor"/s,
      );
      expect(html.match(/obs-appearance-control-row--stacked/g)).toHaveLength(
        3,
      );
    },
  );

  it('updates the draft preview after import, color changes and restore', async () => {
    const picker = Promise.withResolvers();
    const discard = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      Utawakui: {
        chooseOutputPortrait: vi
          .fn()
          .mockReturnValueOnce(picker.promise)
          .mockResolvedValue({ status: 'ok', id: 'draft-2' }),
        discardOutputPortrait: discard,
      },
    });
    const state = reactive({ modelValue: '', background: '#f3d648' });
    const onBusy = vi.fn();
    const { app, root } = mount({
      setup: () => () =>
        h(ObsPhantomPortraitPhotoField, {
          ...state,
          id: 'photo',
          label: 'Portrait',
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

    expect(image()).toBeUndefined();
    trigger(buttons()[0], 'onClick');
    await nextTick();
    expect(buttons()[0].props.disabled).toBe(true);
    expect(onBusy).toHaveBeenLastCalledWith(true);
    expect(image()).toBeUndefined();

    picker.resolve({ status: 'ok', id: 'draft-1' });
    await picker.promise;
    await nextTick();
    expect(image()).toBeUndefined();
    expect(onBusy).toHaveBeenLastCalledWith(true);
    trigger(buttons()[1], 'onClick');
    await nextTick();
    expect(discard).toHaveBeenCalledWith('draft-1');
    expect(onBusy).toHaveBeenLastCalledWith(false);
    trigger(buttons()[0], 'onClick');
    await vi.waitFor(() => expect(buttons()).toHaveLength(3));
    trigger(buttons()[2], 'onClick');
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
    expect(image()).toBeUndefined();
    expect(thumbnail().props.style['--ui-track-thumb-background']).toBe(
      '#654321',
    );
    app.unmount();
  });
});

import { h, markRaw, nextTick } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { maskEdge } from '../../../shared/outputPortraitImage.json';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiField from '../ui/UiField.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiRange from '../ui/UiRange.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiStack from '../ui/UiStack.vue';
import UiSwitch from '../ui/UiSwitch.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import ObsCutoutPortraitImageModal from './ObsCutoutPortraitImageModal.vue';

vi.mock('../ui/UiModal.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('section', [...slots.default(), ...slots.footer()]),
  },
}));

for (const [component, file] of [
  [ObsCutoutPortraitImageModal, './ObsCutoutPortraitImageModal.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiDisclosure, '../ui/UiDisclosure.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiRange, '../ui/UiRange.vue'],
  [UiRangeControl, '../ui/range/UiRangeControl.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiSwitch, '../ui/UiSwitch.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, file, import.meta.url);
}

afterEach(() => vi.unstubAllGlobals());

function mountPhoto({ width = 32, height = 32, api, onApply }) {
  const context = {
    clearRect() {},
    drawImage() {},
    fillRect() {},
    putImageData() {},
    createImageData: () => ({ data: new Uint8Array(maskEdge ** 2 * 4) }),
    getImageData: () => ({ data: new Uint8Array(maskEdge ** 2 * 4) }),
  };
  vi.stubGlobal('createImageBitmap', async () => ({
    width,
    height,
    close() {},
  }));
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => context }),
  });
  vi.stubGlobal('window', { Utawakui: api });
  const { app, root } = mount(ObsCutoutPortraitImageModal, {
    photo: { id: 'draft', bytes: new Uint8Array(), mimeType: 'image/png' },
    onApply,
  });
  const nodes = (type) => findAll(root, (node) => node.type === type);
  const canvas = markRaw(nodes('canvas')[0]);
  const draw = vi.fn();
  canvas.getContext = () => ({ ...context, drawImage: draw });
  return { app, nodes, canvas, draw };
}

it.each([
  [32, null],
  [48, new Uint8Array([12, 34])],
])(
  'applies a %s-pixel photo without running background removal',
  async (width, payload) => {
    const api = {
      segmentOutputPortrait: vi.fn(),
      saveOutputPortrait: vi
        .fn()
        .mockResolvedValue({ status: 'ok', id: 'photo' }),
    };
    const applied = Promise.withResolvers();
    const { app, nodes, canvas } = mountPhoto({
      width,
      api,
      onApply: applied.resolve,
    });
    canvas.toBlob = (callback) =>
      callback(new Blob([new Uint8Array([12, 34])]));
    try {
      await Promise.resolve();
      await nextTick();
      expect([canvas.width, canvas.height]).toEqual([width, width]);
      expect(
        nodes('svg').some(
          ({ props }) => props.class === 'obs-portrait-image-editor__guides',
        ),
      ).toBe(true);
      const apply = nodes('button').find(
        (node) => textContent(node) === '套用照片',
      );
      trigger(apply, 'onClick');
      await expect(applied.promise).resolves.toBe('photo');
      expect(api.saveOutputPortrait).toHaveBeenCalledWith('draft', payload);
      expect(api.segmentOutputPortrait).not.toHaveBeenCalled();
    } finally {
      app.unmount();
    }
  },
);

it('preserves manual framing when enabling cutout and restores the signed percentage settings', async () => {
  const result = Promise.withResolvers();
  const { app, nodes, canvas, draw } = mountPhoto({
    api: { segmentOutputPortrait: () => result.promise },
  });
  try {
    const sliders = () =>
      nodes('input').filter(({ props }) => props.type === 'range');
    const values = () => nodes('output').map(textContent);
    const setSlider = (index, value) =>
      trigger(sliders()[index], 'onInput', {
        target: { value: String(value) },
      });
    const switchCutout = (checked) =>
      trigger(
        nodes('input').find(({ props }) => props.role === 'switch'),
        'onChange',
        { target: { checked } },
      );
    await Promise.resolve();
    await nextTick();
    trigger(canvas, 'onKeydown', { key: 'ArrowRight', preventDefault() {} });
    await nextTick();
    const manualPlacement = draw.mock.lastCall.slice(1);
    expect(sliders()).toHaveLength(0);
    expect(nodes('details')).toHaveLength(0);
    const removeButton = nodes('button').find(
      (node) => textContent(node) === '移除背景',
    );
    trigger(removeButton, 'onClick');
    await nextTick();
    expect(removeButton.props['aria-busy']).toBe(true);
    result.resolve({
      status: 'ok',
      alpha: new Uint8Array(maskEdge ** 2).fill(255),
    });
    await result.promise;
    await nextTick();
    expect(draw.mock.lastCall.slice(1)).toEqual(manualPlacement);
    expect(values()).toEqual(['0%', '0%']);
    expect(nodes('details')[0].props.open).toBe(false);
    setSlider(0, 25);
    setSlider(1, 50);
    await nextTick();
    expect(values()).toEqual(['+25%', '50%']);
    expect(sliders().map(({ props }) => props['aria-valuetext'])).toEqual(
      values(),
    );
    setSlider(0, -25);
    switchCutout(false);
    await nextTick();
    expect(sliders()).toHaveLength(0);
    expect(nodes('details')).toHaveLength(0);
    switchCutout(true);
    await nextTick();
    expect(values()).toEqual(['-25%', '50%']);
  } finally {
    app.unmount();
  }
});

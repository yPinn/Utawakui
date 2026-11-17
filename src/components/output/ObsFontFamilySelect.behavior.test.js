import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createLocalFontsCatalog } from '../../composables/output/useLocalFonts.js';
import ObsFontFamilySelect from './ObsFontFamilySelect.vue';
import UiHint from '../ui/UiHint.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiField from '../ui/UiField.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiModal, '../ui/UiModal.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiCombobox, '../ui/UiCombobox.vue'],
  [ObsFontFamilySelect, './ObsFontFamilySelect.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

const OPTIONS = [
  { id: 'sans', label: '無襯線' },
  { id: 'serif', label: '襯線' },
  { id: 'rounded', label: '圓體' },
];

let body;
let queryLocalFonts;
let catalog;

vi.mock(
  '../../composables/output/useLocalFonts.js',
  async (importOriginal) => ({
    ...(await importOriginal()),
    useLocalFonts: () => catalog,
  }),
);

beforeEach(() => {
  body = hostNode('body');
  queryLocalFonts = vi.fn(async () => [
    {
      family: 'Stage Sans',
      fullName: 'Stage Sans Regular',
      postscriptName: 'StageSans-Regular',
      style: 'Regular',
    },
  ]);
  catalog = createLocalFontsCatalog();
  vi.stubGlobal('document', {
    activeElement: null,
    body,
    documentElement: hostNode('html'),
    querySelector: (selector) => (selector === 'body' ? body : null),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    queryLocalFonts,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (callback) => callback(),
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({
      fontSize: '16px',
      direction: 'ltr',
      getPropertyValue: () => '',
    }),
  });
});

afterEach(() => vi.unstubAllGlobals());

function combobox(root) {
  return findAll(root, (node) => node.props?.role === 'combobox')[0];
}

function action(root, label) {
  return findAll(
    root,
    (node) => node.type === 'button' && textContent(node).includes(label),
  )[0];
}

describe('ObsFontFamilySelect', () => {
  it('keeps multilingual samples behind the information button', async () => {
    const { app, root } = mount(ObsFontFamilySelect, {
      id: 'output-appearance-fontFamily',
      label: '字型',
      modelValue: 'rounded',
      options: OPTIONS,
    });

    expect(combobox(root).props.value).toBe('圓體');
    expect(textContent(root)).not.toContain('星光照亮舞臺');
    trigger(action(root, '字型預覽'), 'onClick');
    await nextTick();
    const dialog = findAll(body, (node) => node.props?.role === 'dialog')[0];
    expect(textContent(dialog)).toContain('星光照亮舞臺');
    expect(
      findAll(dialog, (node) => node.type === 'h3').map(textContent),
    ).toEqual(['圓體']);
    expect(textContent(dialog)).toContain(
      '拉丁字元優先用 Arial Rounded MT Bold',
    );
    const samples = findAll(dialog, (node) => node.type === 'dd');
    expect(samples.map((node) => node.props.lang)).toEqual([
      'zh-Hant',
      'en',
      'ja',
      'ko',
    ]);
    for (const sample of samples) {
      expect(sample.props.style.fontFamily).toContain('Arial Rounded MT Bold');
    }
    expect(queryLocalFonts).not.toHaveBeenCalled();
    app.unmount();
  });

  it('opens template fonts immediately and matches the Output font stacks', async () => {
    const { app, root } = mount(ObsFontFamilySelect, {
      id: 'output-appearance-fontFamily',
      label: '字型',
      modelValue: 'sans',
      options: OPTIONS,
    });
    const control = combobox(root);

    trigger(control, 'onClick');
    expect(queryLocalFonts).toHaveBeenCalledOnce();
    await nextTick();

    expect(control.props['aria-expanded']).toBe(true);
    expect(control.props.value).toBe('');
    const presetOptions = findAll(
      body,
      (node) =>
        node.props?.role === 'option' &&
        findAll(node, (child) => child.props?.['data-font-source'] === 'preset')
          .length > 0,
    );
    expect(presetOptions.map((option) => textContent(option).trim())).toEqual(
      OPTIONS.map(({ label }) => label),
    );
    const overlayCss = ['fallback', 'appearance']
      .map((file) =>
        readFileSync(
          new URL(`../../../overlay/shared/${file}.css`, import.meta.url),
          'utf8',
        ),
      )
      .join('\n')
      .replaceAll(/\s+/g, ' ');
    for (const option of presetOptions) {
      const sample = findAll(
        option,
        (node) => node.props?.style?.fontFamily,
      )[0];
      expect(overlayCss).toContain(sample.props.style.fontFamily);
    }
    app.unmount();
  });

  it('loads once on keyboard opening and lets the operator search local fonts', async () => {
    const { app, root } = mount(ObsFontFamilySelect, {
      id: 'output-appearance-fontFamily',
      label: '字型',
      modelValue: 'sans',
      options: OPTIONS,
    });

    const control = combobox(root);
    trigger(control, 'onKeydown', { key: 'ArrowDown', preventDefault() {} });
    expect(queryLocalFonts).toHaveBeenCalledOnce();
    await Promise.resolve();
    await nextTick();
    expect(textContent(body)).toContain('模板字型');
    expect(textContent(body)).toContain('本機字型');
    trigger(control, 'onBlur');
    trigger(control, 'onClick');
    expect(queryLocalFonts).toHaveBeenCalledOnce();

    trigger(control, 'onInput', { target: { value: 'Stage' } });
    await nextTick();
    const localPreview = findAll(
      body,
      (node) => node.props?.['data-font-source'] === 'local',
    );
    expect(localPreview).toHaveLength(1);
    expect(textContent(localPreview[0])).toContain('Stage Sans');
    expect(textContent(localPreview[0])).not.toContain('星光照亮舞臺');
    expect(
      findAll(localPreview[0], (node) => node.props?.style?.fontFamily)[0].props
        .style.fontFamily,
    ).toContain('"Stage Sans"');
    app.unmount();
  });

  it('emits a bounded descriptor when a local family is selected', async () => {
    const update = vi.fn();
    const { app, root } = mount(ObsFontFamilySelect, {
      id: 'output-appearance-fontFamily',
      label: '字型',
      modelValue: 'sans',
      options: OPTIONS,
      'onUpdate:modelValue': update,
    });
    trigger(combobox(root), 'onClick');
    await Promise.resolve();
    await nextTick();
    trigger(combobox(root), 'onInput', { target: { value: 'Stage' } });
    await nextTick();

    const localOption = findAll(
      body,
      (node) =>
        node.props?.role === 'option' &&
        textContent(node).includes('Stage Sans'),
    )[0];
    trigger(localOption, 'onClick');

    expect(update).toHaveBeenCalledWith({
      source: 'local',
      family: 'Stage Sans',
      postscriptName: 'StageSans-Regular',
      style: 'Regular',
    });
    app.unmount();
  });

  it('marks a saved local font unavailable after a completed catalog check', async () => {
    queryLocalFonts.mockResolvedValue([]);
    const { app, root } = mount(ObsFontFamilySelect, {
      id: 'output-appearance-fontFamily',
      label: '字型',
      modelValue: {
        source: 'local',
        family: 'Missing Stage Font',
        postscriptName: 'MissingStageFont-Regular',
        style: 'Regular',
      },
      options: OPTIONS,
    });
    trigger(combobox(root), 'onClick');
    await Promise.resolve();
    await nextTick();

    expect(textContent(root)).toContain('本機字型不可用，輸出將使用預設字型');
    expect(
      findAll(body, (node) => node.props?.['data-font-source'] === 'missing'),
    ).toHaveLength(1);
    app.unmount();
  });

  it('keeps the presets usable when access fails and can retry from the icon', async () => {
    queryLocalFonts.mockRejectedValueOnce(new Error('query failed'));
    const { app, root } = mount(ObsFontFamilySelect, {
      id: 'output-appearance-fontFamily',
      label: '字型',
      modelValue: 'sans',
      options: OPTIONS,
    });
    trigger(combobox(root), 'onClick');
    await Promise.resolve();
    await nextTick();
    expect(textContent(body)).toContain('無法讀取本機字型');
    expect(textContent(body)).toContain('模板字型');
    expect(
      findAll(body, (node) => node.props?.role === 'option').map((node) =>
        textContent(node).trim(),
      ),
    ).toEqual(OPTIONS.map(({ label }) => label));
    trigger(action(root, '重新讀取本機字型'), 'onClick');
    await Promise.resolve();
    await nextTick();
    expect(queryLocalFonts).toHaveBeenCalledTimes(2);
    expect(textContent(body)).toContain('Stage Sans');
    expect(action(root, '重新讀取本機字型')).toBeUndefined();
    app.unmount();
  });
});

import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ObsFontFamilySelect from './ObsFontFamilySelect.vue';
import UiButton from '../ui/UiButton.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiField from '../ui/UiField.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, filename] of [
  [UiButton, '../ui/UiButton.vue'],
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
  it('shows the selected name in UI type and a multilingual font sample', () => {
    const { app, root } = mount(ObsFontFamilySelect, {
      id: 'output-appearance-fontFamily',
      label: '字型',
      modelValue: 'sans',
      options: OPTIONS,
    });

    expect(combobox(root).props.value).toBe('無襯線');
    expect(textContent(root)).toContain('舞台 · 무대 · ステージ · Stage 123');
    expect(
      findAll(root, (node) => node.props?.['data-font-source'] === 'preset'),
    ).toHaveLength(1);
    expect(queryLocalFonts).not.toHaveBeenCalled();
    app.unmount();
  });

  it('loads local fonts only after the explicit action and previews each option', async () => {
    const { app, root } = mount(ObsFontFamilySelect, {
      id: 'output-appearance-fontFamily',
      label: '字型',
      modelValue: 'sans',
      options: OPTIONS,
    });

    trigger(action(root, '載入本機字體'), 'onClick');
    await Promise.resolve();
    await nextTick();
    expect(queryLocalFonts).toHaveBeenCalledOnce();
    expect(textContent(root)).toContain('已載入 1 個字體家族');

    trigger(combobox(root), 'onInput', { target: { value: 'Stage' } });
    await nextTick();
    const localPreview = findAll(
      body,
      (node) => node.props?.['data-font-source'] === 'local',
    );
    expect(localPreview).toHaveLength(1);
    expect(textContent(localPreview[0])).toContain('Stage Sans');
    expect(textContent(localPreview[0])).toContain(
      '舞台 · 무대 · ステージ · Stage 123',
    );
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
    trigger(action(root, '載入本機字體'), 'onClick');
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
    trigger(action(root, '載入本機字體'), 'onClick');
    await Promise.resolve();
    await nextTick();

    expect(textContent(root)).toContain('本機字體不可用，輸出會使用預設字體');
    expect(
      findAll(root, (node) => node.props?.['data-font-source'] === 'missing'),
    ).toHaveLength(1);
    app.unmount();
  });
});

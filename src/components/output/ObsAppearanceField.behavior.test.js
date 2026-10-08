import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsAppearanceField from './ObsAppearanceField.vue';
import ObsColorSwatchRail from './ObsColorSwatchRail.vue';
import ObsFontFamilySelect from './ObsFontFamilySelect.vue';
import ObsOutputColorField from './ObsOutputColorField.vue';
import ObsLookSelect from './ObsLookSelect.vue';
import ObsPositionPicker from './ObsPositionPicker.vue';
import ObsSegmentedAppearanceChoice from './ObsSegmentedAppearanceChoice.vue';
import UiColorField from '../ui/UiColorField.vue';
import UiButton from '../ui/UiButton.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiField from '../ui/UiField.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  ObsAppearanceControlRow,
  './ObsAppearanceControlRow.vue',
  import.meta.url,
);
attachClientRender(
  ObsAppearanceField,
  './ObsAppearanceField.vue',
  import.meta.url,
);
attachClientRender(
  ObsColorSwatchRail,
  './ObsColorSwatchRail.vue',
  import.meta.url,
);
attachClientRender(
  ObsFontFamilySelect,
  './ObsFontFamilySelect.vue',
  import.meta.url,
);
attachClientRender(
  ObsOutputColorField,
  './ObsOutputColorField.vue',
  import.meta.url,
);
attachClientRender(ObsLookSelect, './ObsLookSelect.vue', import.meta.url);
attachClientRender(
  ObsPositionPicker,
  './ObsPositionPicker.vue',
  import.meta.url,
);
attachClientRender(
  ObsSegmentedAppearanceChoice,
  './ObsSegmentedAppearanceChoice.vue',
  import.meta.url,
);
attachClientRender(UiField, '../ui/UiField.vue', import.meta.url);
attachClientRender(UiButton, '../ui/UiButton.vue', import.meta.url);
attachClientRender(UiCombobox, '../ui/UiCombobox.vue', import.meta.url);
attachClientRender(UiSelect, '../ui/UiSelect.vue', import.meta.url);
attachClientRender(
  UiSegmentedControl,
  '../ui/UiSegmentedControl.vue',
  import.meta.url,
);
attachClientRender(UiScrollRegion, '../ui/UiScrollRegion.vue', import.meta.url);
attachClientRender(UiColorField, '../ui/UiColorField.vue', import.meta.url);
attachClientRender(
  UiRangeControl,
  '../ui/range/UiRangeControl.vue',
  import.meta.url,
);
attachClientRender(
  UiTooltipSurface,
  '../ui/tooltip/UiTooltipSurface.vue',
  import.meta.url,
);

describe('ObsAppearanceField', () => {
  it('renders an allowlisted select and emits its string value', async () => {
    const update = vi.fn();
    const { app, root } = mount(ObsAppearanceField, {
      field: {
        key: 'fontFamily',
        label: '字型',
        control: 'select',
        options: [
          { id: 'ornate', label: '華麗明朝（Hina Mincho）' },
          { id: 'antique', label: '古典明朝（GenEi Antique）' },
        ],
      },
      modelValue: 'ornate',
      'onUpdate:modelValue': update,
    });

    const select = findAll(root, (node) => node.type === 'select')[0];
    expect(select.props.id).toBe('output-appearance-fontFamily');
    expect(textContent(root)).toContain('華麗明朝（Hina Mincho）');
    trigger(select, 'onChange', { target: { value: 'antique' } });
    await nextTick();
    expect(update).toHaveBeenCalledWith('antique');
    app.unmount();
  });

  it('renders shared color and range controls with explicit commit behavior', () => {
    const colorUpdate = vi.fn();
    const colorCommit = vi.fn();
    const toggleSavedColor = vi.fn();
    const colorMount = mount(ObsAppearanceField, {
      field: {
        key: 'textColor',
        label: '文字顏色',
        control: 'color',
      },
      modelValue: '#fff8ec',
      savedColors: ['#112233'],
      'onUpdate:modelValue': colorUpdate,
      onCommit: colorCommit,
      onToggleSavedColor: toggleSavedColor,
    });
    const color = findAll(
      colorMount.root,
      (node) => node.props.type === 'color',
    )[0];
    trigger(color, 'onInput', { target: { value: '#112233' } });
    trigger(color, 'onChange', { target: { value: '#112233' } });
    expect(color.props.value).toBe('#fff8ec');
    expect(colorUpdate).toHaveBeenCalledWith('#112233');
    expect(colorCommit).toHaveBeenCalledTimes(1);
    const hexInput = findAll(
      colorMount.root,
      (node) => node.props.type === 'text',
    )[0];
    expect(hexInput.props.id).toBe('output-appearance-textColor');
    const savedAction = findAll(
      colorMount.root,
      (node) => node.props?.['aria-label'] === '加入常用色 #FFF8EC',
    )[0];
    trigger(savedAction, 'onClick');
    expect(toggleSavedColor).toHaveBeenCalledWith('#fff8ec');
    colorMount.app.unmount();

    const rangeUpdate = vi.fn();
    const rangeCommit = vi.fn();
    const rangeMount = mount(ObsAppearanceField, {
      field: {
        key: 'positionOffsetX',
        label: '水平微調',
        control: 'range',
        defaultValue: 0,
        min: -12,
        max: 12,
        step: 1,
        unit: '%',
        signed: true,
      },
      modelValue: 4,
      'onUpdate:modelValue': rangeUpdate,
      onCommit: rangeCommit,
    });
    const range = findAll(
      rangeMount.root,
      (node) => node.props.type === 'range',
    )[0];
    trigger(range, 'onInput', { target: { valueAsNumber: -3 } });
    trigger(range, 'onChange');
    const resetEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    trigger(range, 'onContextmenu', resetEvent);
    expect(range.props).toMatchObject({
      min: -12,
      max: 12,
      step: 1,
      'aria-valuetext': '+4%',
    });
    expect(rangeUpdate).toHaveBeenNthCalledWith(1, -3);
    expect(rangeUpdate).toHaveBeenNthCalledWith(2, 0);
    expect(rangeCommit).toHaveBeenCalledTimes(2);
    expect(resetEvent.preventDefault).toHaveBeenCalledOnce();
    rangeMount.app.unmount();
  });

  it.each([
    ['position-grid', 'positionAnchor', '顯示位置', 'center-right'],
    ['font-scale', 'fontScale', '字級', 'medium'],
    ['alignment', 'alignment', '對齊', 'left'],
  ])(
    'routes the %s editor through an accessible radio group',
    (editor, key, label, modelValue) => {
      const options =
        editor === 'position-grid'
          ? [
              { id: 'top-left', label: '左上' },
              { id: 'center-right', label: '右中' },
            ]
          : [
              { id: modelValue, label: '目前選項' },
              { id: 'alternative', label: '其他選項' },
            ];
      const { app, root } = mount(ObsAppearanceField, {
        field: { key, label, control: 'select', editor, options },
        modelValue,
      });
      const group = findAll(
        root,
        (node) => node.props?.role === 'radiogroup',
      )[0];

      expect(group.props.id).toBe(`output-appearance-${key}`);
      expect(group.props['aria-label']).toBe(label);
      expect(findAll(root, (node) => node.type === 'select')).toHaveLength(0);
      app.unmount();
    },
  );

  it('routes Look through a compact select-only combobox', () => {
    const { app, root } = mount(ObsAppearanceField, {
      field: {
        key: 'paletteId',
        label: 'Look',
        control: 'select',
        editor: 'look',
        options: [
          { id: 'original', label: '模板原色' },
          { id: 'warm', label: '暖色舞台' },
        ],
      },
      modelValue: 'original',
    });
    const control = findAll(root, (node) => node.props?.role === 'combobox')[0];

    expect(control.props).toMatchObject({
      id: 'output-appearance-paletteId',
      'aria-label': 'Look',
      'aria-haspopup': 'listbox',
    });
    expect(
      findAll(root, (node) => node.props?.role === 'radiogroup'),
    ).toHaveLength(0);
    app.unmount();
  });

  it('routes the Live Stage font field through the previewing font picker', () => {
    const { app, root } = mount(ObsAppearanceField, {
      field: {
        key: 'fontFamily',
        label: '字型',
        control: 'select',
        editor: 'font-family',
        allowLocalFonts: true,
        options: [
          { id: 'sans', label: '無襯線' },
          { id: 'serif', label: '襯線' },
        ],
      },
      modelValue: 'sans',
    });

    const control = findAll(root, (node) => node.props?.role === 'combobox')[0];
    expect(control.props.id).toBe('output-appearance-fontFamily');
    expect(textContent(root)).toContain('舞台 · 무대 · ステージ · Stage 123');
    expect(findAll(root, (node) => node.type === 'select')).toHaveLength(0);
    expect(
      findAll(root, (node) =>
        String(node.props?.class).includes(
          'obs-appearance-control-row--align-start',
        ),
      ),
    ).toHaveLength(1);
    app.unmount();
  });

  it('disables Look Amount when the template original is selected', () => {
    const { app, root } = mount(ObsAppearanceField, {
      field: {
        key: 'lookAmount',
        label: '強度',
        control: 'range',
        min: 0,
        max: 100,
        step: 5,
        unit: '%',
      },
      modelValue: 100,
      disabled: true,
    });
    const range = findAll(root, (node) => node.props.type === 'range')[0];

    expect(range.props.disabled).toBe(true);
    expect(range.props['aria-valuetext']).toBe('100%');
    expect(range.props['aria-describedby']).toBe(
      'output-appearance-lookAmount-hint',
    );
    expect(textContent(root)).toContain('選擇 Look 後可調整');
    app.unmount();
  });
});

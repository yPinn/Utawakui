import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ObsAppearanceControlRow from './ObsAppearanceControlRow.vue';
import ObsAppearanceField from './ObsAppearanceField.vue';
import UiColorField from '../ui/UiColorField.vue';
import UiField from '../ui/UiField.vue';
import UiSelect from '../ui/UiSelect.vue';
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
attachClientRender(UiField, '../ui/UiField.vue', import.meta.url);
attachClientRender(UiSelect, '../ui/UiSelect.vue', import.meta.url);
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
    const colorMount = mount(ObsAppearanceField, {
      field: {
        key: 'textColor',
        label: '文字顏色',
        control: 'color',
      },
      modelValue: '#fff8ec',
      'onUpdate:modelValue': colorUpdate,
      onCommit: colorCommit,
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
    colorMount.app.unmount();

    const rangeUpdate = vi.fn();
    const rangeCommit = vi.fn();
    const rangeMount = mount(ObsAppearanceField, {
      field: {
        key: 'positionOffsetX',
        label: '水平微調',
        control: 'range',
        min: -12,
        max: 12,
        step: 1,
        unit: '%',
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
    expect(range.props).toMatchObject({
      min: -12,
      max: 12,
      step: 1,
      'aria-valuetext': '+4%',
    });
    expect(rangeUpdate).toHaveBeenCalledWith(-3);
    expect(rangeCommit).toHaveBeenCalledTimes(1);
    rangeMount.app.unmount();
  });
});

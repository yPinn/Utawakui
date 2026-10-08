import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ObsPositionPicker from './ObsPositionPicker.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  ObsPositionPicker,
  './ObsPositionPicker.vue',
  import.meta.url,
);

const OPTIONS = [
  ['top-left', '左上'],
  ['top-center', '中上'],
  ['top-right', '右上'],
  ['center-left', '左中'],
  ['center', '正中'],
  ['center-right', '右中'],
  ['bottom-left', '左下'],
  ['bottom-center', '中下'],
  ['bottom-right', '右下'],
].map(([id, label]) => ({ id, label }));

function radios(root) {
  return findAll(root, (node) => node.props?.role === 'radio');
}

describe('ObsPositionPicker', () => {
  it('renders a three-by-three position radio grid with a visible selection label', () => {
    const { app, root } = mount(ObsPositionPicker, {
      id: 'output-appearance-positionAnchor',
      label: '顯示位置',
      modelValue: 'center-right',
      options: OPTIONS,
    });
    const group = findAll(root, (node) => node.props?.role === 'radiogroup')[0];
    const options = radios(root);

    expect(group.props).toMatchObject({
      id: 'output-appearance-positionAnchor',
      'aria-label': '顯示位置',
    });
    expect(options).toHaveLength(9);
    expect(options[5].props).toMatchObject({
      'aria-label': '右中',
      'aria-checked': true,
      tabindex: 0,
    });
    expect(textContent(root)).toContain('右中');
    app.unmount();
  });

  it('moves spatially with arrow keys and emits the destination id', async () => {
    const update = vi.fn();
    const { app, root } = mount(ObsPositionPicker, {
      id: 'output-appearance-positionAnchor',
      label: '顯示位置',
      modelValue: 'center-right',
      options: OPTIONS,
      'onUpdate:modelValue': update,
    });
    const options = radios(root);
    const event = {
      key: 'ArrowUp',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    trigger(options[5], 'onKeydown', event);
    await nextTick();

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('top-right');
    expect(options[2].focus).toHaveBeenCalledOnce();
    app.unmount();
  });
});

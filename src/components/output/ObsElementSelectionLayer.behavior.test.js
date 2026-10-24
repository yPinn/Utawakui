import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ObsElementSelectionLayer from './ObsElementSelectionLayer.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  ObsElementSelectionLayer,
  './ObsElementSelectionLayer.vue',
  import.meta.url,
);

const boxes = {
  viewport: { width: 360, height: 480 },
  elements: [
    { id: 'title', x: 20, y: 300, width: 200, height: 24 },
    { id: 'transport', x: 0, y: 400, width: 360, height: 80 },
  ],
};
const currentTarget = { getBoundingClientRect: () => ({ left: 10, top: 10 }) };

function layerOf(root) {
  return findAll(root, (node) =>
    String(node.props?.class ?? '').includes('obs-element-selection-layer'),
  )[0];
}

describe('ObsElementSelectionLayer', () => {
  it('maps scaled clicks to the element under the pointer or the template', () => {
    const select = vi.fn();
    const { app, root } = mount(ObsElementSelectionLayer, {
      boxes,
      scale: 0.5,
      onSelect: select,
    });
    const layer = layerOf(root);
    expect(layer.props['aria-hidden']).toBe('true');

    trigger(layer, 'onClick', {
      clientX: 10 + 50,
      clientY: 10 + 155,
      currentTarget,
    });
    trigger(layer, 'onClick', {
      clientX: 10 + 50,
      clientY: 10 + 20,
      currentTarget,
    });
    expect(select.mock.calls.map(([id]) => id)).toEqual(['title', 'template']);
    app.unmount();
  });

  it('outlines the selected element at preview scale and the hovered one', async () => {
    const { app, root } = mount(ObsElementSelectionLayer, {
      boxes,
      scale: 0.5,
      selectedId: 'title',
    });
    const outlines = () =>
      findAll(root, (node) => node.props?.['data-element-id']);
    expect(outlines().map((node) => node.props.style)).toEqual([
      { left: '10px', top: '150px', width: '100px', height: '12px' },
    ]);

    trigger(layerOf(root), 'onPointermove', {
      clientX: 10 + 20,
      clientY: 10 + 220,
      currentTarget,
    });
    await nextTick();
    expect(outlines().map((node) => node.props['data-element-id'])).toEqual([
      'title',
      'transport',
    ]);
    app.unmount();
  });
});

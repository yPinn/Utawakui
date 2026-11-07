import { h, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import UiVolumeControl from './UiVolumeControl.vue';
import UiRangeControl from './range/UiRangeControl.vue';
import { attachClientRender, findAll, mount, trigger } from './uiTestHost.js';

vi.mock('./UiIconButton.vue', () => ({
  default: {
    setup:
      (_, { attrs }) =>
      () =>
        h('button', attrs),
  },
}));

attachClientRender(UiVolumeControl, './UiVolumeControl.vue', import.meta.url);
attachClientRender(
  UiRangeControl,
  './range/UiRangeControl.vue',
  import.meta.url,
);

const labels = {
  modelValue: 0.5,
  volumeLabel: 'Volume',
  muteLabel: 'Mute',
  unmuteLabel: 'Unmute',
};

const controls = (root) =>
  findAll(
    root,
    (node) => node.type === 'button' || node.props.type === 'range',
  );

describe('UiVolumeControl', () => {
  it.each([
    ['expanded', 'start', ['button', 'input']],
    ['reveal', 'end', ['button', 'input']],
  ])(
    'follows the visual control order for %s %s',
    (variant, revealSide, order) => {
      const { app, root } = mount(UiVolumeControl, {
        ...labels,
        variant,
        revealSide,
      });
      try {
        expect(controls(root).map((node) => node.type)).toEqual(order);
      } finally {
        app.unmount();
      }
    },
  );

  it.each(['pointerup', 'pointercancel', 'blur'])(
    'keeps the reveal active until %s and removes the drag listeners',
    async (eventName) => {
      const dragWindow = new EventTarget();
      const remove = vi.spyOn(dragWindow, 'removeEventListener');
      const { app, root } = mount(UiVolumeControl, {
        ...labels,
        variant: 'reveal',
        revealSide: 'end',
      });
      try {
        const [, input] = controls(root);
        const [group] = findAll(root, (node) => node.props.role === 'group');
        trigger(input, 'onPointerdown', {
          button: 0,
          pointerId: 7,
          pointerType: 'touch',
          currentTarget: { ownerDocument: { defaultView: dragWindow } },
        });
        await nextTick();
        expect(group.props['data-dragging']).toBe(true);

        dragWindow.dispatchEvent(
          Object.assign(new Event('pointerup'), { pointerId: 8 }),
        );
        await nextTick();
        expect(group.props['data-dragging']).toBe(true);

        dragWindow.dispatchEvent(
          Object.assign(new Event(eventName), { pointerId: 7 }),
        );
        await nextTick();
        expect(group.props['data-dragging']).toBeUndefined();
        expect(remove.mock.calls.map(([type]) => type)).toEqual([
          'pointerup',
          'pointercancel',
          'blur',
        ]);
      } finally {
        app.unmount();
      }
    },
  );
});

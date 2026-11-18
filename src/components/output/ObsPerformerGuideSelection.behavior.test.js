import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERFORMER_GUIDE } from '../../utils/outputPerformerGuide.js';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import ObsPerformerGuideSelection from './ObsPerformerGuideSelection.vue';

attachClientRender(
  ObsPerformerGuideSelection,
  './ObsPerformerGuideSelection.vue',
  import.meta.url,
);

function mountSelection(guide = DEFAULT_PERFORMER_GUIDE) {
  const preview = vi.fn();
  const commit = vi.fn();
  const { app, root } = mount(ObsPerformerGuideSelection, {
    guide,
    onPreview: preview,
    onCommit: commit,
  });
  const [layer] = findAll(
    root,
    (node) => node.props?.class === 'obs-performer-guide-selection',
  );
  const [outline] = findAll(
    root,
    (node) => node.props?.class === 'obs-performer-guide-selection__outline',
  );
  const handles = findAll(root, (node) => node.props['data-performer-handle']);
  layer.getBoundingClientRect = () => ({ width: 960, height: 540 });
  layer.setPointerCapture = vi.fn();
  return { app, layer, outline, handles, preview, commit };
}

function pointer(clientX, clientY, pointerId = 1) {
  return { clientX, clientY, pointerId, button: 0, preventDefault: vi.fn() };
}

describe('model placement pointer gestures', () => {
  it('captures the starting pointer and commits the final geometry in canvas space', () => {
    const { app, layer, outline, preview, commit } = mountSelection();
    trigger(outline, 'onPointerdown', pointer(480, 310));
    expect(layer.setPointerCapture).toHaveBeenCalledWith(1);

    trigger(layer, 'onPointermove', pointer(384, 256, 2));
    expect(preview).not.toHaveBeenCalled();
    trigger(layer, 'onPointermove', pointer(384, 256));
    expect(preview.mock.lastCall[0].x).toBeCloseTo(0.4);
    expect(preview.mock.lastCall[0].y).toBeCloseTo(0.48);
    expect(commit).not.toHaveBeenCalled();

    trigger(layer, 'onPointerup', pointer(288, 202));
    expect(commit.mock.lastCall[0].x).toBeCloseTo(0.3);
    expect(commit.mock.lastCall[0].y).toBeCloseTo(0.42);
    app.unmount();
  });

  it('shows engaged guides, bypasses snapping with Alt and clears lines after committing', async () => {
    const guide = {
      ...DEFAULT_PERFORMER_GUIDE,
      x: 0.43,
      y: 0.46,
      width: 0.2,
      height: 0.24,
    };
    const { app, layer, outline, preview, commit } = mountSelection(guide);
    const lines = () =>
      findAll(layer, (node) => node.props['data-performer-guide-line']);
    try {
      trigger(outline, 'onPointerdown', pointer(400, 240));
      expect(lines()).toHaveLength(0);
      const near = pointer(470, 266);
      trigger(layer, 'onPointermove', near);
      await nextTick();
      expect(preview.mock.lastCall[0]).toMatchObject({ x: 0.5, y: 0.5 });
      expect(lines().map((node) => node.props.style)).toEqual([
        { left: '50%' },
        { top: '50%' },
      ]);

      trigger(layer, 'onPointermove', { ...near, altKey: true });
      await nextTick();
      expect(lines()).toHaveLength(0);
      expect(preview.mock.lastCall[0].x).toBeCloseTo(0.43 + 70 / 960);
      expect(preview.mock.lastCall[0].y).toBeCloseTo(0.46 + 26 / 540);

      trigger(layer, 'onPointermove', near);
      trigger(layer, 'onPointerup', near);
      await nextTick();
      expect(commit.mock.lastCall[0]).toMatchObject({ x: 0.5, y: 0.5 });
      expect(lines()).toHaveLength(0);
    } finally {
      app.unmount();
    }
  });

  it('shows a third line along the engaged edge during a move', async () => {
    const { app, layer, outline, preview, commit } = mountSelection({
      ...DEFAULT_PERFORMER_GUIDE,
      x: 0.45,
      y: 0.45,
      width: 0.2,
      height: 0.2,
    });
    try {
      trigger(outline, 'onPointerdown', pointer(432, 243));
      const near = pointer(420, 243);
      trigger(layer, 'onPointermove', near);
      await nextTick();

      const lines = findAll(
        layer,
        (node) => node.props['data-performer-guide-line'],
      );
      expect(lines).toHaveLength(1);
      expect(parseFloat(lines[0].props.style.left)).toBeCloseTo(100 / 3);
      const aligned = preview.mock.lastCall[0];
      expect(aligned.x - aligned.width / 2).toBeCloseTo(1 / 3);
      expect(aligned.y).toBe(0.45);

      trigger(layer, 'onPointerup', near);
      expect(commit).toHaveBeenCalledWith(aligned);
    } finally {
      app.unmount();
    }
  });

  it('does not snap a click without a drag', () => {
    const { app, layer, outline, commit } = mountSelection({
      ...DEFAULT_PERFORMER_GUIDE,
      x: 0.504,
    });
    trigger(outline, 'onPointerdown', pointer(480, 310));
    trigger(layer, 'onPointerup', pointer(480, 310));
    expect(commit).not.toHaveBeenCalled();
    app.unmount();
  });

  it.each([
    ['ellipse', ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']],
    ['square', ['nw', 'ne', 'se', 'sw']],
  ])('offers the applicable resize handles for %s', (shape, expected) => {
    const { app, handles } = mountSelection({
      ...DEFAULT_PERFORMER_GUIDE,
      shape,
    });
    expect(handles.map((node) => node.props['data-performer-handle'])).toEqual(
      expected,
    );
    app.unmount();
  });

  it.each(['onPointercancel', 'onLostpointercapture'])(
    'discards a draft on %s',
    (cancelEvent) => {
      const { app, layer, outline, preview, commit } = mountSelection();
      trigger(outline, 'onPointerdown', pointer(480, 310));
      trigger(layer, 'onPointermove', pointer(390, 300));
      trigger(layer, cancelEvent, pointer(390, 300));
      trigger(layer, 'onPointerup', pointer(390, 300));

      expect(preview).toHaveBeenLastCalledWith(null);
      expect(commit).not.toHaveBeenCalled();
      app.unmount();
    },
  );
});

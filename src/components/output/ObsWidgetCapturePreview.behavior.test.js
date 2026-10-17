import { describe, expect, it, vi } from 'vitest';
import ObsWidgetCapturePreview from './ObsWidgetCapturePreview.vue';
import ObsPreviewCaption from './ObsPreviewCaption.vue';
import UiButton from '../ui/UiButton.vue';
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
  [ObsWidgetCapturePreview, './ObsWidgetCapturePreview.vue'],
  [ObsPreviewCaption, './ObsPreviewCaption.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, filename, import.meta.url);

describe('Widget external size information', () => {
  it('moves dimensions outside the canvas and preserves both selection entrances without duplicate events', () => {
    const target = hostNode('div');
    const select = vi.fn();
    const { app, root } = mount(ObsWidgetCapturePreview, {
      metadataTarget: target,
      selectedSize: 'small',
      supportedSizes: ['small', 'medium', 'large'],
      onSelectSize: select,
    });
    expect(textContent(root)).not.toContain('480 ×');
    expect(textContent(target)).toContain('480 × 810');
    const headers = findAll(target, (node) => node.type === 'button');
    const canvases = findAll(root, (node) => node.type === 'button');
    expect(headers).toHaveLength(3);
    expect(canvases).toHaveLength(3);
    expect(headers[0].props['aria-pressed']).toBe(true);
    trigger(headers[1], 'onClick');
    expect(select).toHaveBeenCalledExactlyOnceWith('medium');
    trigger(canvases[2], 'onClick');
    expect(select).toHaveBeenLastCalledWith('large');
    expect(select).toHaveBeenCalledTimes(2);
    app.unmount();
    expect(textContent(target)).toBe('');
  });
});

import { readFileSync } from 'node:fs';
import { h, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { attachClientRender, mount } from '../ui/uiTestHost.js';
import KineticPopPreview from './previews/KineticPopPreview.vue';
import {
  readObsTemplateMockupSource,
  readObsTemplatePreviewSource,
} from './obsTemplateMockupSource.mjs';

const ink = vi.hoisted(() => ({ render: vi.fn(), clear: vi.fn() }));
vi.mock('../../../shared/browser/kineticPop.mjs', () => ({
  renderKineticPopPresentation: ink.render,
  clearKineticPopPresentation: ink.clear,
}));
attachClientRender(
  KineticPopPreview,
  './previews/KineticPopPreview.vue',
  import.meta.url,
);

const styles = readFileSync(
  new URL('../../../overlay/lyrics/kineticPop.css', import.meta.url),
  'utf8',
);

describe('Kinetic Pop gallery mockup', () => {
  it('sizes the glyph layers before the first paint and keeps replay running on resize', async () => {
    vi.useFakeTimers();
    ink.render.mockClear();
    ink.clear.mockClear();
    const preference = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('window', { matchMedia: () => preference });
    let onResize;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          onResize = callback;
        }
        observe() {}
        disconnect() {
          disconnect();
        }
      },
    );
    const { app } = mount({
      render: () =>
        h(KineticPopPreview, {
          animated: true,
          scene: { lyrics: { current: 'あの夏の声' } },
        }),
    });

    try {
      expect(ink.render).not.toHaveBeenCalled();
      onResize([{ contentRect: { width: 480 } }]);
      await nextTick();
      expect(ink.render).toHaveBeenCalledTimes(1);
      expect(ink.render.mock.lastCall[2].reducedMotion).toBe(false);
      expect(vi.getTimerCount()).toBe(1);
      const stage = ink.render.mock.lastCall[0].root;
      expect(stage.props.style['--kinetic-rem']).toBe('4px');

      onResize([{ contentRect: { width: 720 } }]);
      await nextTick();
      expect(stage.props.style['--kinetic-rem']).toBe('6px');
      expect(ink.render).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(1);

      preference.matches = true;
      preference.dispatchEvent(new Event('change'));
      await nextTick();
      expect(ink.render).toHaveBeenCalledTimes(2);
      expect(ink.render.mock.lastCall[2].reducedMotion).toBe(true);
      expect(vi.getTimerCount()).toBe(0);

      preference.matches = false;
      preference.dispatchEvent(new Event('change'));
      expect(ink.render).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      app.unmount();
      vi.unstubAllGlobals();
      const pending = vi.getTimerCount();
      vi.useRealTimers();
      expect(pending).toBe(0);
    }
    expect(disconnect).toHaveBeenCalledOnce();
    expect(ink.clear).toHaveBeenCalledTimes(1);
    expect(ink.render).toHaveBeenCalledTimes(3);
  });

  it('runs the same renderer, materials and reduced-motion lifecycle as Output', () => {
    const preview = readObsTemplatePreviewSource('KineticPop');
    const source = readObsTemplateMockupSource();
    expect(preview).toContain('shared/browser/kineticPop.mjs');
    expect(preview).toContain('renderKineticPopPresentation(');
    expect(preview).toContain('clearKineticPopPresentation(');
    expect(preview).toContain('useOutputPreviewMotion(');
    expect(preview).toContain(':data-ovl-kinetic-arrangement="arrangement"');
    expect(preview).toContain('overlay/lyrics/kineticPop.css');
    expect(source).not.toContain('@keyframes obs-preview-kinetic-unit-cycle');
  });

  it('maps the production font scale and safe insets to canvas rem', () => {
    const source = readObsTemplateMockupSource();
    const preview = readObsTemplatePreviewSource('KineticPop');
    expect(preview).toContain('data-kinetic-stage');
    expect(preview).toContain(':data-ovl-scale="scene.appearance?.fontScale"');
    expect(preview).toContain('data-kinetic-current');
    expect(styles).toContain(
      'inset-inline: max(var(--kinetic-safe-inline, var(--ovl-safe-inline)), 3%)',
    );
    expect(styles).toContain(
      'inset-block-end: max(var(--kinetic-stage-safe-block), 4.5%)',
    );
    expect(styles).toMatch(
      /\[data-kinetic-stage\]\[data-ovl-scale='large'\]\s*\)\s*\{\s*--kinetic-stage-safe-block: calc\(3 \* var\(--kinetic-rem, 1rem\)\);/u,
    );
    expect(styles).toContain('place-items: end center');
    expect(styles).toContain('transform-origin: 50% 100%');
    expect(styles).toMatch(
      /font-size: calc\(\s*var\(--ovl-authored-font-rem, 4\.5\) \* var\(--kinetic-rem, 1rem\)\s*\)/u,
    );
    expect(styles).toMatch(
      /\[data-ovl-scale='large'\]\s*\.lyrics-overlay__kinetic-line\[data-kinetic-material='candy-rim'\]\s*\{\s*font-size: 1em;/u,
    );
    expect(source).toContain(
      '--kinetic-safe-inline: calc(4 * var(--kinetic-rem))',
    );
    expect(preview).toContain(
      ':data-kinetic-composition="presentation.composition"',
    );
    expect(preview).toContain("'--ovl-look-amount'");
    expect(preview).toContain('`--ovl-look-color-${role}`');
    expect(styles).toContain('--ovl-look-color-kinetic-candy-deep');
  });
});

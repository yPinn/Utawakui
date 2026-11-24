import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  readObsTemplateMockupSource,
  readObsTemplatePreviewSource,
} from './obsTemplateMockupSource.mjs';

const styles = readFileSync(
  new URL('../../../overlay/lyrics/kineticPop.css', import.meta.url),
  'utf8',
);

describe('Kinetic Pop gallery mockup', () => {
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
    expect(source).toContain('--kinetic-rem: var(--obs-canvas-rem)');
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

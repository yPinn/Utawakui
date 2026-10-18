import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  readObsTemplateMockupSource,
  readObsTemplatePreviewSource,
} from './obsTemplateMockupSource.mjs';

const canvasRem = (value) => `calc(${value} * var(--obs-canvas-rem))`;

describe('Widget gallery mockups', () => {
  it('previews widgets on their own capture canvas', () => {
    const shell = readObsTemplateMockupSource();

    expect(shell).toContain('captureSizeForKind(');
    expect(shell).toContain("'--obs-canvas-width': String(width)");
    expect(shell).toContain("'--obs-canvas-aspect': `${width} / ${height}`");
    expect(shell).toContain('aspect-ratio: var(--obs-canvas-aspect, 16 / 9);');
    expect(shell).toContain("'--obs-canvas-ratio': String(width / height)");
  });

  it('applies each template default appearance like the runtime Overlay', () => {
    const shell = readObsTemplateMockupSource();
    const appearanceCss = readFileSync(
      fileURLToPath(
        new URL('../../../overlay/shared/appearance.css', import.meta.url),
      ),
      'utf8',
    );

    expect(shell).toContain('normalizeOutputAppearance({}, { templateId:');
    for (const attribute of ['font', 'weight', 'surface']) {
      expect(shell).toContain(`:data-appearance-${attribute}=`);
    }
    // Weights and the user surface roles mirror the Overlay appearance layer.
    expect(appearanceCss).toContain('--ovl-user-font-weight: 700;');
    expect(shell).toMatch(
      /\[data-appearance-weight='bold'\]\s*\{\s*--obs-user-font-weight: 700;/u,
    );
    expect(shell).toMatch(
      /\[data-appearance-surface='solid'\]\s*\{\s*--obs-user-surface: var\(--ui-output-preview-user-surface\);/u,
    );
  });

  it('gives detail previews the capture shape with a height cap', () => {
    const shell = readObsTemplateMockupSource().replace(/\s+/gu, ' ');

    expect(shell).toContain(
      'calc( var(--ui-output-gallery-preview-max-height) * var(--obs-canvas-ratio, 1.7778) )',
    );
    expect(shell).toContain(
      'aspect-ratio: var(--obs-canvas-aspect, var(--ui-output-preview-aspect-ratio));',
    );
  });
});

describe('Cover Player gallery mockup', () => {
  it('sizes the card from the 480×540 runtime rules', () => {
    const artworkCss = readFileSync(
      fileURLToPath(
        new URL('../../../overlay/now-playing/artwork.css', import.meta.url),
      ),
      'utf8',
    );
    const source = readObsTemplatePreviewSource('CoverPlayer').replace(
      /\s+/gu,
      ' ',
    );

    // max-width 32rem narrows the player inset to space-3 in this capture.
    expect(artworkCss).toContain(
      '--ovl-template-player-inline: var(--ovl-primitive-space-3);',
    );
    expect(source).toContain(
      `padding: 0 ${canvasRem(0.75)} ${canvasRem(0.75)};`,
    );
    for (const declaration of [
      'font-size: 7em;',
      'font-size: 0.8125em;',
      'font-size: 0.75em;',
      'grid-template-columns: repeat(5, 1fr);',
    ]) {
      expect(artworkCss).toContain(declaration);
      expect(source).toContain(declaration);
    }
    expect(source).toContain(`height: ${canvasRem(0.1875)};`);
    expect(source).not.toContain('obs-template-mockup__title');
    expect(source).not.toContain('obs-template-mockup__secondary');
  });
});

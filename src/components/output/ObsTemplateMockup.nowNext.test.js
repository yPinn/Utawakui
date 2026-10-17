import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  readObsTemplateMockupSource,
  readObsTemplatePreviewSource,
} from './obsTemplateMockupSource.mjs';

const runtimeCss = readFileSync(
  fileURLToPath(
    new URL('../../../overlay/now-playing/now-playing.css', import.meta.url),
  ),
  'utf8',
);
const canvasRem = (value) => `calc(${value} * var(--obs-canvas-rem))`;

describe('Now Next gallery mockup', () => {
  it('previews widgets on their own capture canvas', () => {
    const shell = readObsTemplateMockupSource();

    expect(shell).toContain('captureSizeForKind(');
    expect(shell).toContain("'--obs-canvas-width': String(width)");
    expect(shell).toContain("'--obs-canvas-aspect': `${width} / ${height}`");
    expect(shell).toContain('aspect-ratio: var(--obs-canvas-aspect, 16 / 9);');
    expect(shell).toContain("'--obs-canvas-ratio': String(width / height)");
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

  it('shows the runtime title, artist and Next line', () => {
    const source = readObsTemplatePreviewSource('NowNext');

    expect(source).toContain('{{ track.title }}');
    expect(source).toContain('{{ track.artist }}');
    expect(source).toContain('Next: {{ nextTrack.title }}');
    expect(source).not.toContain('下一首');
    expect(source).not.toContain('obs-template-mockup__title');
  });

  it('sizes the widget from the 480×270 runtime rules', () => {
    const source = readObsTemplatePreviewSource('NowNext');

    // The max-width 42rem and max-height 24rem block is the last one applied.
    for (const [runtime, preview] of [
      ['--ovl-template-now-playing-title-size: 1.85em;', 'font-size: 1.85em;'],
      [
        '--ovl-template-now-playing-player-size: 8.25rem;',
        `inline-size: min(100%, ${canvasRem(8.25)});`,
      ],
    ]) {
      expect(runtimeCss).toContain(runtime);
      expect(source).toContain(preview);
    }
    expect(runtimeCss).toContain(
      'padding-inline: var(--ovl-primitive-space-4) var(--ovl-primitive-space-2);',
    );
    expect(source.replace(/\s+/gu, ' ')).toContain(
      `padding-inline: ${canvasRem(1)} ${canvasRem(0.5)};`,
    );
    for (const declaration of [
      'grid-template-columns: repeat(10, minmax(0, 1fr));',
      'grid-column: 1 / span 3;',
      'grid-column: 5 / span 6;',
      'min-block-size: 68%;',
      'line-height: 1.15;',
      '-webkit-line-clamp: 2;',
    ]) {
      expect(runtimeCss).toContain(declaration);
      expect(source).toContain(declaration);
    }
    expect(source).toContain(`inset: ${canvasRem(1)};`);
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

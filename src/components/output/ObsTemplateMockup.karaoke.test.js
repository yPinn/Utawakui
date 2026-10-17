import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  readObsTemplateMockupSource,
  readObsTemplatePreviewSource,
} from './obsTemplateMockupSource.mjs';

const source = readObsTemplateMockupSource();

describe('Classic KTV gallery mockup', () => {
  it('replaces the old panel and progress bar with two outlined lyric lanes', () => {
    const branch = readObsTemplatePreviewSource('KaraokeStack');

    expect(branch).toContain('obs-template-mockup__ktv-lines');
    expect(branch).toContain('data-ktv-lane="a"');
    expect(branch).toContain('data-ktv-lane="b"');
    expect(branch).toContain(':data-ktv-role="ktvCurrent.role"');
    expect(branch).toContain('data-ktv-held="true"');
    expect(branch).toContain('{{ ktvCurrent.text }}');
    expect(branch).toContain('{{ ktvNext.text }}');
    expect(branch).toContain('obs-template-mockup__ktv-line-fill');
    expect(branch).toContain('obs-template-mockup__ktv-count-in');
    expect(
      branch
        .match(/<template>([\s\S]*)<\/template>/u)?.[1]
        .match(/obs-template-mockup__ktv-count-in-dot/gu),
    ).toHaveLength(4);
    expect(branch).not.toContain('obs-template-mockup__animated-primary');
    expect(branch).not.toContain('正在演唱');
    expect(branch).not.toContain('obs-template-mockup__progress');
    expect(source).toContain('parseKtvDisplayPhrases');
    expect(source).toContain('ktvDisplayPhrases');
  });

  it('uses a transparent lower-third composition with a clipped sung fill', () => {
    const ktvStylesStart = source.indexOf(
      ".obs-template-mockup[data-template-id='karaoke-stack']\n  .obs-template-mockup__content--lyrics",
    );
    const ktvStylesEnd = source.indexOf(
      ".obs-template-mockup[data-template-id='kinetic-pop']\n  .obs-template-mockup__content--lyrics",
      ktvStylesStart,
    );
    const ktvStyles = source.slice(ktvStylesStart, ktvStylesEnd);

    expect(source).toContain(
      ".obs-template-mockup[data-template-id='karaoke-stack']",
    );
    expect(source).toContain('.obs-template-mockup__ktv-lines');
    expect(source).toContain('.obs-template-mockup__ktv-line-fill');
    expect(source).toContain('clip-path: inset(-0.2em 38% -0.2em 0)');
    expect(source).toContain('inset: 0.11em 0.16em 0 0.11em;');
    expect(source).toContain('-webkit-text-stroke:');
    expect(source).toContain("font-family: 'Utawakui Open Huninn'");
    expect(source).toContain('max-inline-size: 94%;');
    expect(source).toContain('padding: 0.11em 0.16em 0.18em 0.11em;');
    expect(source).toContain('margin: -0.11em -0.16em -0.18em -0.11em;');
    expect(ktvStyles).not.toContain('background-clip: text');
    expect(source).toContain('var(--ui-output-preview-ktv-stroke-sung)');
    expect(source).toContain('text-shadow: none;');
    expect(source).not.toContain('var(--ui-output-preview-ktv-shadow)');
  });

  it('sizes the preview in runtime em on a 1920px canvas', () => {
    const runtimeCss = readFileSync(
      fileURLToPath(
        new URL('../../../overlay/lyrics/lyrics.css', import.meta.url),
      ),
      'utf8',
    );
    const cssBlock = (css, selector) => {
      const start = css.indexOf(`${selector} {`);
      expect(start, selector).toBeGreaterThan(-1);
      return css.slice(start, css.indexOf('}', start));
    };
    const runtime = (suffix) =>
      cssBlock(
        runtimeCss,
        `:root[data-ovl-template='karaoke-stack'] ${suffix}`.trimEnd(),
      );

    expect(source).toContain(
      '--obs-canvas-rem: calc(100cqi * 16 / var(--obs-canvas-width, 1920));',
    );
    expect(source).toContain('container-type: inline-size;');
    expect(
      cssBlock(
        source,
        ".obs-template-mockup[data-template-id='karaoke-stack']\n  .obs-template-mockup__content--lyrics",
      ),
    ).toContain('font-size: var(--obs-canvas-rem);');

    const lines = cssBlock(source, '.obs-template-mockup__ktv-lines');
    expect(runtime('.lyrics-overlay')).toContain(
      '--ovl-ktv-lane-block-size: 5.832em;',
    );
    expect(lines).toContain('minmax(5.832em, auto)');
    // Runtime safe area is max(4rem, 3%) inline and max(4rem, 5%) block.
    expect(lines).toContain('inset-inline: 4em;');
    expect(lines).toContain('inset-block-end: 4em;');

    for (const declaration of [
      'font-size: 5.4em;',
      'letter-spacing: 0.015em;',
      'line-height: 1.08;',
    ]) {
      expect(
        runtime(
          ".lyrics-overlay__current,\n  :root[data-ovl-template='karaoke-stack'] .lyrics-overlay__next",
        ),
      ).toContain(declaration);
      expect(cssBlock(source, '.obs-template-mockup__ktv-line')).toContain(
        declaration,
      );
    }
    for (const declaration of [
      'inset-block-start: -2.55em;',
      'inset-inline-start: 0.11em;',
      'gap: 0.55em;',
    ]) {
      expect(runtime('.lyrics-overlay__ktv-count-in')).toContain(declaration);
      expect(cssBlock(source, '.obs-template-mockup__ktv-count-in')).toContain(
        declaration,
      );
    }
    expect(runtime('.lyrics-overlay__ktv-count-in-dot')).toContain(
      'inline-size: 2.1em;',
    );
    const dot = cssBlock(source, '.obs-template-mockup__ktv-count-in-dot');
    expect(dot).toContain('width: 2.1em;');
    expect(dot).toContain('border: 0.13em solid');
    expect(source).not.toContain(
      ".obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__ktv-line {",
    );
  });
});

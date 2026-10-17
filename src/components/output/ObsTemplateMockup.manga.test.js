import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  readObsTemplateMockupSource,
  readObsTemplatePreviewSource,
} from './obsTemplateMockupSource.mjs';

const runtimeCss = readFileSync(
  fileURLToPath(new URL('../../../overlay/lyrics/lyrics.css', import.meta.url)),
  'utf8',
);

describe('Manga Frame gallery mockup', () => {
  it('places each bubble through the runtime placement contract', () => {
    const source = readObsTemplatePreviewSource('MangaFrame');

    expect(source).toContain('mangaFrameLengthTier');
    expect(source).toContain('mangaFrameTextLayout');
    expect(source).toContain('mangaFramePlacementForBubble');
    expect(source).toContain('analyzeLyricsSource');
    expect(source).toContain('adaptMangaLyricsPresentation');
    expect(source).toContain(':data-manga-count="mangaBubbles.length"');
    expect(source).toContain(':data-manga-side="bubble.placement.side"');
    expect(source).toContain(':data-manga-order="bubble.order"');
    expect(source).toContain('bubble.placement.anchorYPercent');
    expect(source).toContain('bubble.placement.inlineJitterRem');
    expect(source).toContain(':data-manga-script="bubble.layout.script"');
    expect(source).toContain(':data-manga-language="bubble.layout.language"');
    expect(source).toContain(':data-manga-columns="bubble.layout.columnCount"');
    expect(source).toContain('bubble.layout.columnTokens');
    expect(source).toContain('<ruby v-if="token.reading">');
    expect(source).toContain('<rt>{{ token.reading }}</rt>');
    expect(source).toContain('bubble.layout.requiredBlockSizeEm');
    expect(source).toContain('v-for="(bubble, index) in mangaBubbles"');
    expect(source).toContain('class="obs-template-mockup__manga-text"');
    expect(source).not.toContain('obs-template-mockup__title');
  });

  it('sizes bubbles from runtime rem on a 1920×1080 canvas', () => {
    const source = readObsTemplatePreviewSource('MangaFrame');
    const canvasRem = (value) => `calc(${value} * var(--obs-canvas-rem))`;

    for (const [runtime, preview] of [
      ['--ovl-manga-lane-inline-size: min(30vw, 34rem);', canvasRem(34)],
      ['--ovl-manga-bubble-base-block-size: min(36vh, 24rem);', canvasRem(24)],
      ['--ovl-manga-bubble-row-cap: min(55.556vh, 37.5rem);', canvasRem(37.5)],
      ['--ovl-manga-bubble-row-cap: min(55vh, 37rem);', canvasRem(37)],
      ['--ovl-manga-bubble-row-cap: min(30vh, 20rem);', canvasRem(20)],
      ['--ovl-manga-bubble-row-cap: min(46vh, 31rem);', canvasRem(31)],
      ['--ovl-manga-text-size-by-count: 2.9em;', canvasRem(2.9)],
      ['--ovl-manga-text-size-by-count: 2.35em;', canvasRem(2.35)],
      ['--ovl-manga-text-size-by-count: 1.9em;', canvasRem(1.9)],
    ]) {
      expect(runtimeCss).toContain(runtime);
      expect(source).toContain(preview);
    }
    expect(runtimeCss).toContain('--ovl-manga-stage-edge: 66.667vw;');
    expect(source).toContain('--ui-manga-stage-edge: 66.667%;');
    expect(source).toContain('inset-block: calc(4 * var(--obs-canvas-rem));');
    expect(source).toContain("[data-manga-side='left']");
    expect(source).toContain("[data-manga-side='right']");
  });

  it('mirrors runtime vertical text and ruby rules', () => {
    const source = readObsTemplateMockupSource();

    expect(source).toContain('text-orientation: mixed');
    expect(source).toContain('text-align: start');
    expect(source).toContain('text-wrap: balance');
    expect(source).toContain("font-family: 'Utawakui GenEi Antique';");
    expect(source).toMatch(
      /\.obs-template-mockup__manga-text rt\s*{[^}]*text-align: center;/s,
    );
    expect(source).toMatch(
      /data-manga-script='latin'[^}]*\.obs-template-mockup__manga-text[^}]*font-size: 0\.82em/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__manga-text\s*{[^}]*min-inline-size: 0;[^}]*max-inline-size: 72%;[^}]*min-block-size: 0;[^}]*max-block-size: 72%;[^}]*overflow: hidden;/s,
    );
    expect(source).not.toMatch(
      /\[data-size='thumbnail'\]\s*\.obs-template-mockup__manga-bubble/u,
    );
  });
});

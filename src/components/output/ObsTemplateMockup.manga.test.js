import { describe, expect, it } from 'vitest';
import { readObsTemplateMockupSource } from './obsTemplateMockupSource.mjs';

describe('Manga Frame gallery mockup', () => {
  it('uses the shared side and length contract instead of a centered-only mockup', () => {
    const source = readObsTemplateMockupSource();

    expect(source).toContain('mangaFrameLengthTier');
    expect(source).toContain('mangaFrameTextLayout');
    expect(source).toContain('mangaFrameSideForLine');
    expect(source).toContain('analyzeLyricsSource');
    expect(source).toContain('adaptMangaLyricsPresentation');
    expect(source).toContain('mangaBubbles');
    expect(source).toContain(':data-manga-count="mangaBubbles.length"');
    expect(source).toContain(':data-manga-side="mangaSide"');
    expect(source).toContain(':data-manga-script="bubble.layout.script"');
    expect(source).toContain(':data-manga-language="bubble.layout.language"');
    expect(source).toContain(':data-manga-columns="bubble.layout.columnCount"');
    expect(source).toContain('bubble.layout.columnTokens');
    expect(source).toContain('<ruby v-if="token.reading">');
    expect(source).toContain('<rt>{{ token.reading }}</rt>');
    expect(source).toContain('bubble.layout.requiredBlockSizeEm');
    expect(source).toContain('bubble.kind');
    expect(source).toContain('v-for="(bubble, index) in mangaBubbles"');
    expect(source).toContain("[data-manga-side='left']");
    expect(source).toContain("[data-manga-side='right']");
    expect(source).toContain('text-orientation: mixed');
    expect(source).toContain('text-align: start');
    expect(source).toContain('text-wrap: balance');
    expect(source).toContain("font-family: 'Utawakui GenEi Antique';");
    expect(source).toMatch(
      /\.obs-template-mockup__title--manga rt\s*{[^}]*text-align: center;/s,
    );
    expect(source).toContain(
      'max(36%, var(--ui-manga-frame-required-block-size))',
    );
    expect(source).toContain('56%');
    expect(source).not.toContain(
      'max(70%, var(--ui-manga-frame-required-block-size))',
    );
    expect(source).not.toContain(
      'obs-template-mockup__manga-bubbles obs-template-mockup__animated-bubble',
    );
    expect(source).toMatch(/data-manga-count='2'[^}]*font-size: 0\.81em/s);
    expect(source).toMatch(/data-manga-count='3'[^}]*font-size: 0\.66em/s);
    expect(source).toMatch(
      /data-manga-script='latin'[^}]*\.obs-template-mockup__title--manga[^}]*font-size: 0\.82em/s,
    );
    expect(source).toMatch(
      /\.obs-template-mockup__title--manga\s*{[^}]*min-inline-size: 0;[^}]*max-inline-size: 72%;[^}]*min-block-size: 0;[^}]*max-block-size: 72%;[^}]*overflow: hidden;/s,
    );
  });
});

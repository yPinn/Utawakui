import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

describe('Manga Frame gallery mockup', () => {
  it('uses the shared side and length contract instead of a centered-only mockup', () => {
    const directory = path.dirname(fileURLToPath(import.meta.url));
    const source = fs.readFileSync(
      path.join(directory, 'ObsTemplateMockup.vue'),
      'utf8',
    );

    expect(source).toContain('mangaFrameLengthTier');
    expect(source).toContain('mangaFrameSideForLine');
    expect(source).toContain('analyzeLyricsSource');
    expect(source).toContain('adaptMangaLyricsPresentation');
    expect(source).toContain('mangaBubbles');
    expect(source).toContain(':data-manga-count="mangaBubbles.length"');
    expect(source).toContain(':data-manga-side="mangaSide"');
    expect(source).toContain('bubble.kind');
    expect(source).toContain('v-for="(bubble, index) in mangaBubbles"');
    expect(source).toContain("[data-manga-side='left']");
    expect(source).toContain("[data-manga-side='right']");
  });
});

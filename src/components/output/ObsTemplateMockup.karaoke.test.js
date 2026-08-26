import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('./ObsTemplateMockup.vue', import.meta.url)),
  'utf8',
);

describe('Classic KTV gallery mockup', () => {
  it('replaces the old panel and progress bar with two outlined lyric lanes', () => {
    const branchStart = source.indexOf("preset?.id === 'karaoke-stack'");
    const branchEnd = source.indexOf(
      "preset?.id === 'reading-aid'",
      branchStart,
    );
    const branch = source.slice(branchStart, branchEnd);

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
      branch.match(/obs-template-mockup__ktv-count-in-dot/gu),
    ).toHaveLength(4);
    expect(branch).not.toContain('obs-template-mockup__animated-primary');
    expect(branch).not.toContain('正在演唱');
    expect(branch).not.toContain('obs-template-mockup__progress');
    expect(source).toContain('parseKtvDisplayPhrases');
    expect(source).toContain('ktvDisplayPhrases');
  });

  it('uses a transparent lower-third composition with a clipped sung fill', () => {
    expect(source).toContain(
      ".obs-template-mockup[data-template-id='karaoke-stack']",
    );
    expect(source).toContain('.obs-template-mockup__ktv-lines');
    expect(source).toContain('.obs-template-mockup__ktv-line-fill');
    expect(source).toContain('clip-path: inset(-0.2em 38% -0.2em 0)');
    expect(source).toContain('inset: 0.11em 0.16em 0 0.11em;');
    expect(source).toContain('-webkit-text-stroke:');
    expect(source).toContain("font-family: 'Utawakui Open Huninn'");
    expect(source).toContain('width: 94%;');
    expect(source).toContain('max-width: 94%;');
    expect(source).toContain('font-size: 2.6rem;');
    expect(source).toContain('padding: 0.11em 0.16em 0.18em 0.11em;');
    expect(source).toContain('margin: -0.11em -0.16em -0.18em -0.11em;');
    expect(source).not.toContain('background-clip: text');
    expect(source).toContain('var(--ui-output-preview-ktv-stroke-sung)');
    expect(source).toContain('text-shadow: none;');
    expect(source).not.toContain('var(--ui-output-preview-ktv-shadow)');
  });

  it('keeps the thumbnail lanes at the lower edge like the real Overlay', () => {
    const genericThumbnailRule = source.indexOf(
      ".obs-template-mockup[data-size='thumbnail'] .obs-template-mockup__content {",
    );
    const ktvThumbnailRule = source.indexOf(
      ".obs-template-mockup[data-size='thumbnail'][data-template-id='karaoke-stack']",
      genericThumbnailRule,
    );
    const ruleEnd = source.indexOf('}', ktvThumbnailRule);

    expect(ktvThumbnailRule).toBeGreaterThan(genericThumbnailRule);
    expect(source.slice(ktvThumbnailRule, ruleEnd)).toContain(
      'align-content: end;',
    );
  });
});

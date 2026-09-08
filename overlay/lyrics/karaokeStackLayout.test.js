import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('./lyrics.css', import.meta.url)),
  'utf8',
);
const html = readFileSync(
  fileURLToPath(new URL('./index.html', import.meta.url)),
  'utf8',
);

describe('Classic KTV Karaoke Stack layout contract', () => {
  it('lets the animated segment percentage reach the progress pseudo-element', () => {
    expect(css).toMatch(
      /@property --ovl-segment-progress\s*\{[\s\S]*?inherits: true;/u,
    );
  });

  it('keeps the existing id while replacing the panel with a transparent lower third', () => {
    const start = css.indexOf(":root[data-ovl-template='karaoke-stack']");
    const end = css.indexOf(":root[data-ovl-template='kinetic-pop']", start);
    const karaokeCss = css.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(karaokeCss).toContain(
      '--ovl-ktv-fill-unsung: var(--ovl-color-ktv-fill-unsung);',
    );
    expect(karaokeCss).toContain(
      '--ovl-ktv-fill-sung: var(--ovl-color-ktv-fill-solo);',
    );
    expect(karaokeCss).toContain(
      '--ovl-ktv-stroke-unsung: var(--ovl-color-ktv-stroke-unsung);',
    );
    expect(karaokeCss).toContain(
      '--ovl-ktv-stroke-sung: var(--ovl-color-ktv-stroke-sung);',
    );
    expect(karaokeCss).not.toContain('--ovl-ktv-shadow');
    expect(karaokeCss).toContain('background: transparent;');
    expect(karaokeCss).toContain('border: 0;');
    expect(karaokeCss).toContain('--ovl-ktv-lane-block-size: 5.832em;');
    expect(karaokeCss).toContain(
      'grid-template-rows: repeat(2, minmax(var(--ovl-ktv-lane-block-size), auto));',
    );
    expect(karaokeCss).toContain(
      'inset-inline: max(var(--ovl-safe-inline), 3%);',
    );
    expect(karaokeCss).toContain('max-inline-size: 94%;');
    expect(karaokeCss).toContain('font-size: 5.4em;');
    expect(karaokeCss).toContain('padding: 0.11em 0.16em 0.18em 0.11em;');
    expect(karaokeCss).toContain('margin: -0.11em -0.16em -0.18em -0.11em;');
    expect(karaokeCss).not.toMatch(/font-size:[^;]*vw/u);
    expect(karaokeCss).not.toContain('var(--ovl-user-surface)');
  });

  it('uses offset twin lanes and a clipped text duplicate for T2 sung progress', () => {
    const start = css.indexOf(":root[data-ovl-template='karaoke-stack']");
    const end = css.indexOf(":root[data-ovl-template='kinetic-pop']", start);
    const karaokeCss = css.slice(start, end);

    expect(css).toContain(
      ":root[data-ovl-template='karaoke-stack'] .lyrics-overlay__current",
    );
    expect(css).toContain(
      ":root[data-ovl-template='karaoke-stack'] .lyrics-overlay__next",
    );
    expect(css).toContain("[data-ktv-lane='a']");
    expect(css).toContain("[data-ktv-lane='b']");
    expect(css).toContain('grid-row: 1;');
    expect(css).toContain('grid-row: 2;');
    expect(css).toContain('content: attr(data-text);');
    expect(css).toMatch(
      /clip-path:\s*inset\(\s*-0\.2em calc\(100% - var\(--ovl-segment-progress\)\) -0\.2em 0\s*\);/u,
    );
    expect(karaokeCss).toContain('inset: 0.11em 0.16em 0 0.11em;');
    expect(karaokeCss).not.toContain('inset: 0.11em 0.16em 0.18em 0.11em;');
    expect(css).toContain(
      '-webkit-text-stroke: 0.085em var(--ovl-ktv-stroke-sung);',
    );
    expect(css).toContain("[data-ktv-role='female']");
    expect(css).toContain("[data-ktv-role='group']");
    expect(css).toMatch(
      /\[data-ktv-held='true'\][^{]*\{[\s\S]*?color: var\(--ovl-ktv-fill-sung\);[\s\S]*?-webkit-text-stroke: 0\.085em var\(--ovl-ktv-stroke-sung\);/u,
    );
    expect(karaokeCss).toContain('text-shadow: none;');
    expect(karaokeCss).not.toContain('0.045em 0.07em');
    expect(karaokeCss).not.toContain('background-clip: text');
  });

  it('provides four role-colored countdown dots before the first vocal entrance', () => {
    expect(html).toContain('id="lyrics-ktv-count-in"');
    expect(html.match(/lyrics-overlay__ktv-count-in-dot/gu)).toHaveLength(4);
    expect(css).toContain('.lyrics-overlay__ktv-count-in');
    expect(css).toContain("[data-remaining-beats='3']");
    expect(css).toContain("[data-remaining-beats='2']");
    expect(css).toContain("[data-remaining-beats='1']");
    expect(css).toContain(".lyrics-overlay__ktv-count-in[data-ktv-lane='b']");
  });

  it('falls back to static current and next lines without requiring T2 segments', () => {
    expect(css).toMatch(
      /data-ovl-template='karaoke-stack'\]\s+\[data-ktv-active='true'\]:not\(\[data-segmented='true'\]\)[^{]*\{[\s\S]*?color: var\(--ovl-ktv-fill-unsung\);/u,
    );
    expect(css).toMatch(
      /data-ovl-template='karaoke-stack'\]\s+\.lyrics-overlay__next\s*\{[\s\S]*?color: var\(--ovl-ktv-fill-unsung\);/u,
    );
  });
});

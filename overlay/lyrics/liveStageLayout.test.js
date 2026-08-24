import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const html = readFileSync(
  fileURLToPath(new URL('./index.html', import.meta.url)),
  'utf8',
);
const css = readFileSync(
  fileURLToPath(new URL('./lyrics.css', import.meta.url)),
  'utf8',
);

describe('Live Stage overlay layout contract', () => {
  it('owns original top branding and independent lower-left/lower-right lanes', () => {
    expect(html).toContain('id="lyrics-live-stage-chrome"');
    expect(html).toContain('id="lyrics-live-stage-card"');
    expect(html).toContain('id="lyrics-live-stage-title"');
    expect(html).toContain('id="lyrics-live-stage-artist"');
    expect(html).not.toMatch(/Mnet|M COUNTDOWN|Genie/i);

    expect(css).toContain(":root[data-ovl-template='live-stage']");
    expect(css).toContain('inset-inline-start: 6.25%');
    expect(css).toContain('inset-inline-end: 5%');
    expect(css).toContain('inset-block-end: 8.333%');
    expect(css).toMatch(
      /\.lyrics-overlay__live-stage-card\s*\{[\s\S]*?display: grid/u,
    );
    expect(css).toContain('.lyrics-overlay__live-stage-caption-line');
    expect(css).toContain('white-space: nowrap');
    expect(css).toContain('.lyrics-overlay__next');
  });
});

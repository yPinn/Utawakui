import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('overlay CSS tokens', () => {
  it('keeps primitive, semantic, and template tokens outside the UI system', () => {
    const tokens = fs.readFileSync(
      new URL('./tokens.css', import.meta.url),
      'utf8',
    );
    const lyrics = fs.readFileSync(
      new URL('../lyrics/lyrics.css', import.meta.url),
      'utf8',
    );

    expect(tokens).toContain('--ovl-primitive-color-ink');
    expect(tokens).toContain('--ovl-color-text-primary');
    expect(lyrics).toContain('--ovl-template-lyrics-current-size');
    expect(`${tokens}\n${lyrics}`).not.toContain('--ui-');
  });

  it('never renders contract text through HTML injection APIs', () => {
    const scripts = [
      '../lyrics/lyrics.mjs',
      '../now-playing/now-playing.mjs',
      '../setlist/setlist.mjs',
    ].map((relativePath) =>
      fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    );

    expect(scripts.join('\n')).not.toMatch(/innerHTML|insertAdjacentHTML/);
    expect(scripts.join('\n')).toContain('textContent');
  });
});

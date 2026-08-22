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

  it('keeps raw colors in the shared token layer', () => {
    const templateStyles = [
      '../lyrics/lyrics.css',
      '../now-playing/now-playing.css',
      '../setlist/setlist.css',
      '../artwork/artwork.css',
    ].map((relativePath) =>
      fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    );

    for (const styles of templateStyles) {
      expect(styles).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)\(/i);
      expect(styles).not.toContain('--ui-');
    }
  });

  it('gives every template a scoped override layer and narrow viewport rules', () => {
    const templateStyles = [
      ['lyrics', '../lyrics/lyrics.css'],
      ['now-playing', '../now-playing/now-playing.css'],
      ['setlist', '../setlist/setlist.css'],
      ['artwork', '../artwork/artwork.css'],
    ];

    for (const [kind, relativePath] of templateStyles) {
      const styles = fs.readFileSync(
        new URL(relativePath, import.meta.url),
        'utf8',
      );
      expect(styles).toContain(`--ovl-template-${kind}-`);
      expect(styles).toContain('@media (max-width:');
      expect(styles).toContain('@media (max-height:');
    }
  });

  it('defines shared contrast and current-state roles once', () => {
    const tokens = fs.readFileSync(
      new URL('./tokens.css', import.meta.url),
      'utf8',
    );

    expect(tokens).toContain('--ovl-color-current-surface');
    expect(tokens).toContain('--ovl-color-stroke-strong');
    expect(tokens).toContain('--ovl-color-stroke-soft');
  });

  it('keeps every Browser Source capture surface non-selectable', () => {
    const base = fs.readFileSync(
      new URL('./base.css', import.meta.url),
      'utf8',
    );

    expect(base).toContain('user-select: none');
    expect(base).toContain('-webkit-user-select: none');
    expect(base).toContain("data-overlay-backdrop='checker'");
    expect(base).toContain("data-overlay-backdrop='dark'");
    expect(base).toContain("data-overlay-backdrop='light'");
    expect(base).toContain("html[data-overlay-backdrop='dark'] body");
    expect(base).toContain('var(--ovl-color-surface)');
    expect(base).toContain('var(--ovl-primitive-color-ink)');
    expect(base).toContain('var(--ovl-primitive-color-paper)');
  });

  it('never renders contract text through HTML injection APIs', () => {
    const scripts = [
      '../lyrics/lyrics.mjs',
      '../now-playing/now-playing.mjs',
      '../setlist/setlist.mjs',
      '../artwork/artwork.mjs',
    ].map((relativePath) =>
      fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    );

    expect(scripts.join('\n')).not.toMatch(/innerHTML|insertAdjacentHTML/);
    expect(scripts.join('\n')).toContain('textContent');
  });
});

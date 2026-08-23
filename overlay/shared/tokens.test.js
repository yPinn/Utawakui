import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('overlay CSS tokens', () => {
  it('keeps fallback primitive, semantic, and template tokens outside the UI system', () => {
    const fallback = fs.readFileSync(
      new URL('./fallback.css', import.meta.url),
      'utf8',
    );
    const tokens = fs.readFileSync(
      new URL('./tokens.css', import.meta.url),
      'utf8',
    );
    const appearance = fs.readFileSync(
      new URL('./appearance.css', import.meta.url),
      'utf8',
    );
    const lyrics = fs.readFileSync(
      new URL('../lyrics/lyrics.css', import.meta.url),
      'utf8',
    );

    expect(fallback).toContain('--ovl-primitive-color-ink');
    expect(tokens).not.toContain('--ovl-primitive-color-ink:');
    expect(tokens).toContain('--ovl-color-text-primary');
    expect(tokens).not.toContain('@layer ovl-appearance {');
    expect(appearance).toContain('@layer ovl-appearance {');
    expect(lyrics).toContain('--ovl-template-lyrics-current-size');
    expect(`${fallback}\n${tokens}\n${appearance}\n${lyrics}`).not.toContain(
      '--ui-',
    );
  });

  it('loads the explicit bundled fallback cascade on every fixed route', () => {
    const base = fs.readFileSync(
      new URL('./base.css', import.meta.url),
      'utf8',
    );
    expect(base).toContain(
      '@layer ovl-reset, ovl-fallback, ovl-semantic, ovl-template, ovl-appearance, ovl-constraints;',
    );

    for (const kind of ['lyrics', 'now-playing', 'setlist', 'artwork']) {
      const html = fs.readFileSync(
        new URL(`../${kind}/index.html`, import.meta.url),
        'utf8',
      );
      const baseIndex = html.indexOf('/overlay/shared/base.css');
      const fallbackIndex = html.indexOf('/overlay/shared/fallback.css');
      const tokensIndex = html.indexOf('/overlay/shared/tokens.css');
      const templateIndex = html.indexOf(`/overlay/${kind}/${kind}.css`);
      const appearanceIndex = html.indexOf('/overlay/shared/appearance.css');

      expect(baseIndex).toBeGreaterThan(-1);
      expect(fallbackIndex).toBeGreaterThan(baseIndex);
      expect(tokensIndex).toBeGreaterThan(fallbackIndex);
      expect(templateIndex).toBeGreaterThan(tokensIndex);
      expect(appearanceIndex).toBeGreaterThan(templateIndex);
    }
  });

  it('lets every fixed route derive text direction from its rendered content', () => {
    for (const kind of ['lyrics', 'now-playing', 'setlist', 'artwork']) {
      const html = fs.readFileSync(
        new URL(`../${kind}/index.html`, import.meta.url),
        'utf8',
      );
      expect(html).toMatch(/<main\b[^>]*\bdir="auto"/s);
    }
  });

  it('keeps each CSS owner in its declared cascade layer', () => {
    const fallback = fs.readFileSync(
      new URL('./fallback.css', import.meta.url),
      'utf8',
    );
    const tokens = fs.readFileSync(
      new URL('./tokens.css', import.meta.url),
      'utf8',
    );
    const base = fs.readFileSync(
      new URL('./base.css', import.meta.url),
      'utf8',
    );
    const appearance = fs.readFileSync(
      new URL('./appearance.css', import.meta.url),
      'utf8',
    );

    expect(base).toContain('@layer ovl-reset {');
    expect(base).toContain('@layer ovl-constraints {');
    expect(fallback).toContain('@layer ovl-fallback {');
    expect(tokens).toContain('@layer ovl-semantic {');
    expect(tokens).not.toContain('@layer ovl-appearance {');
    expect(appearance).toContain('@layer ovl-appearance {');

    for (const kind of ['lyrics', 'now-playing', 'setlist', 'artwork']) {
      const styles = fs.readFileSync(
        new URL(`../${kind}/${kind}.css`, import.meta.url),
        'utf8',
      );
      expect(styles).toContain('@layer ovl-template {');
    }
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

  it('keeps lyric glyphs visible while exposing segment progress', () => {
    const lyrics = fs.readFileSync(
      new URL('../lyrics/lyrics.css', import.meta.url),
      'utf8',
    );

    expect(lyrics).toContain("[data-segment-state='past']");
    expect(lyrics).toContain("[data-segment-state='active']");
    expect(lyrics).toContain("[data-segment-state='upcoming']");
    expect(lyrics).toContain('--ovl-segment-progress');
    expect(lyrics).not.toContain('background-clip: text');
    expect(lyrics).not.toContain('-webkit-text-fill-color: transparent');
    expect(lyrics).not.toMatch(/\bcolor:\s*transparent\b/);
  });

  it('keeps the manga frame monochrome and leaves scenario semantics explicit', () => {
    const lyrics = fs.readFileSync(
      new URL('../lyrics/lyrics.css', import.meta.url),
      'utf8',
    );
    const mangaStart = lyrics.indexOf(":root[data-ovl-template='manga-frame']");
    const mangaStyles = lyrics.slice(mangaStart);

    expect(mangaStart).toBeGreaterThan(-1);
    expect(mangaStyles).toContain('var(--ovl-color-ink)');
    expect(mangaStyles).toContain("data-segment-state='active'");
    expect(mangaStyles).toContain('--ovl-segment-progress');
    expect(mangaStyles).toContain('.lyrics-overlay__manga-frame-shape');
    expect(mangaStyles).toContain('writing-mode: vertical-rl');
    expect(mangaStyles).toContain('text-align: center');
    expect(mangaStyles).toContain('place-items: center');
    expect(mangaStyles).toContain('.lyrics-overlay__next');
    expect(mangaStyles).toContain('display: none');
    expect(mangaStyles).not.toContain('data-music-section');
    expect(mangaStyles).not.toContain('var(--ovl-color-current)');
  });

  it('keeps Cover Player scoped, responsive, and token-driven', () => {
    const artwork = fs.readFileSync(
      new URL('../artwork/artwork.css', import.meta.url),
      'utf8',
    );
    const coverPlayerStart = artwork.indexOf(
      ":root[data-ovl-template='cover-player']",
    );
    const coverPlayerStyles = artwork.slice(coverPlayerStart);

    expect(coverPlayerStart).toBeGreaterThan(-1);
    expect(coverPlayerStyles).toContain('--ovl-artwork-progress');
    expect(coverPlayerStyles).toContain('.artwork-overlay__transport');
    expect(coverPlayerStyles).toContain('--ovl-template-player-inline');
    expect(coverPlayerStyles).toContain('padding: 0;');
    expect(coverPlayerStyles).toContain('overflow: hidden;');
    expect(coverPlayerStyles).not.toContain('.artwork-overlay__volume');
    expect(coverPlayerStyles).not.toContain(
      'box-shadow: var(--ovl-text-shadow)',
    );
    expect(coverPlayerStyles).toContain('@media (max-width:');
    expect(coverPlayerStyles).toContain('@media (max-height:');
    expect(coverPlayerStyles).not.toMatch(
      /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)\(/i,
    );
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

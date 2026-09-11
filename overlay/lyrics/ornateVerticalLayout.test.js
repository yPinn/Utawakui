import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));

describe('Ornate Vertical layout contract', () => {
  it('keeps a right-side safe anchor and one type size without covering the serifs', () => {
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');

    expect(css).toMatch(
      /\[data-ovl-template='ornate-vertical'\]\s+\.lyrics-overlay__ornate-line\s*\{[^}]*grid-area:\s*1 \/ 1;[^}]*justify-self:\s*var\(--ovl-user-position-inline\);/s,
    );
    expect(css).not.toContain("data-ornate-placement='left'");
    expect(css).not.toContain("data-ornate-placement='center'");
    expect(css).toContain('writing-mode: vertical-rl');
    expect(css).toContain('white-space: nowrap');
    expect(css).toContain('align-self: var(--ovl-user-position-block)');
    expect(css).toContain('inset-inline-start: var(--ovl-user-position-x)');
    expect(css).toContain('inset-block-start: var(--ovl-user-position-y)');
    expect(css).toContain('--ovl-ornate-font-size: 5.8vh');
    expect(css).toContain("data-ovl-scale='small'");
    expect(css).toContain("data-ovl-scale='large'");
    expect(css).toMatch(
      /\.lyrics-overlay__ornate-line\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*row-reverse;[^}]*align-items:\s*center;/s,
    );
    expect(css).toMatch(
      /\.lyrics-overlay__ornate-segment\s*\{[^}]*writing-mode:\s*vertical-rl;/s,
    );
    expect(css).toMatch(
      /data-ornate-emphasis='keyword'\][^{]*\{[^}]*font-size:\s*inherit;[^}]*line-height:\s*inherit;/s,
    );
    expect(css).not.toContain('font-size: 1.42em');
    expect(css).not.toContain('-webkit-text-stroke: 0.012em');
    expect(css).not.toContain('filter: blur(0.07em)');
    expect(css).not.toMatch(
      /lyrics-overlay__ornate-line\s*\{[^}]*transform\s*:/s,
    );
    expect(css).not.toMatch(/data-ornate-emphasis='keyword'\]::after/);
    expect(css).not.toMatch(
      /ornate-vertical[\s\S]{0,400}url\([^)]*\.(?:png|jpe?g|webp)/i,
    );
  });

  it('provides structured sample units when preview mode has no live lyrics', () => {
    const source = fs.readFileSync(path.join(directory, 'lyrics.mjs'), 'utf8');

    expect(source).toContain('PREVIEW_ORNATE_VERTICAL');
    expect(source).toContain('ornateVertical: PREVIEW_ORNATE_VERTICAL');
    expect(source).toContain('夜が明けるまで言葉を残していく');
  });
});

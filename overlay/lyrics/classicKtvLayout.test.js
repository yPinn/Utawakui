import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));

describe('Classic KTV layout contract', () => {
  it('reserves both lane tracks when either lyric becomes empty', () => {
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');
    const rootRule = css.match(
      /:root\[data-ovl-template='karaoke-stack'\] \.lyrics-overlay\s*\{([^}]+)\}/u,
    );
    const declarations = rootRule?.[1].replace(/\s+/gu, ' ') ?? '';

    expect(declarations).toContain('--ovl-ktv-lane-block-size: 5.832em;');
    expect(declarations).toContain(
      'grid-template-rows: repeat(2, minmax(var(--ovl-ktv-lane-block-size), auto));',
    );
  });

  it('preserves authored segment edge whitespace inside fixed paint boxes', () => {
    const css = fs.readFileSync(path.join(directory, 'lyrics.css'), 'utf8');
    const segmentRule = css.match(
      /:root\[data-ovl-template='karaoke-stack'\] \.lyrics-overlay__segment\s*\{([^}]+)\}/u,
    );

    expect(segmentRule?.[1]).toContain('display: inline-block');
    expect(segmentRule?.[1]).toContain('white-space: pre');
  });
});

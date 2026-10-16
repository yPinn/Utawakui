import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LyricsDocumentPanel from './LyricsDocumentPanel.vue';

const source = readFileSync(
  new URL('./LyricsDocumentPanel.vue', import.meta.url),
  'utf8',
);

function rule(selector) {
  const start = source.indexOf(`${selector} {`);
  return start < 0 ? '' : source.slice(start, source.indexOf('}', start));
}

function render(props) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(LyricsDocumentPanel, {
          trackCount: 1,
          hasSelectedTrack: true,
          lyricsStatus: 'ready',
          hasSelectedSource: true,
          lines: [
            { lineId: 'a', start: 1, text: '雨晒し' },
            { lineId: 'b', start: 5, text: '汚れたい' },
          ],
          activeLineIndex: 1,
          ...props,
        }),
    }),
  );
}

describe('LyricsDocumentPanel presentation', () => {
  it('keeps the list look by default and prints the sheet on request', async () => {
    expect(await render()).not.toContain('lyrics-preview--sheet');
    const sheet = await render({ presentation: 'sheet' });
    expect(sheet).toContain('lyrics-preview--sheet');
    expect(sheet).toMatch(
      /lyrics-line--active[\s\S]*?<span class="lyrics-line__ink"/u,
    );
  });

  it('marks the sung line with a highlighter, not an accent row', () => {
    expect(
      rule('.lyrics-preview--sheet .lyrics-line--active .lyrics-line__row'),
    ).toContain('background: transparent;');
    expect(
      rule('.lyrics-preview--sheet .lyrics-line--active .lyrics-line__ink'),
    ).toContain('var(--ui-lyrics-highlight)');
  });

  it('prints readings above the lyric in full ink', () => {
    const romaji = rule('.lyrics-preview--sheet .lyrics-line__romaji');
    expect(romaji).toContain('order: -1;');
    expect(source).toMatch(
      /\.lyrics-preview--sheet \.lyrics-line__text rt,[\s\S]*?\{\s*color: inherit;\s*opacity: 1;/u,
    );
  });

  it('floats furigana over its word and spaces only crowded neighbours', async () => {
    const readingLines = [
      null,
      {
        segments: [{ t: 'の' }, { t: '純情', r: 'じゅんじょう' }, { t: 'み' }],
      },
    ];
    const props = {
      showsReadingAid: true,
      readingVariant: 'furigana',
      readingLines,
    };
    const sheet = await render({ ...props, presentation: 'sheet' });
    expect(sheet).toContain('lyrics-line--ruby');
    expect(sheet).toMatch(/<ruby style="--lyrics-ruby-gap:1em;"/u);
    expect(sheet).toMatch(
      /<span class="lyrics-line__ruby-gap" style="--lyrics-ruby-gap:1em;"/u,
    );
    expect(await render(props)).not.toContain('--lyrics-ruby-gap');
    expect(rule('.lyrics-preview--sheet .lyrics-line__text rt')).toContain(
      'position: absolute;',
    );
    expect(sheet).not.toContain('--ui-lyrics-ruby-scale');
  });

  it('applies the lyric language at the reading group and identifies romanization', async () => {
    const html = await render({
      lyricsScript: 'ja',
      showsReadingAid: true,
      readingVariant: 'romaji',
      readingLines: [{ romaji: 'amaz arashi' }],
    });
    expect(html).toMatch(/class="lyrics-line__text-group" lang="ja"/u);
    expect(html).toMatch(/class="lyrics-line__romaji" lang="ja-Latn"/u);
  });
});

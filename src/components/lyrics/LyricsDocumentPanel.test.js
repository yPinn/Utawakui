import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import LyricsDocumentPanel from './LyricsDocumentPanel.vue';
import LyricsFineText from './LyricsFineText.vue';

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
  it.each(['list', 'sheet'])(
    'preserves whitespace without underlining it in %s, with and without readings',
    async (presentation) => {
      for (const word of [
        ' 僕',
        '僕 の',
        ' 僕  の ',
        '僕\u3000の',
        '僕\tの\n',
        ' \u00a0\u3000',
      ]) {
        for (const reading of [false, true]) {
          const text = `前${word}後`;
          const html = await renderToString(
            createSSRApp({
              render: () =>
                h(LyricsFineText, {
                  frame: {
                    text,
                    chunks: [
                      { text: '前', state: 'past' },
                      { text: word, state: 'active' },
                      { text: '後', state: 'upcoming' },
                    ],
                  },
                  presentation,
                  readingSegments: reading
                    ? [{ t: '前' }, { t: word, r: 'ぼく' }, { t: '後' }]
                    : null,
                }),
            }),
          );
          const cues = [
            ...html.matchAll(
              /<span[^>]*class="[^"]*lyrics-fine-text__cue[^"]*"[^>]*>([^<]*)<\/span>/gu,
            ),
          ].map((match) => match[1]);
          expect(cues.every((cue) => !/\s/u.test(cue))).toBe(true);
          expect(cues.join('')).toBe(word.replace(/\s/gu, ''));
          expect(
            html
              .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gu, '')
              .replace(/<[^>]*>/gu, ''),
          ).toBe(text);
        }
      }
    },
  );
  it.each(['list', 'sheet'])(
    'underlines exactly the active T2 chunk across furigana groups in %s',
    async (presentation) => {
      const frame = {
        text: '歩き出した僕の未来',
        chunks: [
          { text: '歩き', state: 'past' },
          { text: '出し', state: 'active' },
          { text: 'た僕の未来', state: 'upcoming' },
        ],
        fineTiming: { units: [{ from: 2, to: 4, startMs: 1000, endMs: 2000 }] },
      };
      const readingSegments = [
        { t: '歩', r: 'ある' },
        { t: 'き' },
        { t: '出', r: 'だ' },
        { t: 'した' },
        { t: '僕', r: 'ぼく' },
        { t: 'の' },
        { t: '未来', r: 'みらい' },
      ];
      const renderCue = (chunks, readings = readingSegments) =>
        renderToString(
          createSSRApp({
            render: () =>
              h(LyricsFineText, {
                frame: { ...frame, chunks },
                readingSegments: readings,
                presentation,
              }),
          }),
        );
      const activeText = (html) =>
        [
          ...html.matchAll(
            /<span[^>]*class="[^"]*lyrics-fine-text__cue[^"]*"[^>]*>([^<]*)<\/span>/gu,
          ),
        ]
          .map((m) => m[1])
          .join('');
      const html = await renderCue(frame.chunks);
      expect(activeText(html)).toBe('出し');
      expect(activeText(await renderCue(frame.chunks, null))).toBe('出し');
      expect(
        activeText(await renderCue(frame.chunks, [{ t: 'wrong', r: 'だ' }])),
      ).toBe('出し');
      expect(html.match(/<rt/g)).toHaveLength(4);
      expect(html).not.toContain('data-lyrics-fine-unit');
      expect(
        activeText(
          await renderCue(
            frame.chunks.map((c) => ({
              ...c,
              state: c.state === 'active' ? 'past' : c.state,
            })),
          ),
        ),
      ).toBe('');
    },
  );
  it.each(['list', 'sheet'])(
    'keeps the highlighter and timed underline in %s without replacing the layout',
    async (presentation) => {
      const html = await render({
        presentation,
        experimentalFrame: {
          lineId: 'b',
          text: '汚れたい',
          chunks: [{ text: '汚れたい', state: 'active' }],
        },
      });
      expect(html).toContain('lyrics-line__experimental-active');
      expect(rule('.lyrics-line--active .lyrics-line__row')).toContain(
        'background: transparent',
      );
      expect(rule('.lyrics-line__experimental-active')).not.toContain(
        'background: var(',
      );
      expect(rule('.lyrics-line--active .lyrics-line__ink')).toContain(
        'var(--ui-lyrics-highlight)',
      );
    },
  );
  it.each(['list', 'sheet'])(
    'keeps the located marker in %s while waiting without an old word cue',
    async (presentation) => {
      const html = await render({
        presentation,
        activeLineIndex: -1,
        positionedLineIndex: 0,
        experimentalFrame: {
          lineId: 'a',
          text: '雨晒し',
          chunks: [{ text: '雨晒し', state: 'active' }],
        },
      });
      expect(html).toMatch(/lyrics-line--active[\s\S]*?雨晒し/u);
      expect(html.match(/lyrics-line--active/g)).toHaveLength(1);
      expect(html).not.toContain('lyrics-line__experimental-active');
      const next = await render({
        presentation,
        activeLineIndex: 1,
        positionedLineIndex: 1,
      });
      expect(next).toMatch(/lyrics-line--active[\s\S]*?汚れたい/u);
      expect(
        await render({ activeLineIndex: -1, positionedLineIndex: -1 }),
      ).not.toContain('lyrics-line--active');
    },
  );
  it('renders manually applied starts only on the matching active line and preserves normal text on mismatch', async () => {
    const frame = {
      lineId: 'b',
      text: '汚れたい',
      chunks: [
        { chunkId: 'one', text: '汚れ', state: 'past' },
        { chunkId: 'two', text: 'たい', state: 'active' },
      ],
    };
    const html = await render({ experimentalFrame: frame });
    expect(html).toContain('lyrics-line__experimental-active');
    expect(html).toContain('たい</span>');
    expect(
      await render({ experimentalFrame: { ...frame, text: 'other version' } }),
    ).not.toContain('class="lyrics-line__experimental-active"');
    expect(
      await render({ experimentalFrame: frame, activeLineIndex: 0 }),
    ).not.toContain('class="lyrics-line__experimental-active"');
  });
  it('keeps furigana and highlights matching reading segments without rewriting them', async () => {
    const frame = {
      lineId: 'b',
      text: '汚れたい',
      chunks: [
        { chunkId: 'one', text: '汚れ', state: 'past' },
        { chunkId: 'two', text: 'たい', state: 'active' },
      ],
    };
    const html = await render({
      experimentalFrame: frame,
      showsReadingAid: true,
      readingVariant: 'furigana',
      readingLines: [
        null,
        { segments: [{ t: '汚れ', r: 'よごれ' }, { t: 'たい' }] },
      ],
    });
    expect(html).toMatch(/<rt[^>]*>よごれ<\/rt>/u);
    expect(html).toMatch(/lyrics-line__experimental-active[^>]*>たい<\/span>/u);
  });
  it('keeps the list look by default and prints the sheet on request', async () => {
    expect(await render()).not.toContain('lyrics-preview--sheet');
    const sheet = await render({ presentation: 'sheet' });
    expect(sheet).toContain('lyrics-preview--sheet');
    expect(sheet).toMatch(
      /lyrics-line--active[\s\S]*?<span class="lyrics-line__ink\b/u,
    );
  });

  it('keeps static fallback and painted lines on the same highlighter base', () => {
    expect(
      rule('.lyrics-preview--sheet .lyrics-line--active .lyrics-line__row'),
    ).toContain('background: transparent;');
    expect(rule('.lyrics-line--active .lyrics-line__ink')).toContain(
      'var(--ui-lyrics-highlight)',
    );
    expect(rule('.lyrics-line__ink')).toContain('box-decoration-break: clone');
  });
  it('does not invent a word underline on a plain unsupported line', async () => {
    const html = await render({ presentation: 'sheet' });
    expect(html).not.toContain('lyrics-line__ink--cue');
    const painted = await render({
      experimentalFrame: {
        lineId: 'b',
        text: '汚れたい',
        chunks: [{ text: '汚れたい', state: 'active' }],
      },
    });
    expect(painted).not.toContain('lyrics-line__ink--cue');
    expect(painted).toContain('lyrics-line__experimental-active');
  });

  it('keeps a whole-line cue when forced colors remove the marker image', () => {
    expect(source).toMatch(
      /@media \(forced-colors: active\)\s*\{\s*\.lyrics-line--active \.lyrics-line__ink\s*\{\s*outline: var\(--ui-border-width\) solid Highlight;/u,
    );
  });

  it('uses one non-skipping cue underline without cumulative paint or animation', () => {
    const cueSource = readFileSync(
      new URL('./LyricsFineText.vue', import.meta.url),
      'utf8',
    );
    expect(cueSource).toContain('text-decoration-skip-ink: none;');
    expect(cueSource).not.toContain('::after');
    expect(cueSource).not.toContain('--lyrics-fine-progress');
    expect(cueSource).not.toContain('paintLyricsFineUnit');
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
    expect(sheet).toMatch(/<ruby[^>]* style="--lyrics-ruby-gap:1em;"/u);
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

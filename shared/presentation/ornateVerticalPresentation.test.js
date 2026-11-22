import { describe, expect, it } from 'vitest';

import {
  adaptOrnateVerticalLyricsPresentation,
  createOrnateVerticalDocumentContext,
  ornateVerticalGlyphParts,
  splitOrnateVerticalSegments,
  splitOrnateVerticalUnits,
} from './ornateVerticalPresentation.mjs';
import { createLyricsPresentationDocumentCache } from './lyricsPresentation.mjs';

const timed = (texts) =>
  texts.map((text, index) => ({ text, startMs: index * 2500 }));

function accentsFor(lines, synced = true) {
  const documentContext = createOrnateVerticalDocumentContext(lines, {
    synced,
  });
  return lines.map(
    ({ text }, lineIndex) =>
      adaptOrnateVerticalLyricsPresentation(text, {
        documentContext,
        lineIndex,
      }).sectionAccentRanges?.map(({ from, to }) => text.slice(from, to)) ?? [],
  );
}

describe('Ornate Vertical presentation', () => {
  it('adds mixed-size gaps only to adjacent Han and kana within a column', () => {
    const source = '夕食をご飯、灯 Go';
    const units = adaptOrnateVerticalLyricsPresentation(source, {
      sectionAccentRanges: [{ from: 0, to: 1 }],
    }).units;
    const parts = ornateVerticalGlyphParts(units, true).flat();
    expect(parts.map(({ text }) => text).join('')).toBe(source);
    expect(
      parts
        .filter(({ style }) => style)
        .map(({ text, accent, style }) => [
          text,
          Boolean(accent),
          style.fontSize,
          style.marginInlineEnd,
        ]),
    ).toEqual([
      ['夕', true, '1.25em', '0.064em'],
      ['食', false, '1.25em', '0.096em'],
      ['を', false, '0.8em', undefined],
      ['ご', false, '0.8em', '0.15em'],
      ['飯', false, '1.25em', undefined],
      ['灯', false, '1.25em', undefined],
    ]);
    const [last] = ornateVerticalGlyphParts(
      splitOrnateVerticalUnits('灯'),
      true,
    );
    expect(last[0].style).toEqual({ fontSize: '1.25em' });
  });

  it('keeps attached punctuation out of the cast shadow in both arrangements', () => {
    const units = adaptOrnateVerticalLyricsPresentation('月、が').units;
    for (const mixedSizes of [false, true]) {
      const [parts] = ornateVerticalGlyphParts(units, mixedSizes);
      expect(parts).toMatchObject([
        { text: '月', kind: 'han' },
        { text: '、', kind: 'symbol' },
      ]);
    }
  });

  it('accents the three complete seven-line refrains in a 50-card sequence', () => {
    const verse = (name, length) =>
      Array.from({ length }, (_, index) => `${name} verse line ${index}`);
    const refrain = verse('Refrain', 7);
    const lyrics = timed([
      ...verse('First', 9),
      ...refrain,
      ...verse('Second', 9),
      ...refrain,
      ...verse('Bridge', 4),
      ...refrain.slice(0, 2),
      ...verse('Variation', 3),
      refrain[5],
      'A new ending',
      ...refrain,
    ]);
    const accents = accentsFor(lyrics);
    expect(lyrics).toHaveLength(50);
    expect(accents.map((parts) => parts.length)).toEqual([
      ...Array(9).fill(0),
      ...Array(7).fill(1),
      ...Array(9).fill(0),
      ...Array(7).fill(1),
      ...Array(11).fill(0),
      ...Array(7).fill(2),
    ]);
    expect(accents[9]).not.toEqual(accents[25]);
  });

  it.each([
    ['ja', ['か\u3099なで響く', '星が窓を照らす', '明日も歩いて'], 'か\u3099'],
    ['zh-Hant', ['晚風穿過窗前', '小城燈火未眠', '等到天空放晴'], '晚'],
    [
      'en',
      ['Keep the morning light', 'Run across the water', 'Turn and sing again'],
      'Keep',
    ],
    [
      'mixed',
      ['星の quiet night', '聲音 in the rain', '歩く when we sing'],
      '星',
    ],
  ])(
    'keeps %s graphemes and Latin words intact',
    (_language, refrain, first) => {
      const lyrics = timed([...refrain, '間奏之後 another verse', ...refrain]);
      const accents = accentsFor(lyrics);
      expect(accents.map((parts) => parts.length)).toEqual([
        1, 1, 1, 0, 2, 2, 2,
      ]);
      expect(accents[0][0]).toBe(first);
      expect(accentsFor(lyrics, false).flat()).toEqual([]);
    },
  );

  it('skips two-line hooks, altered triples and ranges crossing untimed lines', () => {
    const first = 'The morning light';
    const second = 'A window opens';
    const third = 'The sky changes';
    expect(
      accentsFor(timed([first, second, first, second, first, second])).flat(),
    ).toEqual([]);
    expect(
      accentsFor(
        timed([first, second, third, first, second, 'A different sky']),
      ).flat(),
    ).toEqual([]);
    const lines = timed([first, second, third, first, second, third]);
    delete lines[4].startMs;
    expect(accentsFor(lines).flat()).toEqual([]);
  });

  it('prefers the chorus over a longer block that includes repeated lead-in lines', () => {
    const lead = ['Here comes the sun', 'Look out the window'];
    const chorus = ['Wake up today', 'Take in the light', 'Go on singing'];
    const verse = [
      'Quiet in the evening',
      'Even in the dark',
      'Soon it will pass',
    ];
    const sequence = [
      ...lead,
      ...chorus,
      ...verse,
      ...chorus,
      ...verse,
      ...lead,
      ...chorus,
      ...chorus,
    ];
    const accents = accentsFor(timed(sequence));
    expect(accents.map((parts) => parts.length)).toEqual([
      0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2,
    ]);
  });

  it('selects a whole Latin contraction across existing reveal units', () => {
    const refrain = [
      'Don’t look back',
      'Keep moving ahead',
      'See you tomorrow',
    ];
    const lyrics = timed([...refrain, ...refrain]);
    expect(accentsFor(lyrics)[0]).toEqual(['Don’t']);
  });

  it('keys cached accents by track, document revision and selected mode', () => {
    const refrain = [
      'Night is falling',
      'The stars appear',
      'The air is still',
    ];
    const lines = timed([...refrain, ...refrain]);
    const document = {
      trackId: 'track-a',
      documentId: 'lyrics-a',
      documentRevision: 1,
      synced: true,
      lines,
    };
    const cache = createLyricsPresentationDocumentCache();
    const options = { templateId: 'ornate-vertical', sectionAccent: 'auto' };
    const first = cache.get(document, options);
    expect(first.lines[0].presentation.sectionAccentRanges).toHaveLength(1);
    expect(cache.get({ ...document }, options)).toBe(first);
    for (const changes of [
      { trackId: 'track-b' },
      { documentId: 'lyrics-b' },
      { documentRevision: 2 },
    ]) {
      const next = cache.get(
        { ...document, ...changes, lines: timed(refrain) },
        options,
      );
      expect(next.lines[0].presentation.sectionAccentRanges).toBeUndefined();
    }
    expect(
      cache.get(document, { ...options, sectionAccent: 'off' }).lines[0]
        .presentation.sectionAccentRanges,
    ).toBeUndefined();
  });
  it('groups continuous Han when choosing column breaks', () => {
    expect(splitOrnateVerticalUnits('後悔ばかりが募って。')).toEqual([
      { kind: 'han', text: '後悔' },
      { kind: 'kana', text: 'ば' },
      { kind: 'kana', text: 'か' },
      { kind: 'kana', text: 'り' },
      { kind: 'kana', text: 'が' },
      { kind: 'han', text: '募' },
      { kind: 'kana', text: 'っ' },
      { kind: 'kana', text: 'て。' },
    ]);
  });

  it('reveals Han and kana by grapheme, retaining punctuation and Latin words', () => {
    const text = '「後悔」か\u3099、ABC123!';
    const { units, keyword } = adaptOrnateVerticalLyricsPresentation(text);
    expect(units.map(({ text }) => text)).toEqual([
      '「後',
      '悔」',
      'か\u3099、',
      'ABC123!',
    ]);
    expect(units.map(({ reveal }) => reveal)).toEqual([
      'character',
      'character',
      'character',
      'group',
    ]);
    expect(keyword).toEqual({ index: 0, text: '後悔' });
  });

  it('keeps combining kana graphemes intact and groups Latin letters with numbers', () => {
    expect(splitOrnateVerticalUnits('か\u3099 愛 ABC123!')).toEqual([
      { kind: 'kana', text: 'か\u3099 ' },
      { kind: 'han', text: '愛 ' },
      { kind: 'word', text: 'ABC123!' },
    ]);
  });

  it('selects at most one reliable Han run using document repetition as evidence', () => {
    const context = createOrnateVerticalDocumentContext([
      '後悔ばかりが募って',
      '深い後悔だけ残る',
      'あしたも会いたい',
    ]);

    const repeated = adaptOrnateVerticalLyricsPresentation(
      '後悔ばかりが募って',
      { documentContext: context, lineIndex: 0 },
    );
    const allKana = adaptOrnateVerticalLyricsPresentation('あしたまで', {
      documentContext: context,
      lineIndex: 1,
    });

    expect(repeated.keyword).toEqual({ index: 0, text: '後悔' });
    expect(
      repeated.units
        .filter((unit) => unit.emphasis === 'keyword')
        .map(({ text }) => text),
    ).toEqual(['後', '悔']);
    expect(allKana.keyword).toBeNull();
  });

  it('allows a repeated single Han glyph but rejects an isolated or sentence-like run', () => {
    const context = createOrnateVerticalDocumentContext([
      '愛してる',
      '愛だけを歌う',
      '東京国際映画祭',
    ]);

    expect(
      adaptOrnateVerticalLyricsPresentation('愛してる', {
        documentContext: context,
        lineIndex: 0,
      }).keyword,
    ).toEqual({ index: 0, text: '愛' });
    expect(
      adaptOrnateVerticalLyricsPresentation('夢をみる', {
        documentContext: context,
        lineIndex: 1,
      }).keyword,
    ).toBeNull();
    expect(
      adaptOrnateVerticalLyricsPresentation('東京国際映画祭', {
        documentContext: context,
        lineIndex: 2,
      }).keyword,
    ).toBeNull();
  });

  it('keeps every source line on one stable stage anchor', () => {
    const placements = Array.from(
      { length: 7 },
      (_value, lineIndex) =>
        adaptOrnateVerticalLyricsPresentation('静かな夜', { lineIndex })
          .placement,
    );

    expect(placements).toEqual(Array(7).fill('right'));
  });

  it('keeps short lyrics in one visual segment', () => {
    expect(splitOrnateVerticalSegments('後悔ばかりが募って')).toEqual([
      {
        index: 0,
        sourceStart: 0,
        text: '後悔ばかりが募って',
        units: splitOrnateVerticalUnits('後悔ばかりが募って'),
      },
    ]);
  });

  it('splits a long Japanese lyric at a balanced word and particle boundary', () => {
    const segments =
      splitOrnateVerticalSegments('夜が明けるまで君を待っていた');

    expect(segments.map((segment) => segment.text)).toEqual([
      '夜が明けるまで',
      '君を待っていた',
    ]);
  });

  it('prefers authored punctuation without leaving it at the next segment', () => {
    const segments =
      splitOrnateVerticalSegments('静かな夜に、言葉を残して歩いていく');

    expect(segments.map((segment) => segment.text)).toEqual([
      '静かな夜に、',
      '言葉を残して歩いていく',
    ]);
  });

  it.each(
    [
      ['星が瞬く、', '夜が明ける。'],
      ['星が瞬く。', '夜が明ける！'],
      ['時計は 3.14、', '夜の街は静かだ。'],
      ['値は 3,141、', '夜の街は静かだ。'],
      ['星が瞬く，', '「ここ、だよ？」', '空が光る。'],
      ['星が瞬く、', '"ここだよ?"', '空が光る。'],
      ['星が瞬く、', '（風が鳴る、こわい？）', '空が光る。'],
    ].map((columns) => [columns]),
  )('keeps short punctuation-delimited phrases as columns (%j)', (columns) => {
    const text = columns.join('');
    const segments = splitOrnateVerticalSegments(text);
    expect(segments.map((column) => column.text)).toEqual(columns);
    expect(
      segments.map(({ sourceStart, text: columnText }) =>
        text.slice(sourceStart, sourceStart + columnText.length),
      ),
    ).toEqual(columns);
  });

  it('reveals opening marks with the next glyph and closing marks with the previous glyph', () => {
    const { segments } =
      adaptOrnateVerticalLyricsPresentation(
        '星が瞬く、「ここだよ？」空が光る。',
      );
    expect(segments[0].units.at(-1).text).toBe('く、');
    expect(segments[1].units[0].text).toBe('「こ');
    expect(segments[1].units.at(-1).text).toBe('よ？」');
    expect(segments[2].units.at(-1).text).toBe('る。');
  });

  it('rejects a strongly marked split when it would create an unbalanced stub', () => {
    const segments = splitOrnateVerticalSegments(
      '静かな夜、夜が明けるまで君を待っていた',
    );

    expect(segments.map((segment) => segment.text)).toEqual([
      '静かな夜、夜が明けるまで',
      '君を待っていた',
    ]);
  });

  it('does not cut a continuous Han run when no reliable boundary exists', () => {
    expect(
      splitOrnateVerticalSegments('東京国際映画祭実行委員会'),
    ).toHaveLength(1);
  });

  it('projects at most two segments with global reveal indices and one keyword', () => {
    const context = createOrnateVerticalDocumentContext([
      '夜が明けるまで後悔を抱えて歩いていく',
      '後悔だけが残っている',
    ]);
    const presentation = adaptOrnateVerticalLyricsPresentation(
      '夜が明けるまで後悔を抱えて歩いていく',
      { documentContext: context },
    );

    expect(presentation.segments).toHaveLength(2);
    expect(presentation.segments.map((segment) => segment.index)).toEqual([
      0, 1,
    ]);
    expect(
      presentation.segments.flatMap((segment) =>
        segment.units.map((unit) => unit.index),
      ),
    ).toEqual(presentation.units.map((unit) => unit.index));
    expect(
      presentation.units
        .filter((unit) => unit.emphasis === 'keyword')
        .map(({ text }) => text)
        .join(''),
    ).toBe(presentation.keyword.text);
    expect(presentation.units[presentation.keyword.index].emphasis).toBe(
      'keyword',
    );
  });
});

it('preserves a short punctuated opening as the first of three columns', () => {
  const columns = ['それでも、', '口が別の生き物に', 'なったかのように、'];
  const text = columns.join('');
  const segments = splitOrnateVerticalSegments(text);

  expect(segments.map((segment) => segment.text)).toEqual(columns);
  expect(
    segments
      .flatMap((segment) => segment.units)
      .map((unit) => unit.text)
      .join(''),
  ).toBe(text);
});

it.each([
  ['春以外どこにも行きたくない', ['春以外', 'どこにも行きたくない']],
  ['春以外旅したくないんだよね', ['春以外', '旅したくないんだよね']],
  ['星の名前を覚えてみて', ['星の名前を', '覚えてみて']],
  [
    '長い旅路を歩いたって帰れるように',
    ['長い旅路を', '歩いたって', '帰れるように'],
  ],
  ['静かな シンフォニーを聴こう', ['静かな', 'シンフォニーを聴こう']],
  ['月夜のセレナーデを聴こう', ['月夜の', 'セレナーデ', 'を聴こう']],
])('keeps short semantic columns in %s', (text, expected) => {
  expect(
    splitOrnateVerticalSegments(text).map((column) => column.text),
  ).toEqual(expected);
});

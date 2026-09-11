import { describe, expect, it } from 'vitest';

import {
  adaptOrnateVerticalLyricsPresentation,
  createOrnateVerticalDocumentContext,
  splitOrnateVerticalSegments,
  splitOrnateVerticalUnits,
} from './ornateVerticalPresentation.mjs';

describe('Ornate Vertical presentation', () => {
  it('groups continuous Han while revealing Japanese kana by grapheme', () => {
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
      repeated.units.filter((unit) => unit.emphasis === 'keyword'),
    ).toHaveLength(1);
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
      presentation.units.filter((unit) => unit.emphasis === 'keyword'),
    ).toHaveLength(1);
  });
});

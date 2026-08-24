import { describe, expect, it } from 'vitest';

import {
  preprocessLiveStageCaption,
  preprocessLyricsPresentation,
} from './lyricsPresentation.mjs';

describe('lyrics presentation preprocessing', () => {
  it('splits Japanese and Chinese whitespace as authored phrase boundaries', () => {
    expect(
      preprocessLyricsPresentation('君を泣かすから だから一緒には居れないな'),
    ).toEqual({
      transformed: true,
      bubbles: [
        { kind: 'main', text: '君を泣かすから' },
        { kind: 'main', text: 'だから一緒には居れないな' },
      ],
    });
    expect(
      preprocessLyricsPresentation('我抱著你 許願綻放的時機').bubbles,
    ).toEqual([
      { kind: 'main', text: '我抱著你' },
      { kind: 'main', text: '許願綻放的時機' },
    ]);
  });

  it('keeps ordinary Korean and Latin word spacing inside one main row', () => {
    expect(
      preprocessLyricsPresentation('투명한 네 맘이 다 보여').bubbles,
    ).toEqual([{ kind: 'main', text: '투명한 네 맘이 다 보여' }]);
    expect(preprocessLyricsPresentation('I still want you').bubbles).toEqual([
      { kind: 'main', text: 'I still want you' },
    ]);
  });

  it('extracts balanced half-width and full-width parentheticals as aside rows', () => {
    expect(
      preprocessLyricsPresentation('투명한 네 맘이 다 보여 (oh)').bubbles,
    ).toEqual([
      { kind: 'main', text: '투명한 네 맘이 다 보여' },
      { kind: 'aside', text: 'oh' },
    ]);
    expect(
      preprocessLyricsPresentation(
        'マニュアル 私だけにフォーカス （フォーカス）',
      ).bubbles,
    ).toEqual([
      { kind: 'main', text: 'マニュアル' },
      { kind: 'main', text: '私だけにフォーカス' },
      { kind: 'aside', text: 'フォーカス' },
    ]);
    expect(preprocessLyricsPresentation('(Ooh-ooh)').bubbles).toEqual([
      { kind: 'aside', text: 'Ooh-ooh' },
    ]);
    expect(preprocessLyricsPresentation('main (  echo  )').bubbles).toEqual([
      { kind: 'main', text: 'main' },
      { kind: 'aside', text: 'echo' },
    ]);
  });

  it('falls back to untouched text for unbalanced parentheses', () => {
    expect(preprocessLyricsPresentation('main (echo')).toEqual({
      transformed: false,
      bubbles: [{ kind: 'main', text: 'main (echo' }],
    });
  });

  it('bounds one lyric line to three independent bubbles while preserving all text', () => {
    const result = preprocessLyricsPresentation('一 二 三 四 五 （六）');

    expect(result.bubbles).toHaveLength(3);
    expect(result.bubbles).toEqual([
      { kind: 'main', text: '一' },
      { kind: 'main', text: '二 三 四 五' },
      { kind: 'aside', text: '六' },
    ]);
  });
});

describe('Live Stage caption preprocessing', () => {
  it('classifies a leading member marker without rendering it', () => {
    expect(
      preprocessLiveStageCaption(
        "[아사]\nBut if you're killing my mood\nGood riddance",
      ),
    ).toEqual({
      sourceText: "[아사]\nBut if you're killing my mood\nGood riddance",
      speaker: '아사',
      lines: ["But if you're killing my mood", 'Good riddance'],
      metadataOnly: false,
      transformed: true,
    });
  });

  it('treats a marker-only cue as hidden metadata instead of a blank caption', () => {
    expect(preprocessLiveStageCaption('[리즈]')).toMatchObject({
      sourceText: '[리즈]',
      speaker: '리즈',
      lines: [],
      metadataOnly: true,
      transformed: true,
    });
  });

  it('preserves literal brackets that are not a leading speaker marker', () => {
    expect(preprocessLiveStageCaption('A [B]')).toMatchObject({
      speaker: '',
      lines: ['A [B]'],
      metadataOnly: false,
      transformed: false,
    });
  });

  it('keeps short captions on one row and balances longer captions into two compact rows', () => {
    const short = preprocessLiveStageCaption('一二三四五六七');
    const cjk = preprocessLiveStageCaption('一二三四五六七八九十甲乙');
    const mixed = preprocessLiveStageCaption('Real live 바람을 타고 먼저');

    expect(short.lines).toEqual(['一二三四五六七']);
    expect(cjk.lines).toEqual(['一二三四五六', '七八九十甲乙']);
    expect(mixed.lines).toEqual(['Real live', '바람을 타고 먼저']);
  });

  it('bounds authored and unusually long captions to two complete presentation lines', () => {
    const authored = preprocessLiveStageCaption('first\nsecond\nthird');
    const balanced = preprocessLiveStageCaption(
      'Every word remains visible even when a single authored row is unusually long',
    );

    expect(authored.lines).toEqual(['first', 'second third']);
    expect(balanced.lines).toHaveLength(2);
    expect(balanced.lines.join(' ')).toBe(
      'Every word remains visible even when a single authored row is unusually long',
    );
  });
});

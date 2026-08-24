import { describe, expect, it } from 'vitest';

import { preprocessLyricsPresentation } from './lyricsPresentation.mjs';

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

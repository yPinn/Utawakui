import { describe, expect, it } from 'vitest';

import {
  adaptKtvLyricsPresentation,
  adaptLiveStageLyricsPresentation,
  adaptMangaLyricsPresentation,
  analyzeLyricsSource,
} from './lyricsPresentation.mjs';

function mangaPresentation(text, options = {}) {
  return adaptMangaLyricsPresentation(analyzeLyricsSource(text), options);
}

function liveStagePresentation(text, options = {}) {
  return adaptLiveStageLyricsPresentation(analyzeLyricsSource(text), options);
}

function ktvPresentation(text) {
  return adaptKtvLyricsPresentation(analyzeLyricsSource(text));
}

describe('shared lyrics source analysis', () => {
  it('extracts speaker metadata and source-mapped semantic units without deleting text', () => {
    const sourceText = "[리즈] 내 답이야 (That's my style)";
    const analysis = analyzeLyricsSource(sourceText);

    expect(analysis).toMatchObject({
      sourceText,
      speaker: '리즈',
      malformedParenthetical: false,
    });
    expect(
      analysis.units.map(({ kind, text, fillerCandidate }) => ({
        kind,
        text,
        fillerCandidate,
      })),
    ).toEqual([
      { kind: 'main', text: '내 답이야', fillerCandidate: false },
      {
        kind: 'parenthetical',
        text: "That's my style",
        fillerCandidate: false,
      },
    ]);
    for (const unit of analysis.units) {
      expect(sourceText.slice(unit.sourceStart, unit.sourceEnd)).toBe(
        unit.sourceText,
      );
    }
  });

  it('marks but does not remove standalone fillers and repeated phrases', () => {
    const analysis = analyzeLyricsSource('Oh, Kitsch kitsch, kitsch');

    expect(analysis.sourceText).toBe('Oh, Kitsch kitsch, kitsch');
    expect(analysis.units.map((unit) => unit.text)).toEqual([
      'Oh,',
      'Kitsch kitsch,',
      'kitsch',
    ]);
    expect(analysis.units[0].fillerCandidate).toBe(true);
    expect(analysis.units.slice(1).map((unit) => unit.repeatKey)).toEqual([
      'kitsch kitsch',
      'kitsch',
    ]);
  });
});

describe('lyrics presentation preprocessing', () => {
  it('keeps one normalized LRC row intact while exposing analyzer phrase boundaries to KTV', () => {
    expect(
      ktvPresentation('[男] 風箏在陰天擱淺，卻無法掩埋歉疚'),
    ).toMatchObject({
      sourceText: '[男] 風箏在陰天擱淺，卻無法掩埋歉疚',
      text: '風箏在陰天擱淺，卻無法掩埋歉疚',
      speaker: '男',
      role: 'male',
      phrases: ['風箏在陰天擱淺，', '卻無法掩埋歉疚'],
    });
  });

  it('maps only explicit KTV vocal labels and defaults unknown or solo rows to blue', () => {
    expect(ktvPresentation('[女]她的歌詞')).toMatchObject({
      text: '她的歌詞',
      role: 'female',
    });
    expect(ktvPresentation('[合] 一起唱')).toMatchObject({
      text: '一起唱',
      role: 'group',
    });
    expect(ktvPresentation('[主唱] 保留安全預設')).toMatchObject({
      text: '保留安全預設',
      role: 'solo',
    });
    expect(ktvPresentation('沒有標記的單人歌曲')).toMatchObject({
      text: '沒有標記的單人歌曲',
      role: 'solo',
    });
  });

  it('splits Japanese and Chinese whitespace as authored phrase boundaries', () => {
    expect(
      mangaPresentation('君を泣かすから だから一緒には居れないな'),
    ).toEqual({
      transformed: true,
      bubbles: [
        { kind: 'main', text: '君を泣かすから' },
        { kind: 'main', text: 'だから一緒には居れないな' },
      ],
    });
    expect(mangaPresentation('我抱著你 許願綻放的時機').bubbles).toEqual([
      { kind: 'main', text: '我抱著你' },
      { kind: 'main', text: '許願綻放的時機' },
    ]);
  });

  it('keeps ordinary Korean and Latin word spacing inside one main row', () => {
    expect(mangaPresentation('투명한 네 맘이 다 보여').bubbles).toEqual([
      { kind: 'main', text: '투명한 네 맘이 다 보여' },
    ]);
    expect(mangaPresentation('I still want you').bubbles).toEqual([
      { kind: 'main', text: 'I still want you' },
    ]);
  });

  it('extracts balanced half-width and full-width parentheticals as aside rows', () => {
    expect(mangaPresentation('투명한 네 맘이 다 보여 (oh)').bubbles).toEqual([
      { kind: 'main', text: '투명한 네 맘이 다 보여' },
      { kind: 'aside', text: 'oh' },
    ]);
    expect(
      mangaPresentation('マニュアル 私だけにフォーカス （フォーカス）').bubbles,
    ).toEqual([
      { kind: 'main', text: 'マニュアル' },
      { kind: 'main', text: '私だけにフォーカス' },
      { kind: 'aside', text: 'フォーカス' },
    ]);
    expect(mangaPresentation('(Ooh-ooh)').bubbles).toEqual([
      { kind: 'aside', text: 'Ooh-ooh' },
    ]);
    expect(mangaPresentation('main (  echo  )').bubbles).toEqual([
      { kind: 'main', text: 'main' },
      { kind: 'aside', text: 'echo' },
    ]);
  });

  it('falls back to untouched text for unbalanced parentheses', () => {
    expect(mangaPresentation('main (echo')).toMatchObject({
      transformed: false,
      bubbles: [{ kind: 'main', text: 'main (echo' }],
    });
  });

  it('bounds one lyric line to three independent bubbles while preserving all text', () => {
    const result = mangaPresentation('一 二 三 四 五 （六）');

    expect(result.bubbles).toHaveLength(3);
    expect(result.bubbles).toEqual([
      { kind: 'main', text: '一' },
      { kind: 'main', text: '二 三 四 五' },
      { kind: 'aside', text: '六' },
    ]);
  });
});

describe('Live Stage caption preprocessing', () => {
  it.each([
    {
      name: 'authored broadcast rows',
      source: "[아사]\nBut if you're killing my mood\nGood riddance",
      expected: ["But if you're killing my mood", 'Good riddance'],
    },
    {
      name: 'Korean word flow',
      source: '[리즈] 네가 보낸 DM을 읽고 나서 답이 없는 게',
      expected: ['네가 보낸 DM을', '읽고 나서 답이 없는 게'],
    },
    {
      name: 'balanced Korean phrase',
      source: '[유진] 그런 것들에는 좀 점수를 매기지 마',
      expected: ['그런 것들에는 좀', '점수를 매기지 마'],
    },
    {
      name: 'Korean dependent phrase within short-first geometry',
      source: '[이서] 난 생겨 먹은 대로 사는 애야,',
      expected: ['난 생겨 먹은', '대로 사는 애야'],
    },
    {
      name: 'punctuation-led asymmetric rows',
      source: '난 잘 살아, 내 걱정은 낭비야',
      expected: ['난 잘 살아', '내 걱정은 낭비야'],
    },
    {
      name: 'script transition',
      source: 'Real live 바람을 타고 먼저',
      expected: ['Real live', '바람을 타고 먼저'],
    },
    {
      name: 'substantial Korean to English switch',
      source: "우리만의 자유로운 Nineteen's Kitsch",
      expected: ['우리만의 자유로운', "Nineteen's Kitsch"],
    },
    {
      name: 'substantial Korean to short English switch',
      source: '지금까지 한 적 없는 Custom fit',
      expected: ['지금까지 한 적', '없는 Custom fit'],
    },
    {
      name: 'mixed Korean and English modifier phrase',
      source: '[이서] 올려 대는 나의 Feed에는 like it',
      expected: ['올려 대는', '나의 Feed에는 like it'],
    },
    {
      name: 'short-first English phrase',
      source: 'My favorite things',
      expected: ['My', 'favorite things'],
    },
    {
      name: 'parenthetical response',
      source: "내 답이야 (That's my style)",
      expected: ['내 답이야', "(That's my style)"],
    },
    {
      name: 'unspaced CJK balance',
      source: '一二三四五六七八九十甲乙',
      expected: ['一二三四五六', '七八九十甲乙'],
    },
  ])('applies the complete two-line layout model to $name', (sample) => {
    const result = liveStagePresentation(sample.source, {
      lineProgress: 0.5,
    });

    expect(result.lines).toEqual(sample.expected);
    expect(result.pages).toHaveLength(1);
    expect(result.pageBreakProgresses).toEqual([]);
  });

  it('classifies a leading member marker without rendering it', () => {
    expect(
      liveStagePresentation(
        "[아사]\nBut if you're killing my mood\nGood riddance",
      ),
    ).toMatchObject({
      sourceText: "[아사]\nBut if you're killing my mood\nGood riddance",
      speaker: '아사',
      lines: ["But if you're killing my mood", 'Good riddance'],
      metadataOnly: false,
      transformed: true,
    });
  });

  it('treats a marker-only cue as hidden metadata instead of a blank caption', () => {
    expect(liveStagePresentation('[리즈]')).toMatchObject({
      sourceText: '[리즈]',
      speaker: '리즈',
      lines: [],
      metadataOnly: true,
      transformed: true,
    });
  });

  it('preserves literal brackets that are not a leading speaker marker', () => {
    expect(liveStagePresentation('A [B]')).toMatchObject({
      speaker: '',
      lines: ['A [B]'],
      metadataOnly: false,
      transformed: false,
    });
  });

  it('keeps short captions on one row and balances longer captions into two compact rows', () => {
    const short = liveStagePresentation('一二三四五六七');
    const cjk = liveStagePresentation('一二三四五六七八九十甲乙');
    const mixed = liveStagePresentation('Real live 바람을 타고 먼저');

    expect(short.lines).toEqual(['一二三四五六七']);
    expect(cjk.lines).toEqual(['一二三四五六', '七八九十甲乙']);
    expect(mixed.lines).toEqual(['Real live', '바람을 타고 먼저']);
    expect(liveStagePresentation('[이서] 뭘 더 바래?').lines).toEqual([
      '뭘',
      '더 바래',
    ]);
  });

  it('keeps a short first row and a readable longer second row together', () => {
    const sourceText = '난 잘 살아, 내 걱정은 낭비야';
    const result = liveStagePresentation(sourceText, { lineProgress: 0.9 });

    expect(result).toMatchObject({
      sourceText,
      lines: ['난 잘 살아', '내 걱정은 낭비야'],
      pageIndex: 0,
      pageBreakProgresses: [],
    });
    expect(result.pages).toHaveLength(1);
  });

  it("uses the broadcast phrase boundary for I'm on my way before advancing to the next lyric", () => {
    const sourceText = "[유진]\nI'm on my way,\n보이는 그대로야";
    const first = liveStagePresentation(sourceText, { lineProgress: 0.1 });
    const second = liveStagePresentation(sourceText, { lineProgress: 0.9 });

    expect(first).toMatchObject({
      sourceText,
      speaker: '유진',
      lines: ["I'm", 'on my way'],
      pageIndex: 0,
    });
    expect(second.lines).toEqual(['보이는 그대로야']);
    expect(second.pageIndex).toBe(1);
  });

  it('bounds authored and unusually long captions to two complete presentation lines', () => {
    const authored = liveStagePresentation('first\nsecond\nthird');
    const balanced = liveStagePresentation(
      'Every word remains visible even when a single authored row is unusually long',
    );

    expect(authored.lines).toEqual(['first', 'second third']);
    expect(balanced.lines).toHaveLength(2);
    expect(balanced.lines.join(' ')).toBe(
      'Every word remains visible even when a single authored row is unusually long',
    );
  });

  it('suppresses Live Stage fillers and consecutive repeats without changing source text', () => {
    expect(liveStagePresentation('Oh, what a good time')).toMatchObject({
      sourceText: 'Oh, what a good time',
      lines: ['What a', 'good time'],
    });
    expect(liveStagePresentation('Kitsch kitsch, kitsch')).toMatchObject({
      sourceText: 'Kitsch kitsch, kitsch',
      lines: ['Kitsch'],
    });
    expect(liveStagePresentation('Kitsch, kitsch')).toMatchObject({
      sourceText: 'Kitsch, kitsch',
      lines: ['Kitsch'],
    });
  });

  it('cleans Korean presentation punctuation without changing source text', () => {
    expect(liveStagePresentation('멈추지 마,')).toMatchObject({
      sourceText: '멈추지 마,',
      lines: ['멈추지 마'],
    });
    expect(liveStagePresentation('[이서] 뭘 더 바래?')).toMatchObject({
      sourceText: '[이서] 뭘 더 바래?',
      lines: ['뭘', '더 바래'],
    });
    expect(liveStagePresentation('난 잘 살아, 내 걱정은 낭비야').lines).toEqual(
      ['난 잘 살아', '내 걱정은 낭비야'],
    );
    expect(liveStagePresentation('기다려...').lines).toEqual(['기다려']);
    expect(liveStagePresentation("Don't stop!").lines).toEqual(["Don't stop!"]);
    expect(liveStagePresentation('Wait, please!').lines).toEqual([
      'Wait,',
      'please!',
    ]);
    expect(liveStagePresentation("응답 (That's my style!)").lines).toEqual([
      '응답',
      "(That's my style!)",
    ]);
  });

  it('keeps a distinct parenthetical on its own row and removes a duplicate echo', () => {
    expect(liveStagePresentation("내 답이야 (That's my style)")).toMatchObject({
      lines: ['내 답이야', "(That's my style)"],
    });
    expect(
      liveStagePresentation("That's my style (that's my style, ah)"),
    ).toMatchObject({
      lines: ["That's", 'my style'],
    });
  });

  it('paginates a long synced sentence into two compact outputs', () => {
    const first = liveStagePresentation(
      'Every little signal should leave the middle of the stage completely visible',
      { lineProgress: 0.1 },
    );
    const second = liveStagePresentation(first.sourceText, {
      lineProgress: 0.9,
    });

    expect(first.pages).toHaveLength(2);
    expect(first.pageIndex).toBe(0);
    expect(second.pageIndex).toBe(1);
    expect(first.lines).toEqual(first.pages[0].lines);
    expect(second.lines).toEqual(second.pages[1].lines);
    expect(first.pages.flatMap((page) => page.lines).join(' ')).toBe(
      first.sourceText,
    );
    expect(first).not.toHaveProperty('lengthTier');
    expect(second).not.toHaveProperty('lengthTier');
  });
});

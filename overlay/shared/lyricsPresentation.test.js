import { describe, expect, it, vi } from 'vitest';

import {
  adaptKtvLyricsPresentation,
  adaptKineticPopLyricsPresentation,
  adaptLiveStageLyricsPresentation,
  adaptMangaLyricsPresentation,
  analyzeLyricsSource,
  compileLyricsPresentationDocument,
  createLyricsPresentationDocumentCache,
  lyricsPresentationProfileForTemplate,
  parseKtvDisplayPhrases,
} from './lyricsPresentation.mjs';

function mangaPresentation(text, options = {}) {
  return adaptMangaLyricsPresentation(analyzeLyricsSource(text), options);
}

function visibleMangaBubbles(text, options = {}) {
  return mangaPresentation(text, options).bubbles.map(({ kind, text }) => ({
    kind,
    text,
  }));
}

function liveStagePresentation(text, options = {}) {
  return adaptLiveStageLyricsPresentation(analyzeLyricsSource(text), options);
}

function liveStageVisualWidth(value) {
  return Array.from(value).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.35;
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(character)) {
      return total + 1;
    }
    if (/[,，、。！？!?;；:：()（）'’]/u.test(character)) {
      return total + 0.35;
    }
    return total + 0.55;
  }, 0);
}

const JAPANESE_NEGATIVE_TO_SAMPLES = [
  {
    name: 'Japanese negative clause and quotative particle',
    source: '忘れられないと泣くくらいなら',
    expected: ['忘れられないと', '泣くくらいなら'],
  },
  {
    name: 'Japanese spaced negative clause and quotative particle',
    source: '忘れられない と 泣くくらいなら',
    expected: ['忘れられない と', '泣くくらいなら'],
  },
  {
    name: 'Japanese past negative clause and quotative particle',
    source: '忘れられなかったと泣くくらいなら',
    expected: ['忘れられなかったと', '泣くくらいなら'],
  },
  {
    name: 'Japanese polite negative clause and quotative particle',
    source: '忘れられませんと泣くくらいなら',
    expected: ['忘れられませんと', '泣くくらいなら'],
  },
  {
    name: 'Japanese polite past negative clause and quotative particle',
    source: '忘れられませんでしたと泣くくらいなら',
    expected: ['忘れられませんでしたと', '泣くくらいなら'],
  },
  {
    name: 'Japanese literary negative clause and quotative particle',
    source: '忘れられぬと泣くくらいなら',
    expected: ['忘れられぬと', '泣くくらいなら'],
  },
];

function ktvPresentation(text) {
  return adaptKtvLyricsPresentation(analyzeLyricsSource(text));
}

describe('template semantic source analysis', () => {
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

  it('does not duplicate generic grapheme or word streams in template analysis', () => {
    const sourceText = '  [女] 雨の song!  ';
    const analysis = analyzeLyricsSource(sourceText);

    expect(analysis.sourceText).toBe(sourceText);
    expect(analysis).not.toHaveProperty('graphemes');
    expect(analysis).not.toHaveProperty('words');
  });
});

describe('lyrics presentation profiles', () => {
  const document = {
    documentId: 'lyrics-1',
    documentRevision: 7,
    language: 'zh-Hant',
    lines: [
      { text: '[女] 雨下整夜 我的愛溢出就像雨水', startMs: 0, endMs: 8000 },
    ],
  };

  it.each([
    ['focus-line', 'generic-caption', true],
    ['quiet-caption', 'generic-caption', true],
    ['karaoke-stack', 'classic-ktv', true],
    ['kinetic-pop', 'kinetic-pop', true],
    ['ornate-vertical', 'ornate-vertical', true],
    ['manga-frame', 'manga-frame', true],
    ['live-stage', 'live-stage', true],
    ['reading-aid', 'reading-aid', false],
  ])(
    'maps %s to its versioned presentation profile',
    (templateId, id, available) => {
      expect(lyricsPresentationProfileForTemplate(templateId)).toMatchObject({
        id,
        version: 1,
        available,
      });
    },
  );

  it('compiles only the selected template semantic customization', () => {
    const compiled = compileLyricsPresentationDocument(document, {
      templateId: 'karaoke-stack',
    });

    expect(compiled).toMatchObject({
      documentId: 'lyrics-1',
      documentRevision: 7,
      language: 'zh-Hant',
      profile: { id: 'classic-ktv', version: 1 },
    });
    expect(compiled.lines[0].analysis.sourceText).toBe(document.lines[0].text);
    expect(compiled.lines[0].presentation).toMatchObject({
      role: 'female',
      text: '雨下整夜 我的愛溢出就像雨水',
    });
    expect(
      compiled.lines[0].presentation.phrases.map((phrase) => phrase.text),
    ).toEqual(['雨下整夜', '我的愛溢出就像雨水']);
    expect(compiled.lines[0].presentation).not.toHaveProperty('bubbles');
    expect(document.lines[0]).not.toHaveProperty('analysis');
  });

  it('compiles generic, manga, and live-stage customization independently', () => {
    const generic = compileLyricsPresentationDocument(document, {
      templateId: 'focus-line',
    });
    const manga = compileLyricsPresentationDocument(document, {
      templateId: 'manga-frame',
    });
    const liveStage = compileLyricsPresentationDocument(document, {
      templateId: 'live-stage',
    });

    expect(generic.lines[0].presentation).toEqual({
      sourceText: document.lines[0].text,
      text: document.lines[0].text,
    });
    expect(generic.lines[0]).not.toHaveProperty('analysis');
    expect(manga.lines[0].presentation).toHaveProperty('bubbles');
    expect(manga.lines[0]).toHaveProperty('analysis');
    expect(liveStage.lines[0].presentation).toHaveProperty('pages');
    expect(liveStage.lines[0]).toHaveProperty('analysis');
  });

  it('compiles the selected Live Stage presentation policy without changing the source', () => {
    const compact = compileLyricsPresentationDocument(document, {
      templateId: 'live-stage',
    });
    const balanced = compileLyricsPresentationDocument(document, {
      lyricsPresentationPolicyId: 'balanced',
      templateId: 'live-stage',
    });

    expect(compact.presentationPolicy).toEqual({
      id: 'broadcast-compact',
      version: 1,
    });
    expect(balanced.presentationPolicy).toEqual({ id: 'balanced', version: 1 });
    expect(balanced.lines[0].sourceText).toBe(document.lines[0].text);
    expect(balanced.lines[0].presentation.presentationPolicy).toEqual({
      id: 'balanced',
      version: 1,
    });
  });

  it('compiles the ornate vertical document with shared repetition evidence', () => {
    const compiled = compileLyricsPresentationDocument(
      {
        documentId: 'ornate-lyrics',
        documentRevision: 2,
        language: 'ja',
        lines: [
          { text: '後悔ばかりが募って' },
          { text: '深い後悔だけ残る' },
          { text: 'あしたまで' },
          { text: '夜が明けるまで後悔を抱えて歩いていく' },
        ],
      },
      { templateId: 'ornate-vertical' },
    );

    expect(compiled.profile).toMatchObject({
      id: 'ornate-vertical',
      version: 1,
      available: true,
    });
    expect(compiled.lines[0].presentation).toMatchObject({
      keyword: { index: 0, text: '後悔' },
      placement: 'right',
    });
    expect(compiled.lines[1].presentation).toMatchObject({
      keyword: { text: '後悔' },
      placement: 'right',
    });
    expect(compiled.lines[2].presentation).toMatchObject({
      keyword: null,
      placement: 'right',
    });
    expect(
      compiled.lines[3].presentation.segments.map((segment) => segment.text),
    ).toEqual(['夜が明けるまで後悔を', '抱えて歩いていく']);
    expect(compiled.lines[0]).not.toHaveProperty('analysis');
  });

  it('defaults kinetic lines to material two and supports fixed or sequential material selection', () => {
    expect(
      adaptKineticPopLyricsPresentation('すてっぷ！', {
        lineIndex: 2,
      }),
    ).toEqual({
      sourceText: 'すてっぷ！',
      text: 'すてっぷ！',
      displayText: 'すてっぷ！',
      phrases: [
        {
          sourceStart: 0,
          sourceEnd: 5,
          text: 'すてっぷ！',
          units: [
            { text: 'す', weight: 1 },
            { text: 'て', weight: 1 },
            { text: 'っ', weight: 1 },
            { text: 'ぷ！', weight: 1 },
          ],
          weight: 4,
        },
      ],
      phraseIndex: null,
      phraseBreakProgresses: [],
      material: 'candy-rim',
      composition: 'punch',
      units: [
        { text: 'す', weight: 1 },
        { text: 'て', weight: 1 },
        { text: 'っ', weight: 1 },
        { text: 'ぷ！', weight: 1 },
      ],
      rows: [
        {
          text: 'すてっぷ！',
          units: [
            { text: 'す', weight: 1 },
            { text: 'て', weight: 1 },
            { text: 'っ', weight: 1 },
            { text: 'ぷ！', weight: 1 },
          ],
        },
      ],
    });

    expect(
      adaptKineticPopLyricsPresentation('知りもせずに意味を美意識だと崇める', {
        lineIndex: 2,
        kineticMaterial: 'chromatic-depth',
      }),
    ).toMatchObject({
      material: 'chromatic-depth',
      composition: 'caption',
    });

    expect(
      [0, 1, 2, 3].map(
        (lineIndex) =>
          adaptKineticPopLyricsPresentation('文字', {
            lineIndex,
            kineticMaterial: 'cycle',
          }).material,
      ),
    ).toEqual([
      'solid-outline',
      'candy-rim',
      'chromatic-depth',
      'solid-outline',
    ]);

    expect(
      adaptKineticPopLyricsPresentation('文字', {
        lineIndex: 0,
        kineticMaterial: 'unsupported-value',
      }).material,
    ).toBe('candy-rim');

    expect(
      adaptKineticPopLyricsPresentation('「キャット！」すてっぷ。').units,
    ).toEqual([
      { text: '「キ', weight: 1 },
      { text: 'ャ', weight: 1 },
      { text: 'ッ', weight: 1 },
      { text: 'ト！」', weight: 1 },
      { text: 'す', weight: 1 },
      { text: 'て', weight: 1 },
      { text: 'っ', weight: 1 },
      { text: 'ぷ。', weight: 1 },
    ]);

    expect(
      adaptKineticPopLyricsPresentation('', { phraseIndex: 0 }).phraseIndex,
    ).toBeNull();
  });

  it('uses authored whitespace as sequential Kinetic Pop phrases while keeping one horizontal row', () => {
    const authored =
      adaptKineticPopLyricsPresentation('何千回の夜を\n過ごしたって');
    const sourceText = 'いつでも僕らはこんな風に ぼんくらな夜に飽き飽き';
    const overview = adaptKineticPopLyricsPresentation(sourceText);
    const firstPhrase = adaptKineticPopLyricsPresentation(sourceText, {
      lineProgress: 0.5,
    });
    const secondPhrase = adaptKineticPopLyricsPresentation(sourceText, {
      lineProgress: 0.6,
    });
    const unspaced = adaptKineticPopLyricsPresentation(
      'いつでも僕らはこんな風にぼんくらな夜に飽き飽き',
    );

    expect(authored.sourceText).toBe('何千回の夜を\n過ごしたって');
    expect(authored.text).toBe('何千回の夜を 過ごしたって');
    expect(overview.rows.map((row) => row.text)).toEqual([sourceText]);
    expect(overview.phrases.map((phrase) => phrase.text)).toEqual([
      'いつでも僕らはこんな風に',
      'ぼんくらな夜に飽き飽き',
    ]);
    expect(overview.phraseBreakProgresses).toEqual([12 / 23]);
    expect(overview.phraseIndex).toBeNull();
    expect(firstPhrase.phraseIndex).toBe(0);
    expect(firstPhrase.displayText).toBe('いつでも僕らはこんな風に');
    expect(firstPhrase.rows.map((row) => row.text)).toEqual([
      'いつでも僕らはこんな風に',
    ]);
    expect(secondPhrase.phraseIndex).toBe(1);
    expect(secondPhrase.displayText).toBe('ぼんくらな夜に飽き飽き');
    expect(secondPhrase.rows.map((row) => row.text)).toEqual([
      'ぼんくらな夜に飽き飽き',
    ]);
    expect(unspaced.rows.map((row) => row.text)).toEqual([
      'いつでも僕らはこんな風にぼんくらな夜に飽き飽き',
    ]);
    expect(
      unspaced.rows.flatMap((row) => row.units).map((unit) => unit.text),
    ).toContain('風');
    expect(unspaced.rows).toHaveLength(1);
  });

  it('caches static compilation by document revision, language, and profile', () => {
    const compile = vi.fn(compileLyricsPresentationDocument);
    const cache = createLyricsPresentationDocumentCache({ compile });

    const first = cache.get(document, { templateId: 'focus-line' });
    const sameIdentity = cache.get(
      { ...document, lines: document.lines.map((line) => ({ ...line })) },
      { templateId: 'quiet-caption' },
    );
    const ktv = cache.get(document, { templateId: 'karaoke-stack' });
    const revised = cache.get(
      { ...document, documentRevision: 8 },
      { templateId: 'focus-line' },
    );

    expect(sameIdentity).toBe(first);
    expect(ktv).not.toBe(first);
    expect(revised).not.toBe(first);
    expect(compile).toHaveBeenCalledTimes(3);
  });

  it('invalidates kinetic compilation when the selected material changes', () => {
    const compile = vi.fn(compileLyricsPresentationDocument);
    const cache = createLyricsPresentationDocumentCache({ compile });

    const candy = cache.get(document, {
      templateId: 'kinetic-pop',
      kineticMaterial: 'candy-rim',
    });
    const sameCandy = cache.get(document, {
      templateId: 'kinetic-pop',
      kineticMaterial: 'candy-rim',
    });
    const chromatic = cache.get(document, {
      templateId: 'kinetic-pop',
      kineticMaterial: 'chromatic-depth',
    });

    expect(sameCandy).toBe(candy);
    expect(chromatic).not.toBe(candy);
    expect(compile).toHaveBeenCalledTimes(2);
  });

  it('invalidates Live Stage compilation when the presentation policy changes', () => {
    const compile = vi.fn(compileLyricsPresentationDocument);
    const cache = createLyricsPresentationDocumentCache({ compile });

    const compact = cache.get(document, {
      lyricsPresentationPolicyId: 'broadcast-compact',
      templateId: 'live-stage',
    });
    const sameCompact = cache.get(document, {
      lyricsPresentationPolicyId: 'broadcast-compact',
      templateId: 'live-stage',
    });
    const literal = cache.get(document, {
      lyricsPresentationPolicyId: 'literal',
      templateId: 'live-stage',
    });

    expect(sameCompact).toBe(compact);
    expect(literal).not.toBe(compact);
    expect(compile).toHaveBeenCalledTimes(2);
  });

  it('bypasses unstable identities and bounds or clears cached revisions', () => {
    const compile = vi.fn(compileLyricsPresentationDocument);
    const cache = createLyricsPresentationDocumentCache({
      compile,
      maxEntries: 1,
    });
    const unstable = { language: 'en', lines: [{ text: 'plain' }] };

    expect(cache.get(unstable)).not.toBe(cache.get(unstable));
    cache.get(document, { templateId: 'focus-line' });
    cache.get(
      { ...document, documentId: 'lyrics-2' },
      { templateId: 'focus-line' },
    );
    cache.get(document, { templateId: 'focus-line' });
    cache.clear();
    cache.get(document, { templateId: 'focus-line' });

    expect(compile).toHaveBeenCalledTimes(6);
  });
});

describe('lyrics presentation preprocessing', () => {
  it('turns authored Chinese spacing into sequential KTV display phrases', () => {
    expect(
      parseKtvDisplayPhrases(
        analyzeLyricsSource('雨下整夜 我的愛溢出就像雨水'),
        { language: 'zh-Hant' },
      ).map(({ text }) => text),
    ).toEqual(['雨下整夜', '我的愛溢出就像雨水']);

    expect(
      parseKtvDisplayPhrases(
        analyzeLyricsSource('幾句是非，也無法將我的熱情冷卻'),
        { language: 'zh-Hant' },
      ).map(({ text }) => text),
    ).toEqual(['幾句是非，', '也無法將我的熱情冷卻']);
  });

  it('keeps low-confidence Latin and unmarked short CJK rows intact', () => {
    expect(
      parseKtvDisplayPhrases(analyzeLyricsSource('I still want you'), {
        language: 'en',
      }).map(({ text }) => text),
    ).toEqual(['I still want you']);
    expect(
      parseKtvDisplayPhrases(analyzeLyricsSource('窗外的麻雀'), {
        language: 'zh-Hant',
      }).map(({ text }) => text),
    ).toEqual(['窗外的麻雀']);
  });

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
      visibleMangaBubbles('君を泣かすから だから一緒には居れないな'),
    ).toEqual([
      { kind: 'main', text: '君を泣かすから' },
      { kind: 'main', text: 'だから一緒には居れないな' },
    ]);
    expect(visibleMangaBubbles('我抱著你 許願綻放的時機')).toEqual([
      { kind: 'main', text: '我抱著你' },
      { kind: 'main', text: '許願綻放的時機' },
    ]);
    expect(
      mangaPresentation('地下鉄に 飲み込まれる').bubbles.map(
        ({ sourceRanges }) => sourceRanges,
      ),
    ).toEqual([[{ start: 0, end: 4 }], [{ start: 5, end: 11 }]]);
  });

  it('projects adjacent matched Japanese quoted clauses as independent bubbles', () => {
    const first = '「アンタちょっと問題がある」';
    const second = '「アンタちょっと問題よ」';
    const result = mangaPresentation(`${first}${second}`, { language: 'ja' });

    expect(result.transformed).toBe(true);
    expect(result.bubbles).toEqual([
      {
        kind: 'main',
        text: first,
        sourceRanges: [{ start: 0, end: first.length }],
      },
      {
        kind: 'main',
        text: second,
        sourceRanges: [
          { start: first.length, end: first.length + second.length },
        ],
      },
    ]);
  });

  it('keeps trailing sentence punctuation with the preceding quoted bubble', () => {
    const first = '「本当だ」。';
    const second = '「次だ」';
    const result = mangaPresentation(`${first}${second}`, { language: 'ja' });

    expect(result.bubbles).toEqual([
      {
        kind: 'main',
        text: first,
        sourceRanges: [{ start: 0, end: first.length }],
      },
      {
        kind: 'main',
        text: second,
        sourceRanges: [
          { start: first.length, end: first.length + second.length },
        ],
      },
    ]);
  });

  it('does not treat a Latin curly apostrophe as a Manga quote boundary', () => {
    const result = mangaPresentation('I’m「本当」「次」', { language: 'ja' });

    expect(result.bubbles).toEqual([
      {
        kind: 'main',
        text: 'I’m',
        sourceRanges: [{ start: 0, end: 3 }],
      },
      {
        kind: 'main',
        text: '「本当」',
        sourceRanges: [{ start: 3, end: 7 }],
      },
      {
        kind: 'main',
        text: '「次」',
        sourceRanges: [{ start: 7, end: 10 }],
      },
    ]);
  });

  it('keeps a malformed Japanese quoted clause in one conservative bubble', () => {
    for (const text of [
      '「アンタちょっと問題がある',
      '「正常」「未閉じ',
      '「正常」余分」',
      '「入れ子『錯配」だ』',
    ]) {
      expect(mangaPresentation(text, { language: 'ja' })).toMatchObject({
        transformed: false,
        bubbles: [{ kind: 'main', text }],
      });
    }
  });

  it('keeps ordinary Korean and Latin word spacing inside one main row', () => {
    expect(visibleMangaBubbles('투명한 네 맘이 다 보여')).toEqual([
      { kind: 'main', text: '투명한 네 맘이 다 보여' },
    ]);
    expect(visibleMangaBubbles('I still want you')).toEqual([
      { kind: 'main', text: 'I still want you' },
    ]);
  });

  it('extracts balanced half-width and full-width parentheticals as aside rows', () => {
    expect(visibleMangaBubbles('투명한 네 맘이 다 보여 (oh)')).toEqual([
      { kind: 'main', text: '투명한 네 맘이 다 보여' },
      { kind: 'aside', text: 'oh' },
    ]);
    expect(
      visibleMangaBubbles('マニュアル 私だけにフォーカス （フォーカス）'),
    ).toEqual([
      { kind: 'main', text: 'マニュアル' },
      { kind: 'main', text: '私だけにフォーカス' },
      { kind: 'aside', text: 'フォーカス' },
    ]);
    expect(visibleMangaBubbles('(Ooh-ooh)')).toEqual([
      { kind: 'aside', text: 'Ooh-ooh' },
    ]);
    expect(visibleMangaBubbles('main (  echo  )')).toEqual([
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
    expect(result.bubbles.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: 'main', text: '一' },
      { kind: 'main', text: '二 三 四 五' },
      { kind: 'aside', text: '六' },
    ]);
  });
});

describe('Live Stage caption preprocessing', () => {
  it('keeps content handling selectable without changing timing or source text', () => {
    const sourceText = 'Oh, Kitsch, kitsch';
    const compact = liveStagePresentation(sourceText);
    const balanced = liveStagePresentation(sourceText, {
      lyricsPresentationPolicyId: 'balanced',
    });
    const literal = liveStagePresentation('first\nsecond', {
      lyricsPresentationPolicyId: 'literal',
    });

    expect(compact).toMatchObject({
      sourceText,
      lines: ['Kitsch'],
      presentationPolicy: { id: 'broadcast-compact', version: 1 },
    });
    expect(balanced).toMatchObject({
      sourceText,
      presentationPolicy: { id: 'balanced', version: 1 },
    });
    expect(balanced.pages.flatMap((page) => page.lines).join(' ')).toBe(
      sourceText,
    );
    expect(literal).toMatchObject({
      sourceText: 'first\nsecond',
      lines: ['first', 'second'],
      presentationPolicy: { id: 'literal', version: 1 },
    });
  });

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
      name: 'joined Traditional Chinese and English phrase',
      source: '我從未改變想展現的maybe I know',
      expected: ['我從未改變', '想展現的maybe I know'],
    },
    {
      name: 'Traditional Chinese predicate phrase',
      source: '初戀的香味就這樣被我們尋回',
      expected: ['初戀的香味', '就這樣被我們尋回'],
    },
    {
      name: 'Japanese words and attached particles',
      source: '声も顔も不器用なとこも',
      expected: ['声も顔も', '不器用なとこも'],
    },
    {
      name: 'joined English and Traditional Chinese phrase',
      source: 'Real love讓我們重新找回勇氣',
      expected: ['Real love', '讓我們重新找回勇氣'],
    },
    {
      name: 'short embedded Latin acronym within a Chinese phrase',
      source: '今天最新MV公開真的太精彩了',
      expected: ['今天最新MV公開', '真的太精彩了'],
    },
    {
      name: 'embedded Latin word within a Chinese phrase',
      source: '今天最新Hello公開真的太精彩了',
      expected: ['今天最新Hello公開', '真的太精彩了'],
    },
    {
      name: 'Chinese structural particle and predicate phrase',
      source: '全新的AI時代正在慢慢到來',
      expected: ['全新的AI時代', '正在慢慢到來'],
    },
    {
      name: 'joined Korean and English phrase',
      source: '너만의Universe를보여줘',
      expected: ['너만의', 'Universe를보여줘'],
    },
    {
      name: 'joined Korean and spaced English phrase',
      source: '난아직도너를사랑해maybe I know',
      expected: ['난아직도너를사랑해', 'maybe I know'],
    },
    {
      name: 'Japanese inflection',
      source: 'あなたと出会えて本当によかった',
      expected: ['あなたと出会えて', '本当によかった'],
    },
    {
      name: 'Japanese phrase with attached particles',
      source: '不器用なところも全部好きだよ',
      expected: ['不器用なところも', '全部好きだよ'],
    },
    {
      name: 'Japanese past-tense inflection',
      source: '夢を見ていたあの日の僕ら',
      expected: ['夢を見ていた', 'あの日の僕ら'],
    },
    {
      name: 'Japanese chained inflections',
      source: '会いたくて会えなくて泣いていた',
      expected: ['会いたくて', '会えなくて泣いていた'],
    },
    {
      name: 'Japanese negative continuation',
      source: '忘れないでいてほしいから',
      expected: ['忘れないで', 'いてほしいから'],
    },
    ...JAPANESE_NEGATIVE_TO_SAMPLES,
    {
      name: 'Japanese genitive phrase',
      source: '君のことが好きだから',
      expected: ['君のことが', '好きだから'],
    },
    {
      name: 'Japanese demonstrative phrase',
      source: 'その笑顔をずっと守りたい',
      expected: ['その笑顔を', 'ずっと守りたい'],
    },
    {
      name: 'Japanese prenominal adjective phrase',
      source: '小さな夢を胸に抱いている',
      expected: ['小さな夢を', '胸に抱いている'],
    },
    {
      name: 'Japanese compound verb',
      source: '歩き続けてたどり着いた場所',
      expected: ['歩き続けて', 'たどり着いた場所'],
    },
    {
      name: 'Japanese independent continuation',
      source: '君と僕の大切な思い出だから',
      expected: ['君と僕の大切な思い出', 'だから'],
    },
    {
      name: 'Japanese lexical mo prefix',
      source: 'もう一度だけ君に会いたい',
      expected: ['もう一度だけ', '君に会いたい'],
    },
    {
      name: 'exact-capacity Chinese and English phrase',
      source: '想看見天上璀璨的星光 sing it with me',
      expected: ['想看見天上璀璨的星光', 'sing it with me'],
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
    expect(liveStagePresentation('最新MV公開').lines).toEqual(['最新MV公開']);
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

  it.each([
    {
      name: 'spaced Japanese enumeration',
      source: '物 金 愛 言 もう自己顕示飽きた',
      expected: ['物 金 愛 言', 'もう自己顕示飽きた'],
    },
    {
      name: 'Japanese predicate without an orphan glyph',
      source: '中途半端だけは嫌',
      expected: ['中途半端', 'だけは嫌'],
    },
  ])('selects a coherent complete-frame break for $name', (sample) => {
    const result = liveStagePresentation(sample.source, {
      lineProgress: 0.5,
    });

    expect(result.lines).toEqual(sample.expected);
    expect(result.pages.map((page) => page.lines)).toEqual([sample.expected]);
  });

  it('selects a two-then-one layout when the semantic lead needs two rows', () => {
    const sourceText = '遊びだけなら簡単で真剣交渉無茶苦茶 もう嫌';
    const first = liveStagePresentation(sourceText, { lineProgress: 0.1 });
    const second = liveStagePresentation(sourceText, { lineProgress: 0.9 });

    expect(first.pages.map((page) => page.lines)).toEqual([
      ['遊びだけなら', '簡単で真剣交渉無茶苦茶'],
      ['もう嫌'],
    ]);
    expect(first.lines).toEqual(first.pages[0].lines);
    expect(second.lines).toEqual(second.pages[1].lines);
  });

  it.each([
    {
      name: 'same-script Chinese',
      source: '這是一段非常非常長的中文測試句子 好短',
    },
    {
      name: 'cross-script Chinese',
      source: '這是一段非常非常長的中文測試句子 OK now',
    },
    {
      name: 'same-script Korean',
      source: '이것은아주아주긴한국어테스트문장 짧아',
    },
    {
      name: 'cross-script Korean',
      source: '이것은아주아주긴한국어테스트문장 OK now',
    },
  ])('keeps every row within capacity for a $name 2/1 layout', (sample) => {
    const result = liveStagePresentation(sample.source, {
      lineProgress: 0.1,
    });

    expect(result.pages.map((page) => page.lines.length)).toEqual([2, 1]);
    expect(
      result.pages
        .flatMap((page) => page.lines)
        .every((line) => liveStageVisualWidth(line) <= 11),
    ).toBe(true);
    expect(result.pages.map((page) => page.lines.join('')).join(' ')).toBe(
      sample.source,
    );
  });

  it('selects a two-by-two layout for two long semantic phrases', () => {
    const sourceText = '遊びだけなら簡単で 真剣交渉無茶苦茶で';
    const first = liveStagePresentation(sourceText, { lineProgress: 0.1 });
    const second = liveStagePresentation(sourceText, { lineProgress: 0.9 });

    expect(first.pages.map((page) => page.lines)).toEqual([
      ['遊びだけ', 'なら簡単で'],
      ['真剣交渉', '無茶苦茶で'],
    ]);
    expect(first.lines).toEqual(first.pages[0].lines);
    expect(second.lines).toEqual(second.pages[1].lines);
  });

  it('places a true three-row sentence on one then two lines without a trailing orphan', () => {
    const sourceText = '想看見天上璀璨的星光 sing it with me tonight';
    const first = liveStagePresentation(sourceText, { lineProgress: 0.1 });
    const second = liveStagePresentation(sourceText, { lineProgress: 0.9 });

    expect(first.pages.map((page) => page.lines)).toEqual([
      ['想看見天上璀璨的星光'],
      ['sing it', 'with me tonight'],
    ]);
    expect(first.lines).toEqual(['想看見天上璀璨的星光']);
    expect(second.lines).toEqual(['sing it', 'with me tonight']);
    expect(first.pages.flatMap((page) => page.lines).join(' ')).toBe(
      sourceText,
    );
  });

  it('uses a short-first fallback for a long unbreakable token', () => {
    const sourceText = 'ABCDEFGHIJKLMNO';
    const result = liveStagePresentation(sourceText, { lineProgress: 0.5 });

    expect(result.lines).toEqual(['ABCDEFG', 'HIJKLMNO']);
    expect(result.lines.join('')).toBe(sourceText);
  });

  it.each([
    {
      source: '❤️我真的愛你forever and ever',
      expected: ['❤️我真的愛你', 'forever and ever'],
    },
    {
      source: '中文foo—bar真的很長',
      expected: ['中文foo—bar', '真的很長'],
    },
    {
      source: '《Hello》世界依然美好',
      expected: ['《Hello》', '世界依然美好'],
    },
  ])('preserves every visible symbol while splitting $source', (sample) => {
    const result = liveStagePresentation(sample.source, {
      lineProgress: 0.5,
    });

    expect(result.lines).toEqual(sample.expected);
    expect(result.lines.join('')).toBe(sample.source);
  });

  it('keeps script-aware wrapping when Intl.Segmenter is unavailable', async () => {
    const segmenterDescriptor = Object.getOwnPropertyDescriptor(
      Intl,
      'Segmenter',
    );
    vi.resetModules();
    Object.defineProperty(Intl, 'Segmenter', {
      configurable: true,
      value: undefined,
    });

    try {
      const fallbackPresentation =
        await import('../../shared/presentation/lyricsPresentation.mjs?segmenter=fallback');
      const samples = [
        {
          source: '我從未改變想展現的maybe I know',
          expected: ['我從未改變', '想展現的maybe I know'],
        },
        {
          source: '初戀的香味就這樣被我們尋回',
          expected: ['初戀的香味', '就這樣被我們尋回'],
        },
        {
          source: '声も顔も不器用なとこも',
          expected: ['声も顔も', '不器用なとこも'],
        },
        {
          source: 'Real love讓我們重新找回勇氣',
          expected: ['Real love', '讓我們重新找回勇氣'],
        },
        {
          source: '今天最新MV公開真的太精彩了',
          expected: ['今天最新MV公開', '真的太精彩了'],
        },
        {
          source: '今天最新Hello公開真的太精彩了',
          expected: ['今天最新Hello公開', '真的太精彩了'],
        },
        {
          source: '全新的AI時代正在慢慢到來',
          expected: ['全新的AI時代', '正在慢慢到來'],
        },
        {
          source: '너만의Universe를보여줘',
          expected: ['너만의', 'Universe를보여줘'],
        },
        {
          source: '난아직도너를사랑해maybe I know',
          expected: ['난아직도너를사랑해', 'maybe I know'],
        },
        {
          source: '夢を見ていたあの日の僕ら',
          expected: ['夢を見ていた', 'あの日の僕ら'],
        },
        {
          source: '会いたくて会えなくて泣いていた',
          expected: ['会いたくて', '会えなくて泣いていた'],
        },
        {
          source: '忘れないでいてほしいから',
          expected: ['忘れないで', 'いてほしいから'],
        },
        ...JAPANESE_NEGATIVE_TO_SAMPLES.map(({ source, expected }) => ({
          source,
          expected,
        })),
        {
          source: '君のことが好きだから',
          expected: ['君のことが', '好きだから'],
        },
        {
          source: 'その笑顔をずっと守りたい',
          expected: ['その笑顔を', 'ずっと守りたい'],
        },
        {
          source: '小さな夢を胸に抱いている',
          expected: ['小さな夢を', '胸に抱いている'],
        },
        {
          source: '歩き続けてたどり着いた場所',
          expected: ['歩き続けて', 'たどり着いた場所'],
        },
        {
          source: '君と僕の大切な思い出だから',
          expected: ['君と僕の大切な思い出', 'だから'],
        },
        {
          source: 'もう一度だけ君に会いたい',
          expected: ['もう一度だけ', '君に会いたい'],
        },
        {
          source: '物 金 愛 言 もう自己顕示飽きた',
          expected: ['物 金 愛 言', 'もう自己顕示飽きた'],
        },
        {
          source: '中途半端だけは嫌',
          expected: ['中途半端', 'だけは嫌'],
        },
        {
          source: '《Hello》世界依然美好',
          expected: ['《Hello》', '世界依然美好'],
        },
      ];

      for (const sample of samples) {
        const result = fallbackPresentation.adaptLiveStageLyricsPresentation(
          fallbackPresentation.analyzeLyricsSource(sample.source),
          { lineProgress: 0.5 },
        );
        expect(result.lines).toEqual(sample.expected);
      }

      const planned = fallbackPresentation.adaptLiveStageLyricsPresentation(
        fallbackPresentation.analyzeLyricsSource(
          '遊びだけなら簡単で 真剣交渉無茶苦茶で',
        ),
        { lineProgress: 0.1 },
      );
      expect(planned.pages.map((page) => page.lines)).toEqual([
        ['遊びだけ', 'なら簡単で'],
        ['真剣交渉', '無茶苦茶で'],
      ]);

      const twoThenOne = fallbackPresentation.adaptLiveStageLyricsPresentation(
        fallbackPresentation.analyzeLyricsSource(
          '遊びだけなら簡単で真剣交渉無茶苦茶 もう嫌',
        ),
        { lineProgress: 0.1 },
      );
      expect(twoThenOne.pages.map((page) => page.lines.length)).toEqual([2, 1]);
      expect(
        twoThenOne.pages.map((page) => page.lines.join('')).join(' '),
      ).toBe('遊びだけなら簡単で真剣交渉無茶苦茶 もう嫌');
    } finally {
      Object.defineProperty(Intl, 'Segmenter', segmenterDescriptor);
      vi.resetModules();
    }
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

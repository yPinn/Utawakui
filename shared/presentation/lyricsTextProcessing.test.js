import { describe, expect, it } from 'vitest';
import { validateLyricsFineTiming } from '../lyricsFineTiming.mjs';
import { selectLyricsOverlayFrame } from './state.mjs';
import {
  analyzeLyricsText,
  preprocessLyricsDocument,
  projectLyricsTextSelection,
  isSafeLyricsBreak,
  lyricsLineVocalRoles,
} from './lyricsTextProcessing.mjs';

describe('lossless shared text annotations', () => {
  it.each([
    '企劃： Mandy王夢帆/王子',
    '監製:冉啟升/王政典',
    '出品:黃俊',
    '企划：Mandy王梦帆／王子',
    '监制：冉启升/王政典',
    '出品人：黃俊',
  ])(
    'hides the entire planning byline rather than only its prefix: %s',
    (text) => {
      const doc = {
        documentId: 'planning',
        lines: [{ lineId: 'c', text, startMs: 200000, endMs: 201000 }],
      };
      const before = structuredClone(doc);
      expect(analyzeLyricsText(text)).toMatchObject({
        kind: 'credit-candidate',
        defaultHidden: true,
        vocalMarkers: [],
      });
      const defaults = preprocessLyricsDocument(doc)
        .outputCandidates.filter((candidate) => candidate.defaultHidden)
        .map((candidate) => candidate.lineId);
      expect(projectLyricsTextSelection(doc, defaults).lines).toEqual([]);
      expect(projectLyricsTextSelection(doc, []).lines).toMatchObject(
        doc.lines,
      );
      expect(doc).toEqual(before);
    },
  );
  it.each([
    'Jinzy, Llil Ca$, ￥ouki, we cosign',
    'Jinzy, Llil Ca$, ¥ouki, we cosign',
    '企劃：我們把夢想寫進明天',
    '監製：I sing for you',
    '出品：這是我的歌',
    '企劃：Mandy王夢帆說今晚一起走',
    '王子：一起唱到天亮',
    '我們在清明、冬至、新年拜的祖宗墳',
  ])('keeps sung or ambiguous prose visible by default: %s', (text) => {
    const doc = {
      documentId: 'planning-prose',
      lines: [{ lineId: 'v', text }],
    };
    const defaults = preprocessLyricsDocument(doc)
      .outputCandidates.filter((candidate) => candidate.defaultHidden)
      .map((candidate) => candidate.lineId);
    expect(projectLyricsTextSelection(doc, defaults).lines[0].text).toBe(text);
  });
  it.each([
    ['[男声]夜空', '夜空', 'male'],
    ['【女聲】夜空', '夜空', 'female'],
    ['男女合唱：夜空', '夜空', 'group'],
    ['[Male]Stay with me', 'Stay with me', 'male'],
    ['[女性]君と歌う', '君と歌う', 'female'],
    ['[합창]함께 노래해', '함께 노래해', 'group'],
  ])('separates the confirmed cue in %s', (text, body, role) => {
    const doc = {
      documentId: 'aliases',
      lines: [{ lineId: 'v', text, startMs: 0, endMs: 8000 }],
    };
    const defaults = preprocessLyricsDocument(doc)
      .outputCandidates.filter((l) => l.defaultHidden)
      .map((l) => l.lineId);
    const clean = projectLyricsTextSelection(doc, defaults);
    expect(clean.lines[0]).toMatchObject({
      text: body,
      startMs: 0,
      endMs: 8000,
      vocalParts: [{ from: 0, to: body.length, role }],
    });
    const restored = projectLyricsTextSelection(doc, []);
    expect(restored.lines[0].text).toBe(text);
    expect(restored.documentId).not.toBe(clean.documentId);
  });
  it.each([
    '[oh oh] stay with me',
    '[啊啊]一起唱',
    '（啊啊）一起唱',
    '「[男]一起唱」',
    'Love: stay with me',
    '混音 Mixing Engineer: 王曉夫',
  ])('preserves the literal or ambiguous body %s', (text) => {
    const doc = {
      documentId: 'negative',
      lines: [{ lineId: 'v', text, startMs: 0, endMs: 8000 }],
    };
    const result = projectLyricsTextSelection(doc, []);
    expect(result.lines[0].text).toBe(text);
    if (text.startsWith('[')) expect(result.lines[0].vocalParts).toEqual([]);
    if (text.startsWith('混音'))
      expect(preprocessLyricsDocument(doc).lines[0].vocalMarkers).toEqual([]);
  });
  it.each([
    'karaoke-stack',
    'kinetic-pop',
    'ornate-vertical',
    'live-stage',
    'manga-frame',
  ])(
    'keeps restored and literal bracket text consistent in %s',
    (templateId) => {
      for (const text of [
        '[女]一起唱',
        '[oh oh] stay with me',
        '[啊啊]一起唱',
        '[未知歌手]一起唱',
      ]) {
        const doc = projectLyricsTextSelection(
          {
            documentId: 'literal',
            lines: [{ lineId: 'v', text, startMs: 0, endMs: 12000 }],
          },
          [],
        );
        const frame = selectLyricsOverlayFrame(
          {
            revision: 1,
            playback: {
              track: { id: 't' },
              status: 'paused',
              positionMs: 100,
              durationMs: 12000,
            },
            lyrics: { trackId: 't', synced: true, lines: doc.lines },
          },
          { templateId, nowMs: 0 },
        );
        expect(frame.currentText).toBe(text);
        if (templateId === 'karaoke-stack')
          expect(frame.ktv.currentText).toBe(text);
        if (frame.lyricsSourceAnalysis)
          expect(frame.lyricsSourceAnalysis.speaker).toBe('');
      }
    },
  );

  it('removes alternating role labels while retaining their internal ranges', () => {
    const line = {
      lineId: 'v',
      text: '[男]你唱[女]我唱【合唱】一起唱（啊啊）',
      startMs: 1000,
      endMs: 13000,
    };
    const doc = { documentId: 'duet', lines: [line] };
    const output = projectLyricsTextSelection(doc, ['v']);
    expect(output.lines[0]).toMatchObject({
      text: '你唱我唱一起唱',
      startMs: 1000,
      endMs: 13000,
      vocalParts: [
        { from: 0, to: 2, label: '男', role: 'male' },
        { from: 2, to: 4, label: '女', role: 'female' },
        { from: 4, to: 7, label: '合唱', role: 'group' },
      ],
    });
    expect(doc.lines[0]).toBe(line);
    expect(line.text).toContain('[男]');
  });
  it('carries a hidden standalone role into following lyrics without changing their intervals', () => {
    const doc = {
      documentId: 'standalone',
      lines: [
        { lineId: 'm', text: '[男]', startMs: 0, endMs: 1000 },
        { lineId: 'a', text: '你唱', startMs: 1000, endMs: 3000 },
        { lineId: 'g', text: '合唱：一起唱', startMs: 3000, endMs: 6000 },
      ],
    };
    const output = projectLyricsTextSelection(doc, ['m', 'g']);
    expect(output.lines.map((l) => l.text)).toEqual(['你唱', '一起唱']);
    expect(output.lines[0].vocalParts).toEqual([
      { from: 0, to: 2, label: '男', role: 'male' },
    ]);
    expect(output.lines[1].vocalParts).toEqual([
      { from: 0, to: 3, label: '合唱', role: 'group' },
    ]);
  });
  it('uses artist evidence for singer prefixes and leaves ambiguous colon prose selectable', () => {
    const doc = {
      documentId: 'names',
      lines: [
        { lineId: 'dc', text: 'DC: Yo Peter, it’s time to make a toast.' },
        { lineId: 'r', text: 'Rapeter：Yo, yo check1212.' },
        { lineId: 'zh', text: '王以太：想看見星光' },
        { lineId: 'q', text: 'Love: stay with me' },
        { lineId: 'quote', text: '「王以太：想看見星光」' },
      ],
    };
    const options = { performers: ['DC', 'Rapeter', '王以太'] };
    const analysis = preprocessLyricsDocument(doc, options);
    expect(
      analysis.outputCandidates
        .filter((l) => l.defaultHidden)
        .map((l) => l.lineId),
    ).toEqual(['dc', 'r', 'zh']);
    const output = projectLyricsTextSelection(doc, ['dc', 'r', 'zh'], options);
    expect(output.lines.map((l) => l.text)).toEqual([
      'Yo Peter, it’s time to make a toast.',
      'Yo, yo check1212.',
      '想看見星光',
      'Love: stay with me',
      '「王以太：想看見星光」',
    ]);
    expect(output.lines[0].vocalParts[0]).toMatchObject({
      label: 'DC',
      role: 'solo',
    });
  });
  it.each([
    'karaoke-stack',
    'kinetic-pop',
    'ornate-vertical',
    'live-stage',
    'manga-frame',
  ])(
    'keeps male role metadata in the %s state frame after text cleanup',
    (templateId) => {
      const doc = projectLyricsTextSelection(
        {
          documentId: 'role',
          lines: [{ lineId: 'v', text: '[男]一起唱', startMs: 0, endMs: 6000 }],
        },
        ['v'],
      );
      const frame = selectLyricsOverlayFrame(
        {
          revision: 1,
          playback: {
            track: { id: 't' },
            status: 'paused',
            positionMs: 1000,
            durationMs: 6000,
          },
          lyrics: { trackId: 't', synced: true, lines: doc.lines },
        },
        { templateId, nowMs: 0 },
      );
      expect(frame.currentVocalParts).toEqual([
        { from: 0, to: 3, label: '男', role: 'male' },
      ]);
      if (templateId === 'karaoke-stack')
        expect(frame.ktv.currentRole).toBe('male');
    },
  );
  it.each([
    '和聲讓夜色更美',
    '「（和聲）是我們的歌名」',
    '"(Backing Vocals)"',
    '和聲：一起唱',
    'Guitar: I Love You',
    'Mixing Engineer: This is the night',
    'Mixing Engineer: 王曉夫\n一起唱',
    'Producer: HARIKIRI @ Jamroom\n一起唱',
  ])('keeps sung, quoted or merged content by default: %s', (text) => {
    const doc = { documentId: 'keep', lines: [{ lineId: 'v', text }] };
    const analysis = analyzeLyricsText(text);
    expect(analysis.defaultHidden).toBe(false);
    expect(
      analysis.outputLabelRanges.filter((r) => r.defaultHidden !== false),
    ).toEqual([]);
    expect(doc.lines[0].text).toBe(text);
  });
  it('removes standalone labels without extending the prior inferred interval', () => {
    const doc = {
      documentId: 'rest',
      lines: [
        { lineId: 'a', text: '上一句', startMs: 0, endMs: null },
        { lineId: 'label', text: ' （和聲） ', startMs: 1000, endMs: 2000 },
        { lineId: 'b', text: '（啊啊）', startMs: 2000, endMs: 3000 },
      ],
    };
    const result = projectLyricsTextSelection(doc, ['label']);
    expect(result.lines).toEqual([
      { ...doc.lines[0], endMs: 1000, endInferred: true },
      doc.lines[2],
    ]);
    expect(doc.lines[0].endMs).toBeNull();
  });
  it('rebases T1+ offsets and readings while preserving all retained evidence times', () => {
    const text = '（和聲）星光（和声）啊啊';
    const line = {
      lineId: 'v',
      text,
      startMs: 1000,
      endMs: 6000,
      estimatedStarts: {
        version: 1,
        segments: [
          { segmentId: 'a', text: '（和聲）', startMs: 1000 },
          { segmentId: 'b', text: '星光（和声）', startMs: 2000 },
          { segmentId: 'c', text: '啊啊', startMs: 4000 },
        ],
      },
      estimatedFineTiming: {
        version: 1,
        units: [
          { unitId: 'a', from: 0, to: 4, startMs: 1000, endMs: 1800 },
          { unitId: 'b', from: 4, to: 6, startMs: 2000, endMs: 2800 },
          { unitId: 'c', from: 6, to: 12, startMs: 3000, endMs: 5800 },
        ],
      },
    };
    const doc = {
      documentId: 'fine-labels',
      lines: [line],
      reading: {
        version: 1,
        lines: [
          {
            lineId: 'v',
            text,
            romaji: 'old',
            segments: [
              { text: '（和聲）', reading: 'metadata' },
              { text: '星光（和声）', reading: 'mixed' },
              { text: '啊啊', reading: 'aa' },
            ],
          },
        ],
      },
    };
    const before = structuredClone(doc),
      result = projectLyricsTextSelection(doc, ['v']);
    const projected = result.lines[0];
    expect(projected.text).toBe('星光啊啊');
    expect(projected.estimatedStarts.segments).toEqual([
      { ...line.estimatedStarts.segments[1], text: '星光' },
      line.estimatedStarts.segments[2],
    ]);
    expect(projected.estimatedFineTiming.units).toEqual([
      { ...line.estimatedFineTiming.units[1], from: 0, to: 2 },
      { ...line.estimatedFineTiming.units[2], from: 2, to: 4 },
    ]);
    expect(
      validateLyricsFineTiming(projected.estimatedFineTiming, projected),
    ).toEqual(projected.estimatedFineTiming);
    expect(result.reading.lines[0]).toEqual({
      lineId: 'v',
      text: '星光啊啊',
      segments: [
        { text: '星光', reading: '' },
        { text: '啊啊', reading: 'aa' },
      ],
    });
    expect(doc).toEqual(before);
  });
  it.each([
    '混音 Mixing Engineer: 王曉夫',
    '混音助理 Mixing Assistant: Grove Miki @ Jamroom',
    '人聲製作和錄音 Vocal Production & Recording: HARIKIRI @ Jamroom',
    '母帶 Mastering Engineer: Craig J Williams',
    '吉他 Guitar: Iki Zhou',
    '混音助理 Mixing Assistant：Grove Miki @ Jamroom',
    '人声制作和录音 Vocal Production & Recording: HARIKIRI @ Jamroom',
    'ギター Guitar: Iki Zhou',
    '믹싱 엔지니어 Mixing Engineer: Kim Minsu',
  ])('defaults the full technical byline hidden: %s', (text) => {
    expect(analyzeLyricsText(text)).toMatchObject({
      kind: 'credit-candidate',
      defaultHidden: true,
      sourceText: text,
    });
  });
  it.each([
    '（和聲）',
    '(和聲)',
    '（和声）',
    '(和声)',
    '【和聲】',
    '[Backing Vocals]',
    '（ハモリ）',
    '(코러스)',
  ])(
    'defaults an exact performance label hidden without removing its source: %s',
    (text) => {
      expect(
        preprocessLyricsDocument({ lines: [{ lineId: 'label', text }] })
          .outputCandidates,
      ).toEqual([
        expect.objectContaining({ lineId: 'label', defaultHidden: true }),
      ]);
    },
  );
  it('hides parenthetical ranges by default while retaining body, role and native timing', () => {
    const text = '[女]（和聲）一起唱（啊啊）';
    const doc = {
      documentId: 'inline',
      granularity: 'T2',
      lines: [
        {
          lineId: 'sung',
          text,
          startMs: 1000,
          endMs: 4000,
          segments: [
            {
              segmentId: 'a',
              text: '[女]（和聲）',
              startMs: 1000,
              endMs: 1500,
            },
            {
              segmentId: 'b',
              text: '一起唱（啊啊）',
              startMs: 1500,
              endMs: 4000,
            },
          ],
        },
      ],
    };
    const before = structuredClone(doc);
    const output = projectLyricsTextSelection(doc, ['sung']);
    expect(output.lines[0]).toMatchObject({
      text: '一起唱',
      startMs: 1000,
      endMs: 4000,
    });
    expect(output.lines[0].segments).toEqual([
      { ...doc.lines[0].segments[1], text: '一起唱' },
    ]);
    expect(doc).toEqual(before);
    expect(projectLyricsTextSelection(doc, []).lines).toMatchObject(doc.lines);
  });
  it.each([
    '作詞：測試',
    '作词：测试',
    'Lyrics by: Test',
    '作詞：テスト',
    '작사: 테스트',
    '製作人/編曲 Producer: HARIKIRI',
    '制作人／编曲 Producer：HARIKIRI',
    'Producer: HARIKIRI',
    'Produced by: Jane Smith',
    'Mixing & Mastering: Test Engineer',
    'プロデュース：テスト',
    '프로듀서: 테스트',
  ])('marks a credit candidate without changing or hiding %s', (text) => {
    const result = analyzeLyricsText(text);
    expect(result.kind).toBe('credit-candidate');
    expect(result.sourceText).toBe(text);
    expect(result.sourceStart).toBe(0);
    expect(result.sourceEnd).toBe(text.length);
  });
  it.each([
    '[女] 作詞：這也是我唱的',
    '【合唱】我們一起',
    '和聲：一起唱',
    'Vocal: sing with me',
    '(oh oh)',
    '「作詞：也是歌詞」',
    'Lyrics are all I sing',
    '작사처럼 노래해',
    'DC: Yo Peter, it’s time to make a toast.',
    'Rapeter: Yo, yo check1212.',
    '《Rap of CN》 kinda be唯一的機會',
    '《DirtyGOOD》沒幾個人在收聽',
    'I’m not gonna lie, I’ll sing it again. Why?',
    '(Producer: sing with me)',
  ])('retains vocal, quoted and ambiguous text: %s', (text) => {
    expect(analyzeLyricsText(text).kind).toBe('lyric');
  });
  it.each([
    '製作人/編曲 Producer: HARIKIRI',
    '制作人／编曲 Producer：HARIKIRI',
    'Produced by: Jane Smith',
    'プロデュース：テスト',
    '프로듀서: 테스트',
    'Mixing: 김민수',
    '録音：山田太郎',
  ])('defaults a complete credit byline to Output-hidden: %s', (text) => {
    expect(analyzeLyricsText(text).defaultHidden).toBe(true);
  });
  it.each([
    'Lyrics: I wrote your name into the sky',
    'Producer: sing it with me',
    '作詞：這也是我唱的',
    'Producer: HARIKIRI\n一起唱這首歌',
    '和聲：啊啊',
    '作詞：另一句',
    '作詞：一起唱',
    'プロデュース：君と歌う',
  ])('does not auto-hide sung, ambiguous or multi-line content: %s', (text) => {
    expect(analyzeLyricsText(text).defaultHidden).toBe(false);
  });
  it.each([
    '【今晚，明天】',
    '「今晚，明天」',
    '“Tonight, tomorrow”',
    '"Tonight, tomorrow"',
    '『明日、明後日』',
    '（오늘, 내일）',
  ])('tracks paired text ranges: %s', (text) => {
    const result = analyzeLyricsText(text);
    expect(result.pairedRanges).toContainEqual({
      sourceStart: 0,
      sourceEnd: text.length,
    });
    expect(result.malformedPairs).toBe(false);
  });
  it('does not mistake apostrophes for unpaired quotation marks', () => {
    expect(analyzeLyricsText("don't stop, we're here").malformedPairs).toBe(
      false,
    );
    for (const text of ['Why don’ t we', 'rockin’ all night', '’cause I'])
      expect(analyzeLyricsText(text).malformedPairs).toBe(false);
    expect(
      analyzeLyricsText('‘ No friend.’（同行即对手）').pairedRanges,
    ).toContainEqual({ sourceStart: 0, sourceEnd: 13 });
    expect(
      projectLyricsTextSelection(
        {
          documentId: 'apostrophe',
          lines: [{ lineId: 'v', text: '所以说 Why don’ t we（为何不）' }],
        },
        ['v'],
      ).lines[0].text,
    ).toBe('所以说 Why don’ t we');
    expect(analyzeLyricsText('【未完').malformedPairs).toBe(true);
    expect(isSafeLyricsBreak('今晚，明天', 2)).toBe(false);
    expect(isSafeLyricsBreak('今晚「明天」', 3)).toBe(false);
    expect(isSafeLyricsBreak('"Tonight" tomorrow', 8)).toBe(false);
    expect(isSafeLyricsBreak('"Tonight" tomorrow', 9)).toBe(true);
    expect(isSafeLyricsBreak('Tonight "tomorrow"', 8)).toBe(true);
    expect(isSafeLyricsBreak('Tonight "tomorrow"', 9)).toBe(false);
  });
  it('requires explicit eligible line ids, preserves intervals and reading, and restores the original text', () => {
    const doc = {
      documentId: 'song',
      source: { sha256: 'a'.repeat(64) },
      lines: [
        { lineId: 'a', text: '作詞：測試', startMs: 0, endMs: 1000 },
        {
          lineId: 'b',
          text: '[女]一起唱（啊啊和聲）',
          startMs: 1000,
          endMs: 3000,
          segments: [
            { text: '[女]一起唱（啊啊和聲）', startMs: 1000, endMs: 2500 },
          ],
        },
      ],
      reading: { lines: [{ lineId: 'a' }, { lineId: 'b' }] },
    };
    const original = structuredClone(doc);
    expect(
      preprocessLyricsDocument(doc).creditCandidates.map((l) => l.lineId),
    ).toEqual(['a']);
    expect(projectLyricsTextSelection(doc, ['b']).lines[1].text).toBe('一起唱');
    const projected = projectLyricsTextSelection(doc, ['a']);
    expect(projected.lines).toMatchObject([doc.lines[1]]);
    expect(projected.reading.lines).toEqual([{ lineId: 'b' }]);
    expect(projected.documentId).not.toBe(doc.documentId);
    expect(projectLyricsTextSelection(doc, []).lines).toMatchObject(doc.lines);
    expect(doc).toEqual(original);
  });
  it('recomputes the visible tier when the only T2 line is explicitly hidden', () => {
    const doc = {
      documentId: 'tier',
      granularity: 'T2',
      lines: [
        {
          lineId: 'c',
          text: '作詞：測試',
          startMs: 0,
          segments: [{ text: '作詞：測試' }],
        },
        { lineId: 'v', text: '一起唱', startMs: 1000, endMs: 3000 },
      ],
    };
    expect(projectLyricsTextSelection(doc, ['c']).granularity).toBe('T1');
    expect(
      projectLyricsTextSelection({ ...doc, lines: [doc.lines[0]] }, ['c'])
        .granularity,
    ).toBe('T0');
  });
  it('keeps the original inferred end before a hidden credit instead of bridging its interval', () => {
    const document = {
      documentId: 'gap',
      lines: [
        { lineId: 'before', text: '上一句', startMs: 0, endMs: null },
        {
          lineId: 'credit',
          text: 'Producer: HARIKIRI',
          startMs: 1000,
          endMs: 21000,
        },
        {
          lineId: 'after',
          text: '下一句（和聲）',
          startMs: 21000,
          endMs: null,
        },
      ],
    };
    const result = projectLyricsTextSelection(document, ['credit']);
    expect(result.lines[0]).toEqual({
      ...document.lines[0],
      endMs: 1000,
      endInferred: true,
    });
    expect(result.lines[1]).toBe(document.lines[2]);
    expect(document.lines[0].endMs).toBeNull();
    expect(projectLyricsTextSelection(document, [])).toBe(document);
  });
});

describe('reversible parenthetical default and saved manual roles', () => {
  it.each([
    '（啊啊）',
    '(oh oh)',
    '（一起唱）',
    '（啊啊和聲）',
    '(和聲：啊啊)',
    '(Sabrina 胡恂舞)',
  ])('hides complete %s only in selected Output projection', (text) => {
    const doc = {
        documentId: 'paren',
        lines: [
          { lineId: 'v', text: `唱${text}下去`, startMs: 1000, endMs: 6000 },
        ],
      },
      before = structuredClone(doc);
    expect(analyzeLyricsText(doc.lines[0].text).defaultHidden).toBe(true);
    expect(projectLyricsTextSelection(doc, ['v']).lines[0]).toMatchObject({
      text: '唱下去',
      startMs: 1000,
      endMs: 6000,
    });
    expect(projectLyricsTextSelection(doc, []).lines).toMatchObject(doc.lines);
    expect(doc).toEqual(before);
  });
  it.each(['唱（啊啊)下去', '唱(啊啊）下去'])(
    'pairs mixed full- and half-width round brackets: %s',
    (text) => {
      const doc = { documentId: 'mixed', lines: [{ lineId: 'v', text }] };
      expect(analyzeLyricsText(text).malformedPairs).toBe(false);
      expect(projectLyricsTextSelection(doc, ['v']).lines[0].text).toBe(
        '唱下去',
      );
    },
  );
  it.each(['唱（不完整', '「唱（啊啊）下去」', '唱(第一(第二)第一)下去'])(
    'keeps malformed or quoted pairs and never leaks nested closing brackets: %s',
    (text) => {
      const doc = { documentId: 'nested', lines: [{ lineId: 'v', text }] };
      const result = projectLyricsTextSelection(doc, ['v']);
      expect(result.lines[0].text).toBe(
        text.includes('第一') ? '唱下去' : text,
      );
    },
  );
  it('carries a saved named section through hidden marker rows and supports line overrides', () => {
    const doc = {
      documentId: 'duet',
      lines: [
        { lineId: 'a', text: '(Sabrina 胡恂舞)', startMs: 0, endMs: 1000 },
        { lineId: 'b', text: '總覺得做什麼都錯', startMs: 1000, endMs: 4000 },
        { lineId: 'c', text: '(PIZZALI)', startMs: 4000, endMs: 5000 },
        { lineId: 'd', text: '習慣說沒事', startMs: 5000, endMs: 9000 },
        { lineId: 'e', text: '一起唱', startMs: 9000, endMs: 12000 },
      ],
    };
    const assignments = [
      { lineId: 'a', role: 'female', scope: 'section' },
      { lineId: 'c', role: 'male', scope: 'section' },
      { lineId: 'e', role: 'group', scope: 'line' },
    ];
    const result = projectLyricsTextSelection(doc, ['a', 'c'], { assignments });
    expect(result.lines.map((l) => l.vocalParts[0].role)).toEqual([
      'female',
      'male',
      'group',
    ]);
    expect(result.lines.map((l) => [l.startMs, l.endMs])).toEqual([
      [1000, 4000],
      [5000, 9000],
      [9000, 12000],
    ]);
    expect(result.lines.map((l) => l.text)).toEqual(
      doc.lines
        .filter((l) => !['a', 'c'].includes(l.lineId))
        .map((l) => l.text),
    );
  });
  it('resolves whole-line roles for the reading sheet with the Output rules', () => {
    const doc = {
      documentId: 'sheet',
      lines: [
        { lineId: 'a', text: '(Sabrina 胡恂舞)' },
        { lineId: 'b', text: '總覺得做什麼都錯' },
        { lineId: 'c', text: '一起唱' },
        { lineId: 'd', text: '習慣說沒事' },
        { lineId: 'e', text: '[男]我先唱[女]換我唱' },
        { lineId: 'f', text: '[合]一起唱' },
      ],
    };
    const assignments = [
      { lineId: 'a', role: 'female', scope: 'section' },
      { lineId: 'c', role: 'group', scope: 'line' },
    ];
    // A line choice overrides one row without ending the carried section.
    expect(lyricsLineVocalRoles(doc, [], { assignments })).toEqual({
      a: 'female',
      b: 'female',
      c: 'group',
      d: 'female',
      f: 'group',
    });
    expect(lyricsLineVocalRoles(doc)).toEqual({ f: 'group' });
    expect(lyricsLineVocalRoles(null)).toEqual({});
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  planLyricsDisplay,
  selectLyricsDisplayPage,
  nextLyricsDisplayBoundaryMs,
  sliceLyricsReading,
} from './lyricsDisplayLayout.mjs';

const line = (text, extra = {}) => ({
  text,
  startMs: 1000,
  endMs: 25000,
  ...extra,
});
const fits = (text) =>
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
    .length <= 18;

describe('bounded lyric display pages', () => {
  it('keeps a fitting Latin phrase intact at an attached CJK boundary', () => {
    const text = '想看見天上璀璨星光sing it with me';
    const result = planLyricsDisplay(line(text), {
      sequentialRows: true,
      phraseRows: true,
      fits: (value) => value.trimEnd().length <= 18,
    });
    expect(result.pages.map((p) => p.text)).toEqual([
      '想看見天上璀璨星光',
      'sing it with me',
    ]);
  });
  it('keeps a role label attached to lyrics when authored phrase rows are enabled', () => {
    const text = '[女] 想看見星光sing it with me（啊啊和聲）';
    const result = planLyricsDisplay(line(text), {
      phraseRows: true,
      sequentialRows: true,
      fits: () => true,
    });
    expect(result.status).toBe('ready');
    expect(result.pages[0].text.trim()).toBe('[女] 想看見星光');
    expect(result.pages.map((p) => p.text).join('')).toBe(text);
  });
  it('respects authored CJK spaces even when a whole block fits, without breaking English words into batches', () => {
    const text = '把你安撫 安撫千家萬戶 我有我的版圖 從成都一直唱到曼谷';
    const result = planLyricsDisplay(line(text), {
      sequentialRows: true,
      phraseRows: true,
      fits: () => true,
    });
    expect(result.pages.map((p) => p.text.trim())).toEqual([
      '把你安撫',
      '安撫千家萬戶',
      '我有我的版圖',
      '從成都一直唱到曼谷',
    ]);
    expect(result.pages.map((p) => p.text).join('')).toBe(text);
  });
  it('keeps a fitting harmony aside together and never emits blank separator batches', () => {
    const text = '一起唱吧（啊啊和聲）  \t 下一句\n\n最後';
    const result = planLyricsDisplay(line(text), {
      sequentialRows: true,
      fits: (value) => [...value.trimEnd()].length <= 9,
    });
    expect(result.status).toBe('ready');
    expect(result.pages.map((page) => page.text).join('')).toBe(text);
    expect(result.pages.every((page) => page.text.trim())).toBe(true);
    expect(
      result.pages.some((page) => page.text.includes('（啊啊和聲）')),
    ).toBe(true);
  });

  it('never splits a whitespace-plus-combining grapheme while attaching separators', () => {
    const text = '前句\n \u0301後句 最後';
    const result = planLyricsDisplay(line(text), {
      sequentialRows: true,
      fits: (value) =>
        [
          ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
            value,
          ),
        ].length <= 5,
    });
    const boundaries = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
        text,
      ),
    ]
      .map((s) => s.index)
      .concat(text.length);
    expect(result.status).toBe('ready');
    expect(result.pages.map((page) => page.text).join('')).toBe(text);
    expect(
      result.pages.every((page) => boundaries.includes(page.sourceEnd)),
    ).toBe(true);
  });
  it('keeps authored row breaks as sequential batches even when the whole block fits', () => {
    const text = '第一句唱完\r\n第二句接上\n\n[合] 啊啊（和聲）';
    const input = line(text),
      before = structuredClone(input);
    const result = planLyricsDisplay(input, {
      fits: () => true,
      sequentialRows: true,
    });
    expect(result.status).toBe('ready');
    expect(result.pages.map((p) => p.text)).toEqual([
      '第一句唱完\r\n',
      '第二句接上\n\n',
      '[合] 啊啊（和聲）',
    ]);
    expect(result.pages.map((p) => p.text).join('')).toBe(text);
    expect(input).toEqual(before);
  });

  it('retains authored rows when dwell is insufficient instead of merging them to fit', () => {
    const input = line('first\nsecond\nthird', { endMs: 2500 });
    const result = planLyricsDisplay(input, {
      fits: () => true,
      sequentialRows: true,
    });
    expect(result.status).toBe('unfit');
    expect(result.pages.map((p) => p.text).join('')).toBe(input.text);
    expect(result.pages).toHaveLength(3);
  });

  it('keeps all text without stranding punctuation or opening brackets at a page edge', () => {
    const text = '他說【今晚，明天】我們一起走，回家。';
    for (const capacity of [5, 7, 10, 12]) {
      const result = planLyricsDisplay(line(text), {
        fits: (value) => [...value].length <= capacity,
      });
      expect(result.status).toBe('ready');
      expect(result.pages.map((page) => page.text).join('')).toBe(text);
      for (const page of result.pages) {
        expect(page.text).not.toMatch(/^[，。！？、】」』）]/u);
        expect(page.text).not.toMatch(/[【「『（]$/u);
      }
    }
  });
  it.each([
    [{}, 'line-estimate', 'layout-estimate', 1000, 25000],
    [{ startMs: null, endMs: null }, 'line-estimate', null, null, null],
    [
      {
        estimatedStarts: {
          version: 1,
          segments: [{ text: '甲乙丙', startMs: 1400 }],
        },
      },
      'model-starts',
      'model-starts',
      1400,
      25000,
    ],
    [
      { segments: [{ text: '甲乙丙', startMs: 1000, endMs: 24000 }] },
      't2',
      't2',
      1000,
      25000,
    ],
  ])(
    'uses one complete-page capacity check and preserves timing %j',
    (extra, sourceTiming, pageTiming, startMs, endMs) => {
      const input = line('甲乙丙', extra);
      const before = structuredClone(input);
      const accepts = vi.fn(() => true);
      const result = planLyricsDisplay(input, { fits: accepts });
      expect(accepts).toHaveBeenCalledExactlyOnceWith('甲乙丙', {
        sourceStart: 0,
        sourceEnd: 3,
      });
      expect(result).toEqual({
        status: startMs === null ? 'untimed' : 'ready',
        sourceTiming,
        pageTiming,
        pages: [
          { text: '甲乙丙', sourceStart: 0, sourceEnd: 3, startMs, endMs },
        ],
      });
      expect(input).toEqual(before);
    },
  );

  it.each([
    '沿著海岸慢慢走直到天空放晴，直到想起從前的我們也不願放開彼此的手',
    '君と過ごしたこの街の記憶を抱いて、いつかまた会える日まで歩いてゆこう',
    '우리 함께 걸어왔던 이 길을 기억하며 언제까지나 너의 곁에서 노래할게',
    'We will keep all of our memories tonight, and find our way back home together',
    '把回憶留在今晚，we will find our way back home いつかまた会える日まで',
    '很長的中文字串'.repeat(16),
    'a'.repeat(80),
    '「一緒に👨‍👩‍👧‍👦歌おう e\u0301」'.repeat(8),
  ])('preserves and contains every grapheme in %s', (text) => {
    const input = line(text),
      before = structuredClone(input);
    const plan = planLyricsDisplay(input, { fits });
    expect(plan.status).toBe('ready');
    expect(plan.pages.length).toBeGreaterThan(1);
    expect(plan.pages.every((page) => fits(page.text))).toBe(true);
    expect(plan.pages.map((page) => page.text).join('')).toBe(text);
    const cuts = new Set(
      [
        ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
          text,
        ),
      ].map((s) => s.index),
    );
    expect(plan.pages.every((p) => cuts.has(p.sourceStart))).toBe(true);
    expect(input).toEqual(before);
  });

  it('keeps short text, T0 static pages and unresolved clocks distinct', () => {
    expect(planLyricsDisplay(line('hello'), { fits }).pages).toHaveLength(1);
    const plan = planLyricsDisplay(
      line('a'.repeat(40), { startMs: null, endMs: null }),
      { fits },
    );
    expect(plan.status).toBe('untimed');
    expect(plan.pages.every((p) => p.startMs === null)).toBe(true);
    expect(selectLyricsDisplayPage(plan, 5000).index).toBe(0);
    expect(nextLyricsDisplayBoundaryMs(plan, 5000)).toBeNull();
  });

  it('retains single-page rate, short dwell and unresolved-end timing decisions', () => {
    const input = line('甲乙丙', {
      endMs: 3000,
      estimatedStarts: {
        version: 1,
        segments: [{ text: '甲乙丙', startMs: 1400 }],
      },
    });
    const plan = planLyricsDisplay(input, { fits: () => true, rate: 2 });
    expect(plan).toMatchObject({
      status: 'ready',
      sourceTiming: 'model-starts',
      pageTiming: 'layout-estimate',
      pages: [{ startMs: 1000, endMs: 3000 }],
    });
    expect(nextLyricsDisplayBoundaryMs(plan, 1200, 2)).toBeNull();
    const unresolved = planLyricsDisplay(
      { ...input, endMs: null },
      { fits: () => true, rate: 1.25 },
    );
    expect(unresolved).toMatchObject({
      status: 'untimed',
      pageTiming: null,
      pages: [{ startMs: null, endMs: null }],
    });
  });

  it('passes exact occurrence ranges for repeated candidate text', () => {
    const text = 'AVAVAVAV';
    const checks = [];
    const result = planLyricsDisplay(line(text), {
      fits: (candidate, range) => {
        checks.push([candidate, range]);
        expect(candidate).toBe(text.slice(range.sourceStart, range.sourceEnd));
        return candidate.length <= 4;
      },
    });
    expect(result.pages.map((p) => [p.sourceStart, p.sourceEnd])).toEqual([
      [0, 4],
      [4, 8],
    ]);
    expect(checks).toContainEqual(['AVAV', { sourceStart: 0, sourceEnd: 4 }]);
    expect(checks).toContainEqual(['AVAV', { sourceStart: 4, sourceEnd: 8 }]);
  });

  it('uses native T2 before applied starts and never fabricates a model boundary', () => {
    const text = 'first phrase. second phrase. third phrase.';
    const segments = [
      { text: 'first phrase. ', startMs: 1000, endMs: 6000 },
      { text: 'second phrase. ', startMs: 7000, endMs: 12000 },
      { text: 'third phrase.', startMs: 14000, endMs: 20000 },
    ];
    const input = line(text, {
      segments,
      estimatedStarts: {
        version: 1,
        segments: segments.map((s) => ({ ...s, startMs: s.startMs + 100 })),
      },
    });
    const native = planLyricsDisplay(input, { fits });
    expect(native.sourceTiming).toBe('t2');
    expect(native.pageTiming).toBe('t2');
    expect(native.pages.map((p) => p.startMs)).toEqual([1000, 7000, 14000]);
    delete input.segments;
    input.estimatedStarts.segments = segments.map((s) => ({
      text: s.text,
      startMs: s.startMs,
    }));
    const model = planLyricsDisplay(input, { fits });
    expect(model.pageTiming).toBe('model-starts');
    expect(model.pages.map((p) => p.startMs)).toEqual([1000, 7000, 14000]);
    input.estimatedStarts.segments = [{ text, startMs: 1000 }];
    const coarse = planLyricsDisplay(input, { fits });
    expect(coarse.sourceTiming).toBe('model-starts');
    expect(coarse.pageTiming).toBe('layout-estimate');
  });

  it('tries an available word boundary when a preferred punctuation has no onset', () => {
    const text = 'first, second words third phrase';
    const input = line(text, {
      segments: [
        { text: 'first, second ', startMs: 1000, endMs: 6000 },
        { text: 'words third phrase', startMs: 7000, endMs: 24000 },
      ],
    });
    const plan = planLyricsDisplay(input, { fits });
    expect(plan.pageTiming).toBe('t2');
    expect(plan.pages[1].sourceStart).toBe('first, second '.length);
  });

  it('declines impossible density instead of dropping pages or flashing text', () => {
    const plan = planLyricsDisplay(line('a'.repeat(80), { endMs: 3000 }), {
      fits,
    });
    expect(plan.status).toBe('unfit');
    expect(plan.reason).toBe('duration-capacity');
    expect(plan.pages.map((p) => p.text).join('')).toBe('a'.repeat(80));
    expect(planLyricsDisplay(line('hello'), { fits: () => false }).reason).toBe(
      'viewport-capacity',
    );
  });

  it('accepts open native T2 ends and packs densely before declaring a short cue impossible', () => {
    const text = 'first phrase. second phrase. third phrase.';
    const segments = [
      { text: 'first phrase. ', startMs: 1000, endMs: null },
      { text: 'second phrase. ', startMs: 7000, endMs: null },
      { text: 'third phrase.', startMs: 14000, endMs: null },
    ];
    expect(
      planLyricsDisplay(line(text, { segments }), { fits }).pageTiming,
    ).toBe('t2');
    const compact = planLyricsDisplay(
      line('a, b, c, d, e, f, g, h, i', { endMs: 4600 }),
      { fits: (s) => s.length <= 12 },
    );
    expect(compact.status).toBe('ready');
    expect(compact.pages.length).toBeLessThanOrEqual(3);
  });

  it('follows a single clock, rate and backward seek without changing source times', () => {
    const plan = planLyricsDisplay(
      line('first phrase. second phrase. third phrase.'),
      { fits, rate: 2 },
    );
    expect(plan.pages.every((p) => (p.endMs - p.startMs) / 2 >= 1200)).toBe(
      true,
    );
    expect(selectLyricsDisplayPage(plan, plan.pages[1].startMs).index).toBe(1);
    expect(selectLyricsDisplayPage(plan, 1000).index).toBe(0);
    expect(nextLyricsDisplayBoundaryMs(plan, 1000, 2)).toBe(
      (plan.pages[1].startMs - 1000) / 2,
    );
  });

  it('treats explicit vocal changes as batch boundaries even in a fitting Latin run', () => {
    const source = line('sing it with meStay with me', {
      endMs: 20000,
      vocalParts: [
        { from: 0, to: 15, label: '男', role: 'male' },
        { from: 15, to: 27, label: '女', role: 'female' },
      ],
    });
    const plan = planLyricsDisplay(source, {
      fits: () => true,
      sequentialRows: true,
    });
    expect(plan.pages.map((p) => p.text)).toEqual([
      'sing it with me',
      'Stay with me',
    ]);
    expect(plan.pages.map((p) => p.text).join('')).toBe(source.text);
  });

  it('allows literal sung brackets to form a complete batch without a guessed speaker attachment', () => {
    const source = line('[oh oh] stay with me（啊啊）', { vocalParts: [] });
    const plan = planLyricsDisplay(source, {
      fits: (text) => text.trimEnd().length <= 14,
      phraseRows: true,
      sequentialRows: true,
    });
    expect(plan.status).toBe('ready');
    expect(plan.pages.map((p) => p.text).join('')).toBe(source.text);
    expect(plan.pages[0].text.trim()).toBe('[oh oh]');
  });

  it('bounds input and layout work', () => {
    let calls = 0;
    planLyricsDisplay(line('a'.repeat(2000), { endMs: 500000 }), {
      fits: (text) => {
        calls++;
        return text.length <= 100;
      },
    });
    expect(calls).toBeLessThan(500);
    expect(planLyricsDisplay(line('a'.repeat(2001)), { fits }).status).toBe(
      'unsupported',
    );
    const unused = vi.fn(() => true);
    expect(planLyricsDisplay(line(''), { fits: unused }).pages).toEqual([]);
    expect(
      planLyricsDisplay(line('a'.repeat(2001)), { fits: unused }).status,
    ).toBe('unsupported');
    expect(unused).not.toHaveBeenCalled();
  });

  it('slices reading ranges without attaching a whole word reading to half a word', () => {
    const reading = {
      text: '今天一起唱歌',
      segments: [
        { text: '今天', reading: 'きょう' },
        { text: '一起', reading: '' },
        { text: '唱歌', reading: 'うた' },
      ],
      romaji: 'full reading',
    };
    expect(sliceLyricsReading(reading, 2, 6)).toEqual({
      romaji: 'full reading',
      romajiScope: 'line',
      text: '一起唱歌',
      segments: [
        { text: '一起', reading: '' },
        { text: '唱歌', reading: 'うた' },
      ],
    });
    expect(sliceLyricsReading(reading, 1, 4).segments[0]).toEqual({
      text: '天',
      reading: '',
    });
    expect(sliceLyricsReading(reading, 0, 6)).toEqual(reading);
  });
});

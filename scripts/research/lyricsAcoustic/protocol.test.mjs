import { describe, expect, it } from 'vitest';
import protocol from './protocol.cjs';
const {
  textCuts,
  lexicalUnits,
  japaneseWords,
  planWindows,
  mapStarts,
  scoreCuts,
} = protocol;

describe('research acoustic text and window protocol', () => {
  it('uses only explicit small cardinal pronunciations and leaves ambiguous numbers unsupported', () => {
    expect(lexicalUnits('I have 2 dreams', 'en')[2]).toMatchObject({
      text: '2',
      roman: ['two'],
    });
    expect(() => lexicalUnits('I have 01 dreams', 'en')).toThrow();
    expect(() => lexicalUnits('In 2024', 'en')).toThrow();
  });
  it('preserves English word ranges, contractions and punctuation without accepting mixed script', () => {
    const text = '  I don’t want your good-bye!';
    const units = lexicalUnits(text, 'en');
    expect(units.map((w) => w.text)).toEqual([
      'I',
      'don’t',
      'want',
      'your',
      'good',
      'bye',
    ]);
    expect(units.every((w) => text.slice(w.from, w.to) === w.text)).toBe(true);
    const cuts = textCuts(text, 'en');
    expect(
      cuts
        .slice(0, -1)
        .map((from, i) => text.slice(from, cuts[i + 1]))
        .join(''),
    ).toBe(text);
    expect(() => lexicalUnits('I love 你', 'en')).toThrow();
  });

  it('selects text-only original ranges including punctuation and surrogate pairs', () => {
    const text = '  你好，世界！';
    const cuts = textCuts(text, 'zh');
    expect(cuts).toEqual([0, 5, 8]);
    expect(
      cuts
        .slice(0, -1)
        .map((n, i) => text.slice(n, cuts[i + 1]))
        .join(''),
    ).toBe(text);
    expect(() => lexicalUnits('你好world', 'zh')).toThrow();
    expect(() => lexicalUnits('한국어', 'ja')).toThrow();
    expect(() => lexicalUnits('あ日', 'zh')).toThrow();
    expect(() => lexicalUnits('1個', 'zh')).toThrow();
    expect(() => lexicalUnits('😀', 'ja')).toThrow();
    expect(lexicalUnits(' 好，好。', 'zh')).toEqual([
      { text: '好', from: 1, to: 2 },
      { text: '好', from: 3, to: 4 },
    ]);
  });

  it('keeps Japanese display script and occurrence ranges separate from readings', () => {
    const tokens = [
      { surface: 'キラキラ', reading: 'キラキラ' },
      { surface: '歌', reading: 'ウタ' },
    ];
    const words = japaneseWords(' キラキラ歌。', () => tokens);
    expect(words.map((w) => [w.text, w.from, w.to])).toEqual([
      ['キ', 1, 2],
      ['ラ', 2, 3],
      ['キ', 3, 4],
      ['ラ', 4, 5],
      ['歌', 5, 6],
    ]);
    expect(words.at(-1).roman).toEqual(['u', 'ta']);
    expect(
      japaneseWords('キャーっ', () => [
        { surface: 'キャーっ', reading: 'キャーッ' },
      ]).map((w) => w.text),
    ).toEqual(['キャ', 'ー', 'っ']);
    expect(() =>
      japaneseWords('歌', () => [{ surface: '別', reading: 'ベツ' }]),
    ).toThrow();
  });

  it('assigns each occurrence once to bounded contextual windows and subtracts offset', () => {
    const lines = [
      { lineId: 'a', text: '你好', startMs: 1100, endMs: 3000 },
      { lineId: 'b', text: '你好', startMs: 26100, endMs: 31000 },
      { lineId: 'c', text: '你好', startMs: 50100, endMs: 54000 },
      { lineId: 'open', text: '你好', startMs: 56000, endMs: null },
      { lineId: 'long', text: '你好', startMs: 100, endMs: 25000 },
    ];
    const result = planWindows(lines, 60000, 100);
    expect(result.windows[0]).toMatchObject({
      startMs: 0,
      endMs: 30000,
      lineIds: ['a'],
    });
    const ids = result.windows.flatMap((w) => w.lineIds);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.windows.every((w) => w.endMs - w.startMs <= 30000)).toBe(
      true,
    );
    expect(result.declined).toEqual({
      open: 'unresolved-interval',
      long: 'unresolved-interval',
    });
    expect(() => planWindows(lines, Infinity, 0)).toThrow();
    expect(() => planWindows(lines, 60000, 0.1)).toThrow();
  });

  it('maps starts by original occurrence with offset applied exactly once', () => {
    const words = [{ from: 0 }, { from: 2 }, { from: 4 }];
    expect([
      ...mapStarts(
        words,
        [
          { index: 0, start: 0.3 },
          { index: 2, start: 0.6 },
        ],
        10000,
        100,
      ),
    ]).toEqual([
      [0, 10400],
      [4, 10700],
    ]);
    expect(() =>
      mapStarts(
        words,
        [
          { index: 2, start: 0.3 },
          { index: 0, start: 0.6 },
        ],
        0,
        0,
      ),
    ).toThrow();
    expect(() => mapStarts(words, [{ index: 3, start: 0.3 }], 0, 0)).toThrow();
    expect(() => mapStarts(words, [{ index: 0, start: NaN }], 0, 0)).toThrow();
  });

  it('retains missing cuts in the scoring denominator and separates missing references', () => {
    const result = scoreCuts(
      [0, 2, 4, 6],
      new Map([
        [2, 1000],
        [4, 2000],
      ]),
      new Map([[2, 1050]]),
    );
    expect(result).toMatchObject({
      requested: 2,
      scorable: 2,
      noReference: 0,
      retained: 1,
      within100: 1,
      onset100: 0.5,
      coverage: 0.5,
    });
    expect(scoreCuts([0, 1, 2], new Map(), new Map([[1, 20]]))).toMatchObject({
      requested: 1,
      scorable: 0,
      noReference: 1,
      retained: 1,
      onset100: null,
    });
  });
});

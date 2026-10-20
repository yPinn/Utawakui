import { describe, expect, it, vi } from 'vitest';
import { planLyricsPhrases } from './lyricsPhraseBreaks.mjs';

const text = '把所有回憶都留在今晚，we will find our way back home';
const cut = text.indexOf('we');
const line = () => ({
  lineId: 'line-a',
  text,
  startMs: 1000,
  endMs: 12000,
  segments: [
    { text: text.slice(0, cut), startMs: 1200, endMs: 5500 },
    { text: text.slice(cut), startMs: 6000, endMs: 11000 },
  ],
});
describe('mixed long lyric phrase candidates and exact timing', () => {
  it('keeps every source byte and uses native T2 at a natural clause boundary', () => {
    const input = line(),
      before = structuredClone(input);
    const plan = planLyricsPhrases(input);
    expect(plan.status).toBe('ready');
    expect(plan.timingSource).toBe('t2');
    expect(plan.phrases.map((p) => p.text).join('')).toBe(text);
    expect(plan.phrases.map((p) => p.startMs)).toEqual([1200, 6000]);
    expect(plan.phrases[1].sourceStart).toBe(cut);
    expect(input).toEqual(before);
  });
  it.each([
    '君と過ごしたこの街の記憶を抱いて、we will find our way back home',
    '把所有回憶都留在今晚 we will find our way back home',
    '忘れないこの夜の約束、we will find our way home 直到天亮也不會放手',
    "今夜の星を眺めながら、don't say we're alone tonight",
    '🌙把所有回憶都留在今晚，we will find our way back home',
  ])(
    'offers two lossless text groups without inventing timing: %s',
    (value) => {
      const result = planLyricsPhrases({
        text: value,
        startMs: 0,
        endMs: 25000,
      });
      expect(result.status).toBe('unresolved');
      expect(result.reason).toBe('timing-missing');
      expect(result.phrases).toHaveLength(2);
      expect(result.phrases.map((p) => p.text).join('')).toBe(value);
      expect(result.phrases.every((p) => p.startMs === null)).toBe(true);
    },
  );
  it.each([
    '我們一起去party然後沿著回家的路慢慢走',
    '今晚說hello然後我們一起走到遠方',
    '「把所有回憶都留在今晚，we will find our way back home」',
    '今夜 stay with me',
    '沿著海岸慢慢走直到天空放晴直到想起從前的我們',
    '(把所有回憶都留在今晚，we will find our way back home',
  ])(
    'does not treat short loanwords, quotations or ambiguous monolingual text as two clauses: %s',
    (value) => {
      expect(planLyricsPhrases({ text: value }).status).toBe('unchanged');
    },
  );
  it('does not interpolate inside coarse native segments or borrow model time over T2', () => {
    const input = line();
    input.estimatedStarts = {
      version: 1,
      segments: structuredClone(input.segments),
    };
    input.segments = [{ text, startMs: 1000, endMs: 12000 }];
    expect(planLyricsPhrases(input)).toMatchObject({
      status: 'unresolved',
      reason: 'boundary-unmapped',
    });
  });
  it('requires distinct ordered onsets with enough time for both phrases', () => {
    for (const onset of [1200, 1400, 11900, NaN]) {
      const input = line();
      input.segments[1].startMs = onset;
      expect(planLyricsPhrases(input).status).toBe('unresolved');
    }
  });
  it('accepts only fully reconstructed T1+ chunks at their exact onset', () => {
    const input = line();
    input.estimatedStarts = {
      version: 1,
      segments: input.segments.map((s) => ({
        text: s.text,
        startMs: s.startMs,
      })),
    };
    delete input.segments;
    expect(planLyricsPhrases(input)).toMatchObject({
      status: 'ready',
      timingSource: 'model-starts',
    });
    input.estimatedStarts.segments[1].text = 'wrong text';
    expect(planLyricsPhrases(input).status).toBe('unresolved');
  });
  it('uses each occurrence clock, and invalid input cannot yield a timed split', () => {
    const first = line(),
      second = line();
    second.startMs += 20000;
    second.endMs += 20000;
    second.segments = second.segments.map((s) => ({
      ...s,
      startMs: s.startMs + 20000,
      endMs: s.endMs + 20000,
    }));
    expect(
      planLyricsPhrases(second).phrases[1].startMs -
        planLyricsPhrases(first).phrases[1].startMs,
    ).toBe(20000);
    expect(planLyricsPhrases({ ...first, text: 'x'.repeat(2001) }).status).toBe(
      'unchanged',
    );
    expect(planLyricsPhrases(null).status).toBe('unchanged');
  });
  it('rejects damaged clocks and source reconstruction instead of creating a switch', () => {
    for (const change of [
      (input) => {
        input.segments[1] = null;
      },
      (input) => {
        input.segments[1].text = 'other';
      },
      (input) => {
        input.segments[0].startMs = 0;
      },
      (input) => {
        input.segments[1].endMs = null;
      },
      (input) => {
        input.segments[0].endMs = 6500;
      },
      (input) => {
        input.endMs = null;
      },
    ]) {
      const input = line();
      change(input);
      expect(planLyricsPhrases(input).status).toBe('unresolved');
    }
  });
  it('can use existing long native timing without changing the model window limit', () => {
    const input = line();
    input.endMs = 40000;
    input.segments[1].startMs = 25000;
    input.segments[1].endMs = 39000;
    expect(planLyricsPhrases(input)).toMatchObject({
      status: 'ready',
      timingSource: 't2',
    });
  });
  it('preserves the old display path when grapheme segmentation is unavailable', () => {
    vi.stubGlobal('Intl', { Segmenter: undefined });
    try {
      expect(planLyricsPhrases(line()).status).toBe('unchanged');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

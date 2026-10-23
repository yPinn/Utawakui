import { describe, expect, it } from 'vitest';
import {
  makeInput,
  validateSuggestion,
  safeFallback,
  withinBudget,
  modelPayload,
  responseSchema,
} from './contract.mjs';

const sample = {
  id: 'secret-credit-1',
  group: 'credit',
  language: 'zh-Hant',
  text: '你說別走，我仍在這裡，等風再起。',
  referencePartitions: [['secret answer']],
  startMs: 12,
};
const response = (input, extra = {}) => ({
  lineId: input.lineId,
  kind: 'lyric',
  breakIds: [],
  evidenceSpanIds: [],
  reasonCodes: ['no-change'],
  ...extra,
});

describe('offline lyrics text model contract', () => {
  it('renders model input without offsets or labels and constrains the full schema', () => {
    for (const text of [
      'a',
      '[Arranged by: Sky]',
      sample.text,
      '和你一起走過夜晚，等🌙照亮 é가',
    ]) {
      const input = makeInput({ ...sample, text }, 1);
      const payload = modelPayload(input);
      expect(JSON.stringify(payload)).not.toMatch(
        /offset|secret-credit|referencePartitions|startMs/,
      );
      expect(payload.target).toBe(text);
      expect(payload.evidenceSpans).toEqual([{ id: 's0', text }]);
      const schema = responseSchema(input);
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.lineId.enum).toEqual([input.lineId]);
      expect(schema.properties.breakIds.maxItems).toBe(
        input.boundaries.length ? 6 : 0,
      );
      expect(validateSuggestion(input, response(input)).parts.join('')).toBe(
        text,
      );
    }
  });
  it.each([null, [], {}, { reasonCodes: [] }])(
    'rejects incomplete response %j',
    (value) => {
      const input = makeInput(sample, 1);
      expect(() => validateSuggestion(input, value)).toThrow();
    },
  );
  it('supplies opaque occurrence ids and no reference, group, source id or timing', () => {
    const input = makeInput(sample, 7);
    const json = JSON.stringify(input);
    for (const privateValue of [
      'secret-credit',
      'secret answer',
      'referencePartitions',
      'startMs',
      'group',
    ])
      expect(json).not.toContain(privateValue);
    expect(input.lineId).toMatch(/^[a-f0-9]{16}$/);
    expect(makeInput(sample, 8).lineId).not.toBe(input.lineId);
    expect(input.text).toBe(sample.text);
  });
  it('only derives exact source slices and retains source and synthetic timing', () => {
    const input = makeInput(sample, 0);
    const source = Object.freeze({
      text: sample.text,
      startMs: 12345,
      endMs: 23456,
    });
    const point = input.boundaries.find(
      (b) => b.offset === sample.text.indexOf('我'),
    );
    const valid = validateSuggestion(
      input,
      response(input, { breakIds: [point.id] }),
    );
    expect(valid.parts.join('')).toBe(source.text);
    expect(source).toEqual({ text: sample.text, startMs: 12345, endMs: 23456 });
    expect(valid.hidden).toBe(false);
  });
  it.each([
    { text: 'replacement' },
    { startMs: 1 },
    { hidden: true },
    { kind: 'delete' },
    { lineId: 'other' },
    { breakIds: ['unknown'] },
    { reasonCodes: ['invented'] },
    { evidenceSpanIds: ['unknown'] },
  ])('rejects unsupported data: %j', (extra) => {
    const input = makeInput(sample, 1);
    expect(() => validateSuggestion(input, response(input, extra))).toThrow();
  });
  it('rejects duplicate, unordered boundaries and unsafe role detachment', () => {
    const input = makeInput(sample, 1);
    const ids = input.boundaries.map((b) => b.id);
    expect(() =>
      validateSuggestion(
        input,
        response(input, { breakIds: [ids[0], ids[0]] }),
      ),
    ).toThrow();
    expect(() =>
      validateSuggestion(
        input,
        response(input, { breakIds: [ids.at(-1), ids[0]] }),
      ),
    ).toThrow();
    const role = makeInput(
      { language: 'en', text: '[Alice] Stay with me [Bob] Come home' },
      2,
    );
    const afterRole = role.boundaries.find((b) => b.offset === 8);
    if (afterRole)
      expect(() =>
        validateSuggestion(role, response(role, { breakIds: [afterRole.id] })),
      ).toThrow(/role/);
  });
  it('protects quotes, emoji, combining marks, Jamo and literal punctuation', () => {
    for (const text of [
      '他說【別走，等我】再見🌙',
      'Don’t go (oh oh) é🌙',
      '함께 가 (아아) 다시',
    ]) {
      const input = makeInput({ text, language: 'und' }, 1);
      const valid = validateSuggestion(input, response(input));
      expect(valid.parts.join('')).toBe(text);
      const boundaries = new Set(
        [
          ...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(
            text,
          ),
        ].map((x) => x.index),
      );
      expect(input.boundaries.every((b) => boundaries.has(b.offset))).toBe(
        true,
      );
    }
  });
  it('requires evidence for a credit candidate and never hides even a valid one', () => {
    const input = makeInput({ text: '作詞：測試', language: 'zh-Hant' }, 1);
    expect(() =>
      validateSuggestion(input, response(input, { kind: 'credit-candidate' })),
    ).toThrow();
    expect(
      validateSuggestion(
        input,
        response(input, { kind: 'credit-candidate', evidenceSpanIds: ['s0'] }),
      ).hidden,
    ).toBe(false);
  });
  it('falls back losslessly for failure, over-limit or malformed input', () => {
    for (const text of ['（未閉合', 'a'.repeat(2001), '我等你（oh oh）🌙'])
      expect(safeFallback({ text }, 'timeout')).toEqual({
        status: 'fallback',
        reason: 'timeout',
        parts: [text],
        hidden: false,
      });
    expect(makeInput({ text: '（未閉合', language: 'zh' }, 1).skip).toBe(
      'malformed-pairs',
    );
    expect(makeInput({ text: 'a'.repeat(2001), language: 'en' }, 1).skip).toBe(
      'analysis-limit',
    );
  });
  it('enforces exact context reserve, total time and memory boundaries', () => {
    expect(
      withinBudget({
        inputTokens: 3584,
        outputTokens: 512,
        elapsedMs: 2699999,
        memoryBytes: 8 * 2 ** 30 - 1,
      }),
    ).toBe(true);
    for (const patch of [
      { inputTokens: 3585 },
      { elapsedMs: 2700000 },
      { memoryBytes: 8 * 2 ** 30 },
    ])
      expect(
        withinBudget({
          inputTokens: 100,
          outputTokens: 512,
          elapsedMs: 1,
          memoryBytes: 1,
          ...patch,
        }),
      ).toBe(false);
  });
  it('fails closed for invalid budget counters', () => {
    for (const patch of [
      { outputTokens: -1 },
      { outputTokens: 1.5 },
      { elapsedMs: NaN },
      { elapsedMs: -1 },
      { memoryBytes: -1 },
      { memoryBytes: Infinity },
    ])
      expect(
        withinBudget({
          inputTokens: 100,
          outputTokens: 512,
          elapsedMs: 1,
          memoryBytes: 1,
          ...patch,
        }),
      ).toBe(false);
  });
});

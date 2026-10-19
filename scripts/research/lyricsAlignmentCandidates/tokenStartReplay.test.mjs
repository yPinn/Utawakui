import { expect, it } from 'vitest';
import { partialTokenStarts } from './tokenStartReplay.cjs';
import { validateReplayContext } from './tokenStartReplay.cjs';
import { alignStarts } from './protocol.cjs';
const token = (text, from) => ({
  id: 1,
  text: Buffer.from(text).toString('latin1'),
  offsets: { from },
  t_dtw: 99,
});
it('retains untimed ASR text without ever emitting its clock or borrowing DTW', () => {
  const result = partialTokenStarts(
    {
      transcription: [
        {
          tokens: [
            token('你好', 1000),
            token('世界', 6000),
            token('和平', 3000),
          ],
        },
      ],
    },
    5,
  );
  expect(result.missing).toBe(1);
  expect(result.spans.map((s) => [s.start, s.boundary])).toEqual([
    [1, true],
    [1, false],
    [3, true],
  ]);
  const starts = alignStarts(
    [{ lineId: 'line', text: '你好世界和平' }],
    result.spans,
    { mode: 'asr' },
  ).get('line');
  expect(starts.get(2)).toBeUndefined();
  expect(starts.get(4)).toBe(3000);
});
it('rejects backward clocks per token and preserves leading-space token units', () => {
  const r = partialTokenStarts(
    {
      transcription: [
        {
          tokens: [
            token(' 你好', 2000),
            token('世界', 1000),
            token('和平', 3000),
          ],
        },
      ],
    },
    5,
  );
  expect(r.spans[0]).toMatchObject({ text: ' 你好', start: 2, boundary: true });
  expect(r.spans[1].boundary).toBe(false);
  expect(() =>
    partialTokenStarts({ transcription: [{ tokens: [token('你好', 1)] }] }, 31),
  ).toThrow();
  expect(() =>
    partialTokenStarts(
      {
        transcription: [
          {
            tokens: [{ id: 1, text: 'x'.repeat(33000), offsets: { from: 0 } }],
          },
        ],
      },
      5,
    ),
  ).toThrow('budget');
});
it('binds raw replay to the same model and complete window context', () => {
  const expected = { modelManifestSha256: 'a'.repeat(64) },
    method = {
      kind: 'model',
      id: 'base-candidate-research',
      modelManifestSha256: expected.modelManifestSha256,
    };
  const planned = [
    { index: 0, startMs: 500, endMs: 30500, lineIds: ['line-a', 'line-b'] },
  ];
  const recorded = [
    {
      ...planned[0],
      raw: { filename: 'candidate-test-w0.json', sha256: 'b'.repeat(64) },
    },
  ];
  expect(
    validateReplayContext('base', method, expected, planned, recorded).get(0),
  ).toEqual(recorded[0]);
  for (const changed of [
    { id: 'small-candidate-research' },
    { modelManifestSha256: 'c'.repeat(64) },
  ])
    expect(() =>
      validateReplayContext(
        'base',
        { ...method, ...changed },
        expected,
        planned,
        recorded,
      ),
    ).toThrow('model');
  for (const changed of [
    { startMs: 0 },
    { endMs: 30000 },
    { lineIds: ['line-b', 'line-a'] },
  ])
    expect(() =>
      validateReplayContext('base', method, expected, planned, [
        { ...recorded[0], ...changed },
      ]),
    ).toThrow('window');
  expect(() =>
    validateReplayContext('base', method, expected, planned, [
      ...recorded,
      ...recorded,
    ]),
  ).toThrow('window');
});

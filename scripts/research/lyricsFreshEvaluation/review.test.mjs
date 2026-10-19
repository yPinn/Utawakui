import { expect, it } from 'vitest';
import {
  validateLabels,
  summarizeHuman,
  validateKey,
  validateCandidate,
  reviewLineIndices,
} from './review.cjs';
import { sha } from '../lyricsAlignmentCandidates/assets.cjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  prepareAcousticEstimateContext,
  createAcousticEstimate,
  saveTrackAcousticEstimate,
} from '../../../electron/lib/library/lyricsAcousticEstimates.js';
const manifest = {
  schemaVersion: 1,
  corpusSha256: 'a'.repeat(64),
  samples: [{ sampleId: 'r-001', durationMs: 30000, cuts: [1, 2] }],
};
const pending = () => ({
  schemaVersion: 1,
  corpusSha256: manifest.corpusSha256,
  entries: [
    {
      sampleId: 'r-001',
      status: 'pending',
      reviewerId: null,
      content: null,
      onsets: [
        { from: 1, timeMs: null },
        { from: 2, timeMs: null },
      ],
      confidence: null,
      notes: '',
    },
  ],
});
it('includes all normal lines to cover non-target rejection and timing tails', () => {
  const canonical = { lines: [{}, {}, {}, {}] };
  expect(
    reviewLineIndices({ variant: 'normal', targetIndex: 1 }, canonical),
  ).toEqual([0, 1, 2, 3]);
  expect(
    reviewLineIndices({ variant: 'missing-text', targetIndex: 2 }, canonical),
  ).toEqual([2, 0]);
});
it('accepts pending labels without counting them as human evidence', () => {
  const r = validateLabels(pending(), manifest);
  expect(summarizeHuman(r)).toEqual({
    total: 1,
    reviewed: 0,
    uncertain: 0,
    manualOnsets: 0,
  });
});
it('requires real reviewer and content decision before reviewed status', () => {
  const r = pending();
  r.entries[0].status = 'reviewed';
  expect(() => validateLabels(r, manifest)).toThrow();
  Object.assign(r.entries[0], {
    reviewerId: 'reviewer1',
    content: 'exact',
    confidence: 'high',
  });
  expect(summarizeHuman(validateLabels(r, manifest)).reviewed).toBe(1);
});
it('rejects changed corpus, duplicate samples, forged cuts, out of clip clocks and reversed onsets', () => {
  const r = pending();
  r.corpusSha256 = 'b'.repeat(64);
  expect(() => validateLabels(r, manifest)).toThrow();
  const duplicate = pending();
  duplicate.entries.push(duplicate.entries[0]);
  expect(() => validateLabels(duplicate, manifest)).toThrow();
  for (const onsets of [
    [{ from: 7, timeMs: 100 }],
    [
      { from: 1, timeMs: 30001 },
      { from: 2, timeMs: 30002 },
    ],
    [
      { from: 1, timeMs: 200 },
      { from: 2, timeMs: 100 },
    ],
  ]) {
    const x = pending();
    Object.assign(x.entries[0], {
      status: 'reviewed',
      reviewerId: 'r',
      content: 'exact',
      confidence: 'high',
      onsets,
    });
    expect(() => validateLabels(x, manifest)).toThrow();
  }
});
it('does not let pending rows hide supplied human judgments or onset annotations', () => {
  const r = pending();
  r.entries[0].onsets[0].timeMs = 1000;
  expect(() => validateLabels(r, manifest)).toThrow();
});
it('binds the unblinding map and rejects swapped methods, missing or duplicate rows', () => {
  const rows = [{ sampleId: 'r-001', methods: ['qwen', 'qwen-small'] }],
    m = { ...manifest, keyRowsSha256: sha(JSON.stringify(rows)) };
  expect(() => validateKey(m, { rows })).not.toThrow();
  expect(() =>
    validateKey(m, { rows: [{ ...rows[0], methods: ['qwen-small', 'qwen'] }] }),
  ).toThrow();
  expect(() => validateKey(m, { rows: [] })).toThrow();
  expect(() => validateKey(m, { rows: [...rows, ...rows] })).toThrow();
});
it('rejects substituted review audio even if an exporter could hash it again', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-review-'));
  try {
    fs.mkdirSync(path.join(root, 'lyrics'));
    fs.writeFileSync(
      path.join(root, 'lyrics/main.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n你好世界\n',
    );
    fs.writeFileSync(path.join(root, 'audio.wav'), 'synthetic original audio');
    const source = { filename: 'main.vtt', kind: 'manual', offsetMs: 0 },
      context = await prepareAcousticEstimateContext(root, source),
      canonical = {
        documentId: 'doc-1',
        source: { filename: 'main.vtt', sha256: context.source.sha256 },
        lines: [
          { lineId: 'line-1', text: '你好世界', startMs: 1000, endMs: 4000 },
        ],
      },
      document = createAcousticEstimate(context, canonical, []),
      estimate = await saveTrackAcousticEstimate(root, source, document),
      item = { id: 'test-a', offsetMs: 0 };
    await expect(
      validateCandidate(root, item, { canonical, estimate }),
    ).resolves.toBeDefined();
    fs.writeFileSync(path.join(root, 'audio.wav'), 'substituted other audio');
    await expect(
      validateCandidate(root, item, { canonical, estimate }),
    ).rejects.toThrow('review frozen');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

import { expect, it } from 'vitest';
import {
  collectLabels,
  formDraft,
  makeBackup,
  readBackup,
} from './listeningApp.js';
import { validateLabels } from './review.cjs';
const sample = {
  sampleId: 'r-001',
  text: '春天花開',
  cuts: [2],
  startMs: 1000,
  endMs: 5000,
  durationMs: 8000,
};
const manifest = { corpusSha256: 'b'.repeat(64), samples: [sample] };
const pending = {
  sampleId: 'r-001',
  status: 'pending',
  reviewerId: null,
  content: null,
  onsets: [{ from: 2, timeMs: null }],
  confidence: null,
  notes: '',
};
const packet = {
  manifest,
  labels: {
    schemaVersion: 1,
    corpusSha256: manifest.corpusSha256,
    entries: [pending],
  },
  samples: [sample],
};
it('backs up unfinished annotations separately without counting them as reviewed', () => {
  const draft = formDraft(sample, {
    content: 'exact',
    confidence: '',
    reviewed: false,
    notes: '未完成',
    onsets: ['2.345'],
  });
  const p = { ...packet, packetId: 'fixed-packet' },
    backup = makeBackup(p, { 'r-001': draft }, 'listener', validateLabels);
  expect(
    readBackup(p, JSON.parse(JSON.stringify(backup)), validateLabels).drafts[
      'r-001'
    ].onsets[0].timeMs,
  ).toBe(2345);
  expect(
    collectLabels(p, backup.drafts, 'listener', validateLabels).entries[0]
      .status,
  ).toBe('pending');
  expect(() =>
    readBackup({ ...p, packetId: 'other' }, backup, validateLabels),
  ).toThrow();
});
it('does not mark a played or partially annotated sample reviewed', () => {
  const draft = formDraft(sample, {
    content: 'exact',
    confidence: 'high',
    reviewed: false,
    notes: '聽過',
    onsets: ['2.345'],
  });
  expect(
    collectLabels(packet, { 'r-001': draft }, 'listener', validateLabels)
      .entries[0],
  ).toMatchObject({ status: 'pending', content: null });
  expect(packet.labels.entries[0]).toEqual(pending);
});
it('exports explicit human judgments with whole-clip millisecond clocks and validates reviewer and ranges', () => {
  const draft = formDraft(sample, {
    content: 'exact',
    confidence: 'high',
    reviewed: true,
    notes: '',
    onsets: ['2.345'],
  });
  const labels = collectLabels(
    packet,
    { 'r-001': draft },
    'listener',
    validateLabels,
  );
  expect(labels.entries[0].onsets).toEqual([{ from: 2, timeMs: 2345 }]);
  expect(labels.entries[0].status).toBe('reviewed');
  expect(() =>
    collectLabels(packet, { 'r-001': draft }, '', validateLabels),
  ).toThrow();
  expect(() =>
    formDraft(sample, {
      reviewed: true,
      content: 'exact',
      confidence: 'high',
      notes: '',
      onsets: ['9'],
    }),
  ).toThrow();
  expect(() => formDraft(sample, { onsets: ['0x20'], notes: '' })).toThrow();
});

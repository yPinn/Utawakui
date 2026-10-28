import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readReview,
  writeReview,
  invalidateReview,
  deleteReview,
} from './lyricsTimingReviewStore.js';

describe('bounded timing receipt storage', () => {
  let dir;
  const filename = 'main.lrc';
  const document = () => ({
    state: 'confirmed',
    confirmedAt: Date.now(),
    changedAt: Date.now(),
    snapshot: {
      sourceRevision: 'a'.repeat(64),
      timingRevision: 'b'.repeat(64),
      documentId: 'doc',
      profileId: 'v3',
      offsetMs: 0,
      trackIdentity: '1:2',
      mediaBinding: { kind: 'audio-content-sha256', value: 'c'.repeat(64) },
      coverage: { timed: 1, total: 2, segmented: 0 },
    },
  });
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-store-'));
    fs.mkdirSync(path.join(dir, 'lyrics'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  it('writes bounded current state, rejects old bytes and only invalidates confirmed state', () => {
    const empty = readReview(dir, filename);
    expect(empty.status).toBe('unconfirmed');
    const saved = writeReview(dir, filename, empty, document());
    expect(saved.status).toBe('confirmed');
    expect(() => writeReview(dir, filename, empty, document())).toThrowError(
      expect.objectContaining({ code: 'LYRICS_SOURCE_CONFLICT' }),
    );
    invalidateReview({ trackDir: dir, filename });
    const expired = readReview(dir, filename);
    expect(expired.status).toBe('expired');
    invalidateReview({ trackDir: dir, filename });
    expect(readReview(dir, filename).raw).toBe(expired.raw);
    deleteReview(dir, filename);
    deleteReview(dir, filename);
    expect(readReview(dir, filename).status).toBe('unconfirmed');
  });
  it('preserves corrupt, oversized and future documents and refuses their replacement', () => {
    const file = path.join(dir, 'lyrics/review/main.lrc.json');
    fs.mkdirSync(path.dirname(file));
    for (const bytes of [
      '{bad',
      '{}',
      '{"schemaVersion":9}',
      JSON.stringify({ schemaVersion: 1 }),
      ' '.repeat(32769),
    ]) {
      fs.writeFileSync(file, bytes);
      expect(['corrupt', 'unsupported']).toContain(
        readReview(dir, filename).status,
      );
      expect(() =>
        writeReview(dir, filename, { raw: bytes }, document()),
      ).toThrowError(
        expect.objectContaining({ code: 'LYRICS_SOURCE_UNUSABLE' }),
      );
      expect(fs.readFileSync(file, 'utf8')).toBe(bytes);
    }
  });
  it('rejects invalid coverage, offset, revision and media binding', () => {
    const empty = readReview(dir, filename);
    for (const change of [
      { snapshot: { ...document().snapshot, offsetMs: 3600001 } },
      {
        snapshot: {
          ...document().snapshot,
          coverage: { total: 1, timed: 2, segmented: 0 },
        },
      },
      {
        snapshot: {
          ...document().snapshot,
          mediaBinding: { kind: 'path', value: dir },
        },
      },
      { state: 'unknown' },
      { confirmedAt: -1 },
    ]) {
      expect(() =>
        writeReview(dir, filename, empty, { ...document(), ...change }),
      ).toThrow();
    }
    expect(readReview(dir, filename).status).toBe('unconfirmed');
    expect(() => readReview(dir, '../escape.lrc')).toThrow();
    expect(() => readReview(dir, 'a'.repeat(241) + '.lrc')).toThrow();
  });
  it('does not read or mutate redirected sidecars', () => {
    const file = path.join(dir, 'lyrics/review/main.lrc.json'),
      outside = path.join(dir, 'outside.json');
    fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(outside, '{}');
    fs.linkSync(outside, file);
    expect(() => readReview(dir, filename)).toThrowError(
      expect.objectContaining({ code: 'LYRICS_SOURCE_STALE' }),
    );
    expect(() => deleteReview(dir, filename)).toThrow();
    expect(fs.readFileSync(outside, 'utf8')).toBe('{}');
  });
});

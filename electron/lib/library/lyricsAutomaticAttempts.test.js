import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  attemptMetadataKey,
  automaticAttemptDueAt,
  nextAutomaticAttempt,
  normalizeAutomaticAttempt,
} from './lyricsAutomaticAttempts.js';
import {
  deleteLyricsSource,
  readAutomaticLyricsAttempt,
  recordAutomaticLyricsAttempt,
  saveTrackLyricsManifest,
} from './lyrics.js';

const HOUR = 60 * 60 * 1000;
const track = { id: 't', title: 'Song', artist: 'Artist', duration: 200 };
const at = Date.parse('2026-11-16T00:00:00Z');
const step = (previous, reason, when = at) =>
  nextAutomaticAttempt(previous, {
    track,
    result: reason === 'saved' ? { status: 'saved' } : { reason },
    at: when,
  });

describe('automatic lyrics attempt policy', () => {
  it('backs off transient failures at 1h, 6h and 24h', () => {
    let record = step(null, 'provider-unavailable');
    expect(automaticAttemptDueAt(record, track)).toBe(at + HOUR);
    record = step(record, 'request-budget-exhausted');
    expect(automaticAttemptDueAt(record, track)).toBe(at + 6 * HOUR);
    record = step(record, 'acquisition-failed');
    record = step(record, 'acquisition-failed');
    expect(automaticAttemptDueAt(record, track)).toBe(at + 24 * HOUR);
  });

  it('retries misses weekly and stops after three', () => {
    let record = step(null, 'no-exact-candidate');
    expect(automaticAttemptDueAt(record, track)).toBe(at + 7 * 24 * HOUR);
    record = step(step(record, 'no-exact-candidate'), 'no-exact-candidate');
    expect(automaticAttemptDueAt(record, track)).toBe(Infinity);
    expect(automaticAttemptDueAt(record, { ...track, artist: 'Renamed' })).toBe(
      0,
    );
  });

  it('clears on word timing, waits a week after a save and ignores queue skips', () => {
    expect(step(null, 'current-t2')).toBeNull();
    expect(automaticAttemptDueAt(step(null, 'saved'), track)).toBe(
      at + 7 * 24 * HOUR,
    );
    for (const reason of ['background-queue-full', 'busy', 'stale-track'])
      expect(step(null, reason)).toBeUndefined();
  });

  it('keys metadata on title, artist and rounded duration', () => {
    expect(attemptMetadataKey(track)).toBe(
      attemptMetadataKey({ ...track, id: 'other', duration: 200.2 }),
    );
    expect(attemptMetadataKey(track)).not.toBe(
      attemptMetadataKey({ ...track, title: 'Other' }),
    );
    expect(normalizeAutomaticAttempt({ metadataKey: 'x', at: 'bad' })).toBe(
      null,
    );
  });
});

describe('automatic attempt in the lyrics manifest', () => {
  let trackDir;
  afterEach(() => fs.rmSync(trackDir, { recursive: true, force: true }));

  it('survives source edits and opts out after the user removes every source', () => {
    trackDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-attempts-'));
    const record = step(null, 'no-exact-candidate');
    recordAutomaticLyricsAttempt(trackDir, record);
    expect(readAutomaticLyricsAttempt(trackDir)).toEqual(record);

    const lyricsDir = path.join(trackDir, 'lyrics');
    fs.writeFileSync(path.join(lyricsDir, 'manual.lrc'), '[00:01.00]hi');
    saveTrackLyricsManifest(trackDir, [
      { filename: 'manual.lrc', language: 'und', kind: 'local' },
    ]);
    expect(readAutomaticLyricsAttempt(trackDir)).toEqual(record);

    expect(deleteLyricsSource(trackDir, 'manual.lrc')).toBe(true);
    const cleared = readAutomaticLyricsAttempt(trackDir);
    expect(cleared).toMatchObject({ userCleared: true });
    expect(automaticAttemptDueAt(cleared, track)).toBe(Infinity);

    fs.writeFileSync(path.join(lyricsDir, 'again.lrc'), '[00:01.00]hi');
    saveTrackLyricsManifest(trackDir, [
      { filename: 'again.lrc', language: 'und', kind: 'local' },
    ]);
    expect(readAutomaticLyricsAttempt(trackDir)).toBeNull();
  });
});

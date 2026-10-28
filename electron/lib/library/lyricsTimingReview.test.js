import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createLyricsSourceSessions } from './lyricsSourceSessions.js';
import { createLyricsTimingReview } from './lyricsTimingReview.js';
import {
  saveTrackLyricsText,
  setLyricsSourceLabel,
  deleteLyricsSource,
} from './lyrics.js';
import { createHash } from 'node:crypto';
import { saveIndexEntry } from './metadataIndex.js';

describe('Main human timing receipts', () => {
  let dir, track, scope, sources, review;
  const filename = 'main.lrc';
  const intent = (opened) => ['one', filename, opened.sourceSession];
  const open = () => sources.open('one', filename);
  const runtime = () => createLyricsTimingReview({ sources });
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timing-review-'));
    scope = { dir, epoch: 1 };
    track = path.join(dir, 'tracks/one');
    fs.mkdirSync(track, { recursive: true });
    fs.writeFileSync(path.join(track, 'audio.wav'), 'original audio');
    saveIndexEntry(dir, 'one', { title: 'One' });
    saveTrackLyricsText(
      track,
      { filename, kind: 'manual' },
      '[00:01.00]Hello\n[00:02.00]World',
    );
    sources = createLyricsSourceSessions({
      getContext: () => scope,
      beforeMutation: (value) => review.invalidate(value),
    });
    review = runtime();
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  async function confirm() {
    const a = open(),
      ready = await review.get(...intent(a));
    return review.confirm(...intent(a), ready.token);
  }
  it('confirms Main-derived timed coverage, survives restart, and revokes without deleting timing', async () => {
    const receipt = await confirm();
    expect(receipt).toMatchObject({
      status: 'confirmed',
      coverage: { timed: 2, total: 2 },
    });
    expect(JSON.stringify(receipt)).not.toContain(dir);
    review = runtime();
    const a = open(),
      current = await review.get(...intent(a));
    expect(current.status).toBe('confirmed');
    const revoked = await review.revoke(...intent(a), current.token);
    expect(revoked.status).toBe('revoked');
    expect(
      fs.readFileSync(path.join(track, 'lyrics/main.lrc'), 'utf8'),
    ).toContain('Hello');
    expect((await review.get(...intent(open()))).status).toBe('revoked');
  });
  it('preserves no-op and label changes, but offset A-B-A remains expired across restart', async () => {
    await confirm();
    const a = open();
    sources.saveOffset(...intent(a).slice(0, 2), 0, a.sourceSession);
    setLyricsSourceLabel(track, filename, 'Renamed');
    expect((await review.get(...intent(open()))).status).toBe('confirmed');
    sources.saveOffset('one', filename, 100, a.sourceSession);
    const b = open();
    sources.saveOffset('one', filename, 0, b.sourceSession);
    review = runtime();
    expect((await review.get(...intent(open()))).status).toBe('expired');
  });
  it('rejects stale receipt tokens and old source revisions', async () => {
    const a = open(),
      ready = await review.get(...intent(a)),
      old = await review.get(...intent(a));
    await review.confirm(...intent(a), ready.token);
    await expect(review.revoke(...intent(a), old.token)).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_CONFLICT',
    });
    const current = await review.get(...intent(a));
    sources.saveOffset('one', filename, 100, a.sourceSession);
    await expect(
      review.confirm(...intent(a), current.token),
    ).rejects.toMatchObject({ code: 'LYRICS_SOURCE_CONFLICT' });
  });
  it('does not confirm T0 and reports mixed coverage without creating timing', async () => {
    fs.writeFileSync(path.join(track, 'lyrics/main.lrc'), 'Hello');
    expect(await review.get(...intent(open()))).toMatchObject({
      status: 'not-applicable',
      coverage: { timed: 0 },
    });
    fs.writeFileSync(
      path.join(track, 'lyrics/main.lrc'),
      '[00:01.00]Hello\nWorld',
    );
    const a = open();
    sources.saveTiming(
      'one',
      filename,
      a.timing.sourceFingerprint,
      {
        schemaVersion: 1,
        documentId: 'mixed',
        normalizerProfileId: a.timing.normalizerProfileId,
        source: { filename, sha256: a.timing.sourceFingerprint },
        lines: [
          { lineId: 'one', text: 'Hello', startMs: 1000, endMs: null },
          { lineId: 'two', text: 'World', startMs: null, endMs: null },
        ],
      },
      a.sourceSession,
    );
    expect(await confirm()).toMatchObject({
      status: 'confirmed',
      coverage: { timed: 1, total: 2 },
    });
    expect(open().timing.document.lines[1].startMs).toBeNull();
  });
  it('expires media replacement and never revives after changing back', async () => {
    await confirm();
    fs.writeFileSync(path.join(track, 'audio.wav'), 'replacement');
    expect((await review.get(...intent(open()))).status).toBe('expired');
    fs.writeFileSync(path.join(track, 'audio.wav'), 'original audio');
    review = runtime();
    expect((await review.get(...intent(open()))).status).toBe('expired');
  });
  it('expires an observed missing original, even when identical media later returns', async () => {
    await confirm();
    const a = open();
    fs.unlinkSync(path.join(track, 'audio.wav'));
    await expect(review.get(...intent(a))).rejects.toBeTruthy();
    fs.writeFileSync(path.join(track, 'audio.wav'), 'original audio');
    expect((await review.get(...intent(open()))).status).toBe('expired');
  });
  it('keeps confirmed receipt revision on a no-op confirmation', async () => {
    const first = await confirm();
    const a = open(),
      current = await review.get(...intent(a));
    expect((await review.confirm(...intent(a), current.token)).revision).toBe(
      first.revision,
    );
  });
  it('cancels a dispatched confirmation before verification completes', async () => {
    const pending = Promise.withResolvers();
    const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
    let calls = 0;
    review = createLyricsTimingReview({
      sources,
      hashAudio: () =>
        ++calls === 1 ? Promise.resolve(binding) : pending.promise,
    });
    const a = open(),
      ready = await review.get(...intent(a));
    const now = new Date(Date.now() + 1000);
    fs.utimesSync(path.join(track, 'audio.wav'), now, now);
    const confirming = review.confirm(...intent(a), ready.token);
    await Promise.resolve();
    await Promise.resolve();
    review.cancel(ready.token);
    pending.resolve(binding);
    await expect(confirming).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_STALE',
    });
    expect(fs.existsSync(path.join(track, 'lyrics/review/main.lrc.json'))).toBe(
      false,
    );
    expect(() => review.cancel({ path: dir })).toThrow();
  });
  it('preserves no-op timing, expires real edits, and does not revive after timing A-B-A', async () => {
    const initial = open();
    const doc = {
      schemaVersion: 1,
      documentId: 'timed',
      normalizerProfileId: initial.timing.normalizerProfileId,
      source: { filename, sha256: initial.timing.sourceFingerprint },
      lines: [
        {
          lineId: 'one',
          text: 'Hello',
          startMs: 1000,
          endMs: 2000,
          segments: [
            { segmentId: 's', text: 'Hello', startMs: 1000, endMs: 2000 },
          ],
        },
      ],
    };
    sources.saveTiming(
      'one',
      filename,
      initial.timing.sourceFingerprint,
      doc,
      initial.sourceSession,
    );
    await confirm();
    const a = open();
    sources.saveTiming(
      'one',
      filename,
      a.timing.sourceFingerprint,
      doc,
      a.sourceSession,
    );
    expect(await review.get(...intent(open()))).toMatchObject({
      status: 'confirmed',
      coverage: { segmented: 1 },
    });
    const edited = { ...doc, lines: [{ ...doc.lines[0], startMs: 900 }] };
    sources.saveTiming(
      'one',
      filename,
      a.timing.sourceFingerprint,
      edited,
      a.sourceSession,
    );
    const b = open();
    sources.saveTiming(
      'one',
      filename,
      b.timing.sourceFingerprint,
      doc,
      b.sourceSession,
    );
    review = runtime();
    expect((await review.get(...intent(open()))).status).toBe('expired');
  });
  it('isolates sources, keeps A after A-B-A, and deletes only the removed source receipt', async () => {
    await confirm();
    saveTrackLyricsText(
      track,
      { filename: 'other.lrc', kind: 'manual' },
      '[00:02.00]Other',
    );
    const b = sources.open('one', 'other.lrc');
    expect((await review.get('one', 'other.lrc', b.sourceSession)).status).toBe(
      'unconfirmed',
    );
    expect((await review.get(...intent(open()))).status).toBe('confirmed');
    deleteLyricsSource(track, filename);
    expect(fs.existsSync(path.join(track, 'lyrics/review/main.lrc.json'))).toBe(
      false,
    );
  });
  it('migrates only media equivalence accepted by the fresh alias verifier', async () => {
    await confirm();
    const hash = createHash('sha256').update('original audio').digest('hex');
    fs.writeFileSync(path.join(track, 'audio.wav'), 'same audio with new tags');
    let checked = 0;
    review = createLyricsTimingReview({
      sources,
      aliases: async (_dir, id, current) => {
        expect(id).toBe('one');
        expect(current).not.toBe(hash);
        checked++;
        return [hash];
      },
    });
    expect((await review.get(...intent(open()))).status).toBe('confirmed');
    expect(checked).toBe(1);
    review = runtime();
    expect((await review.get(...intent(open()))).status).toBe('confirmed');
  });
  it('does not overwrite corrupt timing or follow a redirected receipt directory', async () => {
    const timingDir = path.join(track, 'lyrics/timing');
    fs.mkdirSync(timingDir);
    fs.writeFileSync(path.join(timingDir, 'main.lrc.json'), '{bad');
    expect((await review.get(...intent(open()))).status).toBe('unusable');
    fs.unlinkSync(path.join(timingDir, 'main.lrc.json'));
    const outside = path.join(dir, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(track, 'lyrics/review'), 'junction');
    await expect(review.get(...intent(open()))).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_STALE',
    });
    expect(fs.readdirSync(outside)).toEqual([]);
  });
  it('does not install a receipt after the verification deadline', async () => {
    const a = open(),
      pending = Promise.withResolvers();
    review = createLyricsTimingReview({
      sources,
      timeoutMs: 5,
      hashAudio: () => pending.promise,
    });
    await expect(review.get(...intent(a))).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_STALE',
    });
    pending.resolve({ kind: 'audio-content-sha256', value: 'a'.repeat(64) });
    await Promise.resolve();
    expect(fs.existsSync(path.join(track, 'lyrics/review/main.lrc.json'))).toBe(
      false,
    );
  });
  it('keeps corrupt and future receipt bytes instead of overwriting them', async () => {
    await confirm();
    const file = path.join(track, 'lyrics/review/main.lrc.json');
    for (const bytes of ['{bad', '{"schemaVersion":99}']) {
      fs.writeFileSync(file, bytes);
      const result = await review.get(...intent(open()));
      expect(['corrupt', 'unsupported']).toContain(result.status);
      expect(result.token).toBeUndefined();
      expect(fs.readFileSync(file, 'utf8')).toBe(bytes);
    }
  });
  it('refuses a confirmation cancelled or changed in scope during media verification', async () => {
    const a = open();
    let finish;
    review = createLyricsTimingReview({
      sources,
      hashAudio: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const pending = review.get(...intent(a));
    await Promise.resolve();
    scope = { ...scope, epoch: 2 };
    finish({ kind: 'audio-content-sha256', value: 'a'.repeat(64) });
    await expect(pending).rejects.toMatchObject({
      code: 'LYRICS_SOURCE_STALE',
    });
    expect(fs.existsSync(path.join(track, 'lyrics/review/main.lrc.json'))).toBe(
      false,
    );
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLyricsSourceSessions } from './lyricsSourceSessions.js';
import { saveTrackLyricsText, setLyricsSourceLabel } from './lyrics.js';
import { saveIndexEntry } from './metadataIndex.js';

describe('Main lyrics source sessions', () => {
  let root, scope, trackDir, runtime;
  const source = 'main.lrc';
  const documentFor = (opened, startMs = 1000) => ({
    schemaVersion: 1,
    documentId: 'doc',
    normalizerProfileId: opened.timing.normalizerProfileId,
    source: { filename: source, sha256: opened.timing.sourceFingerprint },
    lines: [{ lineId: 'line', text: 'Hello', startMs, endMs: null }],
  });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-source-session-'));
    trackDir = path.join(root, 'tracks', 'one');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.wav'), 'audio');
    saveIndexEntry(root, 'one', { title: 'One' });
    saveTrackLyricsText(
      trackDir,
      { filename: source, language: 'en', kind: 'manual' },
      '[00:01.00]Hello',
    );
    scope = { dir: root, epoch: 1 };
    runtime = createLyricsSourceSessions({ getContext: () => scope });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it('returns only opaque source authority and rejects another timing revision of the same text', () => {
    const a = runtime.open('one', source),
      b = runtime.open('one', source);
    expect(Object.keys(a.sourceSession).sort()).toEqual([
      'id',
      'offsetRevision',
      'timingRevision',
    ]);
    expect(JSON.stringify(a.sourceSession)).not.toContain(root);
    const saved = runtime.saveTiming(
      'one',
      source,
      a.timing.sourceFingerprint,
      documentFor(a),
      a.sourceSession,
    );
    expect(saved.document.lines[0].startMs).toBe(1000);
    expect(() =>
      runtime.saveTiming(
        'one',
        source,
        b.timing.sourceFingerprint,
        documentFor(b, 2000),
        b.sourceSession,
      ),
    ).toThrowError(expect.objectContaining({ code: 'LYRICS_SOURCE_CONFLICT' }));
  });
  it('reuses a still-valid source authority for refreshes without rebasing timing', () => {
    const a = runtime.open('one', source),
      b = runtime.open('one', source);
    expect(b.sourceSession.id).toBe(a.sourceSession.id);
    runtime.cancel(a.sourceSession.id);
    expect(runtime.open('one', source).sourceSession.id).not.toBe(
      a.sourceSession.id,
    );
  });
  it('keeps timing and offset CAS independent and preserves no-op offset revision', () => {
    const a = runtime.open('one', source);
    const noChange = runtime.saveOffset('one', source, 0, a.sourceSession);
    expect(noChange.sourceSession.offsetRevision).toBe(
      a.sourceSession.offsetRevision,
    );
    const timing = runtime.saveTiming(
      'one',
      source,
      a.timing.sourceFingerprint,
      documentFor(a),
      a.sourceSession,
    );
    const offset = runtime.saveOffset('one', source, 100, a.sourceSession);
    expect(offset.sourceSession.timingRevision).toBe(
      timing.sourceSession.timingRevision,
    );
    const next = runtime.saveTiming(
      'one',
      source,
      a.timing.sourceFingerprint,
      documentFor(a, 1500),
      timing.sourceSession,
    );
    expect(next.sourceSession.offsetRevision).toBe(
      offset.sourceSession.offsetRevision,
    );
  });
  it.each([100.5, 3600001, Infinity])(
    'rejects invalid offset intent %s without mutation',
    (value) => {
      const a = runtime.open('one', source);
      expect(() =>
        runtime.saveOffset('one', source, value, a.sourceSession),
      ).toThrowError(
        expect.objectContaining({ code: 'LYRICS_SOURCE_INVALID' }),
      );
      expect(runtime.open('one', source).source.offsetMs ?? 0).toBe(0);
    },
  );
  it('rejects untrusted authority fields, invalid documents and invalid targets', () => {
    const a = runtime.open('one', source);
    expect(() =>
      runtime.saveOffset('one', source, 100, {
        ...a.sourceSession,
        path: root,
      }),
    ).toThrow();
    expect(() =>
      runtime.saveTiming(
        'one',
        source,
        a.timing.sourceFingerprint,
        documentFor(a, -1),
        a.sourceSession,
      ),
    ).toThrowError(expect.objectContaining({ code: 'LYRICS_SOURCE_INVALID' }));
    expect(() => runtime.open('../one', source)).toThrow();
    expect(() => runtime.open('one', '../main.lrc')).toThrow();
    expect(runtime.open('missing', source)).toBeNull();
    expect(runtime.open('one', 'absent.lrc')).toBeNull();
  });
  it('does not revive an authority evicted from the bounded session table', () => {
    const a = runtime.open('one', source);
    for (let epoch = 2; epoch < 132; epoch++) {
      scope = { ...scope, epoch };
      runtime.open('one', source);
    }
    scope = { ...scope, epoch: 1 };
    expect(() =>
      runtime.saveOffset('one', source, 100, a.sourceSession),
    ).toThrow();
  });
  it('keeps no-op timing bytes and revision while returning to old values creates a new revision', () => {
    const initial = runtime.open('one', source);
    const a = runtime.saveTiming(
      'one',
      source,
      initial.timing.sourceFingerprint,
      documentFor(initial),
      initial.sourceSession,
    );
    const file = path.join(trackDir, 'lyrics/timing/main.lrc.json'),
      bytes = fs.readFileSync(file, 'utf8');
    const noop = runtime.saveTiming(
      'one',
      source,
      initial.timing.sourceFingerprint,
      documentFor(initial),
      a.sourceSession,
    );
    expect(fs.readFileSync(file, 'utf8')).toBe(bytes);
    expect(noop.sourceSession.timingRevision).toBe(
      a.sourceSession.timingRevision,
    );
    const b = runtime.saveTiming(
      'one',
      source,
      initial.timing.sourceFingerprint,
      documentFor(initial, 2000),
      a.sourceSession,
    );
    const back = runtime.saveTiming(
      'one',
      source,
      initial.timing.sourceFingerprint,
      documentFor(initial),
      b.sourceSession,
    );
    expect(back.sourceSession.timingRevision).not.toBe(
      a.sourceSession.timingRevision,
    );
  });
  it('serializes offset revisions, detects ABA and leaves label changes outside timing authority', () => {
    const opened = runtime.open('one', source),
      a = opened.sourceSession;
    setLyricsSourceLabel(trackDir, source, 'Practice');
    const b = runtime.saveOffset('one', source, 500, a);
    expect(b.source.offsetMs).toBe(500);
    const c = runtime.saveOffset('one', source, 0, b.sourceSession);
    expect(c.sourceSession.offsetRevision).not.toBe(a.offsetRevision);
    expect(() => runtime.saveOffset('one', source, 700, a)).toThrowError(
      expect.objectContaining({ code: 'LYRICS_SOURCE_CONFLICT' }),
    );
  });
  it.each(['cancel', 'epoch', 'source'])(
    'invalidates %s without touching saved timing',
    (change) => {
      const a = runtime.open('one', source);
      if (change === 'cancel') runtime.cancel(a.sourceSession.id);
      if (change === 'epoch') scope = { ...scope, epoch: 2 };
      if (change === 'source')
        fs.writeFileSync(
          path.join(trackDir, 'lyrics', source),
          '[00:02.00]Changed',
        );
      expect(() =>
        runtime.saveTiming(
          'one',
          source,
          a.timing.sourceFingerprint,
          documentFor(a),
          a.sourceSession,
        ),
      ).toThrow();
      expect(
        fs.existsSync(path.join(trackDir, 'lyrics/timing/main.lrc.json')),
      ).toBe(false);
    },
  );
  it('revokes authority as soon as a track deletion begins', () => {
    const opened = runtime.open('one', source);
    runtime.invalidateTrack('one');
    expect(() =>
      runtime.saveOffset('one', source, 100, opened.sourceSession),
    ).toThrow();
    expect(fs.existsSync(path.join(trackDir, 'audio.wav'))).toBe(true);
  });
  it('does not follow a redirected timing directory when the sidecar is absent', () => {
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(trackDir, 'lyrics/timing'), 'junction');
    expect(() => runtime.open('one', source)).toThrow();
    expect(fs.readdirSync(outside)).toEqual([]);
  });
  it.each(['bad', 'future'])(
    'refuses %s timing instead of overwriting it',
    (kind) => {
      const file = path.join(trackDir, 'lyrics/timing/main.lrc.json');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        kind === 'bad' ? 'broken' : JSON.stringify({ schemaVersion: 99 }),
      );
      const before = fs.readFileSync(file, 'utf8'),
        opened = runtime.open('one', source);
      expect(() =>
        runtime.saveTiming(
          'one',
          source,
          opened.timing.sourceFingerprint,
          documentFor(opened),
          opened.sourceSession,
        ),
      ).toThrow();
      expect(fs.readFileSync(file, 'utf8')).toBe(before);
    },
  );
});

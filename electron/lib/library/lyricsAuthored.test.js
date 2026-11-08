import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { saveIndexEntry } from './metadataIndex.js';
import {
  deleteLyricsSource,
  listTrackLyricsSources,
  saveTrackLyricsText,
} from './lyrics.js';
import { createLyricsSourceSessions } from './lyricsSourceSessions.js';

describe('local lyric corrections', () => {
  let dir, trackDir, runtime;
  const source = 'original.lrc';
  const trackId = 'one';
  const context = () => ({ dir, epoch: 1 });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-authored-'));
    trackDir = path.join(dir, 'tracks', trackId);
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.wav'), 'audio');
    saveIndexEntry(dir, trackId, { title: 'One' });
    saveTrackLyricsText(
      trackDir,
      { filename: source, kind: 'manual', language: 'zh-TW', offsetMs: 150 },
      '[00:01.00]<00:01.00>你<00:02.00>號<00:03.00>\n[00:04.00]<00:04.00>你<00:05.00>號<00:06.00>\n[00:07.00]（和聲）',
    );
    runtime = createLyricsSourceSessions({ getContext: context });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('forks saved timing, updates only the edited line and survives loss of the original', () => {
    const original = runtime.open(trackId, source);
    const copy = runtime.forkAuthored(trackId, source, original.sourceSession);
    const filename = copy.source.filename;
    expect(listTrackLyricsSources(trackDir).preference).toEqual({
      filename,
      origin: 'user',
    });
    expect(copy.source).toMatchObject({ kind: 'authored', offsetMs: 150 });
    const before = runtime.open(trackId, filename);
    const [first, second, third] = before.timing.document.lines;
    expect(first.segments).toHaveLength(2);
    expect(second.segments).toHaveLength(2);

    const saved = runtime.editAuthored(
      trackId,
      filename,
      before.sourceSession,
      {
        lineId: first.lineId,
        text: '你好',
      },
    );
    expect(saved.timing.document.lines).toEqual([
      {
        lineId: first.lineId,
        text: '你好',
        startMs: 1000,
        endMs: 4000,
        endInferred: true,
      },
      second,
      third,
    ]);
    expect(saved.timing.recheckLineIds).toEqual([first.lineId]);
    expect(runtime.open(trackId, source).text).toBe(original.text);
    expect(() =>
      runtime.editAuthored(trackId, filename, before.sourceSession, {
        lineId: first.lineId,
        text: '過期',
      }),
    ).toThrow();
    expect(deleteLyricsSource(trackDir, source)).toBe(true);
    const reopened = createLyricsSourceSessions({ getContext: context }).open(
      trackId,
      filename,
    );
    expect(reopened.timing).toEqual(saved.timing);
    expect(reopened.source.offsetMs).toBe(150);
  });

  it('keeps T0 rows and the work file intact on rejected edits', () => {
    saveTrackLyricsText(
      trackDir,
      { filename: 'plain.lrc', kind: 'manual' },
      '同一句\n同一句',
    );
    const original = runtime.open(trackId, 'plain.lrc');
    const copy = runtime.forkAuthored(
      trackId,
      'plain.lrc',
      original.sourceSession,
    );
    const opened = runtime.open(trackId, copy.source.filename);
    const [first, second] = opened.timing.document.lines;
    expect(first.lineId).not.toBe(second.lineId);
    expect(opened.timing.document.granularity).toBe('T0');
    expect(() =>
      runtime.editAuthored(
        trackId,
        copy.source.filename,
        opened.sourceSession,
        {
          lineId: first.lineId,
          text: ' '.repeat(2100),
        },
      ),
    ).toThrow();
    expect(runtime.open(trackId, copy.source.filename).timing).toEqual(
      opened.timing,
    );
  });

  it('clears timing on structural edits and repairs a dependent inferred end', () => {
    const original = runtime.open(trackId, source);
    const { source: copy } = runtime.forkAuthored(
      trackId,
      source,
      original.sourceSession,
    );
    const before = runtime.open(trackId, copy.filename);
    const [first, second, third] = before.timing.document.lines;
    const saved = runtime.editAuthored(
      trackId,
      copy.filename,
      before.sourceSession,
      {
        lineId: second.lineId,
        operation: 'split',
        text: '你\n號',
      },
    );
    const lines = saved.timing.document.lines;
    expect(lines[0]).toMatchObject({ lineId: first.lineId, endMs: null });
    expect(lines[0].endInferred).toBeUndefined();
    expect(lines.slice(1, 3)).toMatchObject([
      { lineId: second.lineId, text: '你', startMs: null, endMs: null },
      { text: '號', startMs: null, endMs: null },
    ]);
    expect(lines[3]).toEqual(third);
  });

  it('saves partial timing and resumes from the same plain-text line identities', () => {
    const plain = 'plain.lrc';
    saveTrackLyricsText(
      trackDir,
      { filename: plain, kind: 'manual' },
      'あ\nあ\n♪「歌」',
    );
    const input = runtime.open(trackId, plain);
    const { source: copy } = runtime.forkAuthored(
      trackId,
      plain,
      input.sourceSession,
    );
    const opened = runtime.open(trackId, copy.filename);
    const [first, second, third] = opened.timing.document.lines;
    runtime.saveTiming(
      trackId,
      copy.filename,
      opened.timing.sourceFingerprint,
      {
        ...opened.timing.document,
        lines: [
          { ...first, startMs: 1100 },
          second,
          { ...third, startMs: 5100 },
        ],
      },
      opened.sourceSession,
    );
    const restarted = createLyricsSourceSessions({ getContext: context });
    const read = restarted.open(trackId, copy.filename);
    expect(read.timing.document.lines.map((line) => line.startMs)).toEqual([
      1100,
      null,
      5100,
    ]);
    expect(read.timing.document.lines.map((line) => line.lineId)).toEqual([
      first.lineId,
      second.lineId,
      third.lineId,
    ]);
    const complete = restarted.saveTiming(
      trackId,
      copy.filename,
      read.timing.sourceFingerprint,
      {
        ...read.timing.document,
        lines: read.timing.document.lines.map((line) =>
          line.lineId === second.lineId ? { ...line, startMs: 3000 } : line,
        ),
      },
      read.sourceSession,
    );
    expect(complete.document.granularity).toBe('T1');
    expect(complete.document.lines.map((line) => line.startMs)).toEqual([
      1100, 3000, 5100,
    ]);
    expect(restarted.open(trackId, plain).text).toBe(input.text);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadResearchInput,
  loadAutomaticResearchInput,
  automaticInputCurrent,
} from './input.js';
import {
  saveTrackLyricsManifest,
  setLyricsSourcePreference,
  setLyricsSourceOffset,
} from '../library/lyrics.js';
import { saveTrackLyricsTiming } from '../library/lyricsTiming.js';
let root, track;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-input-'));
  track = path.join(root, 'tracks/song');
  fs.mkdirSync(path.join(track, 'lyrics'), { recursive: true });
  fs.writeFileSync(path.join(track, 'audio.wav'), 'fixture audio');
  fs.writeFileSync(
    path.join(track, 'lyrics/main.vtt'),
    'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n今天測試\n',
  );
  fs.writeFileSync(
    path.join(track, 'lyrics/ja.vtt'),
    'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n今日の歌\n',
  );
  fs.writeFileSync(
    path.join(root, 'library.json'),
    JSON.stringify({ version: 1, tracks: { song: { duration: 30 } } }),
  );
  saveTrackLyricsManifest(track, [
    { filename: 'main.vtt', kind: 'manual', language: 'zh' },
    { filename: 'ja.vtt', kind: 'manual', language: 'ja' },
  ]);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const intent = { trackId: 'song', language: 'zh', lineIndex: 0 };
describe('main-derived research input', () => {
  it('versions metadata language independently of the preserved estimate identity', async () => {
    const first = await loadResearchInput(root, intent, {
      filename: 'main.vtt',
    });
    saveTrackLyricsManifest(track, [
      { filename: 'main.vtt', kind: 'manual', language: 'ja' },
      { filename: 'ja.vtt', kind: 'manual', language: 'ja' },
    ]);
    const next = await loadResearchInput(root, intent, {
      filename: 'main.vtt',
    });
    expect(next.identity).toBe(first.identity);
    expect(next.sourceRevision).not.toBe(first.sourceRevision);
    expect(automaticInputCurrent(root, first)).toBe(false);
  });
  it('keeps a requested source through preference changes but detects its own revisions', async () => {
    setLyricsSourcePreference(track, 'ja.vtt', 'user');
    const input = await loadAutomaticResearchInput(
      root,
      'song',
      'auto',
      'main.vtt',
    );
    expect(input.source.filename).toBe('main.vtt');
    expect(input.language).toBe('zh');
    setLyricsSourcePreference(track, 'main.vtt', 'user');
    expect(automaticInputCurrent(root, input)).toBe(true);
    setLyricsSourcePreference(track, 'ja.vtt', 'user');
    expect(automaticInputCurrent(root, input)).toBe(true);
    fs.appendFileSync(path.join(track, 'lyrics/main.vtt'), '\n');
    expect(automaticInputCurrent(root, input)).toBe(false);
    expect(
      await loadAutomaticResearchInput(root, 'song', 'auto', 'missing.lrc'),
    ).toMatchObject({ status: 'skipped', reason: 'source-changed' });
  });
  it('admits an und document by line evidence and keeps its mixed line declined', async () => {
    fs.writeFileSync(
      path.join(track, 'lyrics/main.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nDo you enjoy testing?\n\n00:00:05.000 --> 00:00:08.000\n君の local signal\n',
    );
    saveTrackLyricsManifest(track, [
      { filename: 'main.vtt', kind: 'manual', language: 'mul', offsetMs: -250 },
    ]);
    setLyricsSourcePreference(track, 'main.vtt', 'user');
    const before = fs.readFileSync(path.join(track, 'lyrics/lyrics.json'));
    const input = await loadAutomaticResearchInput(root, 'song');
    expect(input.routing.lines.map((l) => l.language)).toEqual(['en', null]);
    expect(input.source.offsetMs).toBe(-250);
    expect(fs.readFileSync(path.join(track, 'lyrics/lyrics.json'))).toEqual(
      before,
    );
  });
  it('routes an English preferred source without changing its language, preference or offset', async () => {
    fs.writeFileSync(
      path.join(track, 'lyrics/main.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nI will always love you and I will never let you go\n',
    );
    saveTrackLyricsManifest(track, [
      { filename: 'main.vtt', kind: 'manual', language: 'und', offsetMs: -500 },
    ]);
    setLyricsSourcePreference(track, 'main.vtt', 'user');
    const before = fs.readFileSync(path.join(track, 'lyrics/lyrics.json'));
    expect(await loadAutomaticResearchInput(root, 'song')).toMatchObject({
      language: 'en',
      languageOrigin: 'content',
      source: { filename: 'main.vtt', language: 'und', offsetMs: -500 },
    });
    expect(fs.readFileSync(path.join(track, 'lyrics/lyrics.json'))).toEqual(
      before,
    );
  });

  it('analyzes the preferred und source by body without changing its metadata or offset', async () => {
    fs.writeFileSync(
      path.join(track, 'lyrics/main.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n我在夜裡想著你，你的聲音讓我忘了時間，我們還在這裡等著明天。\n',
    );
    saveTrackLyricsManifest(track, [
      { filename: 'main.vtt', kind: 'manual', language: 'und', offsetMs: -500 },
      { filename: 'ja.vtt', kind: 'manual', language: 'ja' },
    ]);
    setLyricsSourcePreference(track, 'main.vtt', 'user');
    const before = fs.readFileSync(
      path.join(track, 'lyrics/lyrics.json'),
      'utf8',
    );
    const input = await loadAutomaticResearchInput(root, 'song');
    expect(input).toMatchObject({
      language: 'zh',
      languageOrigin: 'content',
      source: { filename: 'main.vtt', language: 'und', offsetMs: -500 },
    });
    expect(
      fs.readFileSync(path.join(track, 'lyrics/lyrics.json'), 'utf8'),
    ).toBe(before);
  });
  it('returns an explicit unknown reason and accepts one-task manual language without switching source', async () => {
    saveTrackLyricsManifest(track, [
      { filename: 'main.vtt', kind: 'manual', language: 'und' },
    ]);
    setLyricsSourcePreference(track, 'main.vtt', 'user');
    expect(await loadAutomaticResearchInput(root, 'song')).toMatchObject({
      status: 'skipped',
      reason: 'language-unknown',
    });
    expect(await loadAutomaticResearchInput(root, 'song', 'ja')).toMatchObject({
      language: 'ja',
      languageOrigin: 'manual',
      source: { filename: 'main.vtt' },
    });
  });
  it('keeps unsupported metadata closed and skips a source containing only mixed T1 lines', async () => {
    fs.writeFileSync(
      path.join(track, 'lyrics/main.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nDo you enjoy testing?\n',
    );
    saveTrackLyricsManifest(track, [
      { filename: 'main.vtt', kind: 'manual', language: 'ko' },
    ]);
    setLyricsSourcePreference(track, 'main.vtt', 'user');
    expect(await loadAutomaticResearchInput(root, 'song')).toMatchObject({
      status: 'skipped',
      reason: 'language-unsupported',
    });
    fs.writeFileSync(
      path.join(track, 'lyrics/main.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nBright signal 君の文字\n',
    );
    saveTrackLyricsManifest(track, [
      { filename: 'main.vtt', kind: 'manual', language: 'ja' },
    ]);
    expect(await loadAutomaticResearchInput(root, 'song')).toMatchObject({
      status: 'skipped',
      reason: 'unsupported-lyrics',
    });
  });
  it('distinguishes existing T2 from missing sources and missing line timing', async () => {
    const input = await loadResearchInput(root, intent);
    const canonical = structuredClone(input.canonical);
    canonical.granularity = 'T2';
    canonical.lines[0].segments = [
      { segmentId: 'whole', text: '今天測試', startMs: 1000, endMs: 4000 },
    ];
    saveTrackLyricsTiming(
      track,
      'main.vtt',
      input.canonical.source.sha256,
      canonical,
    );
    setLyricsSourcePreference(track, 'main.vtt', 'user');
    expect(await loadAutomaticResearchInput(root, 'song')).toMatchObject({
      status: 'skipped',
      reason: 'native-t2',
    });
    fs.rmSync(path.join(track, 'lyrics'), { recursive: true });
    expect(await loadAutomaticResearchInput(root, 'song')).toMatchObject({
      status: 'skipped',
      reason: 'lyrics-missing',
    });
  });
  it('automatic selection freezes its source independently of later preference changes', async () => {
    setLyricsSourcePreference(track, 'main.vtt', 'user');
    const original = await loadAutomaticResearchInput(root, 'song');
    expect(original.language).toBe('zh');
    expect(automaticInputCurrent(root, original)).toBe(true);
    setLyricsSourcePreference(track, 'ja.vtt', 'user');
    expect(automaticInputCurrent(root, original)).toBe(true);
    expect((await loadAutomaticResearchInput(root, 'song')).language).toBe(
      'ja',
    );
  });
  it('resolves preferred lyrics and offset in main, detects source/audio changes without writing previews', async () => {
    const a = await loadResearchInput(root, intent);
    expect(a.canonical.lines[0].text).toBe('今天測試');
    setLyricsSourcePreference(track, 'ja.vtt', 'user');
    setLyricsSourceOffset(track, 'ja.vtt', 200);
    const b = await loadResearchInput(root, intent);
    expect(b.source.filename).toBe('ja.vtt');
    expect(b.source.offsetMs).toBe(200);
    expect(b.identity).not.toBe(a.identity);
    fs.appendFileSync(path.join(track, 'audio.wav'), 'changed');
    expect((await loadResearchInput(root, intent)).identity).not.toBe(
      b.identity,
    );
    expect(fs.existsSync(path.join(track, 'lyrics/acoustic'))).toBe(false);
  });
  it('preserves canonical T2 sidecars and invalidates changes', async () => {
    const a = await loadResearchInput(root, intent);
    const canonical = structuredClone(a.canonical);
    canonical.granularity = 'T2';
    canonical.lines[0].segments = [
      { segmentId: 'one', text: '今天', startMs: 1000, endMs: 2000 },
      { segmentId: 'two', text: '測試', startMs: 2000, endMs: 4000 },
    ];
    saveTrackLyricsTiming(
      track,
      'main.vtt',
      a.canonical.source.sha256,
      canonical,
    );
    const b = await loadResearchInput(root, intent);
    expect(b.canonical.lines[0].segments).toHaveLength(2);
    expect(b.identity).not.toBe(a.identity);
  });
  it('rejects untimed sources, excessive duration and unsafe ids', async () => {
    await expect(
      loadResearchInput(root, { ...intent, trackId: '../outside' }),
    ).rejects.toThrow();
    fs.writeFileSync(path.join(root, 'library.json'), '{}');
    await expect(loadResearchInput(root, intent)).rejects.toThrow('duration');
  });
});

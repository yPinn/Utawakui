import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadResearchInput } from './input.js';
import {
  saveExperimentalEstimate,
  loadExperimentalEstimate,
} from './estimates.js';
import { saveTrackLyricsManifest } from '../library/lyrics.js';
let root, track, input, result;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'experimental-estimate-'));
  track = path.join(root, 'tracks/song');
  fs.mkdirSync(path.join(track, 'lyrics'), { recursive: true });
  fs.writeFileSync(path.join(track, 'audio.wav'), 'fixture audio');
  fs.writeFileSync(
    path.join(track, 'lyrics/main.vtt'),
    'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n今天測試\n',
  );
  fs.writeFileSync(
    path.join(root, 'library.json'),
    JSON.stringify({ version: 1, tracks: { song: { duration: 30 } } }),
  );
  saveTrackLyricsManifest(track, [
    { filename: 'main.vtt', kind: 'manual', language: 'zh' },
  ]);
  input = await loadResearchInput(root, {
    trackId: 'song',
    language: 'zh',
    lineIndex: 0,
  });
  const line = input.canonical.lines[0];
  result = {
    lines: [
      {
        ...line,
        chunks: [
          { chunkId: 'c1', from: 0, to: 2, startMs: 1000 },
          { chunkId: 'c2', from: 2, to: 4, startMs: 2000 },
        ],
      },
    ],
  };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('separate experimental estimate persistence', () => {
  it('roundtrips a validated separate estimate without changing canonical lyrics', async () => {
    const text = fs.readFileSync(path.join(track, 'lyrics/main.vtt'));
    expect(loadExperimentalEstimate(input).status).toBe('missing');
    expect(
      (await saveExperimentalEstimate(input, result, () => true)).status,
    ).toBe('ready');
    expect(loadExperimentalEstimate(input).status).toBe('ready');
    expect(fs.readFileSync(path.join(track, 'lyrics/main.vtt'))).toEqual(text);
    expect(fs.existsSync(path.join(track, 'lyrics/acoustic-estimates'))).toBe(
      false,
    );
    expect(
      loadExperimentalEstimate({ ...input, identity: 'changed' }).status,
    ).toBe('stale');
  });
  it('preserves prior results on cancellation, tampering or changed input', async () => {
    await saveExperimentalEstimate(input, result, () => true);
    const file = path.join(
      track,
      'lyrics/experimental-estimates/main.vtt.json',
    );
    const before = fs.readFileSync(file);
    await expect(
      saveExperimentalEstimate(input, result, () => false),
    ).rejects.toThrow();
    expect(fs.readFileSync(file)).toEqual(before);
    fs.appendFileSync(path.join(track, 'audio.wav'), 'change');
    await expect(
      saveExperimentalEstimate(input, result, () => true),
    ).rejects.toThrow('input changed');
    expect(fs.readFileSync(file)).toEqual(before);
    fs.writeFileSync(file, '{broken');
    expect(loadExperimentalEstimate(input).status).toBe('corrupt');
  });
});

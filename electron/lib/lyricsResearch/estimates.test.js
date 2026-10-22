import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadResearchInput } from './input.js';
import {
  saveExperimentalEstimate,
  loadExperimentalEstimate,
} from './estimates.js';
import { saveTrackLyricsManifest } from '../library/lyrics.js';
import { createAcousticEstimate } from '../library/lyricsAcousticEstimates.js';
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
  it('preserves coarse publication when optional fine data leaves no room for the wrapper', async () => {
    await saveExperimentalEstimate(input, result, () => true);
    const file = path.join(
      track,
      'lyrics/experimental-estimates/main.vtt.json',
    );
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const lines = Array.from({ length: 180 }, (_, i) => ({
      lineId: `line-${i}`,
      text: '字'.repeat(100),
      startMs: i * 10000 + 1000,
      endMs: i * 10000 + 11000,
    }));
    const chunks = lines.map((line, i) => [
      { chunkId: `chunk-${i}-0`, from: 0, to: 50, startMs: line.startMs },
      {
        chunkId: `chunk-${i}-1`,
        from: 50,
        to: 100,
        startMs: line.startMs + 5000,
      },
    ]);
    const fineTimingByLine = lines.map((line, i) => ({
      version: 1,
      units: Array.from({ length: 100 }, (_, j) => ({
        unitId: `fine-${i}-${j}`,
        from: j,
        to: j + 1,
        startMs: line.startMs + j * 100,
        endMs: line.startMs + j * 100 + 80,
      })),
    }));
    const context = { ...input.context, method: raw.estimate.method };
    const canonical = { ...input.canonical, lines };
    const initial = createAcousticEstimate(context, canonical, chunks, {
      fineTimingByLine,
    });
    expect(initial.schemaVersion).toBe(2);
    let padding = 2097152 - 1000 - Buffer.byteLength(JSON.stringify(initial));
    expect(padding).toBeGreaterThan(0);
    for (const fine of fineTimingByLine)
      for (const unit of fine.units) {
        const count = Math.min(padding, 128 - unit.unitId.length);
        unit.unitId += 'x'.repeat(count);
        padding -= count;
      }
    expect(padding).toBe(0);
    const saved = await saveExperimentalEstimate(
      { ...input, canonical },
      {
        lines: lines.map((line, i) => ({
          ...line,
          chunks: chunks[i],
          fineTiming: fineTimingByLine[i],
        })),
      },
      () => true,
    );
    expect(saved.preview.lines.every((line) => !line.fineTiming)).toBe(true);
    expect(saved.preview.lines.map((line) => line.chunks)).toEqual(chunks);
    expect(fs.statSync(file).size).toBeLessThanOrEqual(2097152);
  });
  it('roundtrips partial fine intervals and still loads the preceding coarse-only method', async () => {
    const fineTiming = {
      version: 1,
      units: [{ unitId: 'fine-0', from: 0, to: 1, startMs: 1100, endMs: 1400 }],
    };
    result.lines[0].fineTiming = fineTiming;
    const saved = await saveExperimentalEstimate(input, result, () => true);
    expect(saved.preview.lines[0].fineTiming).toEqual(fineTiming);
    expect(loadExperimentalEstimate(input).preview.lines[0].fineTiming).toEqual(
      fineTiming,
    );
    const file = path.join(
      track,
      'lyrics/experimental-estimates/main.vtt.json',
    );
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(raw.version).toBe(5);
    expect(raw.estimate.method.chunkerVersion).toContain('occurrence');
    const previousMethod = {
      ...raw.estimate.method,
      version: '3',
      decoderVersion: 'hfa-small-per-line-v3',
      g2pVersion: 'hfa-zh-ja-en-per-line-v3',
      chunkerVersion: 'hfa-starts-v1',
    };
    const legacy = createAcousticEstimate(
      {
        source: raw.estimate.source,
        audio: raw.estimate.audio,
        method: previousMethod,
      },
      input.canonical,
      result.lines.map((line) => line.chunks),
    );
    fs.writeFileSync(
      file,
      JSON.stringify({ ...raw, version: 4, estimate: legacy }),
    );
    const loaded = loadExperimentalEstimate(input);
    expect(loaded.status).toBe('ready');
    expect(loaded.preview.lines[0].chunks).toEqual(
      saved.preview.lines[0].chunks,
    );
    expect(loaded.preview.lines[0]).not.toHaveProperty('fineTiming');
  });
  it('binds every routed occurrence and retains readable legacy envelopes without accepting old methods', async () => {
    await saveExperimentalEstimate(input, result, () => true);
    const file = path.join(
      track,
      'lyrics/experimental-estimates/main.vtt.json',
    );
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    raw.routing.lines[0].language = 'en';
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(loadExperimentalEstimate(input).status).toBe('stale');
    for (const version of [1, 2, 3]) {
      const legacy = {
        version,
        identity:
          version === 1
            ? input.identity
            : createHash('sha256')
                .update(JSON.stringify([input.identity, 'zh']))
                .digest('hex'),
        ...(version >= 2 ? { analysisLanguage: 'zh' } : {}),
        ...(version === 3
          ? {
              validation: {
                checked: 0,
                supported: 0,
                uncertain: 0,
                contradictions: 0,
                missingLyrics: 0,
                silent: 0,
              },
            }
          : {}),
        estimate: raw.estimate,
      };
      fs.writeFileSync(file, JSON.stringify(legacy));
      expect(loadExperimentalEstimate(input).status).toBe('ready');
    }
    raw.estimate.method.version = '2';
    fs.writeFileSync(
      file,
      JSON.stringify({
        ...raw,
        routing: {
          ...raw.routing,
          lines: [{ lineId: input.canonical.lines[0].lineId, language: 'zh' }],
        },
      }),
    );
    expect(loadExperimentalEstimate(input).status).toBe('stale');
  });
  it('persists bounded validation warnings separately from timing and rejects inconsistent summaries', async () => {
    result.lines[0].content = 'possible-missing-lyrics';
    const saved = await saveExperimentalEstimate(
      { ...input, language: 'en' },
      result,
      () => true,
    );
    expect(saved.validation).toMatchObject({ checked: 1, missingLyrics: 1 });
    expect(loadExperimentalEstimate(input).validation).toEqual(
      saved.validation,
    );
    const file = path.join(
      track,
      'lyrics/experimental-estimates/main.vtt.json',
    );
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(raw.version).toBe(5);
    raw.validation.checked = 0;
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(loadExperimentalEstimate(input).status).toBe('corrupt');
  });
  it('binds a manually resolved language while remaining readable without changing source language', async () => {
    await saveExperimentalEstimate(
      { ...input, language: 'ja' },
      result,
      () => true,
    );
    const file = path.join(
      track,
      'lyrics/experimental-estimates/main.vtt.json',
    );
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(raw.version).toBe(5);
    expect(raw.routing.hint).toBe('ja');
    expect(loadExperimentalEstimate(input).status).toBe('ready');
    expect(
      loadExperimentalEstimate({
        ...input,
        identity: 'offset changed',
        source: { ...input.source, offsetMs: -500 },
      }),
    ).toEqual({ status: 'stale', reason: 'offset-changed' });
    raw.routing.hint = 'zh';
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(loadExperimentalEstimate(input).status).toBe('stale');
    raw.routing.hint = 'ko';
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(loadExperimentalEstimate(input).status).toBe('unsupported');
  });
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

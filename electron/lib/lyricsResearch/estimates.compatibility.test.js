import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadResearchInput } from './input.js';
import {
  loadExperimentalEstimate,
  saveExperimentalEstimate,
} from './estimates.js';
import { createAcousticEstimate } from '../library/lyricsAcousticEstimates.js';
import { saveTrackLyricsManifest } from '../library/lyrics.js';
import { normalizeLyricsDocument } from '../../../src/utils/lyricsDocument.js';
import { planLineLanguages } from './language.js';
import { createExperimentalEstimateReader } from './estimateReader.js';
import { compatibleEstimate } from './estimateCompatibility.js';
import { prepareAcousticPreview } from '../../../shared/presentation/lyricsAcousticPreview.mjs';
const sha = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
let library, track, input, file;
// Exercise the pure helper directly as well as its CJS production integration.
// Its proof callback still uses the actual strict v2 loader, not a ready stub.
function project(value) {
  const bytes = fs.readFileSync(file);
  return compatibleEstimate(
    value,
    JSON.parse(bytes),
    (witness) => loadExperimentalEstimate(witness),
    createHash('sha256').update(bytes).digest('hex'),
  );
}
beforeEach(async () => {
  library = fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-compat-'));
  track = path.join(library, 'tracks/song');
  fs.mkdirSync(path.join(track, 'lyrics'), { recursive: true });
  fs.writeFileSync(path.join(track, 'audio.wav'), 'fixture audio');
  fs.writeFileSync(
    path.join(track, 'lyrics/main.vtt'),
    'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n甲乙丙丁\n',
  );
  fs.writeFileSync(
    path.join(library, 'library.json'),
    JSON.stringify({ version: 2, tracks: { song: { duration: 30 } } }),
  );
  saveTrackLyricsManifest(track, [
    { filename: 'main.vtt', kind: 'manual', language: 'zh' },
  ]);
  input = await loadResearchInput(library, {
    trackId: 'song',
    language: 'zh',
    lineIndex: 0,
  });
  file = path.join(track, 'lyrics/experimental-estimates/main.vtt.json');
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(library, { recursive: true, force: true });
});
async function legacy(change = () => {}) {
  const canonical = normalizeLyricsDocument({
    text: input.text,
    source: input.source,
    sourceFingerprint: input.context.source.sha256,
    normalizerProfileId: 'lyrics-source-v2',
  });
  change(canonical);
  const line = canonical.lines[0];
  const chunks = [
    { chunkId: 'first', from: 0, to: 2, startMs: line.startMs },
    { chunkId: 'second', from: 2, to: line.text.length, startMs: 3000 },
  ];
  const fineTiming = {
    version: 1,
    units: [
      { unitId: 'a', from: 0, to: 1, startMs: 1100, endMs: 1200 },
      { unitId: 'b', from: 1, to: 2, startMs: 1700, endMs: 2000 },
      {
        unitId: 'c',
        from: 2,
        to: line.text.length,
        startMs: 3000,
        endMs: 3500,
      },
    ],
  };
  await saveExperimentalEstimate(
    input,
    {
      lines: [
        {
          ...input.canonical.lines[0],
          chunks: chunks.map((c, i) =>
            i === 0
              ? { ...c, startMs: input.canonical.lines[0].startMs }
              : { ...c, to: input.canonical.lines[0].text.length },
          ),
          fineTiming: {
            ...fineTiming,
            units: fineTiming.units.map((u, i) =>
              i === 2 ? { ...u, to: input.canonical.lines[0].text.length } : u,
            ),
          },
        },
      ],
    },
    () => true,
  );
  const current = JSON.parse(fs.readFileSync(file));
  const context = {
    ...input.context,
    source: {
      ...input.context.source,
      normalizerProfileId: 'lyrics-source-v2',
    },
  };
  const estimate = createAcousticEstimate(
    { ...context, method: current.estimate.method },
    canonical,
    [chunks],
    { fineTimingByLine: [fineTiming], schemaVersion: 2 },
  );
  const routing = planLineLanguages(canonical.lines, 'zh');
  const raw = {
    ...current,
    identity: sha([sha([library, context, canonical]), routing]),
    routing,
    estimate,
  };
  fs.writeFileSync(file, JSON.stringify(raw));
  return { raw, canonical, line };
}
const withoutIds = (lines) =>
  JSON.parse(
    JSON.stringify(lines, (key, value) =>
      ['lineId', 'chunkId', 'unitId'].includes(key) ? undefined : value,
    ),
  );

describe('strict read-only normalizer compatibility', () => {
  it.each(['lyrics/main.vtt', 'audio.wav'])(
    'rejects actual %s changes after a memoized preparation',
    async (relative) => {
      await legacy();
      expect(loadExperimentalEstimate(input).status).toBe('ready');
      const read = createExperimentalEstimateReader({
        getLibraryDir: () => library,
        isEnabled: () => true,
        loadInput: async () => input,
        loadEstimate: (value) => {
          const result = loadExperimentalEstimate(value);
          fs.appendFileSync(path.join(track, relative), 'changed');
          return result;
        },
      });
      expect(await read('song', 'main.vtt')).toMatchObject({
        status: 'stale',
        reason: 'source-changed',
      });
    },
  );
  it('certifies the entire old identity, maps only IDs, and retains all fine pauses and onset evidence', async () => {
    const { raw } = await legacy();
    const before = fs.readFileSync(file);
    const loaded = loadExperimentalEstimate(input);
    expect(loaded.status).toBe('ready');
    const direct = project(input);
    expect(direct).toEqual(loaded);
    expect(project(input)).toBe(direct);
    expect(project({ ...input, identity: 'changed' })).toBeNull();
    expect(loaded.compatibility).toEqual({
      rule: 'normalizer-v2-v3-exact-v1',
      sourceEstimateId: raw.estimate.estimateId,
      fromProfile: 'lyrics-source-v2',
      toProfile: 'lyrics-source-v3',
    });
    expect(loaded.preview.documentId).toBe(input.canonical.documentId);
    expect(loaded.preview.estimateId).not.toBe(raw.estimate.estimateId);
    expect(withoutIds(loaded.preview.lines)).toEqual(
      withoutIds(raw.estimate.lines),
    );
    expect(prepareAcousticPreview(input.canonical, loaded).status).toBe(
      'ready',
    );
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['main.vtt.json']);
    const again = loadExperimentalEstimate(input);
    expect(again).toBe(loaded);
    expect(Object.isFrozen(loaded.preview.lines)).toBe(true);
  });
  it.each(['text', 'space', 'onset', 'end', 'provenance', 'insert', 'native'])(
    'rejects a legacy %s difference through the actual witness, even with the same source hash',
    async (kind) => {
      await legacy((doc) => {
        const line = doc.lines[0];
        if (kind === 'text') line.text = '甲乙丙戊';
        if (kind === 'space') line.text = '甲乙丙 ';
        if (kind === 'onset') line.startMs = 999;
        if (kind === 'end') line.endMs++;
        if (kind === 'provenance') line.endInferred = true;
        if (kind === 'insert')
          doc.lines.push({
            ...line,
            lineId: doc.documentId + '_l_1',
            startMs: 6000,
            endMs: 8000,
          });
        if (kind === 'native')
          line.segments = [
            {
              segmentId: 'native',
              text: line.text,
              startMs: 1000,
              endMs: 5000,
            },
          ];
      });
      expect(loadExperimentalEstimate(input).status).toBe('stale');
      expect(project(input)).toBeNull();
    },
  );
  it.each([
    'identity',
    'audio',
    'source',
    'offset',
    'method',
    'routing',
    'schema',
    'fine-end',
    'rehashed-audio',
    'rehashed-source',
  ])('does not repair or weaken a changed %s', async (kind) => {
    const { raw } = await legacy();
    if (kind === 'identity') raw.identity = '0'.repeat(64);
    if (kind === 'audio') raw.estimate.audio.sha256 = '0'.repeat(64);
    if (kind === 'source') raw.estimate.source.sha256 = '0'.repeat(64);
    if (kind === 'offset') raw.estimate.source.offsetUsedMs = 100;
    if (kind === 'method') raw.estimate.method.decoderVersion = 'changed';
    if (kind === 'routing') raw.routing.lines[0].language = 'en';
    if (kind === 'schema') raw.estimate.schemaVersion = 1;
    if (kind === 'fine-end')
      raw.estimate.lines[0].fineTiming.units[0].endMs = 1100;
    if (kind === 'rehashed-audio' || kind === 'rehashed-source') {
      if (kind === 'rehashed-audio') raw.estimate.audio.sha256 = '0'.repeat(64);
      else raw.estimate.source.sha256 = '0'.repeat(64);
      const e = raw.estimate;
      e.estimateId =
        'acoustic_' + sha([e.documentId, e.source, e.audio, e.method, e.lines]);
    }
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(loadExperimentalEstimate(input).status).not.toBe('ready');
    expect(project(input)).toBeNull();
  });
  it('rejects the real unknown-inline-tag v2/v3 parser difference without relabeling old text', async () => {
    fs.writeFileSync(
      path.join(track, 'lyrics/main.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n甲<NOTE>乙丙丁\n',
    );
    input = await loadResearchInput(library, {
      trackId: 'song',
      language: 'zh',
      lineIndex: 0,
    });
    expect(input.canonical.lines[0].text).toBe('甲<NOTE>乙丙丁');
    await legacy((doc) => {
      doc.lines[0].text = '甲乙丙丁';
    });
    expect(loadExperimentalEstimate(input).status).toBe('stale');
  });
  it('rejects separate repeated singing retained by v3 rather than merging old occurrences', async () => {
    fs.writeFileSync(
      path.join(track, 'lyrics/main.vtt'),
      'WEBVTT\n\n00:00:01.000 --> 00:00:05.000\n甲乙丙丁\n\n00:00:06.000 --> 00:00:09.000\n甲乙丙丁\n',
    );
    saveTrackLyricsManifest(track, [
      { filename: 'main.vtt', kind: 'youtube-cc', language: 'zh' },
    ]);
    input = await loadResearchInput(library, {
      trackId: 'song',
      language: 'zh',
      lineIndex: 0,
    });
    expect(input.canonical.lines).toHaveLength(2);
    await legacy((doc) => {
      doc.lines.pop();
    });
    expect(loadExperimentalEstimate(input).status).toBe('stale');
  });
  it('invalidates the memory projection on result replacement and rejects a replacement during the read', async () => {
    const { raw } = await legacy();
    const first = loadExperimentalEstimate(input);
    expect(first.status).toBe('ready');
    fs.writeFileSync(file, JSON.stringify({ ...raw, identity: 'changed' }));
    expect(loadExperimentalEstimate(input).status).toBe('stale');
    fs.writeFileSync(file, JSON.stringify(raw));
    const original = fs.readSync;
    vi.spyOn(fs, 'readSync').mockImplementationOnce((...args) => {
      const n = original(...args);
      fs.writeFileSync(file, JSON.stringify({ ...raw, identity: 'changed' }));
      return n;
    });
    expect(loadExperimentalEstimate(input)).toMatchObject({
      status: 'stale',
      reason: 'result-changed',
    });
  });
  it('rejects the invalid-seconds LRC difference through the old full identity', async () => {
    fs.writeFileSync(
      path.join(track, 'lyrics/main.lrc'),
      '[00:01.00][00:60.00]甲乙丙丁\n[00:05.00]甲乙丙丁',
    );
    saveTrackLyricsManifest(track, [
      { filename: 'main.lrc', kind: 'manual', language: 'zh' },
    ]);
    input = await loadResearchInput(
      library,
      { trackId: 'song', language: 'zh', lineIndex: 0 },
      { filename: 'main.lrc' },
    );
    file = path.join(track, 'lyrics/experimental-estimates/main.lrc.json');
    expect(input.canonical.lines).toHaveLength(2);
    await legacy((doc) => {
      doc.lines[0].text = '甲乙丙丁';
      doc.lines[1].endMs = 60000;
      doc.lines[1].endInferred = true;
      doc.lines.push({
        lineId: doc.documentId + '_l_2',
        text: '甲乙丙丁',
        startMs: 60000,
        endMs: null,
      });
    });
    expect(loadExperimentalEstimate(input).status).toBe('stale');
  });
  it.each(['native', 'timing-sidecar', 'unknown-profile'])(
    'declines a current %s boundary',
    async (kind) => {
      await legacy();
      const changed = structuredClone(input);
      if (kind === 'native') changed.canonical.granularity = 'T2';
      if (kind === 'timing-sidecar')
        changed.context.source.timingSha256 = 'a'.repeat(64);
      if (kind === 'unknown-profile')
        changed.canonical.normalizerProfileId = 'lyrics-source-v4';
      changed.identity = sha([library, changed.context, changed.canonical]);
      expect(loadExperimentalEstimate(changed).status).toBe('stale');
    },
  );
});

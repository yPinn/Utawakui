import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import musicStructureModule from './musicStructureContract.js';

const {
  MUSIC_STRUCTURE_SCHEMA_VERSION,
  MUSIC_STRUCTURE_OVERRIDE_SCHEMA_VERSION,
  resolveMusicStructureSignals,
  validateMusicStructureDocument,
  validateMusicStructureOverrides,
} = musicStructureModule;

const SOURCE_SHA256 = 'a'.repeat(64);

function fixture(name) {
  return JSON.parse(
    fs.readFileSync(
      new URL(`./fixtures/musicStructure/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
}

function clone(value) {
  return structuredClone(value);
}

describe('validateMusicStructureDocument', () => {
  const options = {
    sourceSha256: SOURCE_SHA256,
    sourceDurationMs: 180000,
  };

  it.each([
    ['valid-m0', 'M0'],
    ['valid-m1', 'M1'],
    ['valid-m2', 'M2'],
    ['valid-combined', 'M2'],
  ])('accepts the fixed %s fixture as %s', (name, level) => {
    const document = validateMusicStructureDocument(fixture(name), options);

    expect(document.schemaVersion).toBe(MUSIC_STRUCTURE_SCHEMA_VERSION);
    expect(resolveMusicStructureSignals(document, options).level).toBe(level);
  });

  it('preserves missing and low confidence instead of treating either as certainty', () => {
    const document = validateMusicStructureDocument(
      fixture('valid-low-confidence'),
      options,
    );

    expect(document.tempo.confidence).toBe(0.05);
    expect(document.beats[0].confidence).toBe(0.04);
    expect(document.sections[0].confidence).toBe(0.03);
    expect(document.beats[0].positionInBar).toBeUndefined();
    expect(resolveMusicStructureSignals(document, options)).toMatchObject({
      level: 'M1',
      reason: 'current',
      sectionStatus: 'low-confidence',
      sections: [],
    });
  });

  it('keeps analyzer source and version at document scope for every section', () => {
    const document = validateMusicStructureDocument(
      fixture('valid-m2'),
      options,
    );

    expect(document.analyzer).toMatchObject({
      contractVersion: 1,
      id: 'fixture-analyzer',
      profileId: 'fixture-cpu-v1',
      modelIds: ['fixture-model-v1'],
    });
    expect(document.sections.map((section) => section.role)).toEqual([
      'intro',
      'verse',
      'chorus',
      'bridge',
      'outro',
    ]);
  });

  it('keeps source BPM separate and rejects playback or Lyrics timing fields', () => {
    const withPlaybackRate = clone(fixture('valid-m1'));
    withPlaybackRate.playbackRate = 1.25;
    const withLyricsTiming = clone(fixture('valid-m1'));
    withLyricsTiming.granularity = 'T2';

    expect(() =>
      validateMusicStructureDocument(withPlaybackRate, options),
    ).toThrow(/unexpected/i);
    expect(() =>
      validateMusicStructureDocument(withLyricsTiming, options),
    ).toThrow(/unexpected/i);
    expect(
      validateMusicStructureDocument(fixture('valid-m1'), options),
    ).not.toHaveProperty('playbackRate');
  });

  it('rejects executable serialization hooks without invoking them', () => {
    const value = clone(fixture('valid-m1'));
    let invoked = false;
    value.analyzer.toJSON = () => {
      invoked = true;
      return {};
    };

    expect(() => validateMusicStructureDocument(value, options)).toThrow(
      /unexpected/i,
    );
    expect(invoked).toBe(false);
  });

  it.each([
    ['invalid-unknown-schema', /schema/i],
    ['invalid-unordered-beats', /monotonic/i],
    ['invalid-overlapping-sections', /overlap/i],
    ['invalid-section-out-of-bounds', /bounded integer/i],
    ['invalid-unsafe-provenance', /unexpected/i],
  ])('rejects the fixed %s fixture', (name, message) => {
    expect(() =>
      validateMusicStructureDocument(fixture(name), options),
    ).toThrow(message);
  });

  it.each([
    [
      'unknown analyzer contract',
      (value) => (value.analyzer.contractVersion = 2),
    ],
    ['invalid source hash', (value) => (value.source.sha256 = '../audio.wav')],
    ['invalid duration', (value) => (value.source.durationMs = Infinity)],
    ['out-of-range BPM', (value) => (value.tempo.bpm = 500)],
    ['out-of-range confidence', (value) => (value.tempo.confidence = 1.1)],
    ['out-of-range beat time', (value) => (value.beats[0].timeMs = 181001)],
    ['invalid bar position', (value) => (value.beats[0].positionInBar = 0)],
    ['unknown section role', (value) => (value.sections[0].role = 'drop')],
    [
      'duplicate section id',
      (value) => (value.sections[1].sectionId = 'section_01'),
    ],
    [
      'control characters',
      (value) => (value.sections[0].rawLabel = 'Intro\u0000'),
    ],
  ])('rejects %s', (_name, mutate) => {
    const value = clone(fixture('valid-combined'));
    mutate(value);

    expect(() => validateMusicStructureDocument(value, options)).toThrow();
  });

  it('rejects a source identity or duration from a different audio revision', () => {
    expect(() =>
      validateMusicStructureDocument(fixture('stale-source'), options),
    ).toThrow(/fingerprint/i);
    expect(() =>
      validateMusicStructureDocument(fixture('valid-m1'), {
        ...options,
        sourceDurationMs: 181000,
      }),
    ).toThrow(/duration/i);
  });
});

describe('resolveMusicStructureSignals', () => {
  const options = {
    sourceSha256: SOURCE_SHA256,
    sourceDurationMs: 180000,
  };

  it.each([
    [null, 'missing'],
    [fixture('invalid-unknown-schema'), 'invalid'],
    [fixture('stale-source'), 'stale'],
  ])(
    'returns an explicit M0 fallback for absent or unusable cues',
    (value, reason) => {
      expect(resolveMusicStructureSignals(value, options)).toEqual({
        level: 'M0',
        reason,
        tempo: null,
        beats: [],
        sections: [],
      });
    },
  );

  it('fails closed when the current audio identity is unavailable', () => {
    expect(resolveMusicStructureSignals(fixture('valid-m1'))).toEqual({
      level: 'M0',
      reason: 'unavailable-source',
      tempo: null,
      beats: [],
      sections: [],
    });
  });

  it('requires a complete contiguous section partition before exposing M2', () => {
    const result = resolveMusicStructureSignals(
      fixture('valid-discontinuous-sections'),
      options,
    );

    expect(result).toMatchObject({
      level: 'M1',
      reason: 'current',
      sectionStatus: 'incomplete',
      sections: [],
    });
    expect(result.tempo?.bpm).toBe(120);
    expect(result.beats).toHaveLength(1);
  });

  it('reports missing sections without changing a valid M1 result', () => {
    expect(
      resolveMusicStructureSignals(fixture('valid-m1'), options),
    ).toMatchObject({
      level: 'M1',
      reason: 'current',
      sectionStatus: 'missing',
      sections: [],
    });
  });
});

describe('validateMusicStructureOverrides', () => {
  const options = {
    sourceSha256: SOURCE_SHA256,
    sourceDurationMs: 180000,
  };

  it('accepts the fixed authored override independently of analyzer output', () => {
    const document = validateMusicStructureOverrides(
      fixture('valid-overrides'),
      options,
    );

    expect(document.schemaVersion).toBe(
      MUSIC_STRUCTURE_OVERRIDE_SCHEMA_VERSION,
    );
    expect(document.tempoOverride).toEqual({
      bpm: 121.5,
      anchorTimeMs: 250,
      beatsPerBar: 4,
    });
    expect(document).not.toHaveProperty('analyzer');
  });

  it.each([
    ['analyzer provenance', (value) => (value.analyzer = {})],
    [
      'overlapping sections',
      (value) => (value.sectionOverrides[1].startMs = 1000),
    ],
    ['invalid meter', (value) => (value.tempoOverride.beatsPerBar = 0)],
    ['stale source', (value) => (value.source.sha256 = 'c'.repeat(64))],
  ])('rejects %s in the authored layer', (_name, mutate) => {
    const value = clone(fixture('valid-overrides'));
    mutate(value);

    expect(() => validateMusicStructureOverrides(value, options)).toThrow();
  });
});

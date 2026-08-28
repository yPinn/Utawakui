import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPredictionEvidence,
  buildRunFingerprint,
  buildRuntimeBenchmarkConfig,
  buildWorkerRequest,
  deriveBenchmarkRuntimeRequirements,
  loadCachedResult,
  projectWorkerResult,
  validateBenchmarkModelManifest,
  validateBpmBenchmarkMapping,
  validateRealSongBenchmarkConfig,
} from './music-analysis-real-song-benchmark.mjs';
import {
  fingerprintBpmCorpus,
  validateBpmPredictions,
} from './music-analysis-bpm-evaluation.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SMALL0_SHA =
  '6074be2c4d490c5f6101fcc374a1ec72ae93456e23bb6019783b849f5dc7d47b';
const FINAL0_SHA =
  '8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331';

function config() {
  const libraryRoot = path.resolve('private-library');
  return {
    schemaVersion: 1,
    benchmarkId: 'tuki-15-pilot',
    libraryRoot,
    outputRoot: path.resolve('tasks', 'm2-results'),
    ffmpegPath: path.resolve('tools', 'ffmpeg.exe'),
    pythonPath: path.resolve('runtime', 'python.exe'),
    environmentPath: path.resolve('runtime', 'site-packages'),
    workerPath: path.resolve(
      'resources',
      'audio-processing',
      'structure_analysis_worker.py',
    ),
    modelManifestPath: path.resolve(
      'resources',
      'audio-processing',
      'analysis-structure-model.json',
    ),
    modelPath: path.resolve('tasks', 'm2-models'),
    cases: [
      {
        benchmarkCaseId: 'tuki15-01',
        trackId: 'p1tsL0YmNqU',
        durationMs: 218000,
        tags: ['j-pop', 'karaoke'],
      },
    ],
  };
}

function modelManifest() {
  return {
    schemaVersion: 1,
    manifestKind: 'model',
    kind: 'analysis',
    id: 'all-in-one-harmonix-fold0',
    version: 'harmonix-fold0-htdemucs-v1',
    architecture: 'all-in-one-with-htdemucs',
    wrapper: {
      package: 'all-in-one-infer',
      version: '3.1.0',
      model: 'harmonix-fold0',
    },
    signals: ['tempo', 'beats', 'downbeats', 'sections'],
    files: [
      {
        role: 'structure-checkpoint',
        filename: 'harmonix-fold0.pth',
        url: 'https://example.test/harmonix-fold0.pth',
        sizeBytes: 1,
        sha256: SHA_A,
        license: {
          spdx: 'CC-BY-NC-SA-4.0',
          evidenceUrl: 'https://example.test/license',
          productUse: 'blocked',
          reason: 'benchmark only',
        },
      },
      {
        role: 'separation-checkpoint',
        filename: 'htdemucs.th',
        url: 'https://example.test/htdemucs.th',
        sizeBytes: 2,
        sha256: SHA_B,
        license: {
          spdx: null,
          evidenceUrl: null,
          productUse: 'blocked',
          reason: 'benchmark only',
        },
      },
      {
        role: 'separation-config',
        filename: 'htdemucs.yaml',
        url: 'https://example.test/htdemucs.yaml',
        sizeBytes: 3,
        sha256: SHA_C,
        license: {
          spdx: 'MIT',
          evidenceUrl: 'https://example.test/license',
          productUse: 'accepted',
          reason: null,
        },
      },
    ],
    distribution: { status: 'benchmark-only', reason: 'benchmark only' },
  };
}

function workerResult() {
  return {
    protocolVersion: 1,
    analyzerId: 'all-in-one-structure',
    profileId: 'all-in-one-cpu-v1',
    modelId: 'all-in-one-harmonix-fold0',
    offlineEnforced: true,
    noUserCache: true,
    durationMs: 218123,
    tempo: { bpm: 122, confidence: 0.71 },
    beats: [{ timeMs: 500, downbeat: true, confidence: 0.8 }],
    sections: [
      {
        sectionId: 'section_01',
        startMs: 0,
        endMs: 10000,
        role: 'intro',
        rawLabel: 'intro',
        confidence: 0.82,
      },
      {
        sectionId: 'section_02',
        startMs: 10000,
        endMs: 218123,
        role: 'chorus',
        rawLabel: 'chorus',
        confidence: 0.76,
      },
    ],
  };
}

function bpmConfig(modelId = 'beat-this-small0') {
  const libraryRoot = path.resolve('private-library');
  return {
    schemaVersion: 2,
    benchmarkKind: 'bpm',
    benchmarkId: 'beat-this-bpm-pilot-v1',
    corpusPath: path.resolve('tasks', 'music-analysis-bpm-corpus.json'),
    libraryRoot,
    outputRoot: path.resolve('tasks', `${modelId}-results`),
    ffmpegPath: path.resolve('tools', 'ffmpeg.exe'),
    pythonPath: path.resolve('runtime', 'python.exe'),
    environmentPath: path.resolve('runtime', 'site-packages'),
    workerPath: path.resolve(
      'resources',
      'audio-processing',
      'structure_analysis_worker.py',
    ),
    modelManifestPath: path.resolve(
      'resources',
      'audio-processing',
      `analysis-${modelId}-model.json`,
    ),
    modelPath: path.resolve('tasks', 'bpm-models', modelId),
    cases: [
      {
        benchmarkCaseId: 'track-001',
        trackId: 'p1tsL0YmNqU',
        durationMs: 218000,
      },
    ],
  };
}

function bpmSmokeConfig() {
  const value = bpmConfig();
  value.schemaVersion = 3;
  value.benchmarkKind = 'bpm-runtime-smoke';
  value.benchmarkId = 'beat-this-bpm-runtime-smoke-v1';
  delete value.corpusPath;
  return value;
}

function bpmCorpus() {
  return {
    schemaVersion: 1,
    benchmarkId: 'beat-this-bpm-pilot-v1',
    tempoToleranceRatio: 0.04,
    acceptance: {
      minimumTracks: 1,
      requiredTags: [],
      minimumDirectMatchRate: 0.9,
      minimumRequiredTagDirectMatchRate: 0.8,
      maximumTempoOctaveErrorRate: 0.05,
      maximumTempoUnrelatedErrorRate: 0.05,
      maximumTempoMissingRate: 0.05,
      maximumAnalysisFailureRate: 0.05,
    },
    cases: [{ id: 'track-001', tags: ['j-pop', 'mid'], referenceBpm: 122 }],
  };
}

function beatThisManifest(model = 'small0') {
  return {
    schemaVersion: 1,
    manifestKind: 'model',
    kind: 'analysis',
    id: `beat-this-${model}`,
    version: `1.1.0-${model}`,
    architecture: 'beat-this',
    wrapper: { package: 'beat-this', version: '1.1.0', model },
    signals: ['tempo', 'beats', 'downbeats'],
    files: [
      {
        role: 'weights',
        filename: `${model}.ckpt`,
        url: `https://example.test/${model}.ckpt`,
        sizeBytes: model === 'small0' ? 8451101 : 81058141,
        sha256: model === 'small0' ? SMALL0_SHA : FINAL0_SHA,
        license: {
          spdx: 'MIT',
          evidenceUrl: 'https://example.test/license',
          productUse: 'accepted',
          reason: null,
        },
      },
    ],
    distribution: { status: 'product-downloadable', reason: null },
  };
}

function beatThisWorkerResult(model = 'small0') {
  return {
    protocolVersion: 1,
    analyzerId: 'beat-this',
    profileId: `beat-this-${model}-cpu-v3`,
    modelId: `beat-this-${model}`,
    offlineEnforced: true,
    noUserCache: true,
    durationMs: 218123,
    tempo: { bpm: 122.25, confidence: 0.73 },
    beats: [{ timeMs: 500, downbeat: true, confidence: 0.8 }],
    sections: [],
  };
}

describe('real-song M2 benchmark runner', () => {
  it('keeps the checked-in All-In-One manifest in the fixed catalog', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.resolve(
          'resources',
          'audio-processing',
          'analysis-structure-model.json',
        ),
        'utf8',
      ),
    );
    expect(validateBenchmarkModelManifest(manifest)).toMatchObject({
      analyzerId: 'all-in-one-structure',
      profileId: 'all-in-one-cpu-v1',
    });
  });

  it('accepts a bounded private config and rejects unsafe or ambiguous paths', () => {
    const valid = config();
    expect(validateRealSongBenchmarkConfig(valid)).toEqual(valid);

    for (const mutate of [
      (value) => (value.outputRoot = path.join(value.libraryRoot, 'analysis')),
      (value) => (value.cases[0].trackId = '../private'),
      (value) => (value.cases[0].benchmarkCaseId = 'bad/path'),
      (value) => value.cases.push({ ...value.cases[0] }),
      (value) => (value.inputPath = 'C:\\private\\song.wav'),
    ]) {
      const candidate = structuredClone(valid);
      mutate(candidate);
      expect(() => validateRealSongBenchmarkConfig(candidate)).toThrow();
    }
  });

  it('derives the exact fixed worker request from the model manifest', () => {
    const value = config();
    const manifest = modelManifest();
    const request = buildWorkerRequest({
      config: value,
      manifest,
      inputPath: path.join(value.outputRoot, 'tuki15-01', 'work', 'input.wav'),
      jobPath: path.join(value.outputRoot, 'tuki15-01', 'work'),
    });

    expect(request).toEqual({
      protocolVersion: 1,
      operation: 'analyze-structure',
      analyzerId: 'all-in-one-structure',
      profileId: 'all-in-one-cpu-v1',
      modelId: 'all-in-one-harmonix-fold0',
      modelName: 'harmonix-fold0',
      environmentPath: value.environmentPath,
      inputPath: path.join(value.outputRoot, 'tuki15-01', 'work', 'input.wav'),
      jobPath: path.join(value.outputRoot, 'tuki15-01', 'work'),
      modelPath: value.modelPath,
      modelFiles: [
        {
          role: 'structure-checkpoint',
          path: path.join(value.modelPath, 'harmonix-fold0.pth'),
          sha256: SHA_A,
        },
        {
          role: 'separation-checkpoint',
          path: path.join(value.modelPath, 'htdemucs.th'),
          sha256: SHA_B,
        },
        {
          role: 'separation-config',
          path: path.join(value.modelPath, 'htdemucs.yaml'),
          sha256: SHA_C,
        },
      ],
    });
  });

  it('invalidates cached evidence when an executable input changes', () => {
    const benchmarkCase = config().cases[0];
    const manifest = modelManifest();
    const fingerprint = buildRunFingerprint({
      benchmarkCase,
      manifest,
      sourceSha256: SHA_A,
      workerSha256: SHA_B,
    });

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(
      buildRunFingerprint({
        benchmarkCase,
        manifest,
        sourceSha256: SHA_A,
        workerSha256: SHA_B,
      }),
    ).toBe(fingerprint);
    expect(
      buildRunFingerprint({
        benchmarkCase,
        manifest,
        sourceSha256: SHA_C,
        workerSha256: SHA_B,
      }),
    ).not.toBe(fingerprint);
  });

  it('rejects a cached result whose content no longer matches its digest', () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-m2-cache-'),
    );
    try {
      const resultPath = path.join(directory, 'result.json');
      const cachePath = path.join(directory, 'cache.json');
      const benchmarkCase = config().cases[0];
      const result = projectWorkerResult(benchmarkCase, workerResult(), 12345);
      fs.writeFileSync(resultPath, JSON.stringify(result));
      const resultSha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(resultPath))
        .digest('hex');
      fs.writeFileSync(
        cachePath,
        JSON.stringify({
          schemaVersion: 1,
          cacheKey: SHA_A,
          resultSha256,
        }),
      );

      expect(
        loadCachedResult(resultPath, cachePath, SHA_A, benchmarkCase),
      ).toEqual(result);
      fs.writeFileSync(resultPath, JSON.stringify({ ...result, wallMs: 1 }));
      expect(
        loadCachedResult(resultPath, cachePath, SHA_A, benchmarkCase),
      ).toBeNull();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('projects only evaluator-safe signals and removes private/runtime fields', () => {
    const benchmarkCase = config().cases[0];
    const result = projectWorkerResult(benchmarkCase, workerResult(), 12345);

    expect(result).toEqual({
      id: 'tuki15-01',
      tags: ['j-pop', 'karaoke'],
      durationMs: 218123,
      wallMs: 12345,
      estimate: {
        status: 'completed',
        bpm: 122,
        sections: [
          {
            startMs: 0,
            endMs: 10000,
            role: 'intro',
            confidence: 0.82,
          },
          {
            startMs: 10000,
            endMs: 218123,
            role: 'chorus',
            confidence: 0.76,
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /trackId|inputPath|modelPath|rawLabel|sectionId|beats/i,
    );
  });

  it('records bounded failures and keeps later batch evidence', () => {
    const value = config();
    value.cases.push({
      ...value.cases[0],
      benchmarkCaseId: 'tuki15-02',
      trackId: 'mX9IJ7Urn28',
    });
    const completed = projectWorkerResult(value.cases[0], workerResult(), 1000);
    const failed = {
      id: 'tuki15-02',
      tags: ['j-pop', 'karaoke'],
      durationMs: 218000,
      wallMs: 2000,
      estimate: { status: 'failed', errorCode: 'ANALYSIS_FAILED' },
    };

    expect(
      buildPredictionEvidence(value, modelManifest(), [completed, failed]),
    ).toMatchObject({
      schemaVersion: 1,
      benchmarkId: 'tuki-15-pilot',
      analyzer: {
        id: 'all-in-one-structure',
        version: '3.1.0',
        profileId: 'all-in-one-cpu-v1',
        modelId: 'all-in-one-harmonix-fold0',
      },
      cases: [
        { id: 'tuki15-01', estimate: { status: 'completed' } },
        {
          id: 'tuki15-02',
          estimate: {
            status: 'failed',
            errorCode: 'ANALYSIS_FAILED',
          },
        },
      ],
    });
  });
});

describe('real-song BPM benchmark runner', () => {
  it.each(['small0', 'final0'])(
    'keeps the checked-in Beat This %s manifest in the fixed catalog',
    (model) => {
      const manifestPath = path.resolve(
        'resources',
        'audio-processing',
        `analysis-beat-this-${model}-model.json`,
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(validateBenchmarkModelManifest(manifest)).toMatchObject({
        analyzerId: 'beat-this',
        profileId: `beat-this-${model}-cpu-v3`,
      });
    },
  );

  it('keeps the documented local-run template valid', () => {
    const template = JSON.parse(
      fs.readFileSync(
        path.resolve(
          'docs',
          'contracts',
          'music-analysis-bpm-run-config-template.json',
        ),
        'utf8',
      ),
    );
    expect(validateRealSongBenchmarkConfig(template)).toEqual(template);
  });

  it('keeps the documented non-scoring smoke template valid', () => {
    const template = JSON.parse(
      fs.readFileSync(
        path.resolve(
          'docs',
          'contracts',
          'music-analysis-bpm-smoke-run-config-template.json',
        ),
        'utf8',
      ),
    );
    expect(validateRealSongBenchmarkConfig(template)).toEqual(template);
  });

  it('accepts only the explicit schema-v2 BPM mapping shape', () => {
    const valid = bpmConfig();
    expect(validateRealSongBenchmarkConfig(valid)).toEqual(valid);

    for (const mutate of [
      (value) => (value.benchmarkKind = 'sections'),
      (value) => (value.corpusPath = 'relative-corpus.json'),
      (value) => (value.cases[0].tags = ['private-title']),
      (value) => (value.cases[0].benchmarkCaseId = 'bad/path'),
      (value) => (value.outputRoot = path.join(value.libraryRoot, 'analysis')),
    ]) {
      const candidate = structuredClone(valid);
      mutate(candidate);
      expect(() => validateRealSongBenchmarkConfig(candidate)).toThrow();
    }
  });

  it.each(['small0', 'final0'])(
    'allows only the fixed Beat This %s manifest contract',
    (model) => {
      const manifest = beatThisManifest(model);
      expect(validateBenchmarkModelManifest(manifest)).toMatchObject({
        analyzerId: 'beat-this',
        profileId: `beat-this-${model}-cpu-v3`,
      });

      for (const mutate of [
        (value) => (value.wrapper.model = 'arbitrary'),
        (value) => (value.wrapper.version = 'latest'),
        (value) => (value.distribution.status = 'benchmark-only'),
        (value) => (value.files[0].filename = 'other.ckpt'),
      ]) {
        const candidate = structuredClone(manifest);
        mutate(candidate);
        expect(() => validateBenchmarkModelManifest(candidate)).toThrow();
      }
    },
  );

  it('derives a fixed Beat This worker request and profile-aware cache key', () => {
    const value = bpmConfig();
    const manifest = beatThisManifest();
    const request = buildWorkerRequest({
      config: value,
      manifest,
      inputPath: path.join(value.outputRoot, 'track-001', 'work', 'input.wav'),
      jobPath: path.join(value.outputRoot, 'track-001', 'work'),
    });

    expect(request).toMatchObject({
      analyzerId: 'beat-this',
      profileId: 'beat-this-small0-cpu-v3',
      modelId: 'beat-this-small0',
      modelName: 'small0',
      modelFiles: [
        {
          role: 'weights',
          path: path.join(value.modelPath, 'small0.ckpt'),
          sha256: SMALL0_SHA,
        },
      ],
    });

    const smallKey = buildRunFingerprint({
      benchmarkCase: value.cases[0],
      manifest,
      sourceSha256: SHA_A,
      workerSha256: SHA_B,
    });
    const finalKey = buildRunFingerprint({
      benchmarkCase: value.cases[0],
      manifest: beatThisManifest('final0'),
      sourceSha256: SHA_A,
      workerSha256: SHA_B,
    });
    expect(finalKey).not.toBe(smallKey);
  });

  it('keeps runtime hashes out of the strict user config and BPM evidence mapping', () => {
    const value = bpmConfig();
    const runtimeConfig = buildRuntimeBenchmarkConfig(value, {
      workerSha256: SHA_B,
    });

    expect(runtimeConfig).toEqual({ ...value, workerSha256: SHA_B });
    expect(value).not.toHaveProperty('workerSha256');
    expect(validateBpmBenchmarkMapping(value, bpmCorpus())).toEqual(
      bpmCorpus(),
    );
  });

  it('emits evaluator-compatible, corpus-bound, path-free BPM predictions', () => {
    const value = bpmConfig();
    const manifest = beatThisManifest();
    const corpus = bpmCorpus();
    const result = projectWorkerResult(
      value.cases[0],
      beatThisWorkerResult(),
      12345,
      manifest,
    );
    const evidence = buildPredictionEvidence(value, manifest, [result], corpus);

    expect(evidence).toEqual({
      schemaVersion: 1,
      benchmarkId: corpus.benchmarkId,
      corpusFingerprint: fingerprintBpmCorpus(corpus),
      analyzer: {
        id: 'beat-this',
        version: '1.1.0',
        profileId: 'beat-this-small0-cpu-v3',
        modelId: 'beat-this-small0',
      },
      cases: [
        {
          id: 'track-001',
          estimate: {
            status: 'completed',
            bpm: 122.25,
            beatEvidenceConfidence: 0.73,
          },
        },
      ],
    });
    expect(validateBpmPredictions(evidence, corpus)).toEqual(evidence);
    expect(JSON.stringify(evidence)).not.toMatch(
      /trackId|libraryRoot|corpusPath|inputPath|modelPath|durationMs|wallMs|tags/i,
    );
  });

  it('rejects stale or incomplete corpus mappings before evidence is emitted', () => {
    const value = bpmConfig();
    const manifest = beatThisManifest();
    const result = projectWorkerResult(
      value.cases[0],
      beatThisWorkerResult(),
      1000,
      manifest,
    );
    const staleCorpus = bpmCorpus();
    staleCorpus.benchmarkId = 'other-pilot';
    expect(() => validateBpmBenchmarkMapping(value, staleCorpus)).toThrow();
    expect(() =>
      buildPredictionEvidence(value, manifest, [result], staleCorpus),
    ).toThrow();
    expect(() =>
      buildPredictionEvidence(value, manifest, [], bpmCorpus()),
    ).toThrow();
  });
});

describe('real-song BPM runtime smoke runner', () => {
  it('accepts only the explicit non-scoring schema-v3 config', () => {
    const valid = bpmSmokeConfig();
    expect(validateRealSongBenchmarkConfig(valid)).toEqual(valid);

    for (const mutate of [
      (value) => (value.benchmarkKind = 'bpm'),
      (value) => (value.corpusPath = path.resolve('fake-corpus.json')),
      (value) => (value.cases[0].referenceBpm = 120),
    ]) {
      const candidate = structuredClone(valid);
      mutate(candidate);
      expect(() => validateRealSongBenchmarkConfig(candidate)).toThrow();
    }
  });

  it('requires a corpus only for scored BPM execution', () => {
    expect(
      deriveBenchmarkRuntimeRequirements(bpmConfig(), beatThisManifest()),
    ).toMatchObject({ benchmarkKind: 'bpm', requiresCorpus: true });
    expect(
      deriveBenchmarkRuntimeRequirements(bpmSmokeConfig(), beatThisManifest()),
    ).toMatchObject({
      benchmarkKind: 'bpm-runtime-smoke',
      requiresCorpus: false,
    });
  });

  it('emits path-free runtime evidence that cannot be mistaken for scored predictions', () => {
    const value = bpmSmokeConfig();
    const manifest = beatThisManifest();
    const completed = projectWorkerResult(
      value.cases[0],
      beatThisWorkerResult(),
      12345,
      manifest,
    );
    const evidence = buildPredictionEvidence(value, manifest, [completed]);

    expect(evidence).toEqual({
      schemaVersion: 1,
      evidenceKind: 'bpm-runtime-smoke',
      benchmarkId: 'beat-this-bpm-runtime-smoke-v1',
      analyzer: {
        id: 'beat-this',
        version: '1.1.0',
        profileId: 'beat-this-small0-cpu-v3',
        modelId: 'beat-this-small0',
      },
      cases: [
        {
          id: 'track-001',
          durationMs: 218123,
          wallMs: 12345,
          estimate: {
            status: 'completed',
            bpm: 122.25,
            beatEvidenceConfidence: 0.73,
          },
        },
      ],
    });
    expect(() => validateBpmPredictions(evidence, bpmCorpus())).toThrow();
    expect(JSON.stringify(evidence)).not.toMatch(
      /trackId|libraryRoot|inputPath|modelPath|corpusFingerprint/i,
    );
  });
});

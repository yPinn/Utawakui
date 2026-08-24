import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPredictionEvidence,
  buildRunFingerprint,
  buildWorkerRequest,
  loadCachedResult,
  projectWorkerResult,
  validateRealSongBenchmarkConfig,
} from './music-analysis-real-song-benchmark.mjs';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);

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

describe('real-song M2 benchmark runner', () => {
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

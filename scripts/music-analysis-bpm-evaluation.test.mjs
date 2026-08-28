import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  evaluateBpmBenchmark,
  fingerprintBpmCorpus,
  validateBpmCorpus,
  validateBpmPredictions,
} from './music-analysis-bpm-evaluation.mjs';

const syntheticFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../electron/lib/fixtures/musicStructure/bpm-quality-benchmark.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const corpusFixture = syntheticFixture.corpus;

function completedEstimate(bpm, beatEvidenceConfidence = 0.8) {
  return { status: 'completed', bpm, beatEvidenceConfidence };
}

function passingPredictions(corpus = corpusFixture) {
  if (corpus === corpusFixture) {
    return structuredClone(syntheticFixture.predictions);
  }
  return {
    schemaVersion: 1,
    benchmarkId: corpus.benchmarkId,
    corpusFingerprint: fingerprintBpmCorpus(corpus),
    analyzer: {
      id: 'beat-this',
      version: '1.1.0',
      profileId: 'beat-this-small0-cpu-v2',
      modelId: 'beat-this-small0',
    },
    cases: corpus.cases.map((benchmarkCase) => ({
      id: benchmarkCase.id,
      estimate: completedEstimate(benchmarkCase.referenceBpm),
    })),
  };
}

describe('BPM quality benchmark', () => {
  it('classifies direct, half-time, double-time, unrelated, missing, and failed results independently', () => {
    const predictions = passingPredictions();
    predictions.cases[0].estimate = completedEstimate(73);
    predictions.cases[1].estimate = completedEstimate(60);
    predictions.cases[2].estimate = completedEstimate(360);
    predictions.cases[3].estimate = completedEstimate(79);
    predictions.cases[4].estimate = completedEstimate(null, null);
    predictions.cases[5].estimate = {
      status: 'failed',
      errorCode: 'WORKER_FAILED',
    };

    const report = evaluateBpmBenchmark(corpusFixture, predictions);

    expect(
      report.cases.map((benchmarkCase) => benchmarkCase.tempoRelation),
    ).toEqual([
      'match',
      'half-time',
      'double-time',
      'unrelated',
      'missing',
      'missing',
    ]);
    expect(report.summary).toMatchObject({
      trackCount: 6,
      directMatchRate: 0.166667,
      tempoOctaveErrorRate: 0.333333,
      tempoUnrelatedErrorRate: 0.166667,
      tempoMissingRate: 0.166667,
      analysisFailureRate: 0.166667,
      medianDirectMatchRelativeError: 0.013889,
    });
    expect(report.decision).toBe('fail');
  });

  it('passes only when aggregate and required-stratum quality gates pass', () => {
    const report = evaluateBpmBenchmark(corpusFixture, passingPredictions());

    expect(report).toMatchObject({
      schemaVersion: 1,
      benchmarkId: 'synthetic-bpm-quality-v1',
      decision: 'pass',
      summary: {
        trackCount: 6,
        directMatchRate: 1,
        tempoOctaveErrorRate: 0,
        tempoUnrelatedErrorRate: 0,
        tempoMissingRate: 0,
        analysisFailureRate: 0,
        medianDirectMatchRelativeError: 0,
        beatEvidence: { sampleCount: 6, meanConfidence: 0.8 },
      },
    });
    expect(report.groups['j-pop'].directMatchRate).toBe(1);
    expect(report.gates.every((gate) => gate.passed)).toBe(true);
  });

  it('returns insufficient-data before making a quality claim', () => {
    const corpus = structuredClone(corpusFixture);
    corpus.acceptance.minimumTracks = 30;
    const report = evaluateBpmBenchmark(corpus, passingPredictions(corpus));

    expect(report.decision).toBe('insufficient-data');
    expect(report.gates.find((gate) => gate.id === 'minimum-tracks')).toEqual(
      expect.objectContaining({ actual: 6, required: 30, passed: false }),
    );
  });

  it('fails when a weak required stratum is hidden by the aggregate', () => {
    const corpus = structuredClone(corpusFixture);
    corpus.acceptance.minimumDirectMatchRate = 0.6;
    corpus.acceptance.maximumTempoOctaveErrorRate = 0.4;
    const predictions = passingPredictions(corpus);
    predictions.cases[0].estimate = completedEstimate(36);
    predictions.cases[1].estimate = completedEstimate(60);

    const report = evaluateBpmBenchmark(corpus, predictions);

    expect(report.summary.directMatchRate).toBeCloseTo(2 / 3);
    expect(report.decision).toBe('fail');
    expect(
      report.gates.find(
        (gate) => gate.id === 'required-tag-direct-match-rate:j-pop',
      ),
    ).toEqual(expect.objectContaining({ actual: 0, passed: false }));
  });

  it('keeps beat evidence confidence diagnostic-only', () => {
    const predictions = passingPredictions();
    predictions.cases[0].estimate.beatEvidenceConfidence = null;
    predictions.cases[1].estimate.beatEvidenceConfidence = 0.2;

    const report = evaluateBpmBenchmark(corpusFixture, predictions);

    expect(report.summary.beatEvidence).toEqual({
      sampleCount: 5,
      meanConfidence: 0.68,
    });
    expect(report.gates.some((gate) => gate.id.includes('confidence'))).toBe(
      false,
    );
    expect(report.decision).toBe('pass');
  });

  it('rejects identifying fields, unsafe values, duplicate ids, and extra or missing predictions', () => {
    expect(validateBpmCorpus(corpusFixture)).toEqual(corpusFixture);
    expect(validateBpmPredictions(passingPredictions(), corpusFixture)).toEqual(
      passingPredictions(),
    );

    const corpusMutations = [
      (corpus) => {
        corpus.cases[0].inputPath = 'C:\\Music\\song.wav';
      },
      (corpus) => {
        corpus.cases[0].referenceBpm = 500;
      },
      (corpus) => {
        corpus.cases.push(structuredClone(corpus.cases[0]));
      },
    ];
    const predictionMutations = [
      (predictions) => {
        predictions.cases[0].sourceSha256 = 'a'.repeat(64);
      },
      (predictions) => {
        predictions.cases.pop();
      },
      (predictions) => {
        predictions.cases.push({
          id: 'unexpected',
          estimate: completedEstimate(120),
        });
      },
    ];

    for (const mutate of corpusMutations) {
      const corpus = structuredClone(corpusFixture);
      mutate(corpus);
      expect(() => validateBpmCorpus(corpus)).toThrow();
    }
    for (const mutate of predictionMutations) {
      const predictions = passingPredictions();
      mutate(predictions);
      expect(() =>
        validateBpmPredictions(predictions, corpusFixture),
      ).toThrow();
    }
  });

  it('rejects stale corpus identity even when case ids still match', () => {
    const predictions = passingPredictions();
    const changedCorpus = structuredClone(corpusFixture);
    changedCorpus.cases[0].referenceBpm = 74;

    expect(() => validateBpmPredictions(predictions, changedCorpus)).toThrow(
      /fingerprint/i,
    );
  });

  it('writes the same path-free report through the CLI without overwriting inputs', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-bpm-evaluation-'),
    );
    const corpusPath = path.join(temporaryRoot, 'corpus.json');
    const predictionsPath = path.join(temporaryRoot, 'predictions.json');
    const reportPath = path.join(temporaryRoot, 'report.json');
    const scriptPath = fileURLToPath(
      new URL('./music-analysis-bpm-evaluation.mjs', import.meta.url),
    );
    fs.writeFileSync(corpusPath, JSON.stringify(corpusFixture));
    fs.writeFileSync(predictionsPath, JSON.stringify(passingPredictions()));

    try {
      const completed = spawnSync(
        process.execPath,
        [scriptPath, corpusPath, predictionsPath, reportPath],
        { encoding: 'utf8', windowsHide: true },
      );

      expect(completed.status, completed.stderr).toBe(0);
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toMatchObject({
        benchmarkId: 'synthetic-bpm-quality-v1',
        decision: 'pass',
      });
      expect(fs.readFileSync(reportPath, 'utf8')).not.toContain(temporaryRoot);

      const overwrite = spawnSync(
        process.execPath,
        [scriptPath, corpusPath, predictionsPath, corpusPath],
        { encoding: 'utf8', windowsHide: true },
      );
      expect(overwrite.status).not.toBe(0);
      expect(overwrite.stderr).toMatch(/overwrite/i);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

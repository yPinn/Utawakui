import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyTempoRelation,
  evaluateMusicStructureBenchmark,
  scoreSectionPrediction,
  validateMusicStructureBenchmark,
} from './music-analysis-evaluation.mjs';

const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../electron/lib/fixtures/musicStructure/tempo-octave-evaluation.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

const benchmarkFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../electron/lib/fixtures/musicStructure/m2-quality-benchmark.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

describe('classifyTempoRelation', () => {
  it.each(fixture.cases)(
    'classifies the fixed $id case without silently correcting BPM',
    ({ referenceBpm, estimatedBpm, expectedRelation }) => {
      expect(
        classifyTempoRelation(referenceBpm, estimatedBpm, {
          toleranceRatio: fixture.toleranceRatio,
        }),
      ).toBe(expectedRelation);
    },
  );

  it('rejects invalid evaluation inputs', () => {
    expect(() => classifyTempoRelation(0, 120)).toThrow(/positive/i);
    expect(() => classifyTempoRelation(120, 60, { toleranceRatio: 1 })).toThrow(
      /tolerance/i,
    );
  });
});

describe('M2 quality benchmark', () => {
  it('separates strict/loose boundary accuracy from semantic role accuracy', () => {
    const result = scoreSectionPrediction(benchmarkFixture.cases[1]);

    expect(result.boundaryAt500Ms).toEqual({
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
    });
    expect(result.boundaryAt3000Ms).toEqual({
      precision: 1,
      recall: 1,
      f1: 1,
    });
    expect(result.roleDurationAccuracy).toBeCloseTo(2 / 3);
    expect(result.tempoRelation).toBe('double-time');
    expect(result.m2Status).toBe('current');
    expect(result.m2Eligible).toBe(true);
  });

  it('reports contract-safe downgrades independently of raw quality scores', () => {
    const lowConfidence = scoreSectionPrediction(benchmarkFixture.cases[2]);
    const incomplete = scoreSectionPrediction(benchmarkFixture.cases[3]);

    expect(lowConfidence).toMatchObject({
      boundaryAt500Ms: { f1: 1 },
      roleDurationAccuracy: 1,
      tempoRelation: 'half-time',
      m2Eligible: false,
      m2Status: 'low-confidence',
    });
    expect(incomplete).toMatchObject({
      boundaryAt500Ms: { precision: 1, recall: 0.5 },
      tempoRelation: 'unrelated',
      m2Eligible: false,
      m2Status: 'incomplete',
    });
    expect(incomplete.roleDurationAccuracy).toBeCloseTo(2 / 3);
  });

  it('aggregates macro metrics and produces an auditable gate decision', () => {
    const report = evaluateMusicStructureBenchmark(benchmarkFixture);

    expect(report).toMatchObject({
      schemaVersion: 1,
      benchmarkId: 'synthetic-m2-quality-v1',
      decision: 'pass',
      summary: {
        trackCount: 4,
        boundaryF1At500Ms: 0.791667,
        boundaryF1At3000Ms: 0.916667,
        roleDurationAccuracy: 0.833334,
        m2EligibleRate: 0.5,
        tempoOctaveErrorRate: 0.5,
        tempoMissingRate: 0,
        analysisFailureRate: 0,
      },
    });
    expect(report.gates.every((gate) => gate.passed)).toBe(true);
    expect(report.groups.synthetic.trackCount).toBe(4);
  });

  it('returns insufficient-data before claiming model quality', () => {
    const report = evaluateMusicStructureBenchmark({
      ...benchmarkFixture,
      acceptance: {
        ...benchmarkFixture.acceptance,
        minimumTracks: 30,
      },
    });

    expect(report.decision).toBe('insufficient-data');
    expect(report.gates.find((gate) => gate.id === 'minimum-tracks')).toEqual(
      expect.objectContaining({ passed: false, actual: 4, required: 30 }),
    );
  });

  it('fails when a required song group is hidden by stronger aggregate scores', () => {
    const candidate = structuredClone(benchmarkFixture);
    candidate.acceptance.requiredTags.push({
      tag: 'challenging',
      minimumTracks: 1,
    });
    candidate.acceptance.minimumRequiredTagRoleDurationAccuracy = 0.8;
    candidate.cases[1].tags.push('challenging');

    const report = evaluateMusicStructureBenchmark(candidate);

    expect(report.decision).toBe('fail');
    expect(
      report.gates.find(
        (gate) => gate.id === 'required-tag-role-accuracy:challenging',
      ),
    ).toEqual(expect.objectContaining({ passed: false, actual: 0.666667 }));
  });

  it('does not let a missing BPM estimate dilute octave-error evidence', () => {
    const candidate = structuredClone(benchmarkFixture);
    candidate.cases[0].estimate.bpm = null;

    const report = evaluateMusicStructureBenchmark(candidate);

    expect(report.decision).toBe('fail');
    expect(report.summary.tempoMissingRate).toBe(0.25);
    expect(
      report.gates.find((gate) => gate.id === 'tempo-missing-rate'),
    ).toEqual(expect.objectContaining({ passed: false }));
  });

  it('counts analyzer failures without inventing tempo or section scores', () => {
    const failedCase = {
      ...benchmarkFixture.cases[0],
      id: 'analysis-failed',
      estimate: { status: 'failed', errorCode: 'WORKER_FAILED' },
    };

    expect(scoreSectionPrediction(failedCase)).toMatchObject({
      analysisStatus: 'failed',
      boundaryAt500Ms: { precision: 0, recall: 0, f1: 0 },
      boundaryAt3000Ms: { precision: 0, recall: 0, f1: 0 },
      roleDurationAccuracy: 0,
      tempoRelation: 'missing',
      m2Eligible: false,
      m2Status: 'analysis-failed',
    });
  });

  it('rejects identifying paths, invalid reference partitions, and unknown truth roles', () => {
    expect(validateMusicStructureBenchmark(benchmarkFixture)).toEqual(
      benchmarkFixture,
    );

    for (const mutate of [
      (value) => (value.cases[0].inputPath = 'C:\\Music\\song.wav'),
      (value) => (value.cases[0].referenceSections[1].startMs = 21000),
      (value) => (value.cases[0].referenceSections[1].role = 'unknown'),
      (value) => (value.cases[0].estimate.sections[0].confidence = 2),
      (value) => (value.cases[0].referenceBpm = null),
      (value) => value.cases.push({ ...value.cases[0] }),
    ]) {
      const candidate = structuredClone(benchmarkFixture);
      mutate(candidate);
      expect(() => validateMusicStructureBenchmark(candidate)).toThrow();
    }
  });

  it('writes the same bounded report through the command-line entry point', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-m2-evaluation-'),
    );
    const outputPath = path.join(temporaryRoot, 'report.json');
    const scriptPath = fileURLToPath(
      new URL('./music-analysis-evaluation.mjs', import.meta.url),
    );
    const inputPath = fileURLToPath(
      new URL(
        '../electron/lib/fixtures/musicStructure/m2-quality-benchmark.json',
        import.meta.url,
      ),
    );

    try {
      const completed = spawnSync(
        process.execPath,
        [scriptPath, inputPath, outputPath],
        { encoding: 'utf8', windowsHide: true },
      );

      expect(completed.status, completed.stderr).toBe(0);
      expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toMatchObject({
        benchmarkId: 'synthetic-m2-quality-v1',
        decision: 'pass',
      });
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

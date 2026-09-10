import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  collectLyricsReadingObservations,
  scoreLyricsReadingBenchmark,
  validateLyricsReadingBenchmark,
} from './lyrics-reading-evaluation.mjs';

const fixtureUrl = new URL(
  './fixtures/lyrics-reading-evaluation/synthetic-baseline.json',
  import.meta.url,
);
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, 'utf8'));

function successfulObservations() {
  return fixture.cases.map((benchmarkCase) => {
    const predictedSegments = benchmarkCase.analyzerAddressable
      ? structuredClone(benchmarkCase.expectedSegments)
      : [{ t: '宇宙', r: 'うちゅう' }];
    return {
      caseId: benchmarkCase.id,
      status: 'ok',
      durationMs: 1,
      line: {
        text: benchmarkCase.lines[benchmarkCase.targetLineIndex],
        segments: predictedSegments,
      },
      tokens:
        benchmarkCase.cohort === 'mixed'
          ? [
              { surface: '夢', outOfVocabulary: false },
              { surface: 'tonight', outOfVocabulary: true },
            ]
          : [],
    };
  });
}

describe('Japanese reading benchmark contract', () => {
  it('accepts the synthetic five-cohort fixture', () => {
    expect(validateLyricsReadingBenchmark(fixture)).toEqual(fixture);
  });

  it('rejects extra fields, unsafe identifiers, missing cohorts, and invalid canonical expectations', () => {
    const extra = structuredClone(fixture);
    extra.cases[0].lyricsUrl = 'https://example.com/full-song';
    expect(() => validateLyricsReadingBenchmark(extra)).toThrow(
      /invalid fields/i,
    );

    const unsafe = structuredClone(fixture);
    unsafe.cases[0].id = '__proto__';
    expect(() => validateLyricsReadingBenchmark(unsafe)).toThrow(/case id/i);

    const missingCohort = structuredClone(fixture);
    missingCohort.cases = missingCohort.cases.slice(0, 4);
    missingCohort.acceptance.minimumCases = 4;
    expect(() => validateLyricsReadingBenchmark(missingCohort)).toThrow(
      /required cohort/i,
    );

    const invalidSegments = structuredClone(fixture);
    invalidSegments.cases[0].expectedSegments[0].t = '違';
    expect(() => validateLyricsReadingBenchmark(invalidSegments)).toThrow(
      /canonical text/i,
    );
  });
});

describe('Japanese reading benchmark scoring', () => {
  it('measures the production reading path without tokenizing a line twice', () => {
    const readings = new Map([
      ['歌う声', [{ surface: '歌う声', reading: 'ウタウコエ' }]],
      ['東京タワー', [{ surface: '東京タワー', reading: 'トウキョウタワー' }]],
      [
        '夢を見る tonight',
        [{ surface: '夢を見る tonight', reading: 'ユメヲミル TONIGHT' }],
      ],
      ['今日', [{ surface: '今日', reading: 'キョウ' }]],
      ['宇宙', [{ surface: '宇宙', reading: 'ウチュウ' }]],
    ]);
    const tokenize = vi.fn((text) => readings.get(text));

    const observations = collectLyricsReadingObservations(fixture, {
      tokenize,
      kanaToRomaji: (value) => value,
      analyzer: { id: 'kuromoji-wanakana', version: '0' },
      now: () => 1,
    });

    expect(observations).toHaveLength(5);
    expect(tokenize).toHaveBeenCalledTimes(5);
  });

  it('separates analyzer-addressable accuracy from song-specific exceptions', () => {
    const report = scoreLyricsReadingBenchmark(fixture, {
      analyzer: { id: 'kuromoji-wanakana', version: '0.1.2' },
      observations: successfulObservations(),
      performance: {
        tokenizerLoadMs: 100,
        firstPassMs: 5,
        secondPassMs: 4,
        rssBeforeBytes: 1000,
        rssAfterBytes: 2000,
        maxRssBytes: 3000,
      },
    });

    expect(report).toMatchObject({
      schemaVersion: 1,
      benchmarkId: 'synthetic-japanese-reading-v1',
      decision: 'baseline-ready',
      analyzer: { id: 'kuromoji-wanakana', version: '0.1.2' },
      summary: {
        caseCount: 5,
        analyzerAddressableCaseCount: 4,
        exactReadingAccuracy: 0.8,
        analyzerAddressableExactReadingAccuracy: 1,
        rubySegmentAccuracy: 0.8,
        canonicalIntegrityRate: 1,
        analysisFailureRate: 0,
        totalOutOfVocabularyCount: 1,
        shadowMatchCount: 1,
        shadowFalsePositiveCount: 0,
        shadowMissCount: 0,
        shadowPrecision: 1,
      },
      performance: {
        tokenizerLoadMs: 100,
        secondPassMs: 4,
        maxRssBytes: 3000,
      },
    });
    expect(report.summary.readingCharacterErrorRate).toBeGreaterThan(0);
    expect(report.groups['song-specific'].exactReadingAccuracy).toBe(0);
    expect(report.groups.standard.exactReadingAccuracy).toBe(1);
  });

  it('rejects a result from a different analyzer as a baseline report', () => {
    expect(() =>
      scoreLyricsReadingBenchmark(fixture, {
        analyzer: { id: 'different-analyzer', version: '1' },
        observations: successfulObservations(),
      }),
    ).toThrow(/baseline analyzer/i);
  });

  it('fails the baseline gate for canonical corruption or a shadow false positive', () => {
    const observations = successfulObservations();
    observations[0].line.segments[0].t = '違';
    observations[0].line.text = '違う声';
    observations[0].shadowCorrectionIds = ['unexpected-correction'];

    const report = scoreLyricsReadingBenchmark(fixture, {
      analyzer: { id: 'kuromoji-wanakana', version: '0' },
      observations,
    });

    expect(report.decision).toBe('invalid-baseline');
    expect(report.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'canonical-integrity', passed: false }),
        expect.objectContaining({
          id: 'shadow-false-positives',
          passed: false,
        }),
      ]),
    );
  });

  it('counts analyzer failures without inventing reading or segment accuracy', () => {
    const observations = successfulObservations();
    observations[0] = {
      caseId: fixture.cases[0].id,
      status: 'failed',
      durationMs: 1,
      errorCode: 'ANALYZER_FAILED',
    };

    const report = scoreLyricsReadingBenchmark(fixture, {
      analyzer: { id: 'kuromoji-wanakana', version: '0' },
      observations,
    });

    expect(report.decision).toBe('invalid-baseline');
    expect(report.summary.analysisFailureRate).toBe(0.2);
    expect(report.cases[0]).toMatchObject({
      status: 'failed',
      exactReading: null,
      canonicalIntegrity: null,
    });
  });

  it('rejects an edit-distance workload above the per-case budget', () => {
    const expensiveFixture = structuredClone(fixture);
    const expensiveText = 'あ'.repeat(1001);
    expensiveFixture.cases[0].lines = [expensiveText];
    expensiveFixture.cases[0].targetLineIndex = 0;
    expensiveFixture.cases[0].expectedKana = expensiveText;
    expensiveFixture.cases[0].expectedSegments = [{ t: expensiveText }];
    const observations = successfulObservations();
    observations[0].line = {
      text: expensiveText,
      segments: [{ t: expensiveText, r: 'い'.repeat(1001) }],
    };

    expect(() =>
      scoreLyricsReadingBenchmark(expensiveFixture, {
        analyzer: { id: 'kuromoji-wanakana', version: '0' },
        observations,
      }),
    ).toThrow(/edit-distance workload/i);
  });
});

describe('Japanese reading evaluation CLI', () => {
  it('runs the real bundled kuromoji baseline and atomically writes a report', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-reading-evaluation-'),
    );
    const outputPath = path.join(temporaryRoot, 'report.json');
    const scriptPath = fileURLToPath(
      new URL('./lyrics-reading-evaluation.mjs', import.meta.url),
    );

    try {
      const completed = spawnSync(
        process.execPath,
        [scriptPath, fileURLToPath(fixtureUrl), outputPath],
        { encoding: 'utf8', windowsHide: true, timeout: 30000 },
      );

      expect(completed.status, completed.stderr).toBe(0);
      expect(completed.stderr).toBe('');
      expect(completed.stdout.trim()).toBe(path.resolve(outputPath));
      expect(JSON.parse(fs.readFileSync(outputPath, 'utf8'))).toMatchObject({
        benchmarkId: fixture.benchmarkId,
        decision: 'baseline-ready',
        analyzer: { id: 'kuromoji-wanakana' },
        summary: {
          analyzerAddressableExactReadingAccuracy: 1,
          shadowFalsePositiveCount: 0,
        },
      });
      expect(fs.existsSync(`${outputPath}.tmp`)).toBe(false);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects missing, oversized, and input-overwriting invocations', () => {
    const scriptPath = fileURLToPath(
      new URL('./lyrics-reading-evaluation.mjs', import.meta.url),
    );
    const missing = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/usage:/i);

    const overwrite = spawnSync(
      process.execPath,
      [scriptPath, fileURLToPath(fixtureUrl), fileURLToPath(fixtureUrl)],
      { encoding: 'utf8', windowsHide: true },
    );
    expect(overwrite.status).toBe(1);
    expect(overwrite.stderr).toMatch(/must not overwrite/i);

    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-reading-oversized-'),
    );
    try {
      const existingOutputPath = path.join(temporaryRoot, 'existing.json');
      fs.writeFileSync(existingOutputPath, 'keep-me');
      const existingOutput = spawnSync(
        process.execPath,
        [scriptPath, fileURLToPath(fixtureUrl), existingOutputPath],
        { encoding: 'utf8', windowsHide: true },
      );
      expect(existingOutput.status).toBe(1);
      expect(existingOutput.stderr).toMatch(/already exists/i);
      expect(fs.readFileSync(existingOutputPath, 'utf8')).toBe('keep-me');

      const oversizedPath = path.join(temporaryRoot, 'oversized.json');
      fs.writeFileSync(oversizedPath, ' '.repeat(8 * 1024 * 1024 + 1));
      const oversized = spawnSync(
        process.execPath,
        [scriptPath, oversizedPath],
        { encoding: 'utf8', windowsHide: true },
      );
      expect(oversized.status).toBe(1);
      expect(oversized.stderr).toMatch(/exceeds the size limit/i);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});

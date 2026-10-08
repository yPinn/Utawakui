import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseArtistPhotoEvaluationCliArgs,
  runArtistPhotoEvaluationCli,
} from './artist-photo-provider-evaluation-cli.mjs';

const temporaryDirectories = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'utawakui-artist-photo-evaluation-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function syntheticInputs(directory) {
  const corpusPath = path.join(directory, 'corpus.json');
  const observationsPath = path.join(directory, 'observations.json');
  const reviewsPath = path.join(directory, 'reviews.json');
  const reportPath = path.join(directory, 'report.json');
  const corpus = JSON.parse(
    fs.readFileSync(
      new URL(
        './fixtures/artist-photo-provider-evaluation/synthetic-four-case.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  fs.writeFileSync(corpusPath, JSON.stringify(corpus));
  fs.writeFileSync(
    observationsPath,
    JSON.stringify({
      schemaVersion: 1,
      provider: 'synthetic-provider-v1',
      cases: corpus.cases.map((entry, index) => ({
        caseId: entry.caseId,
        status: 'ok',
        latencyMs: 100 + index,
        operationalFailures: [],
        candidates: [
          {
            rank: 1,
            entityId: `UC${String(index + 1).repeat(22)}`,
            name: entry.artistName,
            portrait: {
              host:
                index % 2 === 0
                  ? 'yt3.googleusercontent.com'
                  : 'lh3.googleusercontent.com',
              width: 120,
              height: 120,
            },
            evidence: {
              exactName: true,
              matchedChannelCount: entry.recordings.length > 0 ? 1 : 0,
              matchedVideoCount: entry.recordings.length > 0 ? 1 : 0,
            },
          },
        ],
      })),
    }),
  );
  fs.writeFileSync(
    reviewsPath,
    JSON.stringify({
      schemaVersion: 1,
      reviewer: 'synthetic-review-v1',
      cases: corpus.cases.map((entry) => ({
        caseId: entry.caseId,
        correctRanks: [1],
      })),
    }),
  );
  return { corpusPath, observationsPath, reviewsPath, reportPath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('artist photo provider evaluation CLI', () => {
  it('accepts only four paths and the explicit synthetic flag', () => {
    expect(
      parseArtistPhotoEvaluationCliArgs([
        'corpus.json',
        'observations.json',
        'reviews.json',
        'report.json',
        '--synthetic',
      ]),
    ).toMatchObject({ synthetic: true });
    expect(() =>
      parseArtistPhotoEvaluationCliArgs([
        'corpus.json',
        'observations.json',
        'reviews.json',
        'corpus.json',
      ]),
    ).toThrow(/must not overwrite input/i);
    expect(() =>
      parseArtistPhotoEvaluationCliArgs([
        'corpus.json',
        'observations.json',
        'reviews.json',
        'report.json',
        '--provider-module=unsafe.mjs',
      ]),
    ).toThrow(/usage/i);
  });

  it('writes only the aggregate privacy-safe report', async () => {
    const paths = syntheticInputs(temporaryDirectory());
    await expect(
      runArtistPhotoEvaluationCli([
        paths.corpusPath,
        paths.observationsPath,
        paths.reviewsPath,
        paths.reportPath,
        '--synthetic',
      ]),
    ).resolves.toBe(path.resolve(paths.reportPath));

    const serialized = fs.readFileSync(paths.reportPath, 'utf8');
    const report = JSON.parse(serialized);
    expect(report.run).toEqual({
      caseCount: 4,
      listedCaseCount: 3,
      provider: 'synthetic-provider-v1',
      corpusProfile: 'synthetic-v1',
    });
    expect(serialized).not.toContain('PRIVATE');
    expect(serialized).not.toContain('listed-current');
    expect(serialized).not.toContain('http');
  });

  it('rejects a regular corpus in synthetic mode', async () => {
    const paths = syntheticInputs(temporaryDirectory());
    const corpus = JSON.parse(fs.readFileSync(paths.corpusPath, 'utf8'));
    corpus.corpusId = 'artist-photo-private-v1';
    fs.writeFileSync(paths.corpusPath, JSON.stringify(corpus));

    await expect(
      runArtistPhotoEvaluationCli([
        paths.corpusPath,
        paths.observationsPath,
        paths.reviewsPath,
        paths.reportPath,
        '--synthetic',
      ]),
    ).rejects.toThrow(/synthetic corpus id/i);
  });

  it('rejects a synthetic corpus when the explicit flag is missing', async () => {
    const paths = syntheticInputs(temporaryDirectory());
    await expect(
      runArtistPhotoEvaluationCli([
        paths.corpusPath,
        paths.observationsPath,
        paths.reviewsPath,
        paths.reportPath,
      ]),
    ).rejects.toThrow(/synthetic corpus id|corpus profile/i);
  });

  it('rejects an existing report path that aliases a private input', async () => {
    const paths = syntheticInputs(temporaryDirectory());
    fs.linkSync(paths.corpusPath, paths.reportPath);

    await expect(
      runArtistPhotoEvaluationCli([
        paths.corpusPath,
        paths.observationsPath,
        paths.reviewsPath,
        paths.reportPath,
        '--synthetic',
      ]),
    ).rejects.toThrow(/must not overwrite input/i);
  });
});

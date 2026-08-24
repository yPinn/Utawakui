import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import reviewModule from './musicAnalysisBenchmarkReview.js';

const { loadMusicAnalysisBenchmarkReview } = reviewModule;

const temporaryDirectories = [];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-m2-review-'));
  temporaryDirectories.push(root);
  const libraryRoot = path.join(root, 'library');
  const outputRoot = path.join(root, 'benchmark-output');
  fs.mkdirSync(libraryRoot);
  const configPath = path.join(root, 'run.json');
  const benchmarkCase = {
    benchmarkCaseId: 'case-01',
    trackId: 'track-01',
    durationMs: 120000,
    tags: ['j-pop', 'karaoke'],
  };
  const config = {
    schemaVersion: 1,
    benchmarkId: 'pilot-01',
    libraryRoot,
    outputRoot,
    ffmpegPath: path.join(root, 'ffmpeg.exe'),
    pythonPath: path.join(root, 'python.exe'),
    environmentPath: path.join(root, 'site-packages'),
    workerPath: path.join(root, 'worker.py'),
    modelManifestPath: path.join(root, 'model.json'),
    modelPath: path.join(root, 'models'),
    cases: [benchmarkCase],
  };
  const predictions = {
    schemaVersion: 1,
    benchmarkId: 'pilot-01',
    analyzer: {
      id: 'all-in-one-structure',
      version: '3.1.0',
      profileId: 'all-in-one-cpu-v1',
      modelId: 'all-in-one-harmonix-fold0',
    },
    cases: [
      {
        id: 'case-01',
        tags: ['j-pop', 'karaoke'],
        durationMs: 120000,
        wallMs: 42000,
        estimate: {
          status: 'completed',
          bpm: 120,
          sections: [
            {
              startMs: 0,
              endMs: 30000,
              role: 'intro',
              confidence: 0.8,
            },
            {
              startMs: 30000,
              endMs: 120000,
              role: 'chorus',
              confidence: 0.7,
            },
          ],
        },
      },
    ],
  };
  writeJson(configPath, config);
  writeJson(path.join(outputRoot, 'predictions.json'), predictions);
  return { root, libraryRoot, outputRoot, configPath, config, predictions };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('music analysis benchmark review evidence', () => {
  it('loads a path-free projection and reuses the production M2 gate', () => {
    const value = fixture();

    expect(
      loadMusicAnalysisBenchmarkReview(value.configPath, {
        expectedLibraryRoot: value.libraryRoot,
      }),
    ).toEqual({
      schemaVersion: 1,
      benchmarkId: 'pilot-01',
      analyzer: value.predictions.analyzer,
      cases: [
        {
          id: 'case-01',
          trackId: 'track-01',
          tags: ['j-pop', 'karaoke'],
          durationMs: 120000,
          wallMs: 42000,
          m2Status: 'current',
          estimate: value.predictions.cases[0].estimate,
        },
      ],
    });
  });

  it('projects low-confidence sections as an M1 downgrade', () => {
    const value = fixture();
    value.predictions.cases[0].estimate.sections[1].confidence = 0.49;
    writeJson(
      path.join(value.outputRoot, 'predictions.json'),
      value.predictions,
    );

    expect(
      loadMusicAnalysisBenchmarkReview(value.configPath, {
        expectedLibraryRoot: value.libraryRoot,
      }).cases[0].m2Status,
    ).toBe('low-confidence');
  });

  it('rejects a config for another library or output nested in the library', () => {
    const value = fixture();
    expect(() =>
      loadMusicAnalysisBenchmarkReview(value.configPath, {
        expectedLibraryRoot: path.join(value.root, 'different-library'),
      }),
    ).toThrow(/current library/i);

    value.config.outputRoot = path.join(value.libraryRoot, 'analysis');
    writeJson(value.configPath, value.config);
    expect(() =>
      loadMusicAnalysisBenchmarkReview(value.configPath, {
        expectedLibraryRoot: value.libraryRoot,
      }),
    ).toThrow(/outside the library/i);
  });

  it('rejects private prediction fields and mismatched case identity', () => {
    const value = fixture();
    value.predictions.cases[0].trackId = 'private-track';
    writeJson(
      path.join(value.outputRoot, 'predictions.json'),
      value.predictions,
    );
    expect(() =>
      loadMusicAnalysisBenchmarkReview(value.configPath, {
        expectedLibraryRoot: value.libraryRoot,
      }),
    ).toThrow(/invalid fields/i);

    delete value.predictions.cases[0].trackId;
    value.predictions.cases[0].id = 'unknown-case';
    writeJson(
      path.join(value.outputRoot, 'predictions.json'),
      value.predictions,
    );
    expect(() =>
      loadMusicAnalysisBenchmarkReview(value.configPath, {
        expectedLibraryRoot: value.libraryRoot,
      }),
    ).toThrow(/run config/i);
  });
});

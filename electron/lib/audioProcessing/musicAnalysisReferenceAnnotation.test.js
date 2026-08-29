import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import annotationModule from './musicAnalysisReferenceAnnotation.js';

const { createMusicAnalysisReferenceAnnotationService } = annotationModule;
const temporaryDirectories = [];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-m2-reference-'));
  temporaryDirectories.push(root);
  const libraryRoot = path.join(root, 'library');
  const outputRoot = path.join(root, 'benchmark-output');
  fs.mkdirSync(libraryRoot);
  const configPath = path.join(root, 'run.json');
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
    cases: [
      {
        benchmarkCaseId: 'case-01',
        trackId: 'track-01',
        durationMs: 120000,
        tags: ['j-pop', 'karaoke'],
      },
    ],
  };
  writeJson(configPath, config);
  return { libraryRoot, outputRoot, configPath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('music analysis reference annotation service', () => {
  it('opens a path-free blank worklist without reading model predictions', () => {
    const value = fixture();
    const service = createMusicAnalysisReferenceAnnotationService({
      randomUUID: () => 'annotation-session-1',
    });

    expect(
      service.open(value.configPath, {
        expectedLibraryRoot: value.libraryRoot,
      }),
    ).toEqual({
      schemaVersion: 1,
      sessionId: 'annotation-session-1',
      benchmarkId: 'pilot-01',
      annotationState: 'draft',
      allowedRoles: [
        'intro',
        'verse',
        'pre-chorus',
        'chorus',
        'bridge',
        'instrumental',
        'outro',
      ],
      cases: [
        {
          id: 'case-01',
          trackId: 'track-01',
          tags: ['j-pop', 'karaoke'],
          durationMs: 120000,
          referenceBpm: null,
          referenceSections: [{ startMs: 0, endMs: 120000, role: null }],
          complete: false,
        },
      ],
    });
    expect(fs.existsSync(path.join(value.outputRoot, 'predictions.json'))).toBe(
      false,
    );
  });

  it('atomically saves only bounded reference data and derives completion', () => {
    const value = fixture();
    const service = createMusicAnalysisReferenceAnnotationService({
      randomUUID: () => 'annotation-session-1',
    });
    service.open(value.configPath, {
      expectedLibraryRoot: value.libraryRoot,
    });

    const saved = service.save({
      sessionId: 'annotation-session-1',
      cases: [
        {
          id: 'case-01',
          referenceBpm: 128,
          referenceSections: [
            { startMs: 0, endMs: 30000, role: 'intro' },
            { startMs: 30000, endMs: 120000, role: 'chorus' },
          ],
        },
      ],
    });

    expect(saved.annotationState).toBe('complete');
    expect(saved.cases[0].complete).toBe(true);
    const persisted = JSON.parse(
      fs.readFileSync(
        path.join(value.outputRoot, 'reference-worklist.json'),
        'utf8',
      ),
    );
    expect(persisted).toEqual({
      schemaVersion: 1,
      benchmarkId: 'pilot-01',
      annotationState: 'complete',
      allowedRoles: saved.allowedRoles,
      cases: [
        {
          id: 'case-01',
          tags: ['j-pop', 'karaoke'],
          durationMs: 120000,
          referenceBpm: 128,
          referenceSections: [
            { startMs: 0, endMs: 30000, role: 'intro' },
            { startMs: 30000, endMs: 120000, role: 'chorus' },
          ],
        },
      ],
    });
    expect(JSON.stringify(persisted)).not.toMatch(
      /trackId|sessionId|prediction|libraryRoot|outputRoot/,
    );
    expect(
      fs.existsSync(
        `${path.join(value.outputRoot, 'reference-worklist.json')}.tmp`,
      ),
    ).toBe(false);
  });

  it('rejects renderer paths, unknown cases, and non-contiguous sections', () => {
    const value = fixture();
    const service = createMusicAnalysisReferenceAnnotationService({
      randomUUID: () => 'annotation-session-1',
    });
    service.open(value.configPath, {
      expectedLibraryRoot: value.libraryRoot,
    });

    expect(() =>
      service.save({
        sessionId: 'annotation-session-1',
        configPath: 'E:\\untrusted\\run.json',
        cases: [],
      }),
    ).toThrow(/invalid fields/i);
    expect(() =>
      service.save({
        sessionId: 'annotation-session-1',
        cases: [
          {
            id: 'unknown-case',
            referenceBpm: 120,
            referenceSections: [],
          },
        ],
      }),
    ).toThrow(/run config/i);
    expect(() =>
      service.save({
        sessionId: 'annotation-session-1',
        cases: [
          {
            id: 'case-01',
            referenceBpm: 120,
            referenceSections: [
              { startMs: 0, endMs: 30000, role: 'intro' },
              { startMs: 31000, endMs: 120000, role: 'chorus' },
            ],
          },
        ],
      }),
    ).toThrow(/contiguous/i);
  });
});

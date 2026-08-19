import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveSeparationsDir,
  resolveSeparationResultPath,
  hasSeparation,
  hasSeparationResultFile,
  loadSeparationManifest,
  recordSeparationResult,
  selectSeparationResult,
} from './separationManifest.js';

describe('resolveSeparationsDir', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepdir-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves to <dir>/tracks/<trackId>/separations', () => {
    expect(resolveSeparationsDir(dir, 'dQw4w9WgXcQ')).toBe(
      path.join(path.resolve(dir), 'tracks', 'dQw4w9WgXcQ', 'separations'),
    );
  });

  it('rejects ../ traversal via trackId', () => {
    expect(resolveSeparationsDir(dir, '../evil')).toBe(null);
  });

  it('rejects an absolute trackId', () => {
    expect(resolveSeparationsDir(dir, 'C:\\Windows')).toBe(null);
  });

  it('rejects a Windows drive-relative trackId', () => {
    expect(resolveSeparationsDir(dir, 'C:Windows')).toBe(null);
  });

  it('rejects empty or non-string trackId', () => {
    expect(resolveSeparationsDir(dir, '')).toBe(null);
    expect(resolveSeparationsDir(dir, null)).toBe(null);
  });
});

describe('resolveSeparationResultPath', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a preset file that exists on disk', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');

    expect(resolveSeparationResultPath(dir, 'abc', 'standard.wav')).toBe(
      path.join(
        path.resolve(dir),
        'tracks',
        'abc',
        'separations',
        'standard.wav',
      ),
    );
  });

  it('returns null when the file has not been produced yet', () => {
    expect(resolveSeparationResultPath(dir, 'abc', 'standard.wav')).toBe(null);
  });

  it('rejects a filename outside the safe charset (path traversal, wrong extension)', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');

    expect(resolveSeparationResultPath(dir, 'abc', '../../secret')).toBe(null);
    expect(resolveSeparationResultPath(dir, 'abc', 'standard.mp3')).toBe(null);
    expect(resolveSeparationResultPath(dir, 'abc', 'standard.wav/../x')).toBe(
      null,
    );
  });

  it('rejects a traversal attempt via trackId even with a valid preset filename', () => {
    expect(resolveSeparationResultPath(dir, '../evil', 'standard.wav')).toBe(
      null,
    );
  });
});

describe('hasSeparation', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-hassep-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is false when nothing has been separated yet', () => {
    expect(hasSeparation(dir, 'abc')).toBe(false);
  });

  it('is false when the separations dir exists but the manifest is empty (interrupted separation)', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    expect(hasSeparation(dir, 'abc')).toBe(false);
  });

  it('is true once the selected result exists on disk', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'x');
    recordSeparationResult(separationsDir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(hasSeparation(dir, 'abc')).toBe(true);
  });

  it('is false when the manifest points at a result whose file is missing', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    recordSeparationResult(separationsDir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    // recordSeparationResult only writes the manifest — no standard.wav on
    // disk, simulating a result deleted out-of-band.
    expect(hasSeparation(dir, 'abc')).toBe(false);
  });
});

describe('hasSeparationResultFile', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-hassepfile-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is true only when <presetId>.wav exists in the given dir', () => {
    fs.writeFileSync(path.join(dir, 'standard.wav'), 'x');
    expect(hasSeparationResultFile(dir, 'standard')).toBe(true);
    expect(hasSeparationResultFile(dir, 'inst-hq3')).toBe(false);
  });
});

describe('loadSeparationManifest', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepmanifest-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the empty default when manifest.json does not exist', () => {
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: null,
      results: {},
    });
  });

  it('reads selectedPresetId and results from a valid manifest', () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        selectedPresetId: 'inst-hq3',
        results: {
          standard: {
            modelId: 'kara2',
            separatedAt: '2026-01-01T00:00:00.000Z',
          },
          'inst-hq3': {
            modelId: 'inst-hq3',
            separatedAt: '2026-01-02T00:00:00.000Z',
          },
        },
      }),
    );
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: 'inst-hq3',
      results: {
        standard: { modelId: 'kara2', separatedAt: '2026-01-01T00:00:00.000Z' },
        'inst-hq3': {
          modelId: 'inst-hq3',
          separatedAt: '2026-01-02T00:00:00.000Z',
        },
      },
    });
  });

  it('returns the empty default for malformed JSON (hand-edited or corrupt file)', () => {
    fs.writeFileSync(path.join(dir, 'manifest.json'), 'not json{');
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: null,
      results: {},
    });
  });

  it('drops individual result entries missing a modelId rather than discarding the whole manifest', () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        selectedPresetId: 'standard',
        results: { standard: { separatedAt: 'x' }, broken: null },
      }),
    );
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: 'standard',
      results: {},
    });
  });
});

describe('recordSeparationResult', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepresult-test-'));
    fs.mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('adds a result and selects it', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(loadSeparationManifest(dir)).toEqual({
      version: 1,
      selectedPresetId: 'standard',
      results: {
        standard: { modelId: 'kara2', separatedAt: '2026-01-01T00:00:00.000Z' },
      },
    });
  });

  it('a second preset is added alongside the first, not overwriting it, and becomes selected', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    recordSeparationResult(dir, {
      presetId: 'inst-hq3',
      modelId: 'inst-hq3',
      separatedAt: '2026-01-02T00:00:00.000Z',
    });
    const manifest = loadSeparationManifest(dir);
    expect(manifest.selectedPresetId).toBe('inst-hq3');
    expect(Object.keys(manifest.results).sort()).toEqual([
      'inst-hq3',
      'standard',
    ]);
  });

  it('regenerating the same preset overwrites only that entry', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-03T00:00:00.000Z',
    });
    const manifest = loadSeparationManifest(dir);
    expect(Object.keys(manifest.results)).toEqual(['standard']);
    expect(manifest.results.standard.separatedAt).toBe(
      '2026-01-03T00:00:00.000Z',
    );
  });
});

describe('selectSeparationResult', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-sepselect-test-'));
    fs.mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('switches selectedPresetId when the target preset has a recorded result', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    recordSeparationResult(dir, {
      presetId: 'inst-hq3',
      modelId: 'inst-hq3',
      separatedAt: '2026-01-02T00:00:00.000Z',
    });
    // recordSeparationResult's own most-recent-wins selects inst-hq3 —
    // switch back to prove selectSeparationResult is a real pointer change.
    expect(selectSeparationResult(dir, 'standard')).toBe(true);
    expect(loadSeparationManifest(dir).selectedPresetId).toBe('standard');
  });

  it('refuses and leaves the manifest untouched for a preset with no result', () => {
    recordSeparationResult(dir, {
      presetId: 'standard',
      modelId: 'kara2',
      separatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(selectSeparationResult(dir, 'inst-hq3')).toBe(false);
    expect(loadSeparationManifest(dir).selectedPresetId).toBe('standard');
  });
});

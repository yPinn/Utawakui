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
      recipeId: 'standard',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      modelIds: ['kara2'],
      artifactFilename: 'standard.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    expect(hasSeparation(dir, 'abc')).toBe(true);
  });

  it('is false when the manifest points at a result whose file is missing', () => {
    const separationsDir = path.join(dir, 'tracks', 'abc', 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    recordSeparationResult(separationsDir, {
      recipeId: 'standard',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      modelIds: ['kara2'],
      artifactFilename: 'standard.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
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

  it('is true only when the manifest artifact filename exists in the given dir', () => {
    fs.writeFileSync(path.join(dir, 'standard.wav'), 'x');
    expect(hasSeparationResultFile(dir, 'standard.wav')).toBe(true);
    expect(hasSeparationResultFile(dir, 'clean.wav')).toBe(false);
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
      version: 2,
      selectedRecipeId: null,
      results: {},
    });
  });

  it('canonicalizes old v2 product ids without renaming their artifacts', () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: 2,
        selectedRecipeId: 'clean',
        results: {
          standard: {
            recipeVersion: 1,
            engineId: 'onnx-mdx',
            modelIds: ['kara2'],
            artifactFilename: 'standard.wav',
            completedAt: '2026-01-01T00:00:00.000Z',
            outputLayout: 'accompaniment-guide-4ch',
          },
          clean: {
            recipeVersion: 1,
            engineId: 'onnx-mdx',
            modelIds: ['inst-hq3'],
            artifactFilename: 'clean.wav',
            completedAt: '2026-01-02T00:00:00.000Z',
            outputLayout: 'accompaniment-guide-4ch',
          },
        },
      }),
    );

    expect(loadSeparationManifest(dir)).toMatchObject({
      selectedRecipeId: 'general',
      results: {
        quick: {
          profileId: 'mdx-kara2-v1',
          artifactFilename: 'standard.wav',
        },
        general: {
          profileId: 'mdx-inst-hq3-v1',
          artifactFilename: 'clean.wav',
        },
      },
    });
  });

  it('normalizes a v1 manifest to canonical product recipes without renaming artifacts', () => {
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
      version: 2,
      selectedRecipeId: 'general',
      results: {
        quick: {
          recipeVersion: 1,
          engineId: 'onnx-mdx',
          profileId: 'mdx-kara2-v1',
          modelIds: ['kara2'],
          artifactFilename: 'standard.wav',
          completedAt: '2026-01-01T00:00:00.000Z',
          outputLayout: 'accompaniment-guide-4ch',
        },
        general: {
          recipeVersion: 1,
          engineId: 'onnx-mdx',
          profileId: 'mdx-inst-hq3-v1',
          modelIds: ['inst-hq3'],
          artifactFilename: 'inst-hq3.wav',
          completedAt: '2026-01-02T00:00:00.000Z',
          outputLayout: 'accompaniment-guide-4ch',
        },
      },
    });
  });

  it('keeps an existing high-quality result as a selectable legacy result', () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        selectedPresetId: 'high-quality',
        results: {
          'high-quality': {
            modelId: 'kara2',
            separatedAt: '2026-01-03T00:00:00.000Z',
          },
        },
      }),
    );

    expect(loadSeparationManifest(dir)).toEqual({
      version: 2,
      selectedRecipeId: 'high-quality',
      results: {
        'high-quality': {
          recipeVersion: 1,
          engineId: 'onnx-mdx',
          profileId: 'mdx-kara2-denoise-v1',
          modelIds: ['kara2'],
          artifactFilename: 'high-quality.wav',
          completedAt: '2026-01-03T00:00:00.000Z',
          outputLayout: 'accompaniment-guide-4ch',
          legacy: true,
        },
      },
    });
  });

  it('keeps an unknown well-formed v1 result for recovery without making it runnable', () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        selectedPresetId: 'old-experiment',
        results: {
          'old-experiment': {
            modelId: 'unknown-model',
            separatedAt: '2026-01-03T00:00:00.000Z',
          },
        },
      }),
    );

    expect(loadSeparationManifest(dir)).toMatchObject({
      selectedRecipeId: 'old-experiment',
      results: {
        'old-experiment': {
          artifactFilename: 'old-experiment.wav',
          legacy: true,
        },
      },
    });
  });

  it('reads a valid v2 manifest without exposing unknown result fields', () => {
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({
        version: 2,
        selectedRecipeId: 'clean',
        results: {
          clean: {
            recipeVersion: 1,
            engineId: 'onnx-mdx',
            modelIds: ['inst-hq3'],
            artifactFilename: 'clean.wav',
            completedAt: '2026-01-04T00:00:00.000Z',
            outputLayout: 'accompaniment-guide-4ch',
            backingVocalPolicy: 'mixed-into-accompaniment',
            ignored: 'private implementation detail',
          },
        },
      }),
    );

    expect(loadSeparationManifest(dir)).toEqual({
      version: 2,
      selectedRecipeId: 'general',
      results: {
        general: {
          recipeVersion: 1,
          engineId: 'onnx-mdx',
          profileId: 'mdx-inst-hq3-v1',
          modelIds: ['inst-hq3'],
          artifactFilename: 'clean.wav',
          completedAt: '2026-01-04T00:00:00.000Z',
          outputLayout: 'accompaniment-guide-4ch',
          backingVocalPolicy: 'mixed-into-accompaniment',
        },
      },
    });
  });

  it('returns the empty default for malformed JSON (hand-edited or corrupt file)', () => {
    fs.writeFileSync(path.join(dir, 'manifest.json'), 'not json{');
    expect(loadSeparationManifest(dir)).toEqual({
      version: 2,
      selectedRecipeId: null,
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
      version: 2,
      selectedRecipeId: null,
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
      recipeId: 'quick',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      profileId: 'mdx-kara2-v1',
      modelIds: ['kara2'],
      artifactFilename: 'quick.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    expect(loadSeparationManifest(dir)).toEqual({
      version: 2,
      selectedRecipeId: 'quick',
      results: {
        quick: {
          recipeVersion: 1,
          engineId: 'onnx-mdx',
          profileId: 'mdx-kara2-v1',
          modelIds: ['kara2'],
          artifactFilename: 'quick.wav',
          completedAt: '2026-01-01T00:00:00.000Z',
          outputLayout: 'accompaniment-guide-4ch',
        },
      },
    });
  });

  it('a second preset is added alongside the first, not overwriting it, and becomes selected', () => {
    recordSeparationResult(dir, {
      recipeId: 'quick',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      profileId: 'mdx-kara2-v1',
      modelIds: ['kara2'],
      artifactFilename: 'quick.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    recordSeparationResult(dir, {
      recipeId: 'general',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      profileId: 'mdx-inst-hq3-v1',
      modelIds: ['inst-hq3'],
      artifactFilename: 'general.wav',
      completedAt: '2026-01-02T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    const manifest = loadSeparationManifest(dir);
    expect(manifest.selectedRecipeId).toBe('general');
    expect(Object.keys(manifest.results).sort()).toEqual(['general', 'quick']);
  });

  it('regenerating the same preset overwrites only that entry', () => {
    recordSeparationResult(dir, {
      recipeId: 'quick',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      profileId: 'mdx-kara2-v1',
      modelIds: ['kara2'],
      artifactFilename: 'quick.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    recordSeparationResult(dir, {
      recipeId: 'quick',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      profileId: 'mdx-kara2-v1',
      modelIds: ['kara2'],
      artifactFilename: 'quick.wav',
      completedAt: '2026-01-03T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    const manifest = loadSeparationManifest(dir);
    expect(Object.keys(manifest.results)).toEqual(['quick']);
    expect(manifest.results.quick.completedAt).toBe('2026-01-03T00:00:00.000Z');
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

  it('switches selectedRecipeId when the target recipe has a recorded result', () => {
    recordSeparationResult(dir, {
      recipeId: 'quick',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      profileId: 'mdx-kara2-v1',
      modelIds: ['kara2'],
      artifactFilename: 'quick.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    recordSeparationResult(dir, {
      recipeId: 'general',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      profileId: 'mdx-inst-hq3-v1',
      modelIds: ['inst-hq3'],
      artifactFilename: 'general.wav',
      completedAt: '2026-01-02T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    // recordSeparationResult's own most-recent-wins selects general. Selecting
    // through the released `standard` alias proves compatibility and a real
    // pointer change without restoring the alias as a runnable recipe.
    expect(selectSeparationResult(dir, 'standard')).toBe(true);
    expect(loadSeparationManifest(dir).selectedRecipeId).toBe('quick');
  });

  it('refuses and leaves the manifest untouched for a preset with no result', () => {
    recordSeparationResult(dir, {
      recipeId: 'quick',
      recipeVersion: 1,
      engineId: 'onnx-mdx',
      profileId: 'mdx-kara2-v1',
      modelIds: ['kara2'],
      artifactFilename: 'quick.wav',
      completedAt: '2026-01-01T00:00:00.000Z',
      outputLayout: 'accompaniment-guide-4ch',
    });
    expect(selectSeparationResult(dir, 'clean')).toBe(false);
    expect(loadSeparationManifest(dir).selectedRecipeId).toBe('quick');
  });
});

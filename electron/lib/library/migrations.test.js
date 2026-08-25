import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  migrateLegacyFlatSeparation,
  migrateLibrary,
  normalizeStructuredTrackSidecars,
} from './migrations.js';

describe('library migrations', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-migrations-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('normalizes structured metadata and yt-dlp artwork sidecars', () => {
    const trackDir = path.join(dir, 'tracks', 'track');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.info.json'), '{}');
    fs.writeFileSync(path.join(trackDir, 'audio.JPEG'), 'image');

    normalizeStructuredTrackSidecars(trackDir);

    expect(fs.existsSync(path.join(trackDir, 'info.json'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'audio.info.json'))).toBe(false);
    expect(fs.readFileSync(path.join(trackDir, 'thumbnail.jpeg'), 'utf8')).toBe(
      'image',
    );
  });

  it('preserves sidecars when normalized artwork exists or renames are locked', () => {
    const trackDir = path.join(dir, 'tracks', 'track');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.info.json'), '{}');
    fs.writeFileSync(path.join(trackDir, 'audio.png'), 'candidate');
    fs.writeFileSync(path.join(trackDir, 'thumbnail.jpg'), 'owned');

    normalizeStructuredTrackSidecars(trackDir);
    expect(fs.existsSync(path.join(trackDir, 'audio.png'))).toBe(true);

    fs.rmSync(path.join(trackDir, 'thumbnail.jpg'));
    fs.writeFileSync(path.join(trackDir, 'audio.info.json'), '{}');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('locked');
    });
    expect(() => normalizeStructuredTrackSidecars(trackDir)).not.toThrow();
    expect(fs.existsSync(path.join(trackDir, 'audio.info.json'))).toBe(true);
    expect(fs.existsSync(path.join(trackDir, 'audio.png'))).toBe(true);
  });

  it('ignores a missing structured track directory', () => {
    expect(() =>
      normalizeStructuredTrackSidecars(path.join(dir, 'missing')),
    ).not.toThrow();
  });

  it.each([
    ['standard', 'kara2', 'quick', 'mdx-kara2-v1', false],
    ['inst-hq3', 'inst-hq3', 'general', 'mdx-inst-hq3-v1', false],
    ['clean', 'clean-model', 'general', null, true],
    ['recording-enhanced', 'refined-model', 'refined', null, true],
    ['high-quality', 'kara2', 'high-quality', 'mdx-kara2-denoise-v1', true],
    ['custom', 'custom-model', 'custom', null, true],
  ])(
    'migrates flat %s separation to the %s recipe',
    (presetId, modelId, recipeId, profileId, legacy) => {
      const trackDir = path.join(dir, presetId);
      fs.mkdirSync(trackDir, { recursive: true });
      fs.writeFileSync(path.join(trackDir, 'stems.wav'), 'stems');
      fs.writeFileSync(
        path.join(trackDir, 'separation.json'),
        JSON.stringify({
          presetId,
          modelId,
          separatedAt: '2026-08-25T00:00:00.000Z',
        }),
      );

      migrateLegacyFlatSeparation(trackDir);

      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(trackDir, 'separations', 'manifest.json'),
          'utf8',
        ),
      );
      expect(manifest.selectedRecipeId).toBe(recipeId);
      expect(manifest.results[recipeId]).toMatchObject({
        recipeVersion: 1,
        engineId: 'onnx-mdx',
        modelIds: [modelId],
        artifactFilename: `${presetId}.wav`,
        completedAt: '2026-08-25T00:00:00.000Z',
        outputLayout: 'accompaniment-guide-4ch',
        ...(profileId ? { profileId } : {}),
        ...(legacy ? { legacy: true } : {}),
      });
      expect(fs.existsSync(path.join(trackDir, 'stems.wav'))).toBe(false);
      expect(fs.existsSync(path.join(trackDir, 'separation.json'))).toBe(false);
    },
  );

  it('uses legacy defaults for an unreadable separation sidecar', () => {
    const trackDir = path.join(dir, 'track');
    fs.mkdirSync(trackDir);
    fs.writeFileSync(path.join(trackDir, 'stems.wav'), 'stems');
    fs.writeFileSync(path.join(trackDir, 'separation.json'), '{invalid');

    migrateLegacyFlatSeparation(trackDir);

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(trackDir, 'separations', 'manifest.json'),
        'utf8',
      ),
    );
    expect(manifest.selectedRecipeId).toBe('quick');
    expect(manifest.results.quick.modelIds).toEqual(['kara2']);
  });

  it('does not overwrite an existing result or selection', () => {
    const trackDir = path.join(dir, 'track');
    const separationsDir = path.join(trackDir, 'separations');
    fs.mkdirSync(separationsDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'stems.wav'), 'legacy');
    fs.writeFileSync(path.join(separationsDir, 'standard.wav'), 'current');
    fs.writeFileSync(
      path.join(separationsDir, 'manifest.json'),
      JSON.stringify({
        version: 2,
        selectedRecipeId: 'general',
        results: {
          quick: {
            recipeVersion: 1,
            engineId: 'onnx-mdx',
            artifactFilename: 'standard.wav',
            modelIds: ['current'],
            completedAt: '2026-08-24T00:00:00.000Z',
            outputLayout: 'accompaniment-guide-4ch',
          },
          general: {
            recipeVersion: 1,
            engineId: 'onnx-mdx',
            artifactFilename: 'general.wav',
            modelIds: ['general'],
            completedAt: '2026-08-24T00:00:00.000Z',
            outputLayout: 'accompaniment-guide-4ch',
          },
        },
      }),
    );

    migrateLegacyFlatSeparation(trackDir);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(separationsDir, 'manifest.json'), 'utf8'),
    );
    expect(manifest.selectedRecipeId).toBe('general');
    expect(manifest.results.quick.modelIds).toEqual(['current']);
    expect(fs.existsSync(path.join(trackDir, 'stems.wav'))).toBe(true);
  });

  it('keeps legacy separation files when migration is interrupted', () => {
    const trackDir = path.join(dir, 'track');
    fs.mkdirSync(trackDir);
    fs.writeFileSync(path.join(trackDir, 'stems.wav'), 'stems');
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(source).endsWith('stems.wav')) throw new Error('locked');
      return rename(source, destination);
    });

    expect(() => migrateLegacyFlatSeparation(trackDir)).not.toThrow();
    expect(fs.existsSync(path.join(trackDir, 'stems.wav'))).toBe(true);
  });

  it('organizes root audio files and moves same-id duplicates aside', () => {
    fs.writeFileSync(path.join(dir, 'song.flac'), 'representative');
    fs.writeFileSync(path.join(dir, 'song.mp3'), 'duplicate');
    fs.writeFileSync(path.join(dir, 'other.wav'), 'other');

    migrateLibrary(dir);

    expect(
      fs.readFileSync(path.join(dir, 'tracks', 'song', 'audio.flac'), 'utf8'),
    ).toBe('representative');
    expect(
      fs.readFileSync(
        path.join(dir, '.duplicates', 'song', 'song.mp3'),
        'utf8',
      ),
    ).toBe('duplicate');
    expect(fs.existsSync(path.join(dir, 'tracks', 'other', 'audio.wav'))).toBe(
      true,
    );
  });

  it('uses a unique duplicate path and skips unsafe Windows-style ids', () => {
    const trackDir = path.join(dir, 'tracks', 'song');
    const duplicateDir = path.join(dir, '.duplicates', 'song');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.mkdirSync(duplicateDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'current');
    fs.writeFileSync(path.join(duplicateDir, 'song.mp3'), 'previous');
    fs.writeFileSync(path.join(dir, 'song.mp3'), 'next');
    fs.writeFileSync(path.join(dir, 'C:.mp3'), 'unsafe');

    migrateLibrary(dir);

    expect(fs.readFileSync(path.join(duplicateDir, 'song-1.mp3'), 'utf8')).toBe(
      'next',
    );
    expect(fs.existsSync(path.join(dir, 'C:.mp3'))).toBe(true);
  });

  it('moves legacy separated output only for an existing structured track', () => {
    const trackDir = path.join(dir, 'tracks', 'song');
    const legacyTrackDir = path.join(dir, '.separated', 'song');
    const orphanDir = path.join(dir, '.separated', 'orphan');
    fs.mkdirSync(trackDir, { recursive: true });
    fs.mkdirSync(legacyTrackDir, { recursive: true });
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(path.join(trackDir, 'audio.mp3'), 'audio');
    fs.writeFileSync(path.join(legacyTrackDir, 'stems.wav'), 'stems');
    fs.writeFileSync(path.join(orphanDir, 'stems.wav'), 'orphan');

    migrateLibrary(dir);

    expect(fs.readFileSync(path.join(trackDir, 'stems.wav'), 'utf8')).toBe(
      'stems',
    );
    expect(fs.existsSync(legacyTrackDir)).toBe(false);
    expect(fs.existsSync(orphanDir)).toBe(true);
  });

  it('leaves source files in place on filesystem failures', () => {
    fs.writeFileSync(path.join(dir, 'song.mp3'), 'audio');
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (String(source).endsWith('song.mp3')) throw new Error('locked');
      return rename(source, destination);
    });

    expect(() => migrateLibrary(dir)).not.toThrow();
    expect(fs.existsSync(path.join(dir, 'song.mp3'))).toBe(true);
  });

  it('is safe for missing library roots and missing flat separations', () => {
    expect(() => migrateLibrary(path.join(dir, 'missing'))).not.toThrow();
    expect(() => migrateLegacyFlatSeparation(dir)).not.toThrow();
  });
});

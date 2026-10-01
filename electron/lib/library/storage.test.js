import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupSeparationStorage,
  createLibraryStorageService,
  inspectLibraryStorage,
  listSeparationCandidates,
  resolveReserveBytes,
} from './storage.js';
import storageValues from '../../../shared/libraryStorageValues.json';
import {
  loadSeparationManifest,
  recordSeparationResult,
  selectSeparationResult,
} from './separationManifest.js';

function writeSized(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(bytes, 1));
}

function addSeparation(root, trackId, recipeId, bytes, completedAt) {
  const separationsDir = path.join(root, 'tracks', trackId, 'separations');
  const artifactFilename = `${recipeId}.wav`;
  writeSized(path.join(separationsDir, artifactFilename), bytes);
  recordSeparationResult(separationsDir, {
    recipeId,
    recipeVersion: 1,
    engineId: 'onnx-mdx',
    profileId: recipeId === 'quick' ? 'mdx-kara2-v1' : 'mdx-inst-hq3-v1',
    modelIds: [recipeId === 'quick' ? 'kara2' : 'inst-hq3'],
    artifactFilename,
    completedAt,
    outputLayout: 'accompaniment-guide-4ch',
  });
}

describe('library storage', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-storage-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('classifies source audio, separation audio, other files, and drive space', () => {
    writeSized(path.join(root, 'legacy.mp3'), 5);
    writeSized(path.join(root, 'tracks', 'track-a', 'audio.flac'), 10);
    writeSized(path.join(root, 'tracks', 'track-a', 'thumbnail.jpg'), 4);
    writeSized(path.join(root, 'tracks', 'track-a', 'lyrics', 'main.lrc'), 3);
    addSeparation(root, 'track-a', 'quick', 20, '2026-01-01T00:00:00.000Z');

    const snapshot = inspectLibraryStorage(root, {
      statfsSync: () => ({ bavail: 50, bsize: 4, blocks: 100 }),
    });
    const manifestBytes = fs.statSync(
      path.join(root, 'tracks', 'track-a', 'separations', 'manifest.json'),
    ).size;

    expect(snapshot).toEqual({
      totalBytes: 42 + manifestBytes,
      songBytes: 15,
      separationBytes: 20,
      otherBytes: 7 + manifestBytes,
      trackCount: 2,
      separationTrackCount: 1,
      driveFreeBytes: 200,
      driveCapacityBytes: 400,
    });
  });

  it('removes a non-selected recipe before any selected result', () => {
    writeSized(path.join(root, 'tracks', 'track-a', 'audio.mp3'), 3);
    addSeparation(root, 'track-a', 'quick', 8, '2026-01-01T00:00:00.000Z');
    addSeparation(root, 'track-a', 'general', 8, '2026-01-02T00:00:00.000Z');
    selectSeparationResult(
      path.join(root, 'tracks', 'track-a', 'separations'),
      'quick',
    );
    addSeparation(root, 'track-b', 'quick', 8, '2026-01-03T00:00:00.000Z');

    const result = cleanupSeparationStorage(root, {
      limitBytes: 20,
      targetRatio: 0.85,
      reserveFreeBytes: 0,
      statfsSync: () => ({ bavail: 100, bsize: 1, blocks: 200 }),
      lastPlayedAtByTrackId: {
        'track-a': '2026-02-02T00:00:00.000Z',
        'track-b': '2026-01-01T00:00:00.000Z',
      },
    });

    expect(result.removed).toEqual([
      { trackId: 'track-a', recipeId: 'general', bytes: 8 },
    ]);
    expect(
      loadSeparationManifest(
        path.join(root, 'tracks', 'track-a', 'separations'),
      ),
    ).toMatchObject({
      selectedRecipeId: 'quick',
      results: { quick: { artifactFilename: 'quick.wav' } },
    });
    expect(
      fs.existsSync(
        path.join(root, 'tracks', 'track-a', 'separations', 'general.wav'),
      ),
    ).toBe(false);
  });

  it('uses full-library last-played time for selected-result LRU and protects active ids', () => {
    for (const [trackId, completedAt] of [
      ['old-protected', '2026-01-01T00:00:00.000Z'],
      ['middle', '2026-01-02T00:00:00.000Z'],
      ['new', '2026-01-03T00:00:00.000Z'],
    ]) {
      writeSized(path.join(root, 'tracks', trackId, 'audio.mp3'), 2);
      addSeparation(root, trackId, 'quick', 8, completedAt);
    }

    const result = cleanupSeparationStorage(root, {
      limitBytes: 20,
      targetRatio: 0.5,
      reserveFreeBytes: 0,
      statfsSync: () => ({ bavail: 100, bsize: 1, blocks: 200 }),
      protectedTrackIds: ['old-protected'],
      lastPlayedAtByTrackId: {
        'old-protected': '2025-01-01T00:00:00.000Z',
        middle: '2026-01-01T00:00:00.000Z',
        new: '2026-02-01T00:00:00.000Z',
      },
    });

    expect(result.removed.map(({ trackId }) => trackId)).toEqual([
      'middle',
      'new',
    ]);
    expect(
      fs.existsSync(
        path.join(root, 'tracks', 'old-protected', 'separations', 'quick.wav'),
      ),
    ).toBe(true);
  });

  it('does nothing below the budget and never removes source or unknown files', () => {
    writeSized(path.join(root, 'tracks', 'track-a', 'audio.mp3'), 6);
    writeSized(path.join(root, 'tracks', 'track-a', 'private-note.txt'), 7);
    addSeparation(root, 'track-a', 'quick', 8, '2026-01-01T00:00:00.000Z');

    const result = cleanupSeparationStorage(root, {
      limitBytes: 10,
      reserveFreeBytes: 0,
      statfsSync: () => ({ bavail: 100, bsize: 1, blocks: 200 }),
    });

    expect(result.removed).toEqual([]);
    expect(result.freedBytes).toBe(0);
    expect(
      fs.existsSync(path.join(root, 'tracks', 'track-a', 'audio.mp3')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, 'tracks', 'track-a', 'private-note.txt')),
    ).toBe(true);
  });

  it('enforces the free-space reserve even when the separation budget is unlimited', () => {
    writeSized(path.join(root, 'tracks', 'track-a', 'audio.mp3'), 6);
    addSeparation(root, 'track-a', 'quick', 8, '2026-01-01T00:00:00.000Z');

    const result = cleanupSeparationStorage(root, {
      limitBytes: null,
      reserveFreeBytes: 5,
      statfsSync: () => ({ bavail: 0, bsize: 1, blocks: 200 }),
    });

    expect(result.freedBytes).toBe(8);
    expect(result.removed).toHaveLength(1);
    expect(result.remainingBytesToFree).toBe(0);
  });

  it('uses bounded reserve defaults and tolerates unavailable drive statistics', () => {
    writeSized(path.join(root, 'tracks', 'track-a', 'audio.mp3'), 6);

    expect(
      inspectLibraryStorage(root, {
        statfsSync: () => {
          throw new Error('drive unavailable');
        },
      }),
    ).toMatchObject({ driveFreeBytes: null, driveCapacityBytes: null });
    expect(resolveReserveBytes(null)).toBe(storageValues.minimumReserveBytes);
    expect(resolveReserveBytes(1024 ** 3)).toBe(
      storageValues.minimumReserveBytes,
    );
    expect(resolveReserveBytes(10 * 1024 ** 4)).toBe(
      storageValues.maximumReserveBytes,
    );
  });

  it('returns no candidates for a new library or a missing artifact', () => {
    expect(listSeparationCandidates(root)).toEqual([]);

    addSeparation(root, 'track-a', 'quick', 8, '2026-01-01T00:00:00.000Z');
    fs.rmSync(path.join(root, 'tracks', 'track-a', 'separations', 'quick.wav'));
    expect(listSeparationCandidates(root)).toEqual([]);
  });

  it('keeps automatic management opt-in and notifies only after removal', () => {
    writeSized(path.join(root, 'tracks', 'track-a', 'audio.mp3'), 6);
    addSeparation(root, 'track-a', 'quick', 8, '2026-01-01T00:00:00.000Z');
    let notificationCount = 0;
    const service = createLibraryStorageService({
      resolveLibraryDir: () => root,
      getLastPlayedAtByTrackId: () => ({
        'track-a': '2026-02-01T00:00:00.000Z',
      }),
      getProtectedTrackIds: () => [],
      notifyLibraryUpdated: () => {
        notificationCount += 1;
      },
      statfsSync: () => ({ bavail: 100, bsize: 1, blocks: 200 }),
    });

    expect(
      service.enforcePolicy({
        autoManageSeparation: false,
        separationLimitBytes: 4,
      }).removed,
    ).toEqual([]);
    expect(notificationCount).toBe(0);

    expect(
      service.enforcePolicy({
        autoManageSeparation: true,
        separationLimitBytes: 4,
      }).removed,
    ).toEqual([{ trackId: 'track-a', recipeId: 'quick', bytes: 8 }]);
    expect(notificationCount).toBe(1);
  });
});

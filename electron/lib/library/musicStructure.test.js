import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import musicStructureModule from './musicStructure.js';
import contractValues from '../../../shared/musicStructureContractValues.json';

const {
  loadTrackMusicStructure,
  musicStructureSidecarPath,
  prepareTrackMusicStructureSource,
  saveTrackMusicStructure,
} = musicStructureModule;
const AUDIO_BYTES = 'audio';
const SOURCE_SHA256 = crypto
  .createHash('sha256')
  .update(AUDIO_BYTES)
  .digest('hex');

const temporaryDirectories = [];

function temporaryLibrary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-structure-'));
  temporaryDirectories.push(dir);
  const trackDir = path.join(dir, 'tracks', 'track-1');
  fs.mkdirSync(trackDir, { recursive: true });
  fs.writeFileSync(path.join(trackDir, 'audio.wav'), AUDIO_BYTES);
  return dir;
}

function fixture(name = 'valid-m1') {
  const document = JSON.parse(
    fs.readFileSync(
      new URL(`../fixtures/musicStructure/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
  document.source.sha256 = SOURCE_SHA256;
  return document;
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('music-structure sidecar storage', () => {
  it('derives the producer input path and fingerprint entirely in main', async () => {
    const dir = temporaryLibrary();

    await expect(
      prepareTrackMusicStructureSource(dir, 'track-1'),
    ).resolves.toEqual({
      inputPath: path.join(dir, 'tracks', 'track-1', 'audio.wav'),
      sourceSha256: SOURCE_SHA256,
    });
    await expect(
      prepareTrackMusicStructureSource(dir, '../outside'),
    ).rejects.toThrow(/track/i);
  });

  it('atomically saves validated analysis and reloads only its current source revision', async () => {
    const dir = temporaryLibrary();

    const saved = await saveTrackMusicStructure(dir, 'track-1', fixture(), {
      sourceSha256: SOURCE_SHA256,
      sourceDurationMs: 180000,
    });

    expect(saved).toMatchObject({
      trackId: 'track-1',
      sourceRevision: SOURCE_SHA256,
      sourceDurationMs: 180000,
      signals: { level: 'M1', reason: 'current' },
    });
    await expect(loadTrackMusicStructure(dir, 'track-1')).resolves.toEqual(
      saved,
    );
    expect(
      JSON.parse(
        fs.readFileSync(musicStructureSidecarPath(dir, 'track-1'), 'utf8'),
      ),
    ).toEqual(fixture());
    expect(fs.existsSync(path.join(dir, 'library.json'))).toBe(false);
    expect(
      fs.existsSync(`${musicStructureSidecarPath(dir, 'track-1')}.tmp`),
    ).toBe(false);
  });

  it('rejects persistence without a main-derived current source identity', async () => {
    const dir = temporaryLibrary();

    await expect(
      saveTrackMusicStructure(dir, 'track-1', fixture()),
    ).rejects.toThrow(/source/i);
    expect(fs.existsSync(musicStructureSidecarPath(dir, 'track-1'))).toBe(
      false,
    );
  });

  it('keeps the previous sidecar authoritative when a replacement is invalid', async () => {
    const dir = temporaryLibrary();
    await saveTrackMusicStructure(dir, 'track-1', fixture(), {
      sourceSha256: SOURCE_SHA256,
      sourceDurationMs: 180000,
    });
    const before = fs.readFileSync(
      musicStructureSidecarPath(dir, 'track-1'),
      'utf8',
    );
    const invalid = fixture();
    invalid.beats[0].timeMs = -1;

    await expect(
      saveTrackMusicStructure(dir, 'track-1', invalid, {
        sourceSha256: SOURCE_SHA256,
        sourceDurationMs: 180000,
      }),
    ).rejects.toThrow();
    expect(
      fs.readFileSync(musicStructureSidecarPath(dir, 'track-1'), 'utf8'),
    ).toBe(before);
  });

  it.each([
    ['missing', null, 'missing'],
    ['invalid', '{', 'invalid'],
    [
      'unsupported',
      JSON.stringify({ ...fixture(), schemaVersion: 99 }),
      'invalid',
    ],
  ])('returns M0 for %s sidecars', async (_name, contents, reason) => {
    const dir = temporaryLibrary();
    fs.writeFileSync(
      path.join(dir, 'library.json'),
      JSON.stringify({
        version: 1,
        tracks: {
          'track-1': { contentHash: SOURCE_SHA256, duration: 180 },
        },
      }),
    );
    if (contents !== null) {
      const filePath = musicStructureSidecarPath(dir, 'track-1');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, contents);
    }

    await expect(
      loadTrackMusicStructure(dir, 'track-1'),
    ).resolves.toMatchObject({
      trackId: 'track-1',
      signals: { level: 'M0', reason },
    });
  });

  it('rejects an oversized sidecar before JSON parsing or audio hashing', async () => {
    const dir = temporaryLibrary();
    const filePath = musicStructureSidecarPath(dir, 'track-1');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, ' '.repeat(contractValues.maxDocumentBytes + 1));

    await expect(
      loadTrackMusicStructure(dir, 'track-1'),
    ).resolves.toMatchObject({
      signals: { level: 'M0', reason: 'invalid' },
    });
  });

  it('returns stale or unavailable M0 without exposing analyzer provenance', async () => {
    const dir = temporaryLibrary();
    const filePath = musicStructureSidecarPath(dir, 'track-1');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fixture()));
    fs.unlinkSync(path.join(dir, 'tracks', 'track-1', 'audio.wav'));

    const unavailable = await loadTrackMusicStructure(dir, 'track-1');
    expect(unavailable.signals).toMatchObject({
      level: 'M0',
      reason: 'unavailable-source',
    });

    expect(unavailable).not.toHaveProperty('analyzer');
    expect(unavailable.signals).not.toHaveProperty('analyzer');
  });

  it('rehashes the audio so an external replacement invalidates cached metadata', async () => {
    const dir = temporaryLibrary();
    await saveTrackMusicStructure(dir, 'track-1', fixture(), {
      sourceSha256: SOURCE_SHA256,
      sourceDurationMs: 180000,
    });
    fs.writeFileSync(
      path.join(dir, 'tracks', 'track-1', 'audio.wav'),
      'replacement-audio',
    );

    await expect(
      loadTrackMusicStructure(dir, 'track-1'),
    ).resolves.toMatchObject({
      trackId: 'track-1',
      signals: { level: 'M0', reason: 'stale' },
    });
  });

  it('rejects unsafe or missing track targets without creating files', async () => {
    const dir = temporaryLibrary();

    await expect(
      saveTrackMusicStructure(dir, '../outside', fixture(), {
        sourceSha256: SOURCE_SHA256,
        sourceDurationMs: 180000,
      }),
    ).rejects.toThrow(/track/i);
    expect(musicStructureSidecarPath(dir, '../outside')).toBeNull();
  });
});

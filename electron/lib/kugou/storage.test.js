import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  saveKugouRecord,
  loadStoredKugouArtifactSummary,
  deleteStoredKugouSource,
} from './storage.js';
import {
  getTrackLyricsState,
  loadTrackLyricsManifest,
  saveTrackLyricsText,
} from '../library/lyrics.js';
const directories = [];
const record = {
  id: 123,
  trackName: 'Song',
  artistName: 'Artist',
  duration: 180,
  lrcLyrics: '[ti:Song]\n[ar:Artist]\n[00:01]One\n[00:02]Two',
  matchBand: 'exact',
  durationDelta: 0,
  durationDeltaSigned: 0,
};
function directory() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'kugou-store-'));
  directories.push(value);
  return value;
}
afterEach(() => {
  for (const value of directories.splice(0))
    fs.rmSync(value, { recursive: true, force: true });
});
describe('Kugou offline T1 sources', () => {
  it('preserves existing sources and user preference, persists provenance and survives reloading', () => {
    const dir = directory();
    saveTrackLyricsText(
      dir,
      { filename: 'existing.lrc', kind: 'manual', language: 'und' },
      '[00:01]Mine',
    );
    const saved = saveKugouRecord(dir, record);
    expect(saved).toMatchObject({
      status: 'saved',
      source: { kind: 'kugou' },
      capability: { level: 'T1' },
    });
    const source = loadTrackLyricsManifest(dir).sources.find(
      (value) => value.kind === 'kugou',
    );
    expect(source.provider).toEqual({
      name: 'kugou',
      recordId: 123,
      artifactFilename: 'kugou-123.json',
    });
    expect(getTrackLyricsState(dir).sources).toHaveLength(2);
    expect(loadStoredKugouArtifactSummary(dir, source.provider)).toMatchObject({
      recordFingerprint: saved.recordFingerprint,
    });
    expect(saveKugouRecord(dir, record).source.filename).toBe(
      saved.source.filename,
    );
    expect(getTrackLyricsState(dir).sources).toHaveLength(2);
    expect(deleteStoredKugouSource(dir, source.filename)).toBe(true);
    expect(
      fs.existsSync(path.join(dir, 'lyrics/providers/kugou-123.json')),
    ).toBe(false);
    expect(getTrackLyricsState(dir).sources).toHaveLength(1);
  });
  it('rolls every file back if publishing the manifest fails', () => {
    const dir = directory();
    saveTrackLyricsText(
      dir,
      { filename: 'existing.lrc', kind: 'manual', language: 'und' },
      '[00:01]Mine',
    );
    const manifest = fs.readFileSync(path.join(dir, 'lyrics/lyrics.json'));
    expect(() =>
      saveKugouRecord(dir, record, {
        publishManifest() {
          throw new Error('disk');
        },
      }),
    ).toThrow('disk');
    expect(fs.readFileSync(path.join(dir, 'lyrics/lyrics.json'))).toEqual(
      manifest,
    );
    expect(fs.existsSync(path.join(dir, 'lyrics/kugou-123.lrc'))).toBe(false);
    expect(
      fs.existsSync(path.join(dir, 'lyrics/providers/kugou-123.json')),
    ).toBe(false);
  });
  it('rejects tampering and path traversal in offline summaries', () => {
    const dir = directory();
    saveKugouRecord(dir, record);
    const provider = loadTrackLyricsManifest(dir).sources[0].provider;
    expect(
      loadStoredKugouArtifactSummary(dir, {
        ...provider,
        artifactFilename: '../kugou-123.json',
      }),
    ).toBeNull();
    const file = path.join(dir, 'lyrics/providers/kugou-123.json');
    const artifact = JSON.parse(fs.readFileSync(file));
    artifact.record.lrcLyrics += 'tampered';
    fs.writeFileSync(file, JSON.stringify(artifact));
    expect(loadStoredKugouArtifactSummary(dir, provider)).toBeNull();
  });
});

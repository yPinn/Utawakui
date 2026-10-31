import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { migrateRetiredLyricsSources } from './retiredLyricsSources.js';
import { loadTrackLyricsManifest } from './lyrics.js';
import { loadTrackLyricsTiming } from './lyricsTiming.js';
const folders = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    fs.rmSync(folder, { force: true, recursive: true });
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-source-'));
  folders.push(root);
  fs.cpSync(new URL('./fixtures/retired-source', import.meta.url), root, {
    recursive: true,
  });
  return root;
}
it('backs up provenance and converts an actual retired-writer fixture without touching user data', () => {
  const root = fixture();
  const manifestFile = path.join(root, 'lyrics/lyrics.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile));
  manifest.sources[0].offsetMs = 1234;
  manifest.preference = {
    filename: manifest.sources[0].filename,
    origin: 'user',
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const protectedFiles = [
    'amll-43.lrc',
    'timing/amll-43.lrc.json',
    'readings/amll-43.lrc.json',
    'vocal-roles/amll-43.lrc.json',
  ];
  for (const relative of protectedFiles.slice(2)) {
    const file = path.join(root, 'lyrics', relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'synthetic user sidecar');
  }
  const bytes = protectedFiles.map((relative) =>
    fs.readFileSync(path.join(root, 'lyrics', relative)),
  );
  expect(migrateRetiredLyricsSources(root)).toBe(true);
  expect(loadTrackLyricsTiming(root, 'amll-43.lrc')).toMatchObject({
    status: 'current',
    document: { granularity: 'T2' },
  });
  const current = loadTrackLyricsManifest(root);
  expect(current.sources[0]).toMatchObject({ kind: 'manual', offsetMs: 1234 });
  expect(current.sources[0].provider).toBeUndefined();
  expect(current.preference).toEqual(manifest.preference);
  for (const [index, relative] of protectedFiles.entries())
    expect(fs.readFileSync(path.join(root, 'lyrics', relative))).toEqual(
      bytes[index],
    );
  const backup = path.join(root, 'lyrics/migrations/retired-providers-v1');
  expect(JSON.parse(fs.readFileSync(path.join(backup, 'lyrics.json')))).toEqual(
    manifest,
  );
  expect(fs.existsSync(path.join(backup, 'providers/amll-43.json'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'lyrics/providers/amll-43.json'))).toBe(
    false,
  );
  expect(migrateRetiredLyricsSources(root)).toBe(false);
});
it('preserves the active manifest and original provenance if publishing migration fails', () => {
  const root = fixture();
  const file = path.join(root, 'lyrics/lyrics.json');
  const original = fs.readFileSync(file);
  expect(() =>
    migrateRetiredLyricsSources(root, {
      publish() {
        throw new Error('disk');
      },
    }),
  ).toThrow('disk');
  expect(fs.readFileSync(file)).toEqual(original);
  expect(fs.existsSync(path.join(root, 'lyrics/providers/amll-43.json'))).toBe(
    true,
  );
});
it('keeps local lyrics readable when a backup directory cannot be created', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, 'lyrics/migrations'), 'blocked');
  expect(() => migrateRetiredLyricsSources(root)).toThrow();
  expect(loadTrackLyricsManifest(root).sources[0]).toMatchObject({
    filename: 'amll-43.lrc',
    kind: 'manual',
  });
  expect(
    fs.readFileSync(path.join(root, 'lyrics/amll-43.lrc'), 'utf8'),
  ).toContain('Hello');
  expect(fs.existsSync(path.join(root, 'lyrics/providers/amll-43.json'))).toBe(
    true,
  );
});
it('never follows an artifact filename outside the fixed retired-source pattern', () => {
  const root = fixture();
  const file = path.join(root, 'lyrics/lyrics.json');
  const value = JSON.parse(fs.readFileSync(file));
  value.sources[0].provider.artifactFilename = '../../outside.json';
  fs.writeFileSync(file, JSON.stringify(value));
  fs.writeFileSync(path.join(root, 'outside.json'), 'protected');
  expect(migrateRetiredLyricsSources(root)).toBe(true);
  expect(fs.readFileSync(path.join(root, 'outside.json'), 'utf8')).toBe(
    'protected',
  );
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createSeparationOutputTransaction,
  recoverSeparationOutputArtifacts,
} from './separationOutputRecovery.js';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-recovery-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const dead = () => false;
function transaction(phase = 'worker') {
  const t = createSeparationOutputTransaction(dir, 'general');
  t.update(phase);
  fs.writeFileSync(path.join(t.staging, 'general.wav'), 'new staged audio');
  return t;
}
function manifest(filename) {
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      version: 2,
      selectedRecipeId: 'general',
      results: { general: { artifactFilename: filename } },
    }),
  );
}

describe('controlled separation crash recovery', () => {
  it('removes only owned uncommitted artifacts, retaining all old bytes', () => {
    fs.writeFileSync(path.join(dir, 'general.wav'), 'old');
    manifest('general.wav');
    const before = fs.readFileSync(path.join(dir, 'manifest.json')),
      t = transaction('publishing');
    fs.writeFileSync(path.join(dir, t.filename('flac5')), 'uncommitted');
    const result = recoverSeparationOutputArtifacts(dir, {
      isProcessAlive: dead,
    });
    expect(result.removed).toEqual([t.id]);
    expect(fs.readFileSync(path.join(dir, 'general.wav'), 'utf8')).toBe('old');
    expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(before);
    expect(fs.existsSync(t.staging)).toBe(false);
    expect(fs.existsSync(path.join(dir, t.filename('flac5')))).toBe(false);
  });
  it('keeps a committed result even if killed before the published receipt update', () => {
    const t = transaction('publishing'),
      name = t.filename('flac5');
    fs.writeFileSync(path.join(dir, name), 'committed');
    manifest(name);
    recoverSeparationOutputArtifacts(dir, { isProcessAlive: dead });
    expect(fs.readFileSync(path.join(dir, name), 'utf8')).toBe('committed');
    expect(fs.existsSync(t.staging)).toBe(false);
  });
  it('preserves manifest references with Windows casing differences', () => {
    const t = transaction('publishing'),
      name = t.filename('flac5');
    fs.writeFileSync(path.join(dir, name), 'committed');
    manifest(name.toUpperCase());
    recoverSeparationOutputArtifacts(dir, { isProcessAlive: dead });
    expect(fs.readFileSync(path.join(dir, name), 'utf8')).toBe('committed');
  });
  it('keeps a positively published result even when its manifest is subsequently absent', () => {
    const t = transaction('published'),
      name = t.filename('wav');
    fs.writeFileSync(path.join(dir, name), 'published');
    recoverSeparationOutputArtifacts(dir, { isProcessAlive: dead });
    expect(fs.existsSync(path.join(dir, name))).toBe(true);
  });
  it.each(['owner', 'child', 'unknown', 'spawn'])(
    'defers unsafe liveness or %s state',
    (kind) => {
      const t = transaction(kind === 'spawn' ? 'spawning-encode' : 'encoding');
      t.update(kind === 'spawn' ? 'spawning-encode' : 'encoding', 12345);
      const isProcessAlive = (pid) =>
        kind === 'unknown'
          ? null
          : kind === 'owner'
            ? pid === process.pid
            : kind === 'child'
              ? pid === 12345
              : false;
      const result = recoverSeparationOutputArtifacts(dir, { isProcessAlive });
      expect(result.deferred).toHaveLength(1);
      expect(fs.existsSync(t.staging)).toBe(true);
    },
  );
  it.each([
    'unknown-file',
    'bad-journal',
    'bad-manifest',
    'candidate-directory',
  ])('preserves %s without changing old data', (kind) => {
    const t = transaction('publishing');
    if (kind === 'unknown-file')
      fs.writeFileSync(path.join(t.staging, 'keep-me.txt'), 'user data');
    if (kind === 'bad-journal')
      fs.writeFileSync(path.join(t.staging, 'transaction.json'), '{bad');
    if (kind === 'bad-manifest')
      fs.writeFileSync(path.join(dir, 'manifest.json'), '{bad');
    if (kind === 'candidate-directory')
      fs.mkdirSync(path.join(dir, t.filename('wav')));
    const result = recoverSeparationOutputArtifacts(dir, {
      isProcessAlive: dead,
    });
    expect(result.deferred).toHaveLength(1);
    expect(fs.existsSync(t.staging)).toBe(true);
  });
  it('ignores legacy unmarked staging and unrelated audio', () => {
    const old = path.join(dir, '.separation-old');
    fs.mkdirSync(old);
    fs.writeFileSync(path.join(old, 'general.wav'), 'keep');
    fs.writeFileSync(path.join(dir, 'general-unrelated.flac'), 'keep');
    expect(
      recoverSeparationOutputArtifacts(dir, { isProcessAlive: dead }).removed,
    ).toEqual([]);
    expect(fs.readFileSync(path.join(old, 'general.wav'), 'utf8')).toBe('keep');
  });
  it('refuses a linked directory inside a recognized transaction', () => {
    const t = transaction(),
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-keep-'));
    try {
      fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
      fs.symlinkSync(outside, path.join(t.staging, 'linked'), 'junction');
      expect(
        recoverSeparationOutputArtifacts(dir, { isProcessAlive: dead })
          .deferred,
      ).toHaveLength(1);
      expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe(
        'keep',
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

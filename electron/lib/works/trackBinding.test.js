import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  bindingsEqual,
  validateTrackBinding,
  hashAudioFile,
} from './trackBinding.js';

afterEach(() => vi.restoreAllMocks());
describe('private original audio bindings', () => {
  it('rejects a replacement discovered after hashing without returning its digest', async () => {
    const original = {
      size: 2,
      mtimeMs: 1,
      ctimeMs: 1,
      ino: 1,
      dev: 1,
      isFile: () => true,
    };
    let read = false;
    const handle = {
      stat: vi.fn(async () => original),
      close: vi.fn(async () => {}),
      read: vi.fn(async (buffer) => {
        if (read) return { bytesRead: 0 };
        read = true;
        buffer.write('ab');
        return { bytesRead: 2 };
      }),
    };
    vi.spyOn(fs.promises, 'open').mockResolvedValue(handle);
    vi.spyOn(fs.promises, 'stat').mockResolvedValue({ ...original, ino: 2 });
    await expect(hashAudioFile('main-resolved-path')).rejects.toMatchObject({
      code: 'WORKS_STALE',
    });
    expect(handle.close).toHaveBeenCalledOnce();
  });
  it('requires exact bounded SHA256 objects and compares without guessing works', () => {
    const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
    expect(validateTrackBinding(binding)).toEqual(binding);
    expect(bindingsEqual(binding, { ...binding })).toBe(true);
    for (const value of [
      null,
      {},
      { ...binding, value: 'A'.repeat(64) },
      { ...binding, path: 'secret' },
      { ...binding, value: 'b'.repeat(64) },
    ])
      expect(bindingsEqual(binding, value)).toBe(false);
    expect(() => validateTrackBinding(null)).toThrow();
  });
  it('hashes original bytes asynchronously and enforces size bounds', async () => {
    fs.mkdirSync('.tmp', { recursive: true });
    const dir = fs.mkdtempSync(path.resolve('.tmp/binding-test-'));
    const file = path.join(dir, 'audio.bin');
    try {
      fs.writeFileSync(file, '音樂🎵');
      expect(await hashAudioFile(file)).toEqual({
        kind: 'audio-content-sha256',
        value: crypto.createHash('sha256').update('音樂🎵').digest('hex'),
      });
      await expect(hashAudioFile(file, { maxBytes: 2 })).rejects.toThrow();
      await expect(hashAudioFile(file, { maxBytes: -1 })).rejects.toThrow();
      await expect(hashAudioFile(path.join(dir, 'missing'))).rejects.toThrow();
      fs.writeFileSync(file, '');
      await expect(hashAudioFile(file)).rejects.toThrow();
      expect(await hashAudioFile(file, { allowEmpty: true })).toEqual({
        kind: 'audio-content-sha256',
        value: crypto.createHash('sha256').update('').digest('hex'),
      });
      await expect(
        hashAudioFile(file, { allowEmpty: 'yes' }),
      ).rejects.toMatchObject({ code: 'WORKS_INVALID' });
      await expect(hashAudioFile(dir)).rejects.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function countReads() {
    const open = fs.promises.open.bind(fs.promises);
    const reads = { count: 0 };
    vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args);
      const read = handle.read.bind(handle);
      handle.read = (...readArgs) => {
        reads.count += 1;
        return read(...readArgs);
      };
      return handle;
    });
    return reads;
  }

  it('reuses the digest of an unchanged file and rehashes after a change', async () => {
    fs.mkdirSync('.tmp', { recursive: true });
    const dir = fs.mkdtempSync(path.resolve('.tmp/binding-cache-'));
    const file = path.join(dir, 'audio.bin');
    try {
      fs.writeFileSync(file, 'first');
      const reads = countReads();
      const first = await hashAudioFile(file);
      const afterFirst = reads.count;
      expect(await hashAudioFile(file)).toEqual(first);
      expect(reads.count).toBe(afterFirst);

      const check = vi.fn(() => {
        throw Object.assign(new Error('stale scope'), { code: 'STALE' });
      });
      await expect(hashAudioFile(file, { check })).rejects.toMatchObject({
        code: 'STALE',
      });

      fs.writeFileSync(file, 'second!');
      expect((await hashAudioFile(file)).value).toBe(
        crypto.createHash('sha256').update('second!').digest('hex'),
      );
      expect(reads.count).toBeGreaterThan(afterFirst);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('shares one read between concurrent callers and survives a failed share', async () => {
    fs.mkdirSync('.tmp', { recursive: true });
    const dir = fs.mkdtempSync(path.resolve('.tmp/binding-shared-'));
    const file = path.join(dir, 'audio.bin');
    try {
      fs.writeFileSync(file, 'shared');
      const reads = countReads();
      const [left, right] = await Promise.all([
        hashAudioFile(file),
        hashAudioFile(file),
      ]);
      expect(left).toEqual(right);
      // One data read plus the end-of-file read.
      expect(reads.count).toBe(2);

      fs.writeFileSync(file, 'shared again');
      const stale = () => {
        throw Object.assign(new Error('stale scope'), { code: 'STALE' });
      };
      const [failed, recovered] = await Promise.allSettled([
        hashAudioFile(file, { check: stale }),
        hashAudioFile(file),
      ]);
      expect(failed.reason).toMatchObject({ code: 'STALE' });
      expect(recovered.value.value).toBe(
        crypto.createHash('sha256').update('shared again').digest('hex'),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

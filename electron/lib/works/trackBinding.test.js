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
});

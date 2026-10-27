import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { originalMedia, createMediaVerifier } from './media.js';
import { hashAudioFile } from '../works/trackBinding.js';
let dir;
function track(id) {
  const directory = path.join(dir, 'tracks', id);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'audio.wav');
  fs.writeFileSync(file, 'original');
  return file;
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'performance-media-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
it('verifies canonical originals and invalidates its bounded stamp memo', async () => {
  const file = track('one'),
    hash = vi.fn(hashAudioFile),
    verifier = createMediaVerifier(hash);
  const check = vi.fn();
  const context = { dir, epoch: 0 };
  const first = await verifier.verify(context, 'one', check);
  expect(first.file).toBe(file);
  await verifier.verify(context, 'one', check);
  expect(hash).toHaveBeenCalledOnce();
  fs.writeFileSync(file, 'replacement');
  const next = await verifier.verify(context, 'one', check);
  expect(next.binding).not.toEqual(first.binding);
  verifier.clear();
  await verifier.verify(context, 'one', check);
  expect(hash).toHaveBeenCalledTimes(3);
});
it('rejects a file changing during the asynchronous verifier', async () => {
  const file = track('one');
  const verifier = createMediaVerifier(async () => {
    fs.writeFileSync(file, 'replacement');
    return {};
  });
  await expect(
    verifier.verify({ dir, epoch: 0 }, 'one', () => {}),
  ).rejects.toMatchObject({ code: 'PERFORMANCE_SOURCE_STALE' });
});
it('distinguishes missing media from an inaccessible library', () => {
  expect(() => originalMedia(dir, 'missing')).toThrow();
  const directory = path.dirname(track('one'));
  fs.unlinkSync(path.join(directory, 'audio.wav'));
  expect(() => originalMedia(dir, 'one')).toThrow();
  const error = Object.assign(new Error('offline library'), { code: 'EACCES' });
  vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
    throw error;
  });
  expect(() => originalMedia(dir, 'one')).toThrow('offline library');
});
it('does not traverse redirected track directories', () => {
  track('one');
  vi.spyOn(fs, 'realpathSync').mockReturnValue('C:/outside');
  expect(() => originalMedia(dir, 'one')).toThrow();
});

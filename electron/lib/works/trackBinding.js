'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

function validateTrackBinding(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).length !== 2 ||
    value.kind !== 'audio-content-sha256' ||
    typeof value.value !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.value)
  )
    throw Object.assign(new Error('Invalid audio binding'), {
      code: 'WORKS_INVALID',
    });
  return { kind: value.kind, value: value.value };
}

function bindingsEqual(left, right) {
  try {
    return (
      validateTrackBinding(left).value === validateTrackBinding(right).value
    );
  } catch {
    return false;
  }
}

function staleAudio() {
  return Object.assign(new Error('Audio changed during hashing'), {
    code: 'WORKS_STALE',
  });
}

function sameStamp(stamp, initial) {
  return (
    stamp.size === initial.size &&
    stamp.mtimeMs === initial.mtimeMs &&
    stamp.ctimeMs === initial.ctimeMs &&
    stamp.ino === initial.ino &&
    stamp.dev === initial.dev
  );
}

// Unchanged files reuse their digest; file systems without file ids are never cached.
// Above the 1,000-track style batch so preview and apply reuse the import pass.
const DIGEST_CACHE_LIMIT = 2048;
const digestCache = new Map();
const pendingDigests = new Map();

function stampKey(stamp) {
  if (!stamp.ino) return null;
  return [stamp.dev, stamp.ino, stamp.size, stamp.mtimeMs, stamp.ctimeMs].join(
    ':',
  );
}

function rememberDigest(key, value) {
  digestCache.delete(key);
  digestCache.set(key, value);
  if (digestCache.size > DIGEST_CACHE_LIMIT)
    digestCache.delete(digestCache.keys().next().value);
}

async function readDigest(handle, initial, maxBytes, check) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.alloc(Math.min(initial.size, 1024 * 1024));
  let total = 0;
  while (true) {
    check();
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
    if (!bytesRead) break;
    total += bytesRead;
    if (total > maxBytes || total > initial.size) throw staleAudio();
    hash.update(buffer.subarray(0, bytesRead));
  }
  if (total !== initial.size) throw staleAudio();
  return hash.digest('hex');
}

// Concurrent callers share one read; a failed shared read falls back to the caller's own.
async function digestFor(handle, initial, maxBytes, check) {
  const key = stampKey(initial);
  if (key === null) return readDigest(handle, initial, maxBytes, check);
  const cached = digestCache.get(key);
  if (cached) {
    rememberDigest(key, cached);
    return cached;
  }
  const pending = pendingDigests.get(key);
  if (pending) {
    const shared = await pending.catch(() => null);
    if (shared) return shared;
  }
  const own = readDigest(handle, initial, maxBytes, check);
  if (!pending) pendingDigests.set(key, own);
  try {
    return await own;
  } finally {
    if (pendingDigests.get(key) === own) pendingDigests.delete(key);
  }
}

// Main supplies the resolved original media path. Never expose this helper over IPC.
// Fixed-size reads keep memory bounded even for large local files.
async function hashAudioFile(
  filePath,
  { maxBytes = 4 * 1024 ** 3, allowEmpty = false, check = () => {} } = {},
) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > 4 * 1024 ** 3 ||
    typeof allowEmpty !== 'boolean' ||
    typeof check !== 'function'
  ) {
    throw Object.assign(new Error('Invalid audio size limit'), {
      code: 'WORKS_INVALID',
    });
  }
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const initial = await handle.stat();
    if (
      !initial.isFile() ||
      initial.size < 0 ||
      (!allowEmpty && initial.size === 0) ||
      initial.size > maxBytes
    ) {
      throw Object.assign(new Error('Audio size outside binding limits'), {
        code: 'WORKS_INVALID',
      });
    }
    const value = await digestFor(handle, initial, maxBytes, check);
    check();
    const final = await handle.stat();
    const current = await fs.promises.stat(filePath);
    if (![final, current].every((stamp) => sameStamp(stamp, initial)))
      throw staleAudio();
    const key = stampKey(initial);
    if (key !== null) rememberDigest(key, value);
    return { kind: 'audio-content-sha256', value };
  } finally {
    await handle.close();
  }
}

module.exports = { validateTrackBinding, bindingsEqual, hashAudioFile };

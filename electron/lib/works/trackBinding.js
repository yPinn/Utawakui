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
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(Math.min(initial.size, 1024 * 1024));
    let total = 0;
    while (true) {
      check();
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > maxBytes || total > initial.size) {
        throw Object.assign(new Error('Audio changed during hashing'), {
          code: 'WORKS_STALE',
        });
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
    check();
    const final = await handle.stat();
    const current = await fs.promises.stat(filePath);
    if (
      total !== initial.size ||
      [final, current].some(
        (stamp) =>
          stamp.size !== initial.size ||
          stamp.mtimeMs !== initial.mtimeMs ||
          stamp.ctimeMs !== initial.ctimeMs ||
          stamp.ino !== initial.ino ||
          stamp.dev !== initial.dev,
      )
    ) {
      throw Object.assign(new Error('Audio changed during hashing'), {
        code: 'WORKS_STALE',
      });
    }
    return { kind: 'audio-content-sha256', value: hash.digest('hex') };
  } finally {
    await handle.close();
  }
}

module.exports = { validateTrackBinding, bindingsEqual, hashAudioFile };

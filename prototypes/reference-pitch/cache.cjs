/* global require, module, Buffer */
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { atomicWriteJson } = require('../../electron/lib/atomicWrite');

const STEP = 0.016;
const MAX_SECONDS = 720;
const MAX_BYTES = 245_000;
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

async function hashMedia(file, signal) {
  if (!file) return null;
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file, { signal })) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function buildCacheKey(input, algorithmHash, decoderStamp, signal) {
  return sha256(
    JSON.stringify([
      algorithmHash,
      decoderStamp,
      input.rejectBacking,
      await hashMedia(input.source, signal),
      await hashMedia(input.original, signal),
    ]),
  );
}

function readPitchCache(file, key) {
  if (!file || !key) return null;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return null;
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { durationSeconds, packed } = record;
    if (
      record.key !== key ||
      typeof packed !== 'string' ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < STEP ||
      durationSeconds > MAX_SECONDS
    )
      return null;
    const bytes = Buffer.from(packed, 'base64');
    const count = Math.floor(Math.round(durationSeconds * 16000) / 256);
    if (bytes.length !== count * 4 || sha256(bytes) !== record.pitchHash)
      return null;
    const pitches = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const pitch = bytes.readFloatLE(i * 4);
      if (!Number.isFinite(pitch) || pitch < 0 || pitch > 2100) return null;
      pitches[i] = pitch;
    }
    return { status: 'ready', durationSeconds, stepSeconds: STEP, pitches };
  } catch {
    return null;
  }
}

function writePitchCache(file, key, result) {
  if (!file || !key) return;
  try {
    if (
      fs.lstatSync(`${file}.tmp`, { throwIfNoEntry: false })?.isSymbolicLink()
    )
      return;
    const bytes = Buffer.alloc(result.pitches.length * 4);
    for (let i = 0; i < result.pitches.length; i++)
      bytes.writeFloatLE(result.pitches[i], i * 4);
    atomicWriteJson(file, {
      key,
      durationSeconds: result.durationSeconds,
      pitchHash: sha256(bytes),
      packed: bytes.toString('base64'),
    });
  } catch {
    // Derived data. The finished analysis is usable even if the cache is read-only.
  }
}

module.exports = { buildCacheKey, readPitchCache, sha256, writePitchCache };

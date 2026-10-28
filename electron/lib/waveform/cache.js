'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateSummary } = require('./summary');
const HEX = /^[a-f0-9]{64}$/;
const OWNED = /^[a-f0-9]{64}-[a-f0-9]{64}\.json$/;
const FILE_BYTES = 96 * 1024;

function createWaveformCache(
  root,
  { maxBytes = 64 * 1024 ** 2, maxEntries = 512 } = {},
) {
  root = path.resolve(root);
  let tail = Promise.resolve();
  async function namesInRoot() {
    const names = [];
    const directory = await fs.opendir(root);
    for await (const entry of directory) {
      if (names.length >= 2048) throw Error('CACHE_UNAVAILABLE');
      names.push(entry.name);
    }
    return names;
  }
  const use = (action) => {
    const result = tail.then(async () => {
      await fs.mkdir(root, { recursive: true });
      if (path.relative(root, await fs.realpath(root)) !== '')
        throw Error('CACHE_UNAVAILABLE');
      const names = await namesInRoot();
      for (const name of names) {
        if (/^[a-f0-9-]{36}\.tmp$/.test(name))
          await fs.unlink(path.join(root, name));
      }
      return action();
    });
    tail = result.catch(() => {});
    return result;
  };
  const filename = (group, key) => {
    if (!HEX.test(group) || !HEX.test(key)) throw Error('INVALID_INTENT');
    return path.join(root, `${group}-${key}.json`);
  };
  async function inventory() {
    const names = await namesInRoot();
    const entries = [];
    for (const name of names.filter((name) => OWNED.test(name))) {
      const file = path.join(root, name);
      const stat = await fs.lstat(file);
      entries.push({ file, stat });
    }
    return entries.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  }
  return {
    get: (group, key) =>
      use(async () => {
        const file = filename(group, key);
        let handle;
        try {
          const before = await fs.lstat(file);
          if (
            !before.isFile() ||
            before.nlink !== 1 ||
            before.size > FILE_BYTES
          )
            return null;
          handle = await fs.open(file, 'r');
          const current = await handle.stat();
          if (
            current.ino !== before.ino ||
            current.dev !== before.dev ||
            current.size !== before.size
          )
            return null;
          const buffer = Buffer.alloc(before.size);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          if (bytesRead !== buffer.length) return null;
          const stored = JSON.parse(buffer.toString('utf8'));
          if (
            stored.version !== 1 ||
            stored.group !== group ||
            stored.key !== key
          )
            return null;
          const decode = (value) => {
            if (typeof value !== 'string' || value.length > 44000)
              throw Error('PAYLOAD');
            const bytes = Buffer.from(value, 'base64');
            if (bytes.length % 4) throw Error('PAYLOAD');
            return new Float32Array(
              bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.length,
              ),
            );
          };
          const value = {
            ...stored.value,
            peaks: {
              ...stored.value.peaks,
              min: decode(stored.value.peaks.min),
              max: decode(stored.value.peaks.max),
            },
          };
          validateSummary(value);
          await fs.utimes(file, new Date(), new Date());
          return value;
        } catch (error) {
          if (
            ['ENOENT', 'PAYLOAD'].includes(error.code ?? error.message) ||
            error instanceof SyntaxError ||
            error instanceof TypeError
          )
            return null;
          throw error;
        } finally {
          await handle?.close();
        }
      }),
    put: (group, key, value, check) =>
      use(async () => {
        validateSummary(value);
        const file = filename(group, key);
        const encode = (array) =>
          Buffer.from(
            array.buffer,
            array.byteOffset,
            array.byteLength,
          ).toString('base64');
        const bytes = Buffer.from(
          JSON.stringify({
            version: 1,
            group,
            key,
            value: {
              ...value,
              peaks: {
                ...value.peaks,
                min: encode(value.peaks.min),
                max: encode(value.peaks.max),
              },
            },
          }),
        );
        if (bytes.length > FILE_BYTES || bytes.length > maxBytes)
          throw Error('PAYLOAD');
        check();
        const entries = await inventory();
        let total = entries.reduce((sum, entry) => sum + entry.stat.size, 0),
          count = entries.length;
        for (const entry of entries) {
          if (
            count < maxEntries &&
            total + bytes.length <= maxBytes &&
            entry.file !== file
          )
            continue;
          check();
          await fs.unlink(entry.file);
          total -= entry.stat.size;
          count--;
        }
        const temp = path.join(root, `${crypto.randomUUID()}.tmp`);
        try {
          await fs.writeFile(temp, bytes, { flag: 'wx' });
          if (path.relative(root, await fs.realpath(root)) !== '')
            throw Error('CACHE_UNAVAILABLE');
          check();
          await fs.rename(temp, file);
          try {
            check();
          } catch (error) {
            await fs.unlink(file);
            throw error;
          }
        } finally {
          await fs.unlink(temp).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
      }),
    clear: (group) =>
      use(async () => {
        if (!HEX.test(group)) throw Error('INVALID_INTENT');
        for (const entry of await inventory())
          if (path.basename(entry.file).startsWith(`${group}-`))
            await fs.unlink(entry.file);
      }),
  };
}
module.exports = { createWaveformCache };

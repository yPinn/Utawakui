'use strict';
const { createProviderRequestGuard } = require('../providerServiceCooldown');
const fs = require('node:fs'),
  crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
async function downloadPinned(
  artifact,
  destination,
  { signal, fetchImpl = fetch } = {},
) {
  signal?.throwIfAborted();
  const url = new URL(artifact.url);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !Number.isSafeInteger(artifact.sizeBytes) ||
    artifact.sizeBytes <= 0 ||
    artifact.sizeBytes > 512 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    fs.existsSync(destination)
  )
    throw Error('new pinned download destination required');
  const temporary = `${destination}.${crypto.randomUUID()}.partial`;
  const options = {
    signal: AbortSignal.any([
      AbortSignal.timeout(15 * 60000),
      ...(signal ? [signal] : []),
    ]),
  };
  let owned = false;
  try {
    const response = await createProviderRequestGuard(fetchImpl).fetch(
      url.href,
      options,
    );
    if (!response.ok || !response.body) {
      await response.body?.cancel?.().catch(() => undefined);
      throw Error('research download failed');
    }
    const digest = crypto.createHash('sha256');
    let bytes = 0;
    const output = fs.createWriteStream(temporary, { flags: 'wx' });
    owned = true;
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, next) {
          bytes += chunk.length;
          if (bytes > artifact.sizeBytes) {
            next(Error('research download size exceeded'));
            return;
          }
          digest.update(chunk);
          next(null, chunk);
        },
      }),
      output,
      options,
    );
    signal?.throwIfAborted();
    if (
      bytes !== artifact.sizeBytes ||
      digest.digest('hex') !== artifact.sha256
    )
      throw Error('research download integrity failed');
    if (fs.existsSync(destination))
      throw Error('research destination appeared');
    fs.renameSync(temporary, destination);
    owned = false;
  } finally {
    if (owned) fs.rmSync(temporary, { force: true });
  }
}

module.exports = { downloadPinned };

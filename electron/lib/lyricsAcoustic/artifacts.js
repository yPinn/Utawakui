'use strict';
const fs = require('node:fs');
const { createProviderRequestGuard } = require('../providerServiceCooldown');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  validateZipArchiveBuffer,
  expandZipArchive,
} = require('../featureDependencies/archive');
const {
  contained,
  sha,
  verifyFileTable,
  fingerprintTree,
} = require('./integrity');
async function downloadArtifact(artifact, { signal, fetchImpl = fetch } = {}) {
  signal?.throwIfAborted();
  const url = new URL(artifact?.url);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !Number.isSafeInteger(artifact.sizeBytes) ||
    artifact.sizeBytes <= 0 ||
    artifact.sizeBytes > 512 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  )
    throw Error('invalid lyrics environment artifact');
  const response = await createProviderRequestGuard(fetchImpl).fetch(url.href, {
    signal: AbortSignal.any([
      AbortSignal.timeout(5 * 60000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel?.().catch(() => undefined);
    throw Error('lyrics environment download failed');
  }
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      signal?.throwIfAborted();
      total += chunk.length;
      if (total > artifact.sizeBytes)
        throw Error('lyrics environment download size exceeded');
      chunks.push(chunk);
    }
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  }
  signal?.throwIfAborted();
  const bytes = Buffer.concat(chunks);
  if (total !== artifact.sizeBytes || sha(bytes) !== artifact.sha256)
    throw Error('lyrics environment download integrity failed');
  return bytes;
}
async function extractArtifact(
  bytes,
  destination,
  artifact,
  { signal, spawnImpl = spawn } = {},
) {
  signal?.throwIfAborted();
  validateZipArchiveBuffer(bytes, destination, artifact);
  fs.mkdirSync(destination, { recursive: true });
  const archive = path.join(
    path.dirname(destination),
    `archive-${require('node:crypto').randomUUID()}.zip`,
  );
  fs.writeFileSync(archive, bytes);
  let child, closed, closePromise;
  const abort = () => child?.kill();
  try {
    await expandZipArchive(archive, destination, artifact, {
      spawnImpl(exe, args) {
        signal?.throwIfAborted();
        child = spawnImpl(exe, args, { windowsHide: true, shell: false });
        closePromise = new Promise((resolve) =>
          child.once('close', () => {
            closed = true;
            resolve();
          }),
        );
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        return child;
      },
    });
    signal?.throwIfAborted();
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    if (child && !closed) {
      child.kill();
      await closePromise;
    }
    fs.rmSync(archive, { force: true });
  }
}
async function prepareLyricsArtifacts({
  staging,
  installed,
  catalog,
  signal,
  download = downloadArtifact,
  extract = extractArtifact,
  onProgress = () => {},
}) {
  const options = { signal };
  async function materializeFiles(name, definition) {
    signal.throwIfAborted();
    if (installed[name]) {
      try {
        await verifyFileTable(installed[name], definition.files, signal);
        fs.mkdirSync(staging[name], { recursive: true });
        for (const file of Object.keys(definition.files)) {
          const to = contained(
            staging[name],
            path.resolve(staging[name], file),
          );
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.copyFileSync(
            contained(installed[name], path.resolve(installed[name], file)),
            to,
          );
        }
        return;
      } catch (error) {
        signal.throwIfAborted();
        if (!definition.artifact) throw error;
      }
    }
    if (!definition.artifact)
      throw Error('lyrics environment download is unavailable');
    const extracted = path.join(path.dirname(staging[name]), `unpack-${name}`);
    await extract(
      await download(definition.artifact, options),
      extracted,
      definition.artifact,
      options,
    );
    const source = definition.archivePrefix
      ? contained(extracted, path.resolve(extracted, definition.archivePrefix))
      : extracted;
    await verifyFileTable(source, definition.files, signal);
    fs.mkdirSync(staging[name], { recursive: true });
    for (const file of Object.keys(definition.files)) {
      const to = contained(staging[name], path.resolve(staging[name], file));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(contained(source, path.resolve(source, file)), to);
    }
    fs.rmSync(extracted, { recursive: true, force: true });
  }
  onProgress('runtime');
  await materializeFiles('runtime', catalog.runtime);
  onProgress('environment');
  fs.mkdirSync(staging.environment, { recursive: true });
  let environmentReused = false;
  if (installed.environment) {
    try {
      if (
        (await fingerprintTree(installed.environment, signal)) ===
        catalog.environment.fingerprint
      ) {
        fs.cpSync(installed.environment, staging.environment, {
          recursive: true,
        });
        environmentReused = true;
      }
    } catch {
      signal.throwIfAborted();
    }
  }
  if (!environmentReused)
    for (const entry of catalog.environment.packages)
      await extract(
        await download(entry.artifact, options),
        staging.environment,
        entry.artifact,
        options,
      );
  signal.throwIfAborted();
  onProgress('model');
  await materializeFiles('model', catalog.model);
}
module.exports = { downloadArtifact, extractArtifact, prepareLyricsArtifacts };

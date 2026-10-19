'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pinned = require('./manifest.json');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function fileHash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

async function treeFingerprint(directory) {
  const rows = [];
  async function walk(dir, depth) {
    if (depth > 32 || rows.length > 10000)
      throw new Error('research environment budget');
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (entry.name === '__pycache__') continue;
      if (entry.name.endsWith('.pyc'))
        throw new Error('research environment sourceless bytecode');
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('research environment link');
      if (entry.isDirectory()) await walk(file, depth + 1);
      else if (entry.isFile())
        rows.push([
          path.relative(directory, file).split(path.sep).join('/'),
          await fileHash(file),
        ]);
    }
  }
  await walk(directory, 0);
  return sha(JSON.stringify(rows));
}

async function verifyFiles(root, entries) {
  for (const [name, entry] of Object.entries(entries)) {
    const file = path.resolve(root, name);
    const relative = path.relative(root, file);
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !fs.lstatSync(file).isFile()
    )
      throw new Error('research artifact path');
    const normalized = entry.normalizeLf
      ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
      : null;
    const bytes =
      normalized === null
        ? fs.statSync(file).size
        : Buffer.byteLength(normalized);
    const digest = normalized === null ? await fileHash(file) : sha(normalized);
    if (bytes !== entry.bytes || digest !== entry.sha256)
      throw new Error('research artifact integrity failed');
  }
}

async function verifyAssets(config, manifest = pinned) {
  for (const key of [
    'modelDir',
    'vendorDir',
    'environmentPath',
    'pythonPath',
    'ffmpegPath',
  ]) {
    if (!path.isAbsolute(config?.[key] ?? ''))
      throw new Error('research paths must be absolute');
  }
  if (
    path.basename(config.pythonPath) !== 'python.exe' ||
    !Object.hasOwn(manifest.runtime, 'python.exe')
  )
    throw new Error('research Python executable mismatch');
  await verifyFiles(config.modelDir, manifest.model);
  await verifyFiles(config.vendorDir, manifest.vendor);
  function vendorClosure(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('research vendor link');
      if (entry.name === '__pycache__') continue; // Explicit source compilation ignores bytecode.
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) vendorClosure(file);
      else if (
        !Object.hasOwn(
          manifest.vendor,
          path.relative(config.vendorDir, file).split(path.sep).join('/'),
        )
      )
        throw new Error('research vendor unpinned file');
    }
  }
  vendorClosure(config.vendorDir);
  await verifyFiles(path.dirname(config.pythonPath), manifest.runtime);
  await verifyFiles(path.dirname(config.ffmpegPath), {
    [path.basename(config.ffmpegPath)]: manifest.ffmpeg,
  });
  const environmentFingerprint = await treeFingerprint(config.environmentPath);
  const code = Object.fromEntries(
    ['protocol.cjs', 'decoder.py', 'frontend.cjs', 'job.cjs'].map((name) => [
      name,
      sha(fs.readFileSync(path.join(__dirname, name))),
    ]),
  );
  const dependencies = Object.fromEntries(
    ['onnxruntime-node', 'kuromoji', 'wanakana'].map((name) => [
      name,
      require(`${name}/package.json`).version,
    ]),
  );
  if (
    manifest.nodeDependencies &&
    Object.entries(manifest.nodeDependencies).some(
      ([name, version]) => dependencies[name] !== version,
    )
  )
    throw new Error('research Node dependency mismatch');
  const environmentLockSha256 = sha(
    JSON.stringify({
      environment: manifest.environment,
      runtime: manifest.runtime,
      environmentFingerprint,
      dependencies,
    }),
  );
  const method = {
    kind: 'model',
    id: 'hubertfa-research',
    version: 'phase2-v1',
    modelManifestSha256: sha(
      JSON.stringify({
        model: manifest.model,
        vendor: manifest.vendor,
        recipe: manifest.recipe,
        frontend: code['frontend.cjs'],
        job: code['job.cjs'],
      }),
    ),
    environmentLockSha256,
    decoderVersion: `hfa-occurrence-${code['decoder.py'].slice(0, 16)}`,
    g2pVersion: `original-g2p-${code['protocol.cjs'].slice(0, 16)}`,
    chunkerVersion: `intl-text-${code['protocol.cjs'].slice(0, 16)}`,
    nodeVersion: process.versions.node,
    icuVersion: process.versions.icu,
  };
  return {
    config: { ...config },
    method,
    manifest,
    environmentFingerprint,
    async assertCurrent() {
      const current = await verifyAssets(config, manifest);
      if (JSON.stringify(current.method) !== JSON.stringify(method))
        throw new Error('research assets changed');
    },
  };
}

module.exports = { fileHash, treeFingerprint, verifyAssets };

'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
async function fileHash(file) {
  const hash = crypto.createHash('sha256');
  for await (const b of fs.createReadStream(file)) hash.update(b);
  return hash.digest('hex');
}
function stamp(file) {
  const s = fs.statSync(file, { bigint: true });
  return [s.size, s.mtimeNs, s.ctimeNs, s.ino].map(String).join(':');
}
async function snapshot(roots) {
  const result = [];
  async function walk(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw Error('candidate asset link');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        if (name === '__pycache__') continue;
        await walk(path.join(file, name));
      }
    } else if (stat.isFile()) {
      if (result.length > 50000) throw Error('candidate asset count');
      result.push({
        file,
        bytes: stat.size,
        sha256: await fileHash(file),
        stamp: stamp(file),
      });
    }
  }
  for (const root of roots) await walk(root);
  return result;
}
function assertSnapshot(rows) {
  for (const row of rows)
    if (stamp(row.file) !== row.stamp) throw Error('candidate asset changed');
}
function assertClosure(roots, rows) {
  const expected = new Set(rows.map((r) => path.resolve(r.file))),
    seen = new Set();
  function walk(file) {
    const s = fs.lstatSync(file);
    if (s.isSymbolicLink()) throw Error('candidate asset link');
    if (s.isDirectory())
      for (const name of fs.readdirSync(file).sort()) {
        if (name !== '__pycache__') walk(path.join(file, name));
      }
    else if (s.isFile()) {
      if (!expected.has(path.resolve(file)))
        throw Error('candidate unbound file');
      seen.add(path.resolve(file));
    }
  }
  roots.forEach(walk);
  if (seen.size !== expected.size) throw Error('candidate missing file');
  assertSnapshot(rows);
}
async function bindCandidate(kind, config, rows) {
  if (!['qwen', 'base', 'small'].includes(kind)) throw Error('candidate kind');
  for (const row of rows) {
    if ((await fileHash(row.file)) !== row.sha256)
      throw Error('candidate asset hash');
  }
  const roots = config.assetRoots ?? rows.map((r) => r.file);
  assertClosure(roots, rows);
  const project = path.resolve(__dirname, '../../..');
  const codeRoots = [
    path.join(project, 'shared'),
    path.join(project, 'electron/lib'),
    path.join(project, 'package-lock.json'),
    path.join(project, 'node_modules/wanakana'),
    path.join(__dirname, '../lyricsAcoustic/protocol.cjs'),
    path.join(__dirname, '../lyricsAcoustic/process.cjs'),
    path.join(__dirname, '../lyricsAcoustic/evaluate.cjs'),
    ...fs
      .readdirSync(__dirname)
      .filter((n) => /\.(?:cjs|py)$/.test(n) && !n.includes('_test'))
      .map((n) => path.join(__dirname, n)),
  ];
  const code = await snapshot(codeRoots);
  const stable = (entries) =>
    entries.map(({ file, bytes, sha256 }) => [
      path.relative(config.root, file).split(path.sep).join('/'),
      bytes,
      sha256,
    ]);
  const method = {
    kind: 'model',
    id: `${kind}-candidate-research`,
    version: 'paired-v1',
    modelManifestSha256: sha(
      JSON.stringify(
        stable(
          rows.filter((r) =>
            r.file.startsWith(config.modelDir ?? config.modelPath),
          ),
        ),
      ),
    ),
    environmentLockSha256: sha(
      JSON.stringify([stable(rows), stable(code), config]),
    ),
    decoderVersion: `candidate-${sha(JSON.stringify(stable(code))).slice(0, 16)}`,
    g2pVersion: 'upstream-v1',
    chunkerVersion: 'frozen-intl-v1',
    nodeVersion: process.versions.node,
    icuVersion: process.versions.icu,
  };
  return {
    kind,
    config,
    method,
    assertCurrent: async () => {
      assertClosure(roots, rows);
      assertClosure(codeRoots, code);
    },
  };
}
module.exports = { fileHash, sha, snapshot, assertSnapshot, bindCandidate };

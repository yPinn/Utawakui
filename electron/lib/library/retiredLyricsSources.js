'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteBuffer } = require('../atomicWrite.js');
function isRetiredLyricsSource(source) {
  return source?.kind === 'amll' || source?.provider?.name === 'amll';
}
function asLocalLyricsSource(source) {
  const local = { ...source, kind: 'manual' };
  delete local.provider;
  return local;
}
function migrateRetiredLyricsSources(trackDir, options = {}) {
  const lyricsDir = path.join(trackDir, 'lyrics');
  const file = path.join(lyricsDir, 'lyrics.json');
  let original;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) return false;
    original = fs.readFileSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const manifest = JSON.parse(original);
  if (
    !Array.isArray(manifest?.sources) ||
    manifest.sources.length > 1000 ||
    !manifest.sources.some(isRetiredLyricsSource)
  )
    return false;
  const artifacts = new Map();
  for (const source of manifest.sources.filter(isRetiredLyricsSource)) {
    const provider = source.provider;
    if (
      !Number.isSafeInteger(provider?.recordId) ||
      provider.recordId <= 0 ||
      provider.artifactFilename !== `amll-${provider.recordId}.json`
    )
      continue;
    const artifact = path.join(
      lyricsDir,
      'providers',
      provider.artifactFilename,
    );
    try {
      const stat = fs.lstatSync(artifact);
      if (stat.isFile() && stat.size <= 5 * 1024 * 1024)
        artifacts.set(artifact, fs.readFileSync(artifact));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  let backup;
  for (let index = 1; index <= 99; index++) {
    const folder = path.join(
      lyricsDir,
      'migrations',
      `retired-providers-v1${index === 1 ? '' : `-${index}`}`,
    );
    if (!fs.existsSync(folder)) {
      backup = folder;
      break;
    }
  }
  if (!backup) throw new Error('Retired lyrics migration backup limit reached');
  fs.mkdirSync(path.join(backup, 'providers'), { recursive: true });
  atomicWriteBuffer(path.join(backup, 'lyrics.json'), original);
  for (const [artifact, bytes] of artifacts)
    atomicWriteBuffer(
      path.join(backup, 'providers', path.basename(artifact)),
      bytes,
    );
  const next = {
    ...manifest,
    sources: manifest.sources.map((source) =>
      isRetiredLyricsSource(source) ? asLocalLyricsSource(source) : source,
    ),
  };
  try {
    (options.publish || atomicWriteBuffer)(
      file,
      Buffer.from(JSON.stringify(next, null, 2) + '\n'),
    );
    for (const artifact of artifacts.keys())
      fs.rmSync(artifact, { force: true });
  } catch (error) {
    for (const [artifact, bytes] of artifacts)
      atomicWriteBuffer(artifact, bytes);
    atomicWriteBuffer(file, original);
    throw error;
  }
  return true;
}
module.exports = {
  migrateRetiredLyricsSources,
  isRetiredLyricsSource,
  asLocalLyricsSource,
};

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  atomicWriteBuffer,
  atomicWriteText,
  atomicWriteJson,
} = require('../atomicWrite.js');
const {
  loadTrackLyricsManifest,
  saveTrackLyricsManifest,
  deleteLyricsSource,
} = require('../library/lyrics.js');
const { timingSidecarPath } = require('../library/lyricsTiming.js');
const { classifyKugouLrc } = require('./lrc.js');
const { fingerprintKugouRecord } = require('./record.js');
const PROFILE = 'kugou-native-lrc-v1';
function validId(id) {
  return Number.isSafeInteger(id) && id > 0;
}
function saveKugouRecord(trackDir, record, options = {}) {
  if (
    !validId(record?.id) ||
    typeof record.trackName !== 'string' ||
    !record.trackName.trim() ||
    typeof record.artistName !== 'string' ||
    !record.artistName.trim() ||
    classifyKugouLrc(record.lrcLyrics, record.duration).status !== 'ok'
  )
    throw new Error('invalid Kugou record');
  const manifest = loadTrackLyricsManifest(trackDir);
  const existing = manifest.sources.find(
    (source) =>
      source.provider?.name === 'kugou' &&
      source.provider.recordId === record.id,
  );
  const base = `kugou-${record.id}`;
  let filename = existing?.filename;
  for (let suffix = 1; !filename && suffix <= 99; suffix += 1) {
    const candidate = `${base}${suffix === 1 ? '' : `-${suffix}`}.lrc`;
    if (!fs.existsSync(path.join(trackDir, 'lyrics', candidate)))
      filename = candidate;
  }
  if (!filename) throw new Error('unable to allocate lyrics filename');
  const artifactFilename = `${base}.json`;
  const artifactPath = path.join(
    trackDir,
    'lyrics/providers',
    artifactFilename,
  );
  const sourcePath = path.join(trackDir, 'lyrics', filename);
  const timingPath = timingSidecarPath(trackDir, filename);
  const manifestPath = path.join(trackDir, 'lyrics/lyrics.json');
  const retrievedAt = new Date(options.retrievedAt ?? Date.now()).toISOString();
  const recordFingerprint = fingerprintKugouRecord(record);
  const capability = { level: 'T1', partial: false };
  const compatibility = { t0: true, t1: true, t2: false };
  const source = {
    filename,
    language: 'und',
    kind: 'kugou',
    label: record.artistName,
    provider: { name: 'kugou', recordId: record.id, artifactFilename },
  };
  const snapshots = new Map(
    [artifactPath, sourcePath, timingPath, manifestPath].map((file) => [
      file,
      fs.existsSync(file) ? fs.readFileSync(file) : null,
    ]),
  );
  try {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    atomicWriteJson(artifactPath, {
      schemaVersion: 1,
      provider: 'kugou',
      providerProfileId: PROFILE,
      providerRecordId: record.id,
      retrievedAt,
      recordFingerprint,
      capability,
      compatibility,
      record,
    });
    atomicWriteText(sourcePath, record.lrcLyrics);
    fs.rmSync(timingPath, { force: true });
    (options.publishManifest || saveTrackLyricsManifest)(trackDir, [
      ...manifest.sources.filter(
        (value) =>
          value.filename !== filename &&
          !(
            value.provider?.name === 'kugou' &&
            value.provider.recordId === record.id
          ),
      ),
      source,
    ]);
  } catch (error) {
    for (const [file, bytes] of snapshots) {
      if (bytes === null) fs.rmSync(file, { force: true });
      else atomicWriteBuffer(file, bytes);
    }
    throw error;
  }
  return {
    status: 'saved',
    source: {
      filename,
      language: source.language,
      kind: source.kind,
      label: source.label,
    },
    capability,
    compatibility,
    warnings: [],
    recordFingerprint,
    retrievedAt,
  };
}
function loadStoredKugouArtifactSummary(trackDir, provider) {
  if (
    provider?.name !== 'kugou' ||
    !validId(provider.recordId) ||
    provider.artifactFilename !== `kugou-${provider.recordId}.json`
  )
    return null;
  try {
    const file = path.join(
      trackDir,
      'lyrics/providers',
      provider.artifactFilename,
    );
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) return null;
    const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (
      artifact.schemaVersion !== 1 ||
      artifact.provider !== 'kugou' ||
      artifact.providerProfileId !== PROFILE ||
      artifact.providerRecordId !== provider.recordId ||
      artifact.record?.id !== provider.recordId ||
      fingerprintKugouRecord(artifact.record) !== artifact.recordFingerprint ||
      typeof artifact.retrievedAt !== 'string' ||
      !Number.isFinite(Date.parse(artifact.retrievedAt))
    )
      return null;
    return {
      recordFingerprint: artifact.recordFingerprint,
      retrievedAt: new Date(artifact.retrievedAt).toISOString(),
    };
  } catch {
    return null;
  }
}
function deleteStoredKugouSource(trackDir, filename) {
  const source = loadTrackLyricsManifest(trackDir).sources.find(
    (value) => value.filename === filename,
  );
  if (!deleteLyricsSource(trackDir, filename)) return false;
  const provider = source?.provider;
  if (
    provider?.name === 'kugou' &&
    validId(provider.recordId) &&
    provider.artifactFilename === `kugou-${provider.recordId}.json`
  )
    fs.rmSync(
      path.join(trackDir, 'lyrics/providers', provider.artifactFilename),
      { force: true },
    );
  return true;
}
module.exports = {
  saveKugouRecord,
  loadStoredKugouArtifactSummary,
  deleteStoredKugouSource,
};

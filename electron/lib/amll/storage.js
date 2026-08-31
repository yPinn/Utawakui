'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  atomicWriteBuffer,
  atomicWriteJson,
  atomicWriteText,
} = require('../atomicWrite.js');
const {
  deleteLyricsSource,
  loadTrackLyricsManifest,
  saveTrackLyricsManifest,
} = require('../library/lyrics.js');
const {
  loadTrackLyricsTiming,
  saveTrackLyricsTiming,
  timingSidecarPath,
} = require('../library/lyricsTiming.js');
const { fingerprintAmllRecord } = require('./candidate.js');
const { analyzeAmllTtml, buildAmllTimingDocument } = require('./ttml.js');

const PROVIDER_ARTIFACT_SCHEMA_VERSION = 1;
const MAX_PROVIDER_ARTIFACT_BYTES = 5 * 1024 * 1024;
const ARTIFACT_RE = /^amll-([1-9]\d*)\.json$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function artifactPath(trackDir, filename) {
  return path.join(trackDir, 'lyrics', 'providers', filename);
}

function snapshotFile(filePath) {
  try {
    return { exists: true, bytes: fs.readFileSync(filePath) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, bytes: null };
    throw error;
  }
}

function restoreFile(filePath, snapshot) {
  if (snapshot.exists) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    atomicWriteBuffer(filePath, snapshot.bytes);
  } else {
    fs.rmSync(filePath, { force: true });
  }
}

function retrievedAt(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error('invalid retrieval time');
  return date.toISOString();
}

function allocateFilename(trackDir, recordId) {
  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const filename =
      suffix === 1 ? `amll-${recordId}.lrc` : `amll-${recordId}-${suffix}.lrc`;
    if (!fs.existsSync(path.join(trackDir, 'lyrics', filename)))
      return filename;
  }
  return null;
}

function saveAmllRecord(trackDir, record, options = {}) {
  const analysis = analyzeAmllTtml(record?.ttml, { recordId: record?.id });
  if (
    !record ||
    !Number.isSafeInteger(record.id) ||
    record.id <= 0 ||
    typeof record.trackName !== 'string' ||
    typeof record.artistName !== 'string' ||
    analysis.status !== 'ok'
  ) {
    throw new Error('invalid amll record');
  }
  const recordFingerprint = fingerprintAmllRecord(record);
  const artifactFilename = `amll-${record.id}.json`;
  const providerArtifactPath = artifactPath(trackDir, artifactFilename);
  const timestamp = retrievedAt(options.retrievedAt);
  const sourceSha256 = sha256(analysis.sourceText);
  const artifact = {
    schemaVersion: PROVIDER_ARTIFACT_SCHEMA_VERSION,
    provider: 'amll',
    providerProfileId: 'amll-http-v1',
    providerRecordId: record.id,
    retrievedAt: timestamp,
    capability: analysis.capability,
    compatibility: analysis.compatibility,
    warnings: analysis.warnings,
    hashes: {
      record: recordFingerprint,
      ttml: sha256(record.ttml),
      compatibilitySource: sourceSha256,
    },
    record,
  };
  if (
    Buffer.byteLength(JSON.stringify(artifact), 'utf8') >
    MAX_PROVIDER_ARTIFACT_BYTES
  ) {
    throw new Error('amll artifact is too large');
  }
  const manifest = loadTrackLyricsManifest(trackDir);
  const existing = manifest.sources.find(
    (source) =>
      source.provider?.name === 'amll' &&
      source.provider.recordId === record.id,
  );
  const sourceFilename =
    existing?.filename || allocateFilename(trackDir, record.id);
  if (!sourceFilename) throw new Error('unable to allocate a lyrics filename');
  const sourcePath = path.join(trackDir, 'lyrics', sourceFilename);
  const timingPath = timingSidecarPath(trackDir, sourceFilename);
  const manifestPath = path.join(trackDir, 'lyrics', 'lyrics.json');
  const snapshots = new Map(
    [providerArtifactPath, sourcePath, timingPath, manifestPath].map(
      (filePath) => [filePath, snapshotFile(filePath)],
    ),
  );
  const timingDocument = analysis.compatibility.t2
    ? buildAmllTimingDocument(
        record.id,
        sourceFilename,
        sourceSha256,
        analysis.document,
      )
    : null;
  const source = {
    filename: sourceFilename,
    language: 'und',
    kind: 'amll',
    label: record.albumName || record.artistName || 'AMLL TTML',
    provider: {
      name: 'amll',
      recordId: record.id,
      artifactFilename,
    },
  };
  try {
    fs.mkdirSync(path.dirname(providerArtifactPath), { recursive: true });
    atomicWriteJson(providerArtifactPath, artifact);
    atomicWriteText(sourcePath, analysis.sourceText);
    if (timingDocument) {
      saveTrackLyricsTiming(
        trackDir,
        sourceFilename,
        sourceSha256,
        timingDocument,
      );
    } else {
      fs.rmSync(timingPath, { force: true });
    }
    const remaining = manifest.sources.filter(
      (candidate) =>
        candidate.filename !== sourceFilename &&
        !(
          candidate.provider?.name === 'amll' &&
          candidate.provider.recordId === record.id
        ),
    );
    (options.publishManifest || saveTrackLyricsManifest)(trackDir, [
      ...remaining,
      source,
    ]);
  } catch (error) {
    for (const [filePath, snapshot] of snapshots)
      restoreFile(filePath, snapshot);
    throw error;
  }
  return {
    status: 'saved',
    source: {
      filename: source.filename,
      language: source.language,
      kind: source.kind,
      label: source.label,
    },
    capability: analysis.capability,
    compatibility: analysis.compatibility,
    warnings: analysis.warnings,
    recordFingerprint,
    retrievedAt: timestamp,
    timing: loadTrackLyricsTiming(trackDir, sourceFilename),
  };
}

function loadStoredAmllArtifactSummary(trackDir, provider) {
  if (
    provider?.name !== 'amll' ||
    !Number.isSafeInteger(provider.recordId) ||
    provider.recordId <= 0 ||
    typeof provider.artifactFilename !== 'string' ||
    !ARTIFACT_RE.test(provider.artifactFilename)
  ) {
    return null;
  }
  try {
    const filePath = artifactPath(trackDir, provider.artifactFilename);
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_PROVIDER_ARTIFACT_BYTES) return null;
    const artifact = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (
      artifact?.schemaVersion !== PROVIDER_ARTIFACT_SCHEMA_VERSION ||
      artifact.provider !== 'amll' ||
      artifact.providerProfileId !== 'amll-http-v1' ||
      artifact.providerRecordId !== provider.recordId ||
      artifact.record?.id !== provider.recordId ||
      !SHA256_RE.test(artifact.hashes?.record) ||
      fingerprintAmllRecord(artifact.record) !== artifact.hashes.record ||
      !Number.isFinite(Date.parse(artifact.retrievedAt))
    ) {
      return null;
    }
    return {
      recordFingerprint: artifact.hashes.record,
      retrievedAt: new Date(artifact.retrievedAt).toISOString(),
    };
  } catch {
    return null;
  }
}

function deleteStoredAmllSource(trackDir, sourceFilename) {
  const source = loadTrackLyricsManifest(trackDir).sources.find(
    (candidate) => candidate.filename === sourceFilename,
  );
  const provider = source?.provider;
  if (!deleteLyricsSource(trackDir, sourceFilename)) return false;
  if (provider?.name === 'amll') {
    fs.rmSync(artifactPath(trackDir, provider.artifactFilename), {
      force: true,
    });
  }
  return true;
}

module.exports = {
  PROVIDER_ARTIFACT_SCHEMA_VERSION,
  deleteStoredAmllSource,
  loadStoredAmllArtifactSummary,
  saveAmllRecord,
};

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
  LYRICS_NORMALIZER_PROFILE_ID,
  LYRICS_TIMING_SCHEMA_VERSION,
  loadTrackLyricsTiming,
  saveTrackLyricsTiming,
  timingSidecarPath,
  validateLyricsTimingDocument,
} = require('../library/lyricsTiming.js');
const { fingerprintNeteaseRecord } = require('./candidate.js');
const { analyzeNeteaseLyrics } = require('./yrc.js');

const PROVIDER_ARTIFACT_SCHEMA_VERSION = 1;
const MAX_PROVIDER_ARTIFACT_BYTES = 5 * 1024 * 1024;
const NETEASE_ARTIFACT_RE = /^netease-([1-9]\d*)\.json$/u;
const SHA256_RE = /^[a-f0-9]{64}$/u;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function providerArtifactPath(trackDir, artifactFilename) {
  return path.join(trackDir, 'lyrics', 'providers', artifactFilename);
}

function normalizeRetrievedAt(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('invalid retrieval time');
  }
  return date.toISOString();
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

function findExistingSource(sources, recordId) {
  return sources.find(
    (source) =>
      source.provider?.name === 'netease' &&
      source.provider.recordId === recordId,
  );
}

function allocateSourceFilename(trackDir, recordId) {
  const base = `netease-${recordId}`;
  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const filename = suffix === 1 ? `${base}.lrc` : `${base}-${suffix}.lrc`;
    if (!fs.existsSync(path.join(trackDir, 'lyrics', filename))) {
      return filename;
    }
  }
  return null;
}

function buildTimingDocument(recordId, filename, sourceSha256, document) {
  return validateLyricsTimingDocument(
    {
      schemaVersion: LYRICS_TIMING_SCHEMA_VERSION,
      documentId: `netease:${recordId}`,
      normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
      source: { filename, sha256: sourceSha256 },
      granularity: 'T2',
      lines: document.lines.map((line, lineIndex) => ({
        lineId: `line:${lineIndex}`,
        text: line.text,
        startMs: line.startMs,
        endMs: line.endMs,
        segments: line.words.map((word, wordIndex) => ({
          segmentId: `line:${lineIndex}:word:${wordIndex}`,
          text: word.text,
          startMs: word.startMs,
          endMs: word.endMs,
        })),
      })),
    },
    {
      sourceFilename: filename,
      sourceSha256,
      normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
    },
  );
}

function saveNeteaseRecord(trackDir, record, options = {}) {
  const analysis = analyzeNeteaseLyrics(record);
  if (
    !record ||
    !Number.isSafeInteger(record.id) ||
    record.id <= 0 ||
    typeof record.trackName !== 'string' ||
    typeof record.artistName !== 'string' ||
    !Array.isArray(record.artists) ||
    analysis.status !== 'ok'
  ) {
    throw new Error('invalid netease record');
  }
  if (!analysis.compatibility.t0 || !analysis.sourceText.trim()) {
    return {
      status: 'preserved',
      source: null,
      capability: analysis.capability,
      compatibility: analysis.compatibility,
      warnings: analysis.warnings,
      recordFingerprint: fingerprintNeteaseRecord(record),
      retrievedAt: normalizeRetrievedAt(options.retrievedAt),
    };
  }

  const artifactFilename = `netease-${record.id}.json`;
  const artifactPath = providerArtifactPath(trackDir, artifactFilename);
  const retrievedAt = normalizeRetrievedAt(options.retrievedAt);
  const recordFingerprint = fingerprintNeteaseRecord(record);
  const artifact = {
    schemaVersion: PROVIDER_ARTIFACT_SCHEMA_VERSION,
    provider: 'netease',
    providerProfileId: 'netease-direct-http-v1',
    providerRecordId: record.id,
    retrievedAt,
    capability: analysis.capability,
    compatibility: analysis.compatibility,
    warnings: analysis.warnings,
    hashes: {
      record: recordFingerprint,
      yrcLyrics: sha256(record.yrcLyrics),
      lrcLyrics: sha256(record.lrcLyrics),
      compatibilitySource: sha256(analysis.sourceText),
    },
    record,
  };

  const manifest = loadTrackLyricsManifest(trackDir);
  const existing = findExistingSource(manifest.sources, record.id);
  const sourceFilename =
    existing?.filename || allocateSourceFilename(trackDir, record.id);
  if (!sourceFilename) throw new Error('unable to allocate a lyrics filename');

  const sourcePath = path.join(trackDir, 'lyrics', sourceFilename);
  const timingPath = timingSidecarPath(trackDir, sourceFilename);
  const manifestPath = path.join(trackDir, 'lyrics', 'lyrics.json');
  const snapshots = new Map(
    [artifactPath, sourcePath, timingPath, manifestPath].map((filePath) => [
      filePath,
      snapshotFile(filePath),
    ]),
  );
  const sourceSha256 = sha256(analysis.sourceText);
  const timingDocument = analysis.document
    ? buildTimingDocument(
        record.id,
        sourceFilename,
        sourceSha256,
        analysis.document,
      )
    : null;
  const source = {
    filename: sourceFilename,
    language: 'und',
    kind: 'netease',
    ...(record.albumName || record.artistName
      ? { label: record.albumName || record.artistName }
      : {}),
    provider: {
      name: 'netease',
      recordId: record.id,
      artifactFilename,
    },
  };

  try {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    atomicWriteJson(artifactPath, artifact);
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
          candidate.provider?.name === 'netease' &&
          candidate.provider.recordId === record.id
        ),
    );
    (options.publishManifest || saveTrackLyricsManifest)(trackDir, [
      ...remaining,
      source,
    ]);
  } catch (error) {
    for (const [filePath, snapshot] of snapshots) {
      restoreFile(filePath, snapshot);
    }
    throw error;
  }

  return {
    status: 'saved',
    source: {
      filename: source.filename,
      language: source.language,
      kind: source.kind,
      ...(source.label ? { label: source.label } : {}),
    },
    capability: analysis.capability,
    compatibility: analysis.compatibility,
    warnings: analysis.warnings,
    recordFingerprint,
    retrievedAt,
    timing: loadTrackLyricsTiming(trackDir, sourceFilename),
  };
}

function loadStoredNeteaseArtifactSummary(trackDir, provider) {
  if (
    !provider ||
    provider.name !== 'netease' ||
    !Number.isSafeInteger(provider.recordId) ||
    provider.recordId <= 0 ||
    typeof provider.artifactFilename !== 'string' ||
    !NETEASE_ARTIFACT_RE.test(provider.artifactFilename)
  ) {
    return null;
  }
  try {
    const artifactPath = providerArtifactPath(
      trackDir,
      provider.artifactFilename,
    );
    const stat = fs.statSync(artifactPath);
    if (!stat.isFile() || stat.size > MAX_PROVIDER_ARTIFACT_BYTES) return null;
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    if (
      artifact?.schemaVersion !== PROVIDER_ARTIFACT_SCHEMA_VERSION ||
      artifact.provider !== 'netease' ||
      artifact.providerProfileId !== 'netease-direct-http-v1' ||
      artifact.providerRecordId !== provider.recordId ||
      artifact.record?.id !== provider.recordId ||
      !SHA256_RE.test(artifact.hashes?.record) ||
      fingerprintNeteaseRecord(artifact.record) !== artifact.hashes.record ||
      typeof artifact.retrievedAt !== 'string' ||
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

function deleteStoredNeteaseSource(trackDir, sourceFilename) {
  const source = loadTrackLyricsManifest(trackDir).sources.find(
    (candidate) => candidate.filename === sourceFilename,
  );
  const provider = source?.provider;
  if (!deleteLyricsSource(trackDir, sourceFilename)) return false;
  if (provider?.name === 'netease') {
    fs.rmSync(providerArtifactPath(trackDir, provider.artifactFilename), {
      force: true,
    });
  }
  return true;
}

module.exports = {
  PROVIDER_ARTIFACT_SCHEMA_VERSION,
  deleteStoredNeteaseSource,
  loadStoredNeteaseArtifactSummary,
  saveNeteaseRecord,
};

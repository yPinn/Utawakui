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
const { analyzeLrclibRecord } = require('./candidate.js');
const { parseLrcLines } = require('./lrc.js');
const { parseLyricsfile } = require('./lyricsfile.js');
const {
  fingerprintLrclibRecord,
  normalizeLrclibRecord,
} = require('./record.js');

const PROVIDER_ARTIFACT_SCHEMA_VERSION = 1;
const PROVIDERS_DIRNAME = 'providers';
const LRCLIB_SOURCE_RE = /^lrclib-(\d+)(?:-\d+)?\.lrc$/i;
const LRCLIB_ARTIFACT_RE = /^lrclib-(\d+)\.json$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_PROVIDER_ARTIFACT_BYTES = 5 * 1024 * 1024;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function nullableTextHash(value) {
  return typeof value === 'string' ? sha256(value) : null;
}

function formatLrcTimestamp(milliseconds) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0',
  )}.${String(millis).padStart(3, '0')}`;
}

function lyricsfileProjection(record) {
  if (typeof record.lyricsfile !== 'string') return null;
  const parsed = parseLyricsfile(record.lyricsfile);
  if (parsed.status !== 'ok') return { parsed, text: null, timing: null };

  const lines = parsed.document.lines;
  const text =
    lines.length > 0
      ? `${lines
          .map((line) => `[${formatLrcTimestamp(line.startMs)}]${line.text}`)
          .join('\n')}\n`
      : parsed.document.plain;
  return {
    parsed,
    text,
    timing: parsed.compatibility.t2 ? parsed.document : null,
  };
}

function legacyProjection(record) {
  if (
    typeof record.syncedLyrics === 'string' &&
    parseLrcLines(record.syncedLyrics).length > 0
  ) {
    return record.syncedLyrics;
  }
  return typeof record.plainLyrics === 'string' ? record.plainLyrics : null;
}

function buildTimingDocument(recordId, sourceFilename, sourceSha256, document) {
  const timingDocument = {
    schemaVersion: LYRICS_TIMING_SCHEMA_VERSION,
    documentId: `lrclib:${recordId}`,
    normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
    source: { filename: sourceFilename, sha256: sourceSha256 },
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
  };
  return validateLyricsTimingDocument(timingDocument, {
    sourceFilename,
    sourceSha256,
    normalizerProfileId: LYRICS_NORMALIZER_PROFILE_ID,
  });
}

function providerArtifactPath(trackDir, artifactFilename) {
  return path.join(trackDir, 'lyrics', PROVIDERS_DIRNAME, artifactFilename);
}

function normalizedFilesystemPath(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function readBoundedFile(handle, maxBytes) {
  const chunks = [];
  const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1));
  let totalBytes = 0;
  let position = 0;
  while (totalBytes <= maxBytes) {
    const bytesRead = fs.readSync(
      handle,
      buffer,
      0,
      Math.min(buffer.length, maxBytes + 1 - totalBytes),
      position,
    );
    if (bytesRead === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    totalBytes += bytesRead;
    position += bytesRead;
  }
  return totalBytes > maxBytes ? null : Buffer.concat(chunks).toString('utf8');
}

function loadStoredLrclibArtifactSummary(trackDir, provider) {
  const artifactFilename = provider?.artifactFilename;
  const match =
    typeof artifactFilename === 'string'
      ? LRCLIB_ARTIFACT_RE.exec(artifactFilename)
      : null;
  if (
    provider?.name !== 'lrclib' ||
    !Number.isSafeInteger(provider.recordId) ||
    !match ||
    Number(match[1]) !== provider.recordId
  ) {
    return null;
  }

  let artifactHandle = null;
  try {
    const providerDir = path.resolve(trackDir, 'lyrics', PROVIDERS_DIRNAME);
    const artifactPath = providerArtifactPath(trackDir, artifactFilename);
    const realProviderDir = fs.realpathSync(providerDir);
    const realArtifactPath = fs.realpathSync(artifactPath);
    if (
      normalizedFilesystemPath(realProviderDir) !==
        normalizedFilesystemPath(providerDir) ||
      normalizedFilesystemPath(path.dirname(realArtifactPath)) !==
        normalizedFilesystemPath(providerDir)
    ) {
      return null;
    }

    artifactHandle = fs.openSync(
      artifactPath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
    );
    const artifactStat = fs.fstatSync(artifactHandle);
    if (
      !artifactStat.isFile() ||
      artifactStat.size > MAX_PROVIDER_ARTIFACT_BYTES
    )
      return null;
    const artifactText = readBoundedFile(
      artifactHandle,
      MAX_PROVIDER_ARTIFACT_BYTES,
    );
    if (artifactText === null) return null;
    const artifact = JSON.parse(artifactText);
    if (
      artifact?.schemaVersion !== PROVIDER_ARTIFACT_SCHEMA_VERSION ||
      artifact.provider !== 'lrclib' ||
      artifact.providerRecordId !== provider.recordId ||
      artifact.record?.id !== provider.recordId ||
      !SHA256_RE.test(artifact.hashes?.record) ||
      typeof artifact.retrievedAt !== 'string' ||
      !Number.isFinite(Date.parse(artifact.retrievedAt))
    ) {
      return null;
    }
    if (fingerprintLrclibRecord(artifact.record) !== artifact.hashes.record) {
      return null;
    }
    return {
      recordFingerprint: artifact.hashes.record,
      retrievedAt: new Date(artifact.retrievedAt).toISOString(),
    };
  } catch {
    return null;
  } finally {
    if (artifactHandle !== null) fs.closeSync(artifactHandle);
  }
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

function lrclibIdFromFilename(filename) {
  const match = LRCLIB_SOURCE_RE.exec(filename);
  return match ? Number(match[1]) : null;
}

function findExistingSource(sources, recordId) {
  return sources.find(
    (source) =>
      (source.provider?.name === 'lrclib' &&
        source.provider.recordId === recordId) ||
      (source.kind === 'lrclib' &&
        lrclibIdFromFilename(source.filename) === recordId),
  );
}

function allocateSourceFilename(trackDir, recordId) {
  const base = `lrclib-${recordId}`;
  for (let suffix = 1; suffix <= 99; suffix += 1) {
    const filename = suffix === 1 ? `${base}.lrc` : `${base}-${suffix}.lrc`;
    if (!fs.existsSync(path.join(trackDir, 'lyrics', filename)))
      return filename;
  }
  return null;
}

function normalizeRetrievedAt(value) {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error('invalid retrieval time');
  return date.toISOString();
}

function saveLrclibRecord(trackDir, rawRecord, options = {}) {
  const normalized = normalizeLrclibRecord(rawRecord);
  if (normalized.status !== 'ok') throw new Error('invalid lrclib record');
  const record = normalized.record;
  const analysis = analyzeLrclibRecord(record);
  const lyricsfile = lyricsfileProjection(record);
  const sourceText = lyricsfile ? lyricsfile.text : legacyProjection(record);
  const artifactFilename = `lrclib-${record.id}.json`;
  const artifactPath = providerArtifactPath(trackDir, artifactFilename);
  const artifact = {
    schemaVersion: PROVIDER_ARTIFACT_SCHEMA_VERSION,
    provider: 'lrclib',
    providerRecordId: record.id,
    retrievedAt: normalizeRetrievedAt(options.retrievedAt),
    capability: analysis.capability,
    compatibility: analysis.compatibility,
    warnings: analysis.warnings,
    hashes: {
      record: fingerprintLrclibRecord(record),
      plainLyrics: nullableTextHash(record.plainLyrics),
      syncedLyrics: nullableTextHash(record.syncedLyrics),
      lyricsfile: nullableTextHash(record.lyricsfile),
      compatibilitySource: nullableTextHash(sourceText),
    },
    record,
  };

  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  if (typeof sourceText !== 'string' || sourceText.trim().length === 0) {
    atomicWriteJson(artifactPath, artifact);
    return {
      status: 'preserved',
      source: null,
      capability: analysis.capability,
      compatibility: analysis.compatibility,
      warnings: analysis.warnings,
      recordFingerprint: artifact.hashes.record,
      retrievedAt: artifact.retrievedAt,
    };
  }

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
  const sourceSha256 = sha256(sourceText);
  const timingDocument = lyricsfile?.timing
    ? buildTimingDocument(
        record.id,
        sourceFilename,
        sourceSha256,
        lyricsfile.timing,
      )
    : null;
  const language = analysis.language || 'und';
  const label = record.albumName || record.artistName;
  const source = {
    filename: sourceFilename,
    language,
    kind: 'lrclib',
    ...(label ? { label } : {}),
    provider: {
      name: 'lrclib',
      recordId: record.id,
      artifactFilename,
    },
  };
  const publishManifest = options.publishManifest || saveTrackLyricsManifest;

  try {
    atomicWriteJson(artifactPath, artifact);
    atomicWriteText(sourcePath, sourceText);
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
          candidate.provider?.name === 'lrclib' &&
          candidate.provider.recordId === record.id
        ),
    );
    publishManifest(trackDir, [...remaining, source]);
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
    recordFingerprint: artifact.hashes.record,
    retrievedAt: artifact.retrievedAt,
    timing: loadTrackLyricsTiming(trackDir, sourceFilename),
  };
}

function deleteStoredLrclibSource(trackDir, sourceFilename) {
  const manifest = loadTrackLyricsManifest(trackDir);
  const source = manifest.sources.find(
    (candidate) => candidate.filename === sourceFilename,
  );
  const provider = source?.provider;
  if (!deleteLyricsSource(trackDir, sourceFilename)) return false;
  if (provider?.name === 'lrclib') {
    fs.rmSync(providerArtifactPath(trackDir, provider.artifactFilename), {
      force: true,
    });
  }
  return true;
}

module.exports = {
  PROVIDER_ARTIFACT_SCHEMA_VERSION,
  deleteStoredLrclibSource,
  fingerprintLrclibRecord,
  loadStoredLrclibArtifactSummary,
  saveLrclibRecord,
};

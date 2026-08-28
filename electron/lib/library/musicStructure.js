'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteBuffer } = require('../atomicWrite');
const {
  resolveMusicStructureSignals,
  validateMusicStructureDocument,
} = require('../musicStructureContract');
const contractValues = require('../../../shared/musicStructureContractValues.json');
const { resolveTrackAudioPath, resolveTrackDir } = require('./paths');

const ANALYSIS_DIRNAME = 'analysis';
const MUSIC_STRUCTURE_FILENAME = 'music-structure.json';

function m0Fallback(reason) {
  return { level: 'M0', reason, tempo: null, beats: [], sections: [] };
}

function musicStructureSidecarPath(dir, trackId) {
  const trackDir = resolveTrackDir(dir, trackId);
  return trackDir
    ? path.join(trackDir, ANALYSIS_DIRNAME, MUSIC_STRUCTURE_FILENAME)
    : null;
}

function validateSourceIdentity(value) {
  if (
    !value ||
    typeof value.sourceSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sourceSha256) ||
    !Number.isSafeInteger(value.sourceDurationMs) ||
    value.sourceDurationMs < 0 ||
    value.sourceDurationMs > contractValues.maxDurationMs
  ) {
    throw new Error('current music structure source identity is required');
  }
  return value;
}

function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function prepareTrackMusicStructureSource(dir, trackId) {
  const inputPath = resolveTrackAudioPath(dir, trackId);
  if (!inputPath) {
    throw new Error('music structure track is unavailable');
  }
  return {
    inputPath,
    sourceSha256: await computeFileSha256(inputPath),
  };
}

async function currentSourceIdentity(dir, trackId, sourceDurationMs) {
  const audioPath = resolveTrackAudioPath(dir, trackId);
  if (!audioPath) return null;
  if (
    !Number.isSafeInteger(sourceDurationMs) ||
    sourceDurationMs < 0 ||
    sourceDurationMs > contractValues.maxDurationMs
  ) {
    return null;
  }
  try {
    return {
      sourceSha256: await computeFileSha256(audioPath),
      sourceDurationMs,
    };
  } catch {
    return null;
  }
}

function readBoundedSidecar(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'invalid' };
  }

  try {
    const buffer = Buffer.allocUnsafe(contractValues.maxDocumentBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const bytesRead = fs.readSync(
        fd,
        buffer,
        total,
        buffer.length - total,
        null,
      );
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > contractValues.maxDocumentBytes) return { kind: 'invalid' };
    try {
      return {
        kind: 'document',
        document: JSON.parse(buffer.subarray(0, total).toString('utf8')),
      };
    } catch {
      return { kind: 'invalid' };
    }
  } catch {
    return { kind: 'invalid' };
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // A close failure cannot make already-bounded derived data executable.
    }
  }
}

function publicResult(trackId, identity, signals, analysisProfileId) {
  return {
    trackId,
    sourceRevision: identity?.sourceSha256 ?? null,
    sourceDurationMs: identity?.sourceDurationMs ?? null,
    signals,
    ...(analysisProfileId === undefined ? {} : { analysisProfileId }),
  };
}

async function readTrackMusicStructure(dir, trackId, includeAnalysisProfileId) {
  const project = (
    resultTrackId,
    identity,
    signals,
    analysisProfileId = null,
  ) =>
    publicResult(
      resultTrackId,
      identity,
      signals,
      includeAnalysisProfileId ? analysisProfileId : undefined,
    );
  const filePath = musicStructureSidecarPath(dir, trackId);
  if (!filePath) {
    return project(null, null, m0Fallback('unavailable-source'));
  }

  const stored = readBoundedSidecar(filePath);
  if (stored.kind === 'missing') {
    return project(trackId, null, m0Fallback('missing'));
  }
  if (stored.kind !== 'document') {
    return project(trackId, null, m0Fallback('invalid'));
  }
  let document;
  try {
    document = validateMusicStructureDocument(stored.document);
  } catch {
    return project(trackId, null, m0Fallback('invalid'));
  }
  const identity = await currentSourceIdentity(
    dir,
    trackId,
    document.source.durationMs,
  );
  return project(
    trackId,
    identity,
    resolveMusicStructureSignals(document, {
      sourceSha256: identity?.sourceSha256,
      sourceDurationMs: identity?.sourceDurationMs,
    }),
    document.analyzer.profileId,
  );
}

async function loadTrackMusicStructure(dir, trackId) {
  return readTrackMusicStructure(dir, trackId, false);
}

async function inspectTrackMusicStructure(dir, trackId) {
  return readTrackMusicStructure(dir, trackId, true);
}

async function saveTrackMusicStructure(
  dir,
  trackId,
  rawDocument,
  sourceIdentity,
) {
  const filePath = musicStructureSidecarPath(dir, trackId);
  const audioPath = filePath ? resolveTrackAudioPath(dir, trackId) : null;
  if (!filePath || !audioPath) {
    throw new Error('music structure track is unavailable');
  }
  const identity = validateSourceIdentity(sourceIdentity);
  if ((await computeFileSha256(audioPath)) !== identity.sourceSha256) {
    throw new Error('music structure source fingerprint is stale');
  }
  const document = validateMusicStructureDocument(rawDocument, identity);
  const serialized = Buffer.from(JSON.stringify(document), 'utf8');
  if (serialized.length > contractValues.maxDocumentBytes) {
    throw new Error('music structure document is too large');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteBuffer(filePath, serialized);
  return publicResult(
    trackId,
    identity,
    resolveMusicStructureSignals(document, identity),
  );
}

module.exports = {
  inspectTrackMusicStructure,
  loadTrackMusicStructure,
  musicStructureSidecarPath,
  prepareTrackMusicStructureSource,
  saveTrackMusicStructure,
};

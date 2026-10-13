'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { atomicWriteJson } = require('../atomicWrite');
const {
  AUDIO_CONVERSION_EXTENSIONS,
  AUDIO_CONVERSION_FORMATS,
  AUDIO_EXTENSIONS,
  ARTWORK_BASENAME,
  INDEX_FILENAME,
  STRUCTURED_AUDIO_BASENAME,
  TRACKS_DIRNAME,
} = require('./constants');
const {
  isSafeTrackId,
  resolveTrackDir,
  resolveTrackAudioPath,
} = require('./paths');
const { loadIndex, saveIndexEntry } = require('./metadataIndex');
const {
  parseLocalAudioMetadata,
  readLocalAudioMetadata,
} = require('./localAudioMetadata');
const {
  createFfmpegFlacTranscodeJob,
} = require('../audioProcessing/ffmpegFlacTranscodeJob');
// listTrackRecords is the filesystem-truth track list buildContentHashTrackMap
// walks to find existing content hashes. This is the one place a "not
// tracks.js" submodule needs tracks.js: buildContentHashTrackMap can't
// duplicate track enumeration/migration logic without drifting from it.
const { listTrackRecords } = require('./tracks');

const PUBLIC_METADATA_FAILURE_REASONS = new Set([
  'format-mismatch',
  'invalid-audio',
  'unsupported-codec',
  'unsupported-media',
]);
const CONVERSION_SOURCE_FORMATS = new Set([
  ...Object.values(AUDIO_CONVERSION_FORMATS).map(
    ({ sourceFormat }) => sourceFormat,
  ),
  'alac',
]);

function isSha256Digest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value);
}

async function copyFileWithContentHash(sourcePath, targetPath) {
  const hash = crypto.createHash('sha256');
  let fileSize = 0;
  const hashStream = new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      fileSize += chunk.length;
      callback(null, chunk);
    },
  });
  await pipeline(
    fs.createReadStream(sourcePath),
    hashStream,
    fs.createWriteStream(targetPath, { flags: 'wx' }),
  );
  return { contentHash: hash.digest('hex'), fileSize };
}

async function computeFileContentHash(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function localTrackIdBaseFromFilePath(filePath) {
  const stem = path.basename(filePath, path.extname(filePath)).trim();
  return isSafeTrackId(stem) ? stem : 'track';
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function uniqueLocalTrackId(dir, baseId) {
  let candidate = baseId;
  let suffix = 2;
  while (await pathExists(resolveTrackDir(dir, candidate))) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function buildContentHashTrackMap(dir) {
  const index = loadIndex(dir);
  const trackIdByContentHash = new Map();
  let changed = false;

  for (const record of listTrackRecords(dir)) {
    const indexed = index.tracks[record.id];
    let contentHash = indexed?.contentHash;
    if (
      !isSha256Digest(contentHash) &&
      indexed?.sourceType === 'local-file' &&
      indexed?.storageType === 'managed'
    ) {
      const audioPath = resolveTrackAudioPath(dir, record.id);
      if (audioPath) {
        try {
          contentHash = await computeFileContentHash(audioPath);
          index.tracks[record.id] = { ...indexed, contentHash };
          changed = true;
        } catch {
          contentHash = undefined;
        }
      }
    }

    if (isSha256Digest(contentHash) && !trackIdByContentHash.has(contentHash)) {
      trackIdByContentHash.set(contentHash, record.id);
    }
  }

  if (changed) atomicWriteJson(path.join(dir, INDEX_FILENAME), index);
  return trackIdByContentHash;
}

function publicFilename(sourcePath) {
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
    return '未知檔案';
  }
  return path.basename(sourcePath);
}

function addSkipped(result, sourcePath, reason, details = {}) {
  result.skipped.push({
    filename: publicFilename(sourcePath),
    reason,
    ...details,
  });
}

function notifyFailure(onFailure, failure) {
  try {
    onFailure?.(failure);
  } catch {
    // Diagnostics are fail-open and never change the import outcome.
  }
}

async function removeDirectory(directory) {
  if (!directory) return;
  await fs.promises.rm(directory, { recursive: true, force: true });
}

function indexMetadataForImport(
  sourcePath,
  metadata,
  importState,
  provenance = {},
) {
  const filenameTitle =
    path.basename(sourcePath, path.extname(sourcePath)).trim() || '未命名曲目';
  const title = metadata.title || filenameTitle;
  return {
    title,
    ...(metadata.artist ? { artist: metadata.artist } : {}),
    ...(metadata.album ? { album: metadata.album } : {}),
    ...(metadata.releaseYear ? { releaseYear: metadata.releaseYear } : {}),
    duration: metadata.duration,
    titleOrigin: metadata.title ? 'file-tag' : 'filename',
    ...(metadata.artist ? { artistOrigin: 'file-tag' } : {}),
    sourceType: 'local-file',
    storageType: 'managed',
    audioFilename: importState.audioFilename,
    originalFilename: path.basename(sourcePath),
    importedAt: new Date().toISOString(),
    fileSize: importState.fileSize,
    contentHash: importState.contentHash,
    ...(CONVERSION_SOURCE_FORMATS.has(provenance.sourceFormat)
      ? { sourceFormat: provenance.sourceFormat }
      : {}),
    ...(provenance.conversionFormat === 'flac'
      ? { conversionFormat: 'flac' }
      : {}),
  };
}

function addConversionRequired(
  result,
  sourcePath,
  sourceFormat,
  onConversionCandidate,
) {
  if (!CONVERSION_SOURCE_FORMATS.has(sourceFormat)) return false;
  result.conversionRequired ||= [];
  result.conversionRequired.push({
    filename: publicFilename(sourcePath),
    sourceFormat,
  });
  try {
    onConversionCandidate?.({ sourcePath, sourceFormat });
  } catch {
    // The private candidate collector is fail-open like diagnostics. The
    // public review item remains bounded and cannot expose the path.
  }
  return true;
}

async function prepareStagedAudio({
  sourcePath,
  stagingAudioPath,
  prepareAudio,
}) {
  if (!prepareAudio) {
    return copyFileWithContentHash(sourcePath, stagingAudioPath);
  }
  await prepareAudio(stagingAudioPath);
  const stats = await fs.promises.stat(stagingAudioPath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error('compatibility conversion produced no audio file');
  }
  return {
    contentHash: await computeFileContentHash(stagingAudioPath),
    fileSize: stats.size,
  };
}

async function importOneLocalAudioFile({
  dir,
  sourcePath,
  trackIdByContentHash,
  readAudioMetadata,
  persistIndexEntry,
  onFailure,
  onConversionCandidate,
  result,
  audioExtension,
  displaySourcePath = sourcePath,
  prepareAudio,
  sourceMetadata,
  provenance,
}) {
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) {
    addSkipped(result, sourcePath, 'invalid-path');
    return;
  }

  const extension = audioExtension || path.extname(sourcePath).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) {
    addSkipped(result, sourcePath, 'unsupported-extension');
    return;
  }

  let sourceStats;
  try {
    sourceStats = await fs.promises.stat(sourcePath);
  } catch (error) {
    addSkipped(result, sourcePath, 'missing-file');
    notifyFailure(onFailure, { sourcePath, reason: 'missing-file', error });
    return;
  }
  if (!sourceStats.isFile()) {
    addSkipped(result, sourcePath, 'not-a-file');
    return;
  }

  let stagingDirectory;
  let finalTrackDirectory;
  try {
    const stagingRoot = path.join(dir, '.import-staging');
    await fs.promises.mkdir(stagingRoot, { recursive: true });
    stagingDirectory = await fs.promises.mkdtemp(
      path.join(stagingRoot, 'track-'),
    );
    const audioFilename = `${STRUCTURED_AUDIO_BASENAME}${extension}`;
    const stagingAudioPath = path.join(stagingDirectory, audioFilename);
    const { contentHash, fileSize } = await prepareStagedAudio({
      sourcePath,
      stagingAudioPath,
      prepareAudio,
    });

    const existingTrackId = trackIdByContentHash.get(contentHash);
    if (existingTrackId) {
      addSkipped(result, displaySourcePath, 'duplicate-content', {
        existingTrackId,
      });
      return;
    }

    const outputMetadata = await readAudioMetadata(stagingAudioPath, extension);
    const metadata = sourceMetadata
      ? {
          ...outputMetadata,
          ...sourceMetadata,
          duration: outputMetadata.duration,
        }
      : outputMetadata;
    if (metadata.artwork) {
      await fs.promises.writeFile(
        path.join(
          stagingDirectory,
          `${ARTWORK_BASENAME}${metadata.artwork.extension}`,
        ),
        metadata.artwork.buffer,
        { flag: 'wx' },
      );
    }

    const trackId = await uniqueLocalTrackId(
      dir,
      localTrackIdBaseFromFilePath(displaySourcePath),
    );
    finalTrackDirectory = resolveTrackDir(dir, trackId);
    if (!finalTrackDirectory) {
      addSkipped(result, displaySourcePath, 'invalid-track-id');
      return;
    }

    await fs.promises.mkdir(path.join(dir, TRACKS_DIRNAME), {
      recursive: true,
    });
    await fs.promises.rename(stagingDirectory, finalTrackDirectory);
    stagingDirectory = undefined;

    const indexEntry = indexMetadataForImport(
      displaySourcePath,
      metadata,
      {
        audioFilename,
        contentHash,
        fileSize,
      },
      provenance,
    );
    try {
      await persistIndexEntry(dir, trackId, indexEntry);
    } catch (error) {
      await removeDirectory(finalTrackDirectory);
      finalTrackDirectory = undefined;
      throw error;
    }

    trackIdByContentHash.set(contentHash, trackId);
    result.imported.push({ id: trackId, title: indexEntry.title });
  } catch (error) {
    if (
      !prepareAudio &&
      error?.code === 'conversion-required' &&
      addConversionRequired(
        result,
        displaySourcePath,
        error.sourceFormat,
        onConversionCandidate,
      )
    ) {
      return;
    }
    const reason = PUBLIC_METADATA_FAILURE_REASONS.has(error?.code)
      ? error.code
      : error?.code === 'conversion-failed'
        ? 'conversion-failed'
        : 'import-failed';
    addSkipped(result, displaySourcePath, reason);
    notifyFailure(onFailure, { sourcePath, reason, error });
  } finally {
    try {
      await removeDirectory(stagingDirectory);
    } catch (error) {
      notifyFailure(onFailure, {
        sourcePath,
        reason: 'cleanup-failed',
        error,
      });
    }
  }
}

async function inspectConversionCandidate({
  sourcePath,
  parseAudioMetadata,
  onFailure,
  onConversionCandidate,
  result,
}) {
  let sourceStats;
  try {
    sourceStats = await fs.promises.stat(sourcePath);
  } catch (error) {
    addSkipped(result, sourcePath, 'missing-file');
    notifyFailure(onFailure, { sourcePath, reason: 'missing-file', error });
    return;
  }
  if (!sourceStats.isFile()) {
    addSkipped(result, sourcePath, 'not-a-file');
    return;
  }

  try {
    const classified = await parseAudioMetadata(
      sourcePath,
      path.extname(sourcePath).toLowerCase(),
    );
    if (
      classified?.kind !== 'conversion' ||
      !addConversionRequired(
        result,
        sourcePath,
        classified.sourceFormat,
        onConversionCandidate,
      )
    ) {
      throw Object.assign(new Error('source is not convertible'), {
        code: 'format-mismatch',
      });
    }
  } catch (error) {
    const reason = PUBLIC_METADATA_FAILURE_REASONS.has(error?.code)
      ? error.code
      : 'invalid-audio';
    addSkipped(result, sourcePath, reason);
    notifyFailure(onFailure, { sourcePath, reason, error });
  }
}

async function importLocalAudioFiles(dir, filePaths, options = {}) {
  const result = { imported: [], skipped: [] };
  if (!Array.isArray(filePaths)) return result;

  const trackIdByContentHash = await buildContentHashTrackMap(dir);
  const readAudioMetadata = options.readAudioMetadata || readLocalAudioMetadata;
  const parseAudioMetadata =
    options.parseAudioMetadata || parseLocalAudioMetadata;
  const persistIndexEntry = options.persistIndexEntry || saveIndexEntry;

  for (const sourcePath of filePaths) {
    const extension =
      typeof sourcePath === 'string'
        ? path.extname(sourcePath).toLowerCase()
        : '';
    if (AUDIO_CONVERSION_EXTENSIONS.has(extension)) {
      await inspectConversionCandidate({
        sourcePath,
        parseAudioMetadata,
        onFailure: options.onFailure,
        onConversionCandidate: options.onConversionCandidate,
        result,
      });
      continue;
    }
    await importOneLocalAudioFile({
      dir,
      sourcePath,
      trackIdByContentHash,
      readAudioMetadata,
      persistIndexEntry,
      onFailure: options.onFailure,
      onConversionCandidate: options.onConversionCandidate,
      result,
    });
  }

  return result;
}

async function convertLocalAudioFiles(dir, candidates, options = {}) {
  const result = { imported: [], skipped: [] };
  if (!Array.isArray(candidates)) return result;

  const trackIdByContentHash = await buildContentHashTrackMap(dir);
  const parseAudioMetadata =
    options.parseAudioMetadata || parseLocalAudioMetadata;
  const readAudioMetadata = options.readAudioMetadata || readLocalAudioMetadata;
  const persistIndexEntry = options.persistIndexEntry || saveIndexEntry;
  const createTranscodeJob =
    options.createTranscodeJob || createFfmpegFlacTranscodeJob;

  for (const candidate of candidates) {
    const sourcePath = candidate?.sourcePath;
    const expectedSourceFormat = candidate?.sourceFormat;
    if (
      typeof sourcePath !== 'string' ||
      !CONVERSION_SOURCE_FORMATS.has(expectedSourceFormat)
    ) {
      addSkipped(result, sourcePath, 'source-changed');
      continue;
    }

    let classified;
    try {
      classified = await parseAudioMetadata(
        sourcePath,
        path.extname(sourcePath).toLowerCase(),
      );
    } catch (error) {
      addSkipped(result, sourcePath, 'source-changed');
      notifyFailure(options.onFailure, {
        sourcePath,
        reason: 'source-changed',
        error,
      });
      continue;
    }
    if (
      classified?.kind !== 'conversion' ||
      classified.sourceFormat !== expectedSourceFormat
    ) {
      addSkipped(result, sourcePath, 'source-changed');
      continue;
    }

    await importOneLocalAudioFile({
      dir,
      sourcePath,
      displaySourcePath: sourcePath,
      audioExtension: '.flac',
      trackIdByContentHash,
      readAudioMetadata,
      persistIndexEntry,
      onFailure: options.onFailure,
      result,
      sourceMetadata: classified.metadata,
      provenance: {
        sourceFormat: expectedSourceFormat,
        conversionFormat: 'flac',
      },
      prepareAudio: async (outputPath) => {
        try {
          await createTranscodeJob({
            ffmpegPath: options.ffmpegPath,
            inputPath: sourcePath,
            outputPath,
          }).result;
        } catch (error) {
          try {
            error.code = 'conversion-failed';
          } catch {
            // The fallback error remains bounded even for a frozen cause.
            throw Object.assign(new Error('compatibility conversion failed'), {
              code: 'conversion-failed',
              cause: error,
            });
          }
          throw error;
        }
      },
    });
  }

  return result;
}

module.exports = {
  computeFileContentHash,
  convertLocalAudioFiles,
  importLocalAudioFiles,
};

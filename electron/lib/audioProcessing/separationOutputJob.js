'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { spawn } = require('child_process');
const { createOnnxMdxJob } = require('./engines/onnxMdxJob');
const { createFfmpegFlacTranscodeJob } = require('./ffmpegFlacTranscodeJob');
const {
  loadSeparationManifest,
  recordSeparationResult,
} = require('../library/separationManifest');
const {
  createSeparationOutputTransaction,
  recoverSeparationOutputArtifacts,
} = require('./separationOutputRecovery');

function normalizeSeparationOutputFormat(value = 'wav') {
  if (value !== 'wav' && value !== 'flac5')
    throw new Error('invalid separation output format');
  return value;
}

async function describeWav(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(44);
  try {
    fs.readSync(fd, header, 0, 44, 0);
  } finally {
    fs.closeSync(fd);
  }
  const size = fs.statSync(filePath).size;
  if (
    header.toString('ascii', 0, 4) !== 'RIFF' ||
    header.toString('ascii', 8, 12) !== 'WAVE' ||
    header.toString('ascii', 12, 16) !== 'fmt ' ||
    header.readUInt32LE(16) !== 16 ||
    header.readUInt16LE(20) !== 1 ||
    header.readUInt16LE(22) !== 4 ||
    header.readUInt32LE(24) !== 44100 ||
    header.readUInt32LE(28) !== 352800 ||
    header.readUInt16LE(32) !== 8 ||
    header.readUInt16LE(34) !== 16 ||
    header.toString('ascii', 36, 40) !== 'data' ||
    header.readUInt32LE(4) !== size - 8 ||
    header.readUInt32LE(40) !== size - 44 ||
    size <= 44 ||
    (size - 44) % 8 !== 0
  ) {
    throw new Error('invalid separation WAV');
  }
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath, { start: 44 }))
    hash.update(chunk);
  return {
    bytes: size - 44,
    frames: (size - 44) / 8,
    sha256: hash.digest('hex'),
  };
}

function validateFlacHeader(filePath, frames) {
  const fd = fs.openSync(filePath, 'r'),
    header = Buffer.alloc(42);
  try {
    fs.readSync(fd, header, 0, 42, 0);
  } finally {
    fs.closeSync(fd);
  }
  const info = header.readBigUInt64BE(18);
  if (
    header.toString('ascii', 0, 4) !== 'fLaC' ||
    (header[4] & 127) !== 0 ||
    header.readUIntBE(5, 3) !== 34 ||
    Number(info >> 44n) !== 44100 ||
    Number((info >> 41n) & 7n) + 1 !== 4 ||
    Number((info >> 36n) & 31n) + 1 !== 16 ||
    Number(info & 0xfffffffffn) !== frames
  ) {
    throw new Error('invalid separation FLAC');
  }
}

// Decode without channel mixing or resampling; hash streaming PCM, never expose stderr.
function createSeparationPcmVerifyJob({
  ffmpegPath,
  inputPath,
  spawnImpl = spawn,
}) {
  if (
    ![ffmpegPath, inputPath].every(
      (p) =>
        typeof p === 'string' &&
        (path.isAbsolute(p) || path.win32.isAbsolute(p)),
    )
  ) {
    throw new Error('separation verification paths must be absolute');
  }
  const child = spawnImpl(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-i',
      inputPath,
      '-map',
      '0:a:0',
      '-vn',
      '-sn',
      '-dn',
      '-c:a',
      'pcm_s16le',
      '-f',
      's16le',
      '-',
    ],
    { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const hash = createHash('sha256');
  let bytes = 0,
    cancelled = false,
    settled = false,
    streamFailed = false;
  let resolveResult, rejectResult, resolveClosed;
  const closed = new Promise((r) => (resolveClosed = r));
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const fail = () => {
    if (!settled) {
      settled = true;
      rejectResult(
        new Error(
          cancelled
            ? 'audio-processing job cancelled'
            : 'separation PCM verification failed',
        ),
      );
    }
  };
  child.stdout.on('data', (chunk) => {
    bytes += chunk.length;
    hash.update(chunk);
  });
  child.stdout.on('error', () => {
    streamFailed = true;
    try {
      child.kill();
    } catch {
      /* Wait for close before releasing the job. */
    }
  });
  child.on('error', () => {
    fail();
    if (child.pid === undefined) resolveClosed();
  });
  child.on('close', (code) => {
    if (cancelled || streamFailed || code !== 0) fail();
    else if (!settled) {
      settled = true;
      resolveResult({ bytes, sha256: hash.digest('hex') });
    }
    resolveClosed();
  });
  return {
    pid: child.pid,
    closed,
    result,
    async cancel() {
      if (settled) {
        await closed;
        return;
      }
      cancelled = true;
      try {
        child.kill();
      } catch {
        /* Await actual close, never pretend the child exited. */
      }
      await closed;
    },
  };
}

// The formal handler never constructs this unless its factory explicitly opts in.
// Worker publication occurs only in a fresh private staging directory. Main owns
// the final guard, manifest switch and cleanup; old artifacts are never overwritten.
function createSeparationOutputJob({
  workerPath,
  workerData,
  emitProgress,
  assertCurrent = () => {},
  createWorkerJob = createOnnxMdxJob,
  createTranscodeJob = createFfmpegFlacTranscodeJob,
  createVerifyJob = createSeparationPcmVerifyJob,
  recordResult = recordSeparationResult,
  onFallback = () => {},
  onRecovery = () => {},
}) {
  const outputDir = path.resolve(workerData.outputDir);
  const recipeId = workerData.recipeId;
  if (typeof recipeId !== 'string' || !/^[a-z0-9-]+$/i.test(recipeId))
    throw new Error('invalid separation recipe');
  assertCurrent();
  fs.mkdirSync(outputDir, { recursive: true });
  const recovery = recoverSeparationOutputArtifacts(outputDir);
  if (recovery.deferred.length) {
    try {
      onRecovery(recovery);
    } catch {
      /* Optional private diagnostics. */
    }
  }
  assertCurrent();
  const transaction = createSeparationOutputTransaction(outputDir, recipeId);
  const { staging } = transaction;
  let active = null,
    cancelled = false,
    cancelPromise = null,
    published = false,
    candidate = null;
  const guard = () => {
    if (cancelled) throw new Error('audio-processing job cancelled');
    assertCurrent();
  };
  const run = async (job, phase) => {
    active = job;
    // Own the child and consume both result outcomes before any fallible I/O.
    const completed = Promise.resolve(job.result).then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );
    try {
      try {
        if (phase && job.pid !== undefined) transaction.update(phase, job.pid);
      } catch (error) {
        try {
          await job.cancel();
        } catch {
          /* Still wait for actual close. */
        }
        await (job.closed ?? completed);
        throw error;
      }
      const outcome = await completed;
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    } finally {
      if (job.closed) await job.closed;
      // A request is not an acknowledgement. Settle its decision before a
      // concurrent child completion reaches fallback or publication guards.
      if (cancelPromise) await cancelPromise.catch(() => {});
      if (active === job) active = null;
    }
  };
  const result = (async () => {
    try {
      guard();
      await run(
        createWorkerJob({
          workerPath,
          workerData: { ...workerData, outputDir: staging },
          emitProgress,
        }),
      );
      guard();
      const manifest = loadSeparationManifest(staging),
        entry = manifest.results[recipeId];
      if (
        !entry ||
        entry.profileId !== workerData.profileId ||
        entry.engineId !== 'onnx-mdx' ||
        entry.modelIds.length !== 1 ||
        entry.modelIds[0] !== workerData.modelId ||
        entry.artifactFilename !== `${recipeId}.wav`
      ) {
        throw new Error('invalid staged separation provenance');
      }
      const wavPath = path.join(staging, entry.artifactFilename),
        description = await describeWav(wavPath);
      guard();
      let chosen = wavPath,
        outputFormat = 'wav',
        fallbackReason;
      const flacPath = path.join(staging, 'candidate.flac');
      try {
        emitProgress?.({ stage: 'writing' });
        transaction.update('spawning-encode');
        const encoder = createTranscodeJob({
          ffmpegPath: workerData.ffmpegPath,
          inputPath: wavPath,
          outputPath: flacPath,
        });
        await run(encoder, 'encoding');
        transaction.update('ready');
        guard();
        validateFlacHeader(flacPath, description.frames);
        transaction.update('spawning-verify');
        const verifier = createVerifyJob({
          ffmpegPath: workerData.ffmpegPath,
          inputPath: flacPath,
        });
        const decoded = await run(verifier, 'verifying');
        transaction.update('ready');
        guard();
        if (
          decoded.bytes !== description.bytes ||
          decoded.sha256 !== description.sha256
        )
          throw new Error('separation PCM mismatch');
        chosen = flacPath;
        outputFormat = 'flac5';
      } catch (error) {
        // Cancellation, stale scope and gate revocation must not become fallback success.
        guard();
        if (error?.code === 'SEPARATION_JOURNAL_FAILED') throw error;
        fallbackReason = 'flac-unavailable';
        try {
          onFallback(error);
        } catch {
          /* Diagnostics cannot invalidate a usable WAV fallback. */
        }
      }
      guard();
      const artifactFilename = transaction.filename(outputFormat);
      candidate = path.join(outputDir, artifactFilename);
      transaction.update('publishing');
      fs.renameSync(chosen, candidate);
      guard();
      recordResult(outputDir, { ...entry, recipeId, artifactFilename });
      published = true;
      // Manifest commit is authoritative. A lost post-commit receipt is safe:
      // recovery also checks every current manifest reference before deletion.
      try {
        transaction.update('published');
      } catch {
        /* Keep successful publication. */
      }
      return {
        stemsPath: candidate,
        artifactFilename,
        outputFormat,
        ...(fallbackReason ? { fallbackReason } : {}),
      };
    } finally {
      // Worker cancellation can reject result before terminate() has completed.
      // Hold cleanup and scheduler occupancy until the child actually settles.
      if (cancelPromise) await cancelPromise.catch(() => {});
      try {
        if (candidate && !published) fs.rmSync(candidate, { force: true });
        fs.rmSync(staging, { recursive: true, force: true });
      } catch (error) {
        // Cleanup is retryable housekeeping, never the publication authority.
        try {
          onRecovery(
            {
              removed: [],
              deferred: [{ id: transaction.id, reason: 'cleanup-failed' }],
            },
            error,
          );
        } catch {
          /* Optional diagnostics cannot replace the original outcome. */
        }
      }
    }
  })();
  return {
    result,
    async cancel() {
      if (published) return false;
      if (!cancelPromise) {
        cancelled = true;
        const child = active;
        cancelPromise = Promise.resolve()
          .then(() => child?.cancel())
          .then(
            (accepted) => {
              if (accepted === false) cancelled = false;
              return accepted !== false;
            },
            (error) => {
              cancelled = false;
              throw error;
            },
          );
      }
      return cancelPromise;
    },
  };
}

module.exports = {
  normalizeSeparationOutputFormat,
  createSeparationPcmVerifyJob,
  createSeparationOutputJob,
};

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeWav } from '../vocalSeparation.js';
import {
  loadSeparationManifest,
  recordSeparationResult,
} from '../library/separationManifest.js';
import {
  createSeparationOutputJob,
  createSeparationPcmVerifyJob,
} from './separationOutputJob.js';

let dir;
const metadata = {
  recipeId: 'general',
  recipeVersion: 1,
  engineId: 'onnx-mdx',
  profileId: 'mdx-inst-hq4-v1',
  modelIds: ['inst-hq4'],
  artifactFilename: 'general.wav',
  completedAt: '2026-10-30',
  outputLayout: 'accompaniment-guide-4ch',
};
const wav = () =>
  encodeWav(
    Array.from(
      { length: 4 },
      (_, ch) => new Float32Array([0.1 + ch / 10, 0.2 + ch / 10]),
    ),
    44100,
  );
const digest = (b) => createHash('sha256').update(b).digest('hex');
function flac(channels = 4) {
  const b = Buffer.alloc(42);
  b.write('fLaC');
  b[4] = 128;
  b.writeUIntBE(34, 5, 3);
  b.writeBigUInt64BE(
    (44100n << 44n) | (BigInt(channels - 1) << 41n) | (15n << 36n) | 2n,
    18,
  );
  return b;
}
function harness(overrides = {}) {
  const createWorkerJob = vi.fn(({ workerData }) => {
    fs.writeFileSync(path.join(workerData.outputDir, 'general.wav'), wav());
    recordSeparationResult(workerData.outputDir, metadata);
    return {
      result: Promise.resolve({
        stemsPath: path.join(workerData.outputDir, 'general.wav'),
      }),
      cancel: vi.fn(async () => {}),
    };
  });
  const createTranscodeJob = vi.fn(({ outputPath }) => {
    fs.writeFileSync(outputPath, flac());
    return {
      result: Promise.resolve(outputPath),
      cancel: vi.fn(async () => {}),
    };
  });
  const createVerifyJob = vi.fn(() => ({
    result: Promise.resolve({ sha256: digest(wav().subarray(44)), bytes: 16 }),
    cancel: vi.fn(async () => {}),
  }));
  const job = createSeparationOutputJob({
    workerPath: 'worker.js',
    workerData: {
      outputDir: dir,
      recipeId: 'general',
      profileId: metadata.profileId,
      modelId: 'inst-hq4',
      ffmpegPath: path.resolve('ffmpeg.exe'),
    },
    emitProgress: vi.fn(),
    assertCurrent: () => {},
    createWorkerJob,
    createTranscodeJob,
    createVerifyJob,
    ...overrides,
  });
  return { job, createWorkerJob, createTranscodeJob, createVerifyJob };
}
function oldResult() {
  fs.writeFileSync(path.join(dir, 'general.wav'), 'old audio');
  recordSeparationResult(dir, metadata);
  return fs.readFileSync(path.join(dir, 'manifest.json'));
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uta-output-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('isolated FLAC separation output transaction', () => {
  it.each(['encoder', 'verifier'])(
    'holds cleanup and fallback until an errored %s actually closes',
    async (role) => {
      oldResult();
      let rejectChild, closeChild, created;
      const started = new Promise((r) => (created = r)),
        closed = new Promise((r) => (closeChild = r));
      const child = () => {
        const task = {
          pid: 12345,
          closed,
          result: new Promise((_, r) => (rejectChild = r)),
          cancel: async () => {},
        };
        created();
        return task;
      };
      const { job } = harness(
        role === 'encoder'
          ? { createTranscodeJob: child }
          : { createVerifyJob: child },
      );
      let finished = false;
      const outcome = job.result.then((r) => {
        finished = true;
        return r;
      });
      await started;
      rejectChild(new Error('early child error'));
      for (let i = 0; i < 6; i++) await Promise.resolve();
      expect(finished).toBe(false);
      expect(
        fs.readdirSync(dir).some((n) => n.startsWith('.separation-')),
      ).toBe(true);
      closeChild();
      await expect(outcome).resolves.toMatchObject({
        outputFormat: 'wav',
        fallbackReason: 'flac-unavailable',
      });
    },
  );
  it.each(['encoding', 'verifying'])(
    'owns and closes an already spawned child when the %s journal fails',
    async (phase) => {
      oldResult();
      let rejectChild, closeChild, created;
      const started = new Promise((r) => (created = r)),
        closed = new Promise((r) => (closeChild = r));
      const cancel = vi.fn(async () => {
        rejectChild(new Error('child stopped'));
        return true;
      });
      const child = () => {
        const job = {
          pid: 12345,
          closed,
          result: new Promise((_, r) => (rejectChild = r)),
          cancel,
        };
        created();
        return job;
      };
      const rename = fs.renameSync,
        spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
          if (
            path.basename(to) === 'transaction.json' &&
            JSON.parse(fs.readFileSync(from, 'utf8')).phase === phase
          )
            throw Object.assign(new Error('journal full'), { code: 'ENOSPC' });
          return rename(from, to);
        });
      const { job } = harness(
        phase === 'encoding'
          ? { createTranscodeJob: child }
          : { createVerifyJob: child },
      );
      let failure;
      const outcome = job.result.catch((e) => {
        failure = e;
      });
      try {
        await started;
        for (let i = 0; i < 6; i++) await Promise.resolve();
        expect(cancel).toHaveBeenCalledOnce();
        expect(failure).toBeUndefined();
        expect(
          fs.readdirSync(dir).some((n) => n.startsWith('.separation-')),
        ).toBe(true);
        closeChild();
        await outcome;
        expect(failure?.code).toBe('SEPARATION_JOURNAL_FAILED');
      } finally {
        closeChild();
        spy.mockRestore();
        await outcome;
      }
    },
  );

  it.each(['committed', 'failed'])(
    'does not overwrite the %s outcome when staging cleanup is blocked',
    async (state) => {
      const before = oldResult(),
        remove = fs.rmSync,
        onRecovery = vi.fn();
      const spy = vi
        .spyOn(fs, 'rmSync')
        .mockImplementation((target, options) => {
          if (
            path.dirname(target) === dir &&
            path.basename(target).startsWith('.separation-')
          )
            throw Object.assign(new Error('cleanup locked'), { code: 'EPERM' });
          return remove(target, options);
        });
      try {
        const { job } = harness({
          onRecovery,
          ...(state === 'failed'
            ? {
                createWorkerJob: () => ({
                  result: Promise.reject(new Error('inference failed')),
                  cancel: async () => {},
                }),
              }
            : {}),
        });
        if (state === 'committed') {
          const result = await job.result;
          expect(
            loadSeparationManifest(dir).results.general.artifactFilename,
          ).toBe(result.artifactFilename);
        } else {
          await expect(job.result).rejects.toThrow('inference failed');
          expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(
            before,
          );
        }
        expect(onRecovery).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    },
  );
  it.each(['spawning-encode', 'published'])(
    'handles a journal write failure at %s without invalidating old or committed audio',
    async (phase) => {
      const before = oldResult(),
        rename = fs.renameSync;
      const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        if (
          path.basename(to) === 'transaction.json' &&
          JSON.parse(fs.readFileSync(from, 'utf8')).phase === phase
        )
          throw Object.assign(new Error('journal full'), { code: 'ENOSPC' });
        return rename(from, to);
      });
      try {
        const { job, createTranscodeJob } = harness();
        if (phase === 'published') {
          const r = await job.result;
          expect(r.outputFormat).toBe('flac5');
          expect(
            loadSeparationManifest(dir).results.general.artifactFilename,
          ).toBe(r.artifactFilename);
        } else {
          await expect(job.result).rejects.toThrow(
            'transaction could not be saved',
          );
          expect(createTranscodeJob).not.toHaveBeenCalled();
          expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(
            before,
          );
        }
        expect(fs.readFileSync(path.join(dir, 'general.wav'), 'utf8')).toBe(
          'old audio',
        );
      } finally {
        spy.mockRestore();
      }
    },
  );
  it.each(['refused', 'error'])(
    'keeps worker failure distinct when cancellation is %s',
    async (kind) => {
      const before = oldResult();
      let rejectWorker;
      const { job } = harness({
        createWorkerJob: () => ({
          result: new Promise((_, r) => (rejectWorker = r)),
          cancel: async () => {
            if (kind === 'error') throw new Error('cancel failed');
            return false;
          },
        }),
      });
      const outcome = expect(job.result).rejects.toThrow('worker failed');
      if (kind === 'error')
        await expect(job.cancel()).rejects.toThrow('cancel failed');
      else await expect(job.cancel()).resolves.toBe(false);
      rejectWorker(new Error('worker failed'));
      await outcome;
      expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(before);
      expect(fs.readdirSync(dir).sort()).toEqual([
        'general.wav',
        'manifest.json',
      ]);
    },
  );
  it('records a private fallback cause while keeping the public reason bounded', async () => {
    const onFallback = vi.fn();
    const { job } = harness({
      onFallback,
      createTranscodeJob: () => ({
        result: Promise.reject(new Error('private encoder cause')),
        cancel: async () => {},
      }),
    });
    await expect(job.result).resolves.toMatchObject({
      fallbackReason: 'flac-unavailable',
    });
    expect(onFallback).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'private encoder cause' }),
    );
  });

  it('rejects revoked execution authority immediately before manifest publication', async () => {
    const before = oldResult();
    const { job } = harness({
      assertCurrent: () => {
        if (fs.readdirSync(dir).some((n) => /^general-.*\.flac$/.test(n)))
          throw new Error('gate revoked');
      },
    });
    await expect(job.result).rejects.toThrow('gate revoked');
    expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(before);
    expect(fs.readdirSync(dir).sort()).toEqual([
      'general.wav',
      'manifest.json',
    ]);
  });

  it('rejects wrong worker provenance without invoking the encoder', async () => {
    const before = oldResult(),
      createTranscodeJob = vi.fn();
    const { job } = harness({
      createTranscodeJob,
      createWorkerJob: ({ workerData }) => {
        fs.writeFileSync(path.join(workerData.outputDir, 'general.wav'), wav());
        recordSeparationResult(workerData.outputDir, {
          ...metadata,
          modelIds: ['kara2'],
        });
        return { result: Promise.resolve(), cancel: async () => {} };
      },
    });
    await expect(job.result).rejects.toThrow(/provenance/);
    expect(createTranscodeJob).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(before);
  });
  it('publishes a unique validated artifact without changing old audio', async () => {
    oldResult();
    const h = harness();
    const r = await h.job.result;
    expect(r.outputFormat).toBe('flac5');
    expect(r.artifactFilename).toMatch(/^general-[a-f0-9-]+\.flac$/);
    expect(fs.readFileSync(path.join(dir, 'general.wav'), 'utf8')).toBe(
      'old audio',
    );
    expect(loadSeparationManifest(dir).results.general.artifactFilename).toBe(
      r.artifactFilename,
    );
    expect(h.createTranscodeJob).toHaveBeenCalledOnce();
    expect(h.createVerifyJob).toHaveBeenCalledOnce();
    expect(fs.readdirSync(dir).some((n) => n.startsWith('.separation-'))).toBe(
      false,
    );
  });
  it.each(['encode', 'header', 'pcm'])(
    'falls back to this new WAV on %s failure',
    async (kind) => {
      oldResult();
      const changes =
        kind === 'encode'
          ? {
              createTranscodeJob: () => ({
                result: Promise.reject(new Error('private encoder path')),
                cancel: async () => {},
              }),
            }
          : kind === 'header'
            ? {
                createTranscodeJob: ({ outputPath }) => {
                  fs.writeFileSync(outputPath, flac(2));
                  return { result: Promise.resolve(), cancel: async () => {} };
                },
              }
            : {
                createVerifyJob: () => ({
                  result: Promise.resolve({ sha256: 'wrong', bytes: 16 }),
                  cancel: async () => {},
                }),
              };
      const { job } = harness(changes);
      const r = await job.result;
      expect(r.outputFormat).toBe('wav');
      expect(r.fallbackReason).toBe('flac-unavailable');
      expect(fs.readFileSync(path.join(dir, r.artifactFilename))).toEqual(
        wav(),
      );
      expect(fs.readFileSync(path.join(dir, 'general.wav'), 'utf8')).toBe(
        'old audio',
      );
      expect(fs.readdirSync(dir).filter((n) => n.endsWith('.flac'))).toEqual(
        [],
      );
    },
  );
  it('preserves old manifest and audio on publication failure', async () => {
    const before = oldResult();
    const { job } = harness({
      recordResult: () => {
        throw new Error('save failed');
      },
    });
    await expect(job.result).rejects.toThrow('save failed');
    expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(before);
    expect(fs.readdirSync(dir).sort()).toEqual([
      'general.wav',
      'manifest.json',
    ]);
  });
  it('never converts an obsolete scope into a successful WAV fallback', async () => {
    const before = oldResult();
    let current = true;
    const { job } = harness({
      assertCurrent: () => {
        if (!current) throw new Error('scope changed');
      },
      createTranscodeJob: () => ({
        result: Promise.resolve().then(() => {
          current = false;
          throw new Error('encode failed');
        }),
        cancel: async () => {},
      }),
    });
    await expect(job.result).rejects.toThrow('scope changed');
    expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(before);
  });
  it('waits for a cancelled child before cleaning staging, without fallback', async () => {
    const before = oldResult();
    let rejectChild, releaseCancel, started;
    const start = new Promise((r) => (started = r)),
      cancelDone = new Promise((r) => (releaseCancel = r));
    const { job } = harness({
      createTranscodeJob: () => {
        started();
        return {
          result: new Promise((_, r) => (rejectChild = r)),
          cancel: () => {
            rejectChild(new Error('cancel'));
            return cancelDone;
          },
        };
      },
    });
    const outcome = expect(job.result).rejects.toThrow(/cancelled/);
    await start;
    const cancel = job.cancel();
    await Promise.resolve();
    expect(fs.readdirSync(dir).some((n) => n.startsWith('.separation-'))).toBe(
      true,
    );
    releaseCancel();
    await cancel;
    await outcome;
    expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(before);
    expect(fs.readdirSync(dir).sort()).toEqual([
      'general.wav',
      'manifest.json',
    ]);
  });
  it('fails rather than publishing invalid WAV or worker provenance', async () => {
    const before = oldResult();
    const { job } = harness({
      createWorkerJob: ({ workerData }) => {
        fs.writeFileSync(path.join(workerData.outputDir, 'general.wav'), 'bad');
        recordSeparationResult(workerData.outputDir, metadata);
        return { result: Promise.resolve(), cancel: async () => {} };
      },
    });
    await expect(job.result).rejects.toThrow(/WAV/);
    expect(fs.readFileSync(path.join(dir, 'manifest.json'))).toEqual(before);
  });
});

describe('streaming separation PCM verification child', () => {
  function start(pid) {
    const child = new EventEmitter();
    if (pid !== undefined) child.pid = pid;
    child.stdout = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn(() => child);
    const job = createSeparationPcmVerifyJob({
      ffmpegPath: path.resolve('ffmpeg.exe'),
      inputPath: path.resolve('candidate.flac'),
      spawnImpl,
    });
    return { child, spawnImpl, job };
  }
  it('hashes the complete stream without resampling, downmix or shell', async () => {
    const { child, spawnImpl, job } = start();
    child.stdout.write(Buffer.from([1, 2]));
    child.stdout.write(Buffer.from([3, 4]));
    child.emit('close', 0);
    await expect(job.result).resolves.toEqual({
      bytes: 4,
      sha256: digest(Buffer.from([1, 2, 3, 4])),
    });
    const args = spawnImpl.mock.calls[0][1];
    expect(args).not.toContain('-ac');
    expect(args).not.toContain('-ar');
    expect(spawnImpl.mock.calls[0][2]).toMatchObject({
      shell: false,
      windowsHide: true,
    });
  });
  it('keeps cancellation pending until the child closes', async () => {
    const { child, job } = start(),
      outcome = expect(job.result).rejects.toThrow(/cancelled/);
    let ended = false;
    const cancellation = job.cancel().then(() => {
      ended = true;
    });
    await Promise.resolve();
    expect(ended).toBe(false);
    child.emit('close', 0);
    await cancellation;
    await outcome;
  });
  it('rejects decoder failure without exposing child data', async () => {
    const { child, job } = start();
    child.emit('close', 1);
    await expect(job.result).rejects.toThrow(
      'separation PCM verification failed',
    );
  });
  it('does not treat an error with a PID as process closure', async () => {
    const { child, job } = start(12345),
      failure = expect(job.result).rejects.toThrow('verification failed');
    child.emit('error', new Error('EPERM'));
    let ended = false;
    const cancellation = job.cancel().then(() => {
      ended = true;
    });
    await Promise.resolve();
    expect(ended).toBe(false);
    child.emit('close', 1);
    await cancellation;
    await failure;
  });
});

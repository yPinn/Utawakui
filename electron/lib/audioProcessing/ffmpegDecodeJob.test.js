import { EventEmitter } from 'events';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { createFfmpegDecodeJob } from './ffmpegDecodeJob.js';

function childProcess() {
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe('createFfmpegDecodeJob', () => {
  it('uses the fixed stereo PCM analysis profile without a shell', async () => {
    const child = childProcess();
    const spawnImpl = vi.fn(() => child);
    const ffmpegPath = path.resolve('ffmpeg.exe');
    const inputPath = path.resolve('source.webm');
    const outputPath = path.resolve('input.wav');
    const progress = vi.fn();
    const job = createFfmpegDecodeJob({
      ffmpegPath,
      inputPath,
      outputPath,
      emitProgress: progress,
      spawnImpl,
    });

    child.emit('close', 0, null);
    await expect(job.result).resolves.toBe(outputPath);
    expect(spawnImpl).toHaveBeenCalledWith(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-sn',
        '-dn',
        '-ac',
        '2',
        '-ar',
        '44100',
        '-c:a',
        'pcm_s16le',
        outputPath,
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    );
    expect(progress).toHaveBeenCalledWith({ stage: 'decoding', percent: 0 });
  });

  it('normalizes failure and cancellation without exposing stderr', async () => {
    const failedChild = childProcess();
    const failed = createFfmpegDecodeJob({
      ffmpegPath: path.resolve('ffmpeg.exe'),
      inputPath: path.resolve('source.webm'),
      outputPath: path.resolve('input.wav'),
      spawnImpl: () => failedChild,
    });
    failedChild.stderr.emit('data', 'C:\\private\\source.webm decode failed');
    failedChild.emit('close', 1, null);
    await expect(failed.result).rejects.toThrow('analysis audio decode failed');

    const cancelledChild = childProcess();
    const cancelled = createFfmpegDecodeJob({
      ffmpegPath: path.resolve('ffmpeg.exe'),
      inputPath: path.resolve('source.webm'),
      outputPath: path.resolve('input.wav'),
      spawnImpl: () => cancelledChild,
    });
    const cancellation = cancelled.cancel();
    expect(cancelledChild.kill).toHaveBeenCalledOnce();
    cancelledChild.emit('close', null, 'SIGTERM');
    await cancellation;
    await expect(cancelled.result).rejects.toThrow(
      'audio-processing job cancelled',
    );
  });

  it('rejects non-absolute executable, input, or output paths', () => {
    for (const values of [
      {
        ffmpegPath: 'ffmpeg',
        inputPath: path.resolve('in'),
        outputPath: path.resolve('out'),
      },
      {
        ffmpegPath: path.resolve('ffmpeg'),
        inputPath: 'in',
        outputPath: path.resolve('out'),
      },
      {
        ffmpegPath: path.resolve('ffmpeg'),
        inputPath: path.resolve('in'),
        outputPath: 'out',
      },
    ]) {
      expect(() =>
        createFfmpegDecodeJob({ ...values, spawnImpl: vi.fn() }),
      ).toThrow(/absolute/i);
    }
  });
});

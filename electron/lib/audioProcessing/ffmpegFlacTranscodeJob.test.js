import { EventEmitter } from 'events';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { createFfmpegFlacTranscodeJob } from './ffmpegFlacTranscodeJob.js';

function absolute(name) {
  return path.resolve('C:\\utawakui-test', name);
}

function childProcessDouble() {
  const child = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe('createFfmpegFlacTranscodeJob', () => {
  it('spawns one fixed lossless audio-only FLAC recipe without a shell', async () => {
    const child = childProcessDouble();
    const spawnImpl = vi.fn(() => child);
    const outputPath = absolute('output.flac');
    const job = createFfmpegFlacTranscodeJob({
      ffmpegPath: absolute('ffmpeg.exe'),
      inputPath: absolute('input.wma'),
      outputPath,
      spawnImpl,
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      absolute('ffmpeg.exe'),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        absolute('input.wma'),
        '-map',
        '0:a:0',
        '-vn',
        '-sn',
        '-dn',
        '-map_metadata',
        '0',
        '-c:a',
        'flac',
        '-compression_level',
        '5',
        outputPath,
      ],
      {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      },
    );
    child.emit('close', 0);
    await expect(job.result).resolves.toBe(outputPath);
  });

  it('rejects non-absolute executable, input, or output paths', () => {
    for (const values of [
      {
        ffmpegPath: 'ffmpeg.exe',
        inputPath: absolute('input.wma'),
        outputPath: absolute('output.flac'),
      },
      {
        ffmpegPath: absolute('ffmpeg.exe'),
        inputPath: 'input.wma',
        outputPath: absolute('output.flac'),
      },
      {
        ffmpegPath: absolute('ffmpeg.exe'),
        inputPath: absolute('input.wma'),
        outputPath: 'output.flac',
      },
    ]) {
      expect(() =>
        createFfmpegFlacTranscodeJob({ ...values, spawnImpl: vi.fn() }),
      ).toThrow('compatibility conversion paths must be absolute');
    }
  });

  it('returns a bounded failure without stderr or command details', async () => {
    const child = childProcessDouble();
    const job = createFfmpegFlacTranscodeJob({
      ffmpegPath: absolute('ffmpeg.exe'),
      inputPath: absolute('private.wma'),
      outputPath: absolute('output.flac'),
      spawnImpl: vi.fn(() => child),
    });

    child.emit('close', 1);
    await expect(job.result).rejects.toThrow(
      'local audio compatibility conversion failed',
    );
    await expect(job.result).rejects.not.toThrow('private.wma');
  });

  it('normalizes process errors without exposing the private source path', async () => {
    const child = childProcessDouble();
    const job = createFfmpegFlacTranscodeJob({
      ffmpegPath: absolute('ffmpeg.exe'),
      inputPath: absolute('private-input.wma'),
      outputPath: absolute('output.flac'),
      spawnImpl: vi.fn(() => child),
    });

    child.emit('error', new Error('private-input.wma could not be opened'));
    await expect(job.result).rejects.toThrow(
      'local audio compatibility conversion failed',
    );
    await expect(job.result).rejects.not.toThrow('private-input.wma');
  });

  it('kills and settles a cancelled conversion with a bounded error', async () => {
    const child = childProcessDouble();
    const job = createFfmpegFlacTranscodeJob({
      ffmpegPath: absolute('ffmpeg.exe'),
      inputPath: absolute('input.wma'),
      outputPath: absolute('output.flac'),
      spawnImpl: vi.fn(() => child),
    });

    const cancellation = job.cancel();
    expect(child.kill).toHaveBeenCalledOnce();
    child.emit('close', null);
    await cancellation;
    await expect(job.result).rejects.toThrow(
      'local audio compatibility conversion cancelled',
    );
    await expect(job.cancel()).resolves.toBeUndefined();
  });

  it('settles cancellation when killing the child process throws', async () => {
    const child = childProcessDouble();
    child.kill.mockImplementation(() => {
      throw new Error('kill failed');
    });
    const job = createFfmpegFlacTranscodeJob({
      ffmpegPath: absolute('ffmpeg.exe'),
      inputPath: absolute('input.wma'),
      outputPath: absolute('output.flac'),
      spawnImpl: vi.fn(() => child),
    });

    await job.cancel();
    await expect(job.result).rejects.toThrow(
      'local audio compatibility conversion cancelled',
    );
  });
});

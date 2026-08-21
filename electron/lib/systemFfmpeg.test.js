import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { detectSystemFfmpeg, parseFfmpegVersion } from './systemFfmpeg.js';

const EXPECTED_SMOKE_TEST_BYTES = 4410 * 2 * 4; // frames * channels * f32le

function isWhereCall(args) {
  return args.length === 1 && args[0] === 'ffmpeg';
}

function isVersionCall(args) {
  return args.includes('-version');
}

function isDecodeCall(args) {
  return args.includes('-f') && args.includes('f32le');
}

// Mirrors featureDependencies.test.js's EventEmitter-based fake process —
// keyed off args (not the resolved command string) since resolveWhereExePath
// may return a real absolute path on a Windows test runner.
function makeSpawnImpl({ whereOutput, whereCode = 0, version, decodeBytes }) {
  return vi.fn((command, args) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (isWhereCall(args)) {
        if (whereOutput) proc.stdout.emit('data', Buffer.from(whereOutput));
        proc.emit('close', whereCode);
        return;
      }
      if (isVersionCall(args)) {
        if (version) {
          proc.stdout.emit('data', Buffer.from(`ffmpeg version ${version}\n`));
        }
        proc.emit('close', version ? 0 : 1);
        return;
      }
      if (isDecodeCall(args)) {
        if (decodeBytes != null) {
          proc.stdout.emit('data', Buffer.alloc(decodeBytes));
        }
        proc.emit('close', decodeBytes != null ? 0 : 1);
        return;
      }
      proc.emit('close', 1);
    });
    return proc;
  });
}

describe('parseFfmpegVersion', () => {
  it('parses a Gyan essentials-style version string', () => {
    expect(
      parseFfmpegVersion(
        'ffmpeg version 7.1-full_build-www.gyan.dev Copyright (c) 2000-2024',
      ),
    ).toBe('7.1-full_build-www.gyan.dev');
  });

  it('parses an upstream nightly-style version string', () => {
    expect(
      parseFfmpegVersion('ffmpeg version n6.1.1-3-g1234abcd Copyright...'),
    ).toBe('n6.1.1-3-g1234abcd');
  });

  it('returns null when the output does not contain a version line', () => {
    expect(parseFfmpegVersion('command not found')).toBe(null);
  });
});

describe('detectSystemFfmpeg', () => {
  it('reports unavailable when where.exe finds nothing', async () => {
    const spawnImpl = makeSpawnImpl({ whereCode: 1 });

    const result = await detectSystemFfmpeg({
      allowNonWindows: true,
      spawnImpl,
    });

    expect(result).toEqual({
      available: false,
      path: null,
      version: null,
      ok: false,
      reason: '在系統 PATH 中找不到 FFmpeg',
    });
  });

  it('reports unavailable when the version string cannot be parsed', async () => {
    const spawnImpl = makeSpawnImpl({
      whereOutput: 'C:\\ffmpeg\\bin\\ffmpeg.exe\r\n',
    });

    const result = await detectSystemFfmpeg({
      allowNonWindows: true,
      spawnImpl,
    });

    expect(result.available).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.version).toBe(null);
  });

  it('fails the smoke test when decoded output length does not match', async () => {
    const spawnImpl = makeSpawnImpl({
      whereOutput: 'C:\\ffmpeg\\bin\\ffmpeg.exe\r\n',
      version: '7.1-full_build-www.gyan.dev',
      decodeBytes: EXPECTED_SMOKE_TEST_BYTES - 4,
    });

    const result = await detectSystemFfmpeg({
      allowNonWindows: true,
      spawnImpl,
    });

    expect(result.available).toBe(true);
    expect(result.version).toBe('7.1-full_build-www.gyan.dev');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/解碼測試輸出長度不符/);
  });

  it('returns path, version, and ok:true on the happy path', async () => {
    const spawnImpl = makeSpawnImpl({
      whereOutput: 'C:\\ffmpeg\\bin\\ffmpeg.exe\r\n',
      version: '7.1-full_build-www.gyan.dev',
      decodeBytes: EXPECTED_SMOKE_TEST_BYTES,
    });

    const result = await detectSystemFfmpeg({
      allowNonWindows: true,
      spawnImpl,
    });

    expect(result).toEqual({
      available: true,
      path: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
      version: '7.1-full_build-www.gyan.dev',
      ok: true,
      reason: null,
    });
  });

  it('cleans up the smoke test temp file after running', async () => {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-system-ffmpeg-test-'),
    );
    let capturedWavPath = null;
    const spawnImpl = vi.fn((command, args) => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      queueMicrotask(() => {
        if (isWhereCall(args)) {
          proc.stdout.emit(
            'data',
            Buffer.from('C:\\ffmpeg\\bin\\ffmpeg.exe\r\n'),
          );
          proc.emit('close', 0);
          return;
        }
        if (isVersionCall(args)) {
          proc.stdout.emit(
            'data',
            Buffer.from('ffmpeg version 7.1-full_build-www.gyan.dev\n'),
          );
          proc.emit('close', 0);
          return;
        }
        if (isDecodeCall(args)) {
          capturedWavPath = args[args.indexOf('-i') + 1];
          expect(fs.existsSync(capturedWavPath)).toBe(true);
          proc.stdout.emit('data', Buffer.alloc(EXPECTED_SMOKE_TEST_BYTES));
          proc.emit('close', 0);
          return;
        }
        proc.emit('close', 1);
      });
      return proc;
    });

    try {
      await detectSystemFfmpeg({
        allowNonWindows: true,
        spawnImpl,
        tmpDir,
      });
      expect(capturedWavPath).not.toBe(null);
      expect(fs.existsSync(capturedWavPath)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

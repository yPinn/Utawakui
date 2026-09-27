'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Kept in exact lockstep with vocalSeparation.js's decodeAudio() — the smoke
// test below only means something if it exercises the identical decode path
// vocal separation actually uses, not a generic "does ffmpeg run" probe.
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const SMOKE_TEST_FRAMES = 4410; // 0.1s at SAMPLE_RATE
const DEFAULT_PROCESS_TIMEOUT_MS = 15_000;

function resolveWhereExePath() {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const wherePath = path.join(systemRoot, 'System32', 'where.exe');
  return fs.existsSync(wherePath) ? wherePath : 'where';
}

function runProcess(
  spawnImpl,
  command,
  args,
  timeoutMs = DEFAULT_PROCESS_TIMEOUT_MS,
) {
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawnImpl(command, args);
    } catch (err) {
      resolve({ ok: false, stdout: Buffer.alloc(0), stderr: String(err) });
      return;
    }
    const chunks = [];
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        proc.kill();
      } catch {
        // The timeout status remains authoritative.
      }
      resolve({
        ok: false,
        stdout: Buffer.alloc(0),
        stderr: 'process timed out',
      });
    }, timeoutMs);
    timer.unref?.();

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    proc.stdout?.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    proc.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    proc.on('error', (err) => {
      finish({ ok: false, stdout: Buffer.alloc(0), stderr: String(err) });
    });
    proc.on('close', (code) => {
      finish({ ok: code === 0, stdout: Buffer.concat(chunks), stderr });
    });
  });
}

// `where.exe` can print multiple matches (e.g. a .exe and a shadowing
// .bat/.cmd shim); the first line is the one Windows would actually launch.
async function resolveSystemFfmpegPath(options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const result = await runProcess(
    spawnImpl,
    resolveWhereExePath(),
    ['ffmpeg'],
    options.processTimeoutMs,
  );
  if (!result.ok) return null;
  const firstLine = result.stdout
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine || null;
}

function parseFfmpegVersion(versionOutput) {
  const match = String(versionOutput).match(/ffmpeg version (\S+)/i);
  return match ? match[1] : null;
}

async function getFfmpegVersion(ffmpegPath, options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const result = await runProcess(
    spawnImpl,
    ffmpegPath,
    ['-version'],
    options.processTimeoutMs,
  );
  if (!result.ok) return null;
  return parseFfmpegVersion(result.stdout.toString('utf8'));
}

// A short, deterministic (non-silent, so a build that drops non-zero
// samples can't accidentally pass) 44.1kHz stereo s16 WAV — the smoke test
// decodes this rather than trusting `-version` alone, since a version
// string only proves "this is ffmpeg," not "this build's decode path
// actually works" (a stripped-down or broken build can still print one).
function buildSmokeTestWav() {
  const bytesPerSample = 2;
  const dataSize = SMOKE_TEST_FRAMES * CHANNELS * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
  buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < SMOKE_TEST_FRAMES; i++) {
    const sample = Math.round(
      Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 8000,
    );
    const offset = 44 + i * CHANNELS * bytesPerSample;
    buffer.writeInt16LE(sample, offset);
    buffer.writeInt16LE(sample, offset + bytesPerSample);
  }
  return buffer;
}

async function runSmokeTestDecode(ffmpegPath, options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const tmpDir = options.tmpDir || os.tmpdir();
  const wavPath = path.join(
    tmpDir,
    `utawakui-ffmpeg-check-${process.pid}-${Date.now()}.wav`,
  );
  fs.writeFileSync(wavPath, buildSmokeTestWav());
  try {
    const args = [
      '-y',
      '-i',
      wavPath,
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-f',
      'f32le',
      '-',
    ];
    const result = await runProcess(
      spawnImpl,
      ffmpegPath,
      args,
      options.processTimeoutMs,
    );
    if (!result.ok) {
      return { ok: false, reason: 'FFmpeg 解碼測試失敗' };
    }
    const expectedBytes = SMOKE_TEST_FRAMES * CHANNELS * 4; // f32le
    if (result.stdout.length !== expectedBytes) {
      return {
        ok: false,
        reason: `FFmpeg 解碼測試輸出長度不符(預期 ${expectedBytes} bytes,實際 ${result.stdout.length} bytes)`,
      };
    }
    return { ok: true };
  } finally {
    fs.rmSync(wavPath, { force: true });
  }
}

// Detects a usable system-installed FFmpeg on PATH. Read-only and
// side-effect-free (aside from the smoke test's own temp WAV, cleaned up
// before returning) — safe to call speculatively from the renderer without
// a feature gate.
async function detectSystemFfmpeg(options = {}) {
  if (process.platform !== 'win32' && !options.allowNonWindows) {
    return {
      available: false,
      path: null,
      version: null,
      ok: false,
      reason: '系統 FFmpeg 偵測目前僅支援 Windows',
    };
  }

  const ffmpegPath = await resolveSystemFfmpegPath(options);
  if (!ffmpegPath) {
    return {
      available: false,
      path: null,
      version: null,
      ok: false,
      reason: '在系統 PATH 中找不到 FFmpeg',
    };
  }

  const version = await getFfmpegVersion(ffmpegPath, options);
  if (!version) {
    return {
      available: true,
      path: ffmpegPath,
      version: null,
      ok: false,
      reason: '無法讀取 FFmpeg 版本資訊',
    };
  }

  const smokeTest = await runSmokeTestDecode(ffmpegPath, options);
  if (!smokeTest.ok) {
    return {
      available: true,
      path: ffmpegPath,
      version,
      ok: false,
      reason: smokeTest.reason,
    };
  }

  return { available: true, path: ffmpegPath, version, ok: true, reason: null };
}

module.exports = {
  detectSystemFfmpeg,
  parseFfmpegVersion,
};

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
function runProbe(
  exe,
  args,
  {
    signal,
    timeoutMs = 60000,
    input = '',
    nodeMode = false,
    spawnImpl = spawn,
    onSpawn = () => {},
  } = {},
) {
  return new Promise((resolve, reject) => {
    try {
      signal?.throwIfAborted();
    } catch (error) {
      reject(error);
      return;
    }
    const allowed = new Set([
      'SYSTEMROOT',
      'WINDIR',
      'TEMP',
      'TMP',
      'PATH',
      'PATHEXT',
    ]);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) =>
        allowed.has(name.toUpperCase()),
      ),
    );
    Object.assign(env, {
      OPENBLAS_NUM_THREADS: '1',
      OMP_NUM_THREADS: '1',
      MKL_NUM_THREADS: '1',
    });
    if (nodeMode) env.ELECTRON_RUN_AS_NODE = '1';
    const proc = spawnImpl(exe, args, {
      env,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      onSpawn(proc.pid);
    } catch {
      /* Instrumentation cannot break process cleanup. */
    }
    let stdout = '',
      stderr = 0,
      error = null,
      forceTimer;
    const stop = (reason) => {
      error ??= reason;
      proc.kill();
      forceTimer ??= setTimeout(() => proc.kill('SIGKILL'), 250);
      forceTimer.unref?.();
    };
    const abort = () =>
      stop(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(
      () => stop(Error('lyrics environment probe deadline')),
      timeoutMs,
    );
    timer.unref?.();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    proc.stdout.on('data', (chunk) => {
      if (Buffer.byteLength(stdout) + chunk.length > 8192)
        stop(Error('lyrics environment probe output budget'));
      else stdout += chunk;
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.length;
      if (stderr > 8192)
        stop(Error('lyrics environment probe diagnostic budget'));
    });
    proc.on('error', (failure) => {
      error ??= failure;
    });
    proc.stdin.on('error', () => {});
    proc.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      signal?.removeEventListener('abort', abort);
      if (error) {
        reject(error);
        return;
      }
      try {
        const value = JSON.parse(stdout);
        if (code !== 0 || value.ready !== true)
          throw Error('lyrics environment load failed');
        resolve(value);
      } catch {
        reject(Error('lyrics environment load failed'));
      }
    });
    if (Buffer.byteLength(input) > 32768)
      stop(Error('lyrics environment probe input budget'));
    else proc.stdin.end(input);
  });
}
async function probeLyricsEnvironment({
  runtime,
  environment,
  model,
  catalog,
  signal,
  workspace,
  pythonProbePath,
  onSpawn,
}) {
  fs.mkdirSync(workspace, { recursive: true });
  await runProbe(
    path.join(runtime, 'python.exe'),
    ['-I', '-B', pythonProbePath],
    {
      signal,
      input: JSON.stringify({
        environment,
        workspace,
        pythonVersion: catalog.runtime.pythonVersion,
        packages: Object.fromEntries(
          catalog.environment.packages.map((p) => [p.name, p.version]),
        ),
      }),
      onSpawn,
    },
  );
  await runProbe(
    process.execPath,
    [__filename, '--node', path.join(model, 'model.onnx')],
    { signal, nodeMode: true, onSpawn },
  );
  return { ready: true };
}
async function nodeProbe(modelPath) {
  const ort = require('onnxruntime-node');
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    intraOpNumThreads: 4,
    interOpNumThreads: 1,
  });
  try {
    const output = await session.run({
      waveform: new ort.Tensor('float32', new Float32Array(88200), [1, 88200]),
    });
    const frame = output.ph_frame_logits,
      edge = output.ph_edge_logits;
    if (
      frame?.dims?.[0] !== 1 ||
      frame?.dims?.[1] !== 144 ||
      edge?.dims?.[0] !== 1 ||
      edge?.dims?.[1] !== frame.dims[2] ||
      !frame.data.every(Number.isFinite) ||
      !edge.data.every(Number.isFinite)
    )
      throw Error('lyrics model probe shape');
    process.stdout.write(JSON.stringify({ ready: true }));
  } finally {
    await session.release();
  }
}
if (require.main === module) {
  if (process.argv[2] !== '--node' || !path.isAbsolute(process.argv[3] ?? ''))
    process.exitCode = 1;
  else
    nodeProbe(process.argv[3]).catch(() => {
      process.exitCode = 1;
    });
}
module.exports = { runProbe, probeLyricsEnvironment };

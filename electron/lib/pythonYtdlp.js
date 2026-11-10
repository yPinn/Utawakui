'use strict';

const { spawn } = require('child_process');

const DEFAULT_YTDLP_IDLE_TIMEOUT_MS = 120_000;

const OPTION_FLAGS = Object.freeze([
  ['dumpSingleJson', '--dump-single-json', 'boolean'],
  ['skipDownload', '--skip-download', 'boolean'],
  ['noPlaylist', '--no-playlist', 'boolean'],
  ['quiet', '--quiet', 'boolean'],
  ['noWarnings', '--no-warnings', 'boolean'],
  ['newline', '--newline', 'boolean'],
  ['progressTemplate', '--progress-template', 'value'],
  ['noContinue', '--no-continue', 'boolean'],
  ['maxFilesize', '--max-filesize', 'value'],
  ['flatPlaylist', '--flat-playlist', 'boolean'],
  ['playlistEnd', '--playlist-end', 'value'],
  ['output', '--output', 'value'],
  ['format', '--format', 'value'],
  ['extractorArgs', '--extractor-args', 'value'],
  ['jsRuntimes', '--js-runtimes', 'value'],
  ['remoteComponents', '--remote-components', 'value'],
  ['pluginDirs', '--plugin-dirs', 'value'],
  ['cacheDir', '--cache-dir', 'value'],
  ['writeInfoJson', '--write-info-json', 'boolean'],
  ['writeThumbnail', '--write-thumbnail', 'boolean'],
  ['writeSubs', '--write-subs', 'boolean'],
  ['writeAutoSubs', '--write-auto-subs', 'boolean'],
  ['subLangs', '--sub-langs', 'value'],
  ['subFormat', '--sub-format', 'value'],
  ['cookiesFromBrowser', '--cookies-from-browser', 'value'],
  ['cookies', '--cookies', 'value'],
  ['impersonate', '--impersonate', 'value'],
]);

const SUPPORTED_OPTIONS = new Set([...OPTION_FLAGS.map(([key]) => key)]);

function assertSupportedOptions(options) {
  for (const key of Object.keys(options || {})) {
    if (!SUPPORTED_OPTIONS.has(key)) {
      throw new Error(`unsupported yt-dlp option: ${key}`);
    }
  }
}

function pushBooleanFlag(args, flag, value) {
  if (value === true) args.push(flag);
}

function pushValueFlag(args, flag, value) {
  if (value === undefined || value === null || value === false) return;
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (item !== undefined && item !== null && item !== false) {
      args.push(flag, String(item));
    }
  }
}

function buildPythonYtdlpArgs(url, options = {}) {
  assertSupportedOptions(options);

  const args = ['-m', 'yt_dlp'];
  for (const [key, flag, type] of OPTION_FLAGS) {
    if (type === 'boolean') {
      pushBooleanFlag(args, flag, options[key]);
    } else {
      pushValueFlag(args, flag, options[key]);
    }
  }
  // `--` ends option parsing so the positional target (a main-built URL or
  // `ytsearch:` query) can never be read as a flag, even if a future caller
  // passes a value that begins with `-`.
  args.push('--', url);
  return args;
}

function mergeExtractorArgs(existing, additional) {
  const values = [
    ...(Array.isArray(existing) ? existing : [existing]),
    additional,
  ].filter(Boolean);
  if (values.length <= 1) return values[0];
  return values;
}

function buildRuntimeOptions(options, runtime) {
  const jsRuntimes =
    runtime.nodeRuntime &&
    (!options.jsRuntimes || options.jsRuntimes === 'node')
      ? `node:${runtime.nodeRuntime}`
      : options.jsRuntimes;

  return {
    ...options,
    ...(runtime.pluginDirs && !options.pluginDirs
      ? { pluginDirs: runtime.pluginDirs }
      : {}),
    ...(runtime.cacheDir && !options.cacheDir
      ? { cacheDir: runtime.cacheDir }
      : {}),
    ...(jsRuntimes ? { jsRuntimes } : {}),
    ...(runtime.remoteComponents && !options.remoteComponents
      ? { remoteComponents: runtime.remoteComponents }
      : {}),
    extractorArgs: mergeExtractorArgs(
      options.extractorArgs,
      runtime.providerBaseUrl
        ? `youtubepot-bgutilhttp:base_url=${runtime.providerBaseUrl}`
        : null,
    ),
  };
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function createYtdlpError(code, stdout, stderr) {
  const message = stderr.trim() || stdout.trim() || `yt-dlp exited ${code}`;
  const error = new Error(message);
  error.code = code;
  error.stdout = stdout;
  error.stderr = stderr;
  return error;
}

function providerCancellationError() {
  return Object.assign(new Error('provider operation cancelled'), {
    code: 'IMPORT_DOWNLOAD_CANCELLED',
    name: 'AbortError',
  });
}

function createPythonYtdlpRunner(runtime) {
  const spawnImpl = runtime.spawnImpl || spawn;
  const pythonPath = runtime.pythonPath || 'python';
  const remoteComponents = runtime.remoteComponents || 'ejs:github';
  const idleTimeoutMs =
    Number.isSafeInteger(runtime.idleTimeoutMs) && runtime.idleTimeoutMs > 0
      ? runtime.idleTimeoutMs
      : DEFAULT_YTDLP_IDLE_TIMEOUT_MS;

  return function runPythonYtdlp(url, options = {}, execution = {}) {
    return new Promise((resolve, reject) => {
      const signal = execution?.signal;
      if (signal?.aborted) {
        reject(providerCancellationError());
        return;
      }
      const mergedOptions = buildRuntimeOptions(options, {
        ...runtime,
        remoteComponents,
      });
      const args = buildPythonYtdlpArgs(url, mergedOptions);
      const child = spawnImpl(pythonPath, args, {
        windowsHide: true,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          PYTHONNOUSERSITE: '1',
          ...(runtime.env || {}),
        },
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let idleTimer = null;
      let abortListener = null;
      let interrupted = null;
      let stdoutLine = '';

      function clearIdleTimer() {
        clearTimeout(idleTimer);
        idleTimer = null;
      }

      function stopChild() {
        try {
          child.kill();
        } catch {
          // The process may already have exited before close is delivered.
        }
      }

      function armIdleTimer() {
        clearIdleTimer();
        idleTimer = setTimeout(() => {
          if (settled) return;
          const error = Object.assign(
            new Error('yt-dlp process stopped making progress'),
            { code: 'YTDLP_PROCESS_TIMEOUT', name: 'TimeoutError' },
          );
          if (execution.waitForExitOnAbort) {
            interrupted = error;
            stopChild();
            return;
          }
          if (finish(() => reject(error))) stopChild();
        }, idleTimeoutMs);
        idleTimer.unref?.();
      }

      function finish(callback) {
        if (settled) return false;
        settled = true;
        clearIdleTimer();
        if (signal && abortListener) {
          signal.removeEventListener('abort', abortListener);
          abortListener = null;
        }
        callback();
        return true;
      }

      abortListener = () => {
        if (execution.waitForExitOnAbort && !settled) {
          interrupted ||= providerCancellationError();
          clearIdleTimer();
          stopChild();
          return;
        }
        if (finish(() => reject(providerCancellationError()))) stopChild();
      };

      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
        if (!interrupted) armIdleTimer();
        if (execution.onStdoutLine) {
          const lines = (stdoutLine + chunk).split(/\r?\n/u);
          stdoutLine = lines.pop();
          for (const line of lines) execution.onStdoutLine(line);
        }
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
        if (!interrupted) armIdleTimer();
      });
      child.on('error', (error) => finish(() => reject(error)));
      child.on('close', (code) => {
        finish(() => {
          if (interrupted) {
            reject(interrupted);
            return;
          }
          if (code !== 0) {
            reject(createYtdlpError(code, stdout, stderr));
            return;
          }
          try {
            resolve(options.dumpSingleJson ? parseJsonOutput(stdout) : stdout);
          } catch (err) {
            err.stdout = stdout;
            err.stderr = stderr;
            reject(err);
          }
        });
      });
      signal?.addEventListener('abort', abortListener, { once: true });
      armIdleTimer();
    });
  };
}

module.exports = {
  buildPythonYtdlpArgs,
  createPythonYtdlpRunner,
};

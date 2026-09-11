'use strict';

const { spawn } = require('child_process');

const OPTION_FLAGS = Object.freeze([
  ['dumpSingleJson', '--dump-single-json', 'boolean'],
  ['skipDownload', '--skip-download', 'boolean'],
  ['noPlaylist', '--no-playlist', 'boolean'],
  ['quiet', '--quiet', 'boolean'],
  ['noWarnings', '--no-warnings', 'boolean'],
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

function createPythonYtdlpRunner(runtime) {
  const spawnImpl = runtime.spawnImpl || spawn;
  const pythonPath = runtime.pythonPath || 'python';
  const remoteComponents = runtime.remoteComponents || 'ejs:github';

  return function runPythonYtdlp(url, options = {}) {
    return new Promise((resolve, reject) => {
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
      child.stdout?.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => {
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
  };
}

module.exports = {
  buildPythonYtdlpArgs,
  createPythonYtdlpRunner,
};

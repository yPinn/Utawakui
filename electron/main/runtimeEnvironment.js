'use strict';

const path = require('node:path');

// This product intentionally ships as electron.exe (ADR 0002). Electron 43
// therefore leaves app.isPackaged false even when the executable loads the
// builder-owned resources/app.asar. Detect the concrete artifact layout we
// own instead of delegating product behavior to that Electron heuristic.
function detectPackagedRuntime({ appPath, resourcesPath } = {}) {
  if (
    typeof appPath !== 'string' ||
    !path.isAbsolute(appPath) ||
    typeof resourcesPath !== 'string' ||
    !path.isAbsolute(resourcesPath)
  ) {
    return false;
  }
  const expectedAppPath = path.join(resourcesPath, 'app.asar');
  return path.relative(expectedAppPath, appPath) === '';
}

// electron-updater independently gates checks on Electron's app.isPackaged.
// Our retained electron.exe filename makes that heuristic false in a real
// builder artifact, so opt into its development-config escape hatch only for
// the exact mismatch that detectPackagedRuntime() has already authenticated.
// Pinning the path to the builder-owned production config prevents source or
// ordinary development launches from contacting the public release feed.
function resolvePackagedUpdateConfigPath({
  isPackagedRuntime,
  isElectronPackaged,
  resourcesPath,
} = {}) {
  if (
    !isPackagedRuntime ||
    isElectronPackaged ||
    typeof resourcesPath !== 'string' ||
    !path.isAbsolute(resourcesPath)
  ) {
    return null;
  }
  return path.join(resourcesPath, 'app-update.yml');
}

// A packaged install must not be switchable onto the dev-server renderer,
// which would hand the full preload bridge to whatever serves localhost.
function readDeveloperOptions(argv = [], { isPackagedRuntime = false } = {}) {
  const values = Array.isArray(argv) ? argv : [];
  const isDev = !isPackagedRuntime && values.includes('--dev');
  return {
    isDev,
    openDevTools: isDev && values.includes('--devtools'),
  };
}

// Development-only overrides: feedback relay target and the executable yt-dlp
// runs as its JavaScript runtime.
const DEVELOPMENT_ENV_OVERRIDES = Object.freeze([
  'UTAWAKUI_FEEDBACK_ENDPOINT',
  'UTAWAKUI_YTDLP_JS_RUNTIME',
]);
// Chromium honors these in packaged builds; CDP would bypass every IPC check.
const REMOTE_DEBUGGING_SWITCHES = Object.freeze([
  'remote-debugging-port',
  'remote-debugging-pipe',
]);

// Strips development overrides from env (so child processes never inherit
// them) and reports a remote-debugging switch the caller must refuse.
function applyPackagedRuntimeRestrictions({
  isPackagedRuntime,
  commandLine,
  env = process.env,
}) {
  if (!isPackagedRuntime) return { allowed: true };
  for (const name of DEVELOPMENT_ENV_OVERRIDES) delete env[name];
  const debuggingSwitch = REMOTE_DEBUGGING_SWITCHES.find((name) =>
    commandLine?.hasSwitch?.(name),
  );
  return debuggingSwitch
    ? { allowed: false, refusedSwitch: debuggingSwitch }
    : { allowed: true };
}

module.exports = {
  DEVELOPMENT_ENV_OVERRIDES,
  applyPackagedRuntimeRestrictions,
  detectPackagedRuntime,
  readDeveloperOptions,
  resolvePackagedUpdateConfigPath,
};

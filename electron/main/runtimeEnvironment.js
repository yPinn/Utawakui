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

function readDeveloperOptions(argv = []) {
  const values = Array.isArray(argv) ? argv : [];
  const isDev = values.includes('--dev');
  return {
    isDev,
    openDevTools: isDev && values.includes('--devtools'),
  };
}

module.exports = {
  detectPackagedRuntime,
  readDeveloperOptions,
  resolvePackagedUpdateConfigPath,
};

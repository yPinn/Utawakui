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

function readDeveloperOptions(argv = []) {
  const values = Array.isArray(argv) ? argv : [];
  const isDev = values.includes('--dev');
  return {
    isDev,
    openDevTools: isDev && values.includes('--devtools'),
  };
}

module.exports = { detectPackagedRuntime, readDeveloperOptions };

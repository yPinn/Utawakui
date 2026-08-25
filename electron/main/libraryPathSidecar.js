'use strict';

const fs = require('fs');
const path = require('path');

const LIBRARY_MARKER_FILENAME = '.utawakui-library';
const LIBRARY_PATH_SIDECAR_FILENAME = 'library-path.txt';

function removeSidecar(sidecarPath) {
  try {
    fs.rmSync(sidecarPath, { force: true });
  } catch {
    // Best effort: the NSIS uninstaller independently validates the path.
  }
}

function writeLibraryPathSidecar(userDataDir, libraryDir) {
  const resolvedUserDataDir = path.resolve(userDataDir);
  const resolvedLibraryDir = path.resolve(libraryDir);
  const sidecarPath = path.join(
    resolvedUserDataDir,
    LIBRARY_PATH_SIDECAR_FILENAME,
  );
  const root = path.parse(resolvedLibraryDir).root;

  if (
    resolvedLibraryDir === root ||
    path.dirname(resolvedLibraryDir) === root
  ) {
    removeSidecar(sidecarPath);
    return false;
  }

  try {
    fs.mkdirSync(resolvedLibraryDir, { recursive: true });
    fs.writeFileSync(
      path.join(resolvedLibraryDir, LIBRARY_MARKER_FILENAME),
      'Utawakui library root\n',
      { flag: 'a' },
    );
    fs.mkdirSync(resolvedUserDataDir, { recursive: true });
    fs.writeFileSync(sidecarPath, resolvedLibraryDir, 'utf16le');
    return true;
  } catch {
    removeSidecar(sidecarPath);
    return false;
  }
}

module.exports = {
  LIBRARY_MARKER_FILENAME,
  writeLibraryPathSidecar,
};

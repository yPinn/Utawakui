'use strict';

const fs = require('fs');
const path = require('path');

const LEGACY_LIBRARY_MARKER_FILENAME = '.utawakui-library';
const LEGACY_LIBRARY_MARKER_VALUE = 'Utawakui library root\n';
const LIBRARY_OWNERSHIP_MARKER_FILENAME = '.utawakui-library-owner-v2';
const LIBRARY_OWNERSHIP_MARKER_VALUE = 'utawakui-dedicated-library-v2';
const LIBRARY_PATH_SIDECAR_FILENAME = 'library-path.txt';

function removeSidecar(sidecarPath) {
  try {
    fs.rmSync(sidecarPath, { force: true });
  } catch {
    // Best effort: the NSIS uninstaller independently validates the path.
  }
}

function readMarker(markerPath) {
  try {
    return fs.readFileSync(markerPath, 'utf8');
  } catch {
    return null;
  }
}

function claimLibraryRoot(libraryDir) {
  const ownershipMarkerPath = path.join(
    libraryDir,
    LIBRARY_OWNERSHIP_MARKER_FILENAME,
  );
  const ownershipMarker = readMarker(ownershipMarkerPath);

  if (ownershipMarker !== null) {
    return ownershipMarker === LIBRARY_OWNERSHIP_MARKER_VALUE;
  }

  const entries = fs.readdirSync(libraryDir);
  const isEmpty = entries.length === 0;
  const hasOnlyLegacyMarker =
    entries.length === 1 && entries[0] === LEGACY_LIBRARY_MARKER_FILENAME;

  if (!isEmpty && !hasOnlyLegacyMarker) return false;

  if (hasOnlyLegacyMarker) {
    const legacyMarkerPath = path.join(
      libraryDir,
      LEGACY_LIBRARY_MARKER_FILENAME,
    );
    if (readMarker(legacyMarkerPath) !== LEGACY_LIBRARY_MARKER_VALUE) {
      return false;
    }
  }

  fs.writeFileSync(ownershipMarkerPath, LIBRARY_OWNERSHIP_MARKER_VALUE, {
    encoding: 'utf8',
    flag: 'wx',
  });

  if (hasOnlyLegacyMarker) {
    fs.rmSync(path.join(libraryDir, LEGACY_LIBRARY_MARKER_FILENAME));
  }

  return true;
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
    if (!claimLibraryRoot(resolvedLibraryDir)) {
      removeSidecar(sidecarPath);
      return false;
    }
    fs.mkdirSync(resolvedUserDataDir, { recursive: true });
    fs.writeFileSync(sidecarPath, resolvedLibraryDir, 'utf16le');
    return true;
  } catch {
    removeSidecar(sidecarPath);
    return false;
  }
}

module.exports = {
  LEGACY_LIBRARY_MARKER_FILENAME,
  LIBRARY_OWNERSHIP_MARKER_FILENAME,
  LIBRARY_OWNERSHIP_MARKER_VALUE,
  writeLibraryPathSidecar,
};

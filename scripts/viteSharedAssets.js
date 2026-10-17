'use strict';

const path = require('node:path');

// Packaged app.asar already ships shared/; the renderer's dist/ sits beside it.
const SHARED_ASSET_PREFIXES = Object.freeze(['shared/assets/fonts/']);
const SHARED_OUTPUT_DIR = '__shared__';
// Every emitted CSS file lands here; renderBuiltUrl only sees its chunk name.
const ASSET_OUTPUT_DIR = 'assets';

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function sharedAssetPath(originalFileName) {
  if (typeof originalFileName !== 'string') return null;
  const normalized = toPosix(originalFileName);
  return SHARED_ASSET_PREFIXES.some((prefix) => normalized.startsWith(prefix))
    ? normalized
    : null;
}

function assetFileNames(assetInfo) {
  const shared = sharedAssetPath(assetInfo.originalFileNames?.[0]);
  return shared
    ? `${SHARED_OUTPUT_DIR}/${shared}`
    : `${ASSET_OUTPUT_DIR}/[name]-[hash][extname]`;
}

function renderBuiltUrl(filename, { hostId, hostType }) {
  if (!filename.startsWith(`${SHARED_OUTPUT_DIR}/`)) return undefined;
  if (hostType !== 'css') {
    throw new Error(
      `${filename} is shared with the packaged app and may only be referenced from CSS`,
    );
  }
  // Paths are relative to dist/; shared/ is its sibling inside app.asar.
  const cssDir = path.posix.join(ASSET_OUTPUT_DIR, path.posix.dirname(hostId));
  const target = `../${filename.slice(SHARED_OUTPUT_DIR.length + 1)}`;
  return path.posix.relative(cssDir, target);
}

// Points renderer CSS at the packaged shared/ copy instead of re-emitting it.
function createSharedAssetsPlugin() {
  return {
    name: 'utawakui-shared-assets',
    apply: 'build',
    config: () => ({
      build: { rollupOptions: { output: { assetFileNames } } },
      experimental: { renderBuiltUrl },
    }),
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (fileName.startsWith(`${SHARED_OUTPUT_DIR}/`))
          delete bundle[fileName];
      }
    },
  };
}

module.exports = {
  SHARED_OUTPUT_DIR,
  assetFileNames,
  createSharedAssetsPlugin,
  renderBuiltUrl,
  sharedAssetPath,
};

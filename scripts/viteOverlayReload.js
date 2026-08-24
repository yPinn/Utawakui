'use strict';

const path = require('node:path');

const OVERLAY_RUNTIME_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.mjs',
  '.png',
  '.svg',
  '.webp',
]);

function isOverlayRuntimeAsset(projectRoot, file) {
  const overlayRoot = path.resolve(projectRoot, 'overlay');
  const resolvedFile = path.resolve(file);
  const relativePath = path.relative(overlayRoot, resolvedFile);
  const isInsideOverlay =
    relativePath !== '' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath);

  if (!isInsideOverlay) return false;
  if (/\.(?:test|spec)\.[cm]?js$/u.test(relativePath)) return false;
  return OVERLAY_RUNTIME_EXTENSIONS.has(
    path.extname(relativePath).toLowerCase(),
  );
}

function createOverlayReloadPlugin(projectRoot) {
  const overlayRoot = path.resolve(projectRoot, 'overlay');
  return {
    name: 'utawakui-overlay-full-reload',
    configureServer(server) {
      server.watcher.add(overlayRoot);
    },
    handleHotUpdate({ file, server }) {
      if (!isOverlayRuntimeAsset(projectRoot, file)) return undefined;
      server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    },
  };
}

module.exports = { createOverlayReloadPlugin, isOverlayRuntimeAsset };

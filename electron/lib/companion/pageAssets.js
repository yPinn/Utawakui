'use strict';

const fs = require('node:fs');
const path = require('node:path');
const appIdentity = require('../../../shared/appIdentity.json');
const hangulFontFiles = require('../../../shared/assets/fonts/hangulFontFiles.json');

const MANIFEST_NAME = 'utawakui-manifest.json';
const ENTRY_KEY = 'src/entries/companion/index.html';
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
});

// Bundled dependencies come from Vite's build manifest. Public assets with
// stable names are listed explicitly when building the route table.
function collectEntryFiles(manifest, entryKey = ENTRY_KEY) {
  const files = new Set();
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
    if (key !== entryKey) files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const asset of chunk.assets ?? []) files.add(asset);
    for (const child of [
      ...(chunk.imports ?? []),
      ...(chunk.dynamicImports ?? []),
    ])
      visit(child);
  }
  visit(entryKey);
  if (manifest[entryKey]) files.add(manifest[entryKey].file);
  return [...files].filter(
    (file) =>
      typeof file === 'string' && /^assets\/[^/\\]+(\/[^/\\]+)*$/u.test(file),
  );
}

// Builds the exact route table from Vite's entry and the shared font allowlist.
// Files are read once so requests never touch the disk path.
function loadCompanionPage(distDir) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(distDir, MANIFEST_NAME), 'utf8'),
  );
  const routes = new Map();
  routes.set('/m/', {
    body: fs.readFileSync(path.join(distDir, ENTRY_KEY)),
    type: CONTENT_TYPES['.html'],
  });
  for (const file of [
    ...collectEntryFiles(manifest),
    appIdentity.favicon.slice(1),
  ]) {
    const type = CONTENT_TYPES[path.extname(file).toLowerCase()];
    if (!type) continue;
    routes.set(`/${file}`, {
      body: fs.readFileSync(path.join(distDir, file)),
      type,
    });
  }
  for (const file of hangulFontFiles) {
    const relativePath = `shared/assets/fonts/${file}`;
    routes.set(`/${relativePath}`, {
      body: fs.readFileSync(path.join(distDir, '..', relativePath)),
      type: CONTENT_TYPES[path.extname(file)],
    });
  }
  return routes;
}

module.exports = {
  ENTRY_KEY,
  MANIFEST_NAME,
  collectEntryFiles,
  loadCompanionPage,
};

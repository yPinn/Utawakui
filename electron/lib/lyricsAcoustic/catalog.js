'use strict';
const fs = require('node:fs');
const path = require('node:path');
function lyricsAcousticResourcePaths({ isPackaged, resourcesPath, appPath }) {
  const root = isPackaged ? resourcesPath : path.join(appPath, 'resources');
  if (!path.isAbsolute(root ?? ''))
    throw Error('lyrics environment resource root');
  return {
    catalogPath: path.join(
      root,
      'audio-processing',
      'lyrics-acoustic-catalog.json',
    ),
    pythonProbePath: path.join(
      root,
      'audio-processing',
      'lyrics_acoustic_probe.py',
    ),
  };
}
function loadLyricsAcousticCatalog(options) {
  const paths = lyricsAcousticResourcePaths(options);
  if (fs.statSync(paths.catalogPath).size > 262144)
    throw Error('lyrics environment catalog budget');
  const catalog = JSON.parse(fs.readFileSync(paths.catalogPath, 'utf8'));
  if (
    catalog.schemaVersion !== 1 ||
    catalog.capabilityId !== 'lyrics-acoustic' ||
    catalog.runtime?.manifest?.artifact?.sha256 !==
      catalog.runtime?.artifactHash ||
    catalog.model?.id !== 'hubertfa-zh-ja' ||
    catalog.environment?.id !== 'lyrics-alignment'
  )
    throw Error('lyrics environment catalog mismatch');
  return { catalog, ...paths };
}
module.exports = { loadLyricsAcousticCatalog, lyricsAcousticResourcePaths };

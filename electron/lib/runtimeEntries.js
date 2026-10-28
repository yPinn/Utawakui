'use strict';

const path = require('node:path');

const RUNTIME_ENTRIES = Object.freeze({
  main: { source: 'electron/entry.js', file: 'main.cjs' },
  preload: { source: 'electron/preload.js', file: 'preload.cjs' },
  performerPreload: {
    source: 'electron/performerPreload.js',
    file: 'performer-preload.cjs',
  },
  readingWorker: {
    source: 'electron/lib/lyricsReadingWorker.js',
    file: 'reading.cjs',
    physical: true,
  },
  separationWorker: {
    source: 'electron/lib/vocalSeparationWorker.js',
    file: 'separation.cjs',
    physical: true,
  },
  lyricsProbe: {
    source: 'electron/lib/lyricsAcoustic/probe.js',
    file: 'probe.cjs',
    physical: true,
  },
  waveformWorker: {
    source: 'electron/lib/waveform/worker.js',
    file: 'waveform.cjs',
    physical: true,
  },
});

function resolveRuntimeEntry(appRoot, key) {
  if (!Object.hasOwn(RUNTIME_ENTRIES, key))
    throw new Error('Unknown runtime entry');
  const entry = RUNTIME_ENTRIES[key];
  const root = path.resolve(appRoot);
  const archive = root.endsWith('.asar.unpacked') ? root.slice(0, -9) : root;
  if (!archive.endsWith('.asar')) return path.join(root, entry.source);
  return path.join(
    entry.physical ? `${archive}.unpacked` : archive,
    'runtime',
    entry.file,
  );
}

module.exports = { RUNTIME_ENTRIES, resolveRuntimeEntry };

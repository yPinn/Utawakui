'use strict';

const APP_SOURCE_PATTERN =
  /^(?:electron\/.*\.js|overlay\/.*\.mjs|shared\/.*\.(?:js|mjs)|src\/.*\.(?:js|vue))$/;

const DEFERRED_SOURCES = new Map([
  ['electron/main.js', 'electron-entrypoint'],
  ['electron/lib/lyricsReadingWorker.js', 'child-process-entrypoint'],
  ['electron/lib/vocalSeparationWorker.js', 'child-process-entrypoint'],
  ['src/main.js', 'renderer-entrypoint'],
  ['src/performer-main.js', 'renderer-entrypoint'],
]);

const COVERAGE_NEUTRAL_SOURCES = new Set([
  'overlay/shared/lyricsPresentation.mjs',
  'overlay/shared/mangaFrameContract.mjs',
  'overlay/shared/state.mjs',
  'src/icons/index.js',
]);

const coveragePolicy = Object.freeze({
  include: Object.freeze([
    'electron/preload.js',
    'electron/performerPreload.js',
    'electron/lib/**/*.js',
    'electron/main/**/*.js',
    'overlay/**/*.mjs',
    'shared/**/*.js',
    'shared/**/*.mjs',
    'scripts/audio-separator-roformer-wheel-patch.mjs',
    'scripts/release-contract.mjs',
    'src/composables/**/*.js',
    'src/constants/*.js',
    'src/icons/*.js',
    'src/utils/*.js',
  ]),
  exclude: Object.freeze([
    '**/*.test.js',
    '**/*.test.mjs',
    'shared/**/*.json',
    'electron/lib/lyricsReadingWorker.js',
    'electron/lib/vocalSeparationWorker.js',
    ...COVERAGE_NEUTRAL_SOURCES,
  ]),
  globalThresholds: Object.freeze({
    statements: 80,
    branches: 75,
    functions: 83,
    lines: 82,
  }),
  domains: Object.freeze([
    Object.freeze({
      name: 'electron-lib',
      prefix: 'electron/lib/',
      minimum: Object.freeze({
        statements: 84,
        branches: 80,
        functions: 90,
        lines: 86,
      }),
    }),
    Object.freeze({
      name: 'electron-main',
      prefix: 'electron/main/',
      minimum: Object.freeze({
        statements: 62,
        branches: 57,
        functions: 63,
        lines: 64,
      }),
    }),
    Object.freeze({
      name: 'overlay',
      prefix: 'overlay/',
      minimum: Object.freeze({
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 78,
      }),
    }),
    Object.freeze({
      name: 'shared-contracts',
      prefix: 'shared/',
      minimum: Object.freeze({
        statements: 92,
        branches: 80,
        functions: 97,
        lines: 94,
      }),
    }),
    Object.freeze({
      name: 'shared-presentation',
      prefix: 'shared/presentation/',
      minimum: Object.freeze({
        statements: 96,
        branches: 83,
        functions: 98,
        lines: 97,
      }),
    }),
    Object.freeze({
      name: 'release-tooling',
      prefix: 'scripts/',
      minimum: Object.freeze({
        statements: 88,
        branches: 87,
        functions: 94,
        lines: 88,
      }),
    }),
    Object.freeze({
      name: 'renderer',
      prefix: 'src/',
      minimum: Object.freeze({
        statements: 79,
        branches: 74,
        functions: 84,
        lines: 81,
      }),
    }),
    Object.freeze({
      name: 'renderer-composables',
      prefix: 'src/composables/',
      minimum: Object.freeze({
        statements: 74,
        branches: 69,
        functions: 78,
        lines: 77,
      }),
    }),
    Object.freeze({
      name: 'renderer-utils',
      prefix: 'src/utils/',
      minimum: Object.freeze({
        statements: 95,
        branches: 84,
        functions: 99,
        lines: 97,
      }),
    }),
  ]),
  files: Object.freeze([
    Object.freeze({
      path: 'electron/preload.js',
      minimum: Object.freeze({
        statements: 92,
        branches: 90,
        functions: 91,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'electron/performerPreload.js',
      minimum: Object.freeze({
        statements: 94,
        branches: 95,
        functions: 92,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/diagnostics.js',
      minimum: Object.freeze({
        statements: 92,
        branches: 82,
        functions: 92,
        lines: 94,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/downloader.js',
      minimum: Object.freeze({
        statements: 70,
        branches: 63,
        functions: 79,
        lines: 73,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/featureDependencies/archive.js',
      minimum: Object.freeze({
        statements: 98,
        branches: 86,
        functions: 100,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/featureDependencies/download.js',
      minimum: Object.freeze({
        statements: 98,
        branches: 85,
        functions: 100,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/library/migrations.js',
      minimum: Object.freeze({
        statements: 93,
        branches: 85,
        functions: 100,
        lines: 99,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/outputServer.js',
      minimum: Object.freeze({
        statements: 88,
        branches: 82,
        functions: 92,
        lines: 92,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/outputServer/http.js',
      minimum: Object.freeze({
        statements: 85,
        branches: 80,
        functions: 85,
        lines: 88,
      }),
    }),
    Object.freeze({
      path: 'electron/main/lyrics/acquisitionHandlers.js',
      minimum: Object.freeze({
        statements: 79,
        branches: 77,
        functions: 88,
        lines: 83,
      }),
    }),
    Object.freeze({
      path: 'electron/main/lyrics/documentHandlers.js',
      minimum: Object.freeze({
        statements: 85,
        branches: 72,
        functions: 100,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'electron/main/lyrics/readingHandlers.js',
      minimum: Object.freeze({
        statements: 75,
        branches: 68,
        functions: 69,
        lines: 82,
      }),
    }),
    Object.freeze({
      path: 'electron/main/mediaProtocol.js',
      minimum: Object.freeze({
        statements: 98,
        branches: 78,
        functions: 100,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'electron/main/windowState.js',
      minimum: Object.freeze({
        statements: 95,
        branches: 82,
        functions: 87,
        lines: 96,
      }),
    }),
    Object.freeze({
      path: 'electron/main/libraryPathSidecar.js',
      minimum: Object.freeze({
        statements: 95,
        branches: 100,
        functions: 100,
        lines: 95,
      }),
    }),
    Object.freeze({
      path: 'electron/main/outputRuntime.js',
      minimum: Object.freeze({
        statements: 92,
        branches: 82,
        functions: 86,
        lines: 94,
      }),
    }),
    Object.freeze({
      path: 'shared/outputContract.js',
      minimum: Object.freeze({
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'shared/outputStreamContract.js',
      minimum: Object.freeze({
        statements: 84,
        branches: 74,
        functions: 97,
        lines: 87,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useMediaSession.js',
      minimum: Object.freeze({
        statements: 92,
        branches: 82,
        functions: 100,
        lines: 92,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useLyrics.js',
      minimum: Object.freeze({
        statements: 91,
        branches: 83,
        functions: 95,
        lines: 95,
      }),
    }),
    Object.freeze({
      path: 'src/composables/lyrics/useLyricsAcquisition.js',
      minimum: Object.freeze({
        statements: 92,
        branches: 77,
        functions: 100,
        lines: 97,
      }),
    }),
    Object.freeze({
      path: 'src/composables/lyrics/useLyricsSourceDocuments.js',
      minimum: Object.freeze({
        statements: 94,
        branches: 77,
        functions: 100,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'src/composables/usePlayer.js',
      minimum: Object.freeze({
        statements: 84,
        branches: 79,
        functions: 95,
        lines: 87,
      }),
    }),
    Object.freeze({
      path: 'src/composables/player/usePlayerAudioGraph.js',
      minimum: Object.freeze({
        statements: 85,
        branches: 78,
        functions: 90,
        lines: 86,
      }),
    }),
    Object.freeze({
      path: 'src/composables/usePerformerViewState.js',
      minimum: Object.freeze({
        statements: 96,
        branches: 80,
        functions: 98,
        lines: 98,
      }),
    }),
  ]),
});

function classifyAppSource(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  if (COVERAGE_NEUTRAL_SOURCES.has(normalized)) {
    return { status: 'coverage-neutral', reason: 're-export-only' };
  }
  const deferredReason = DEFERRED_SOURCES.get(normalized);
  if (deferredReason) return { status: 'deferred', reason: deferredReason };
  if (normalized.startsWith('src/') && normalized.endsWith('.vue')) {
    return { status: 'deferred', reason: 'vue-sfc-runtime' };
  }
  if (
    (/^electron\/(?:preload|performerPreload)\.js$/.test(normalized) ||
      /^electron\/(?:lib|main)\/.+\.js$/.test(normalized) ||
      /^overlay\/.+\.mjs$/.test(normalized) ||
      /^shared\/.+\.(?:js|mjs)$/.test(normalized) ||
      /^src\/(?:composables|constants|icons|utils)\/.+\.js$/.test(
        normalized,
      )) &&
    !DEFERRED_SOURCES.has(normalized)
  ) {
    return { status: 'measured' };
  }
  return { status: 'unclassified' };
}

module.exports = {
  APP_SOURCE_PATTERN,
  classifyAppSource,
  coveragePolicy,
};

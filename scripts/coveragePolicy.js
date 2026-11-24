'use strict';

const APP_SOURCE_PATTERN =
  /^(?:electron\/.*\.js|overlay\/.*\.mjs|shared\/.*\.(?:js|mjs)|src\/.*\.(?:js|vue))$/;

const DEFERRED_SOURCES = new Map([
  ['electron/entry.js', 'electron-entrypoint'],
  ['electron/main.js', 'electron-entrypoint'],
  ['electron/lib/lyricsReadingWorker.js', 'child-process-entrypoint'],
  ['electron/lib/vocalSeparationWorker.js', 'child-process-entrypoint'],
  ['src/main.js', 'renderer-entrypoint'],
  ['src/entries/prompter/main.js', 'renderer-entrypoint'],
  ['src/entries/companion/main.js', 'renderer-entrypoint'],
  ['src/entries/companion/bootstrap.js', 'renderer-entrypoint'],
]);

const COVERAGE_NEUTRAL_SOURCES = new Map([
  ['overlay/shared/lyricsPresentation.mjs', 're-export-only'],
  ['overlay/shared/mangaFrameContract.mjs', 're-export-only'],
  ['overlay/shared/state.mjs', 're-export-only'],
  ['src/components/demo/demoImageFixtures.js', 'static-fixture'],
  ['src/components/demo/demoTrackCollectionProfiles.js', 're-export-only'],
  ['src/icons/index.js', 're-export-only'],
  ['src/utils/trackPreviewLyricChorus.js', 're-export-only'],
  ['src/components/ui/uiTestHost.js', 'test-infrastructure'],
  ['src/utils/catalogSourceText.js', 'test-infrastructure'],
  // Node/vitest has no real Web Audio implementation (same posture as
  // usePlayerAudioGraph.js's untested half, see ADR 0019 and ADR 0020):
  // node creation, gain envelopes, and currentTime-based scheduling here
  // cannot be exercised without a hand-rolled mock that would just assert
  // against itself. All decision logic (which beat fires when, accent vs
  // regular) lives in the tested pure module metronomeSchedule.js instead.
  ['src/utils/metronomeClickEngine.js', 'untestable-web-audio'],
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
    'scripts/lyrics-provider-corpus-candidates.mjs',
    'scripts/lyrics-provider-corpus-runner.mjs',
    'scripts/lyrics-provider-corpus-cli.mjs',
    'scripts/lyrics-provider-contracts.mjs',
    'scripts/lyrics-provider-contract-cli.mjs',
    'scripts/lyrics-provider-corpus-metadata.mjs',
    'scripts/lyrics-provider-corpus-prepare.mjs',
    'scripts/lyrics-provider-corpus-prepare-cli.mjs',
    'scripts/lyrics-provider-corpus-review.mjs',
    'scripts/lyrics-provider-corpus-review-cli.mjs',
    'scripts/lyrics-provider-corpus-sources.mjs',
    'scripts/lyrics-provider-corpus-strata.mjs',
    'scripts/lyrics-provider-evaluation.mjs',
    'scripts/lyrics-provider-kugou.mjs',
    'scripts/lyrics-provider-kugou-query.mjs',
    'scripts/lyrics-provider-lrclib.mjs',
    'scripts/lyrics-provider-netease.mjs',
    'scripts/lyrics-provider-netease-evaluation.mjs',
    'scripts/lyrics-provider-netease-runtime-contract.mjs',
    'scripts/lyrics-provider-netease-runtime.mjs',
    'scripts/lyrics-provider-netease-sentinel.mjs',
    'scripts/lyrics-provider-probe-registry.mjs',
    'scripts/release-contract.mjs',
    'src/bgm/**/*.js',
    'src/companion/**/*.js',
    'src/microphone/**/*.js',
    'src/composables/**/*.js',
    'src/components/**/*.js',
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
    ...COVERAGE_NEUTRAL_SOURCES.keys(),
  ]),
  // Floors stay at or below 80/70/80/80 (stmts/branches/funcs/lines); never pin to current coverage.
  globalThresholds: Object.freeze({
    statements: 80,
    branches: 70,
    functions: 80,
    lines: 80,
  }),
  domains: Object.freeze([
    Object.freeze({
      name: 'electron-lib',
      prefix: 'electron/lib/',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
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
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      name: 'shared-presentation',
      prefix: 'shared/presentation/',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      name: 'release-tooling',
      prefix: 'scripts/',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      name: 'renderer',
      prefix: 'src/',
      minimum: Object.freeze({
        statements: 79,
        branches: 70,
        functions: 80,
        lines: 80,
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
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
  ]),
  files: Object.freeze([
    Object.freeze({
      path: 'electron/preload.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/performerPreload.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/diagnostics.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
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
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/featureDependencies/download.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/library/migrations.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/outputServer.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/lib/outputServer/http.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/configHandlers.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/externalNavigationHandlers.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/featureDependencyHandlers.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/featureGateHandlers.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/lyrics/acquisitionHandlers.js',
      minimum: Object.freeze({
        statements: 79,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/lyrics/documentHandlers.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/lyrics/readingHandlers.js',
      minimum: Object.freeze({
        statements: 75,
        branches: 68,
        functions: 69,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/mediaProtocol.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/windows/mainWindow.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/libraryPathSidecar.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'electron/main/outputRuntime.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'shared/outputContract.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'shared/outputStreamContract.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useMediaSession.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useMusicAnalysisWorkbench.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/analysis/useMusicAnalysisCapability.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/analysis/useMusicAnalysisJob.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useFeatureDependencies.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useFeatureGatePresentation.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useFeatureGates.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useImportSession.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/import/useImportSourceResolution.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/import/useImportExecution.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useLyrics.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/lyrics/useLyricsAcquisition.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/lyrics/useLyricsSourceDocuments.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/usePlayer.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/player/usePlayerAudioGraph.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useOutputRuntime.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 66,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/output/useOutputProjectionPublisher.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
    Object.freeze({
      path: 'src/composables/usePerformerViewState.js',
      minimum: Object.freeze({
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      }),
    }),
  ]),
});

function classifyAppSource(filePath) {
  const normalized = String(filePath).replaceAll('\\', '/');
  const coverageNeutralReason = COVERAGE_NEUTRAL_SOURCES.get(normalized);
  if (coverageNeutralReason)
    return { status: 'coverage-neutral', reason: coverageNeutralReason };
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
      /^src\/components\/.+\.js$/.test(normalized) ||
      /^src\/(?:bgm|companion|microphone|composables|constants|icons|utils)\/.+\.js$/.test(
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

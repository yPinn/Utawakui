'use strict';

const APP_SOURCE_PATTERN =
  /^(?:electron\/.*\.js|overlay\/.*\.mjs|shared\/.*\.(?:js|mjs)|src\/.*\.(?:js|vue))$/;

const DEFERRED_SOURCES = new Map([
  ['electron/entry.js', 'electron-entrypoint'],
  ['electron/main.js', 'electron-entrypoint'],
  ['electron/lib/lyricsReadingWorker.js', 'child-process-entrypoint'],
  ['electron/lib/vocalSeparationWorker.js', 'child-process-entrypoint'],
  ['src/main.js', 'renderer-entrypoint'],
  ['src/performer-main.js', 'renderer-entrypoint'],
]);

const COVERAGE_NEUTRAL_SOURCES = new Map([
  ['overlay/shared/lyricsPresentation.mjs', 're-export-only'],
  ['overlay/shared/mangaFrameContract.mjs', 're-export-only'],
  ['overlay/shared/state.mjs', 're-export-only'],
  ['src/components/demo/demoImageFixtures.js', 'static-fixture'],
  ['src/composables/useStudioLibraryInspectorWidth.js', 're-export-only'],
  ['src/icons/index.js', 're-export-only'],
  ['src/components/ui/uiTestHost.js', 'test-infrastructure'],
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
    'scripts/lyrics-provider-amll.mjs',
    'scripts/lyrics-provider-amll-probe.mjs',
    'scripts/lyrics-provider-amll-ttml.mjs',
    'scripts/lyrics-provider-corpus-candidates.mjs',
    'scripts/lyrics-provider-corpus-runner.mjs',
    'scripts/lyrics-provider-corpus-cli.mjs',
    'scripts/lyrics-provider-corpus-metadata.mjs',
    'scripts/lyrics-provider-corpus-prepare.mjs',
    'scripts/lyrics-provider-corpus-prepare-cli.mjs',
    'scripts/lyrics-provider-corpus-review.mjs',
    'scripts/lyrics-provider-corpus-review-cli.mjs',
    'scripts/lyrics-provider-corpus-sources.mjs',
    'scripts/lyrics-provider-corpus-strata.mjs',
    'scripts/lyrics-provider-evaluation.mjs',
    'scripts/lyrics-provider-kugou.mjs',
    'scripts/lyrics-provider-lrclib.mjs',
    'scripts/lyrics-provider-netease.mjs',
    'scripts/lyrics-provider-netease-evaluation.mjs',
    'scripts/lyrics-provider-netease-runtime-contract.mjs',
    'scripts/lyrics-provider-netease-runtime.mjs',
    'scripts/lyrics-provider-netease-sentinel.mjs',
    'scripts/lyrics-provider-probe-registry.mjs',
    'scripts/release-contract.mjs',
    'src/composables/**/*.js',
    'src/components/demo/trackThumbFallback.js',
    'src/components/ui/*.js',
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
      path: 'electron/main/configHandlers.js',
      minimum: Object.freeze({
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      }),
    }),
    Object.freeze({
      path: 'electron/main/externalNavigationHandlers.js',
      minimum: Object.freeze({
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      }),
    }),
    Object.freeze({
      path: 'electron/main/featureDependencyHandlers.js',
      minimum: Object.freeze({
        statements: 98,
        branches: 75,
        functions: 95,
        lines: 98,
      }),
    }),
    Object.freeze({
      path: 'electron/main/featureGateHandlers.js',
      minimum: Object.freeze({
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
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
      path: 'src/composables/useMusicAnalysisWorkbench.js',
      minimum: Object.freeze({
        statements: 84,
        branches: 72,
        functions: 89,
        lines: 87,
      }),
    }),
    Object.freeze({
      path: 'src/composables/analysis/useMusicAnalysisCapability.js',
      minimum: Object.freeze({
        statements: 98,
        branches: 88,
        functions: 100,
        lines: 100,
      }),
    }),
    Object.freeze({
      path: 'src/composables/analysis/useMusicAnalysisJob.js',
      minimum: Object.freeze({
        statements: 95,
        branches: 79,
        functions: 88,
        lines: 97,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useFeatureDependencies.js',
      minimum: Object.freeze({
        statements: 95,
        branches: 90,
        functions: 92,
        lines: 94,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useFeatureGatePresentation.js',
      minimum: Object.freeze({
        statements: 96,
        branches: 91,
        functions: 100,
        lines: 97,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useFeatureGates.js',
      minimum: Object.freeze({
        statements: 98,
        branches: 97,
        functions: 100,
        lines: 100,
      }),
    }),
    Object.freeze({
      path: 'src/composables/useImportSession.js',
      minimum: Object.freeze({
        statements: 97,
        branches: 85,
        functions: 100,
        lines: 100,
      }),
    }),
    Object.freeze({
      path: 'src/composables/import/useImportSourceResolution.js',
      minimum: Object.freeze({
        statements: 96,
        branches: 81,
        functions: 100,
        lines: 100,
      }),
    }),
    Object.freeze({
      path: 'src/composables/import/useImportExecution.js',
      minimum: Object.freeze({
        statements: 91,
        branches: 81,
        functions: 100,
        lines: 97,
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
      path: 'src/composables/useOutputRuntime.js',
      minimum: Object.freeze({
        statements: 89,
        branches: 66,
        functions: 100,
        lines: 92,
      }),
    }),
    Object.freeze({
      path: 'src/composables/output/useOutputProjectionPublisher.js',
      minimum: Object.freeze({
        statements: 96,
        branches: 88,
        functions: 100,
        lines: 100,
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
      normalized === 'src/components/demo/trackThumbFallback.js' ||
      /^src\/components\/ui\/.+\.js$/.test(normalized) ||
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

'use strict';

// Use vitest/config so the test field is recognized.
const { defineConfig } = require('vitest/config');
const vue = require('@vitejs/plugin-vue');
const path = require('node:path');
const { createOverlayReloadPlugin } = require('./scripts/viteOverlayReload.js');
const { createSharedAssetsPlugin } = require('./scripts/viteSharedAssets.js');
const { createAppIdentityPlugin } = require('./scripts/viteAppIdentity.js');
const {
  createSfcStyleCachePlugin,
} = require('./scripts/vitestSfcStyleCache.js');
const { coveragePolicy } = require('./scripts/coveragePolicy.js');
const devServerValues = require('./shared/devServerValues.json');
const rendererEntries = require('./shared/rendererEntries.json');

// Child-process CLIs and dictionary/model runtimes run after the unit group so
// their CPU load cannot push ordinary tests past the default timeout.
const RUNTIME_TEST_PATTERNS = [
  'scripts/**/*.test.mjs',
  'electron/lib/kuromoji*.test.js',
  'electron/lib/japaneseReading/**/*.test.js',
  'electron/lib/vocalSeparation.test.js',
  'electron/lib/lyricsAcoustic/artifacts.test.js',
  'electron/lib/lyricsAcoustic/probe.test.js',
  'electron/lib/featureDependencies/archive.runtime.test.js',
];
const TEST_EXCLUDE = ['coverage/**', 'dist/**', '**/node_modules/**'];
// Istanbul instrumentation slows every test 2-3x; scale budgets, not hang checks.
const TIMEOUT_SCALE = process.argv.includes('--coverage') ? 3 : 1;

module.exports = defineConfig({
  plugins: [
    vue(),
    createAppIdentityPlugin(),
    createOverlayReloadPlugin(__dirname),
    createSharedAssetsPlugin(),
    createSfcStyleCachePlugin(),
  ],
  // Vite clears interactive terminals when it restarts or re-optimizes. Keep the
  // complete npm run dev scrollback available for startup diagnosis.
  clearScreen: false,
  // Required for Electron loadFile(); file:// cannot resolve root paths.
  base: './',
  // Without explicit entries the dep scanner crawls every *.html in the repo,
  // including thousands under tasks/ and .tmp/.
  optimizeDeps: { entries: Object.values(rendererEntries) },
  server: {
    port: devServerValues.port,
    strictPort: true,
    watch: {
      ignored: [
        '**/tasks/**',
        '**/.tmp/**',
        '**/coverage/**',
        '**/release/**',
        '**/release-*/**',
      ],
    },
  },
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(rendererEntries).map(([role, entry]) => [
          role,
          path.resolve(__dirname, entry),
        ]),
      ),
    },
  },
  test: {
    environment: 'node',
    // CI's full-suite parallel run occasionally flakes on tests that do real
    // filesystem IO (reading a hand-edited source file, os.tmpdir() races)
    // under heavy worker load. Retrying only in CI keeps local failures
    // immediate — a real bug should never be masked by a silent retry — and
    // costs far less than the alternative: a human re-running the whole CI
    // job (npm ci, lint, format, build, everything) just to shake off one
    // transient test.
    retry: process.env.CI ? 1 : 0,
    // Threads start faster than forks here; the full suite has no
    // process.chdir or native-addon test that needs a separate process.
    pool: 'threads',
    // Reuses transformed modules across runs; content-keyed, so edits invalidate.
    // SFCs with <style src> opt out through createSfcStyleCachePlugin.
    experimental: { fsModuleCache: true },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          testTimeout: 5_000 * TIMEOUT_SCALE,
          include: [
            'electron/*.test.js',
            'electron/lib/**/*.test.js',
            'electron/main/**/*.test.js',
            'overlay/**/*.test.js',
            'services/**/*.test.js',
            'shared/**/*.test.js',
            'src/**/*.test.js',
          ],
          exclude: [...TEST_EXCLUDE, ...RUNTIME_TEST_PATTERNS],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'runtime',
          include: RUNTIME_TEST_PATTERNS,
          exclude: TEST_EXCLUDE,
          // Real child processes and dictionary loads; not a hang budget.
          testTimeout: 20_000 * TIMEOUT_SCALE,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    coverage: {
      // v8 (the default) double-counts electron/lib CJS files that are both
      // `import`-ed by their own test file and `require()`-d by another
      // instrumented module (e.g. electron/lib/library/tracks.js requires
      // youtube.js — and many test files separately require
      // electron/lib/library/paths.js, the same multi-require scenario):
      // the two separately-loaded instances get separate V8 script coverage
      // records, and vitest's v8-to-istanbul merge keeps only one instead
      // of unioning them — confirmed by reproducing with youtube.test.js +
      // library.test.js (90.9%/100% funcs isolated -> 42.42%/0% funcs
      // together). istanbul instruments source directly instead of
      // sampling V8 runtime coverage, so it isn't affected.
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      all: true,
      clean: true,
      skipFull: true,
      include: coveragePolicy.include,
      exclude: coveragePolicy.exclude,
      thresholds: coveragePolicy.globalThresholds,
    },
  },
});

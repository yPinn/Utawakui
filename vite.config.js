'use strict';

// Use vitest/config so the test field is recognized.
const { defineConfig } = require('vitest/config');
const vue = require('@vitejs/plugin-vue');

module.exports = defineConfig({
  plugins: [vue()],
  // Required for Electron loadFile(); file:// cannot resolve root paths.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['electron/lib/**/*.test.js', 'src/**/*.test.js'],
    exclude: ['coverage/**', 'dist/**', 'node_modules/**'],
    coverage: {
      // v8 (the default) double-counts electron/lib CJS files that are both
      // `import`-ed by their own test file and `require()`-d by another
      // instrumented module (e.g. library.js requires youtube.js): the two
      // separately-loaded instances get separate V8 script coverage
      // records, and vitest's v8-to-istanbul merge keeps only one instead
      // of unioning them — confirmed by reproducing with youtube.test.js +
      // library.test.js (90.9%/100% funcs isolated -> 42.42%/0% funcs
      // together). istanbul instruments source directly instead of
      // sampling V8 runtime coverage, so it isn't affected.
      provider: 'istanbul',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      all: true,
      clean: true,
      skipFull: true,
      include: [
        'electron/lib/*.js',
        'src/utils/*.js',
        'src/composables/useDragReorder.js',
        'src/composables/useImportSession.js',
        'src/composables/useLyrics.js',
        'src/composables/usePlaybackQueue.js',
        'src/composables/usePlaylists.js',
        'src/composables/useRovingRadioGroup.js',
        'src/composables/useSeparation.js',
      ],
      exclude: [
        '**/*.test.js',
        'electron/lib/downloader.js',
        'electron/lib/vocalSeparationWorker.js',
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 75,
        lines: 75,
      },
    },
  },
});

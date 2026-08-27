'use strict';

// Use vitest/config so the test field is recognized.
const { defineConfig } = require('vitest/config');
const vue = require('@vitejs/plugin-vue');
const path = require('node:path');
const { createOverlayReloadPlugin } = require('./scripts/viteOverlayReload.js');
const { coveragePolicy } = require('./scripts/coveragePolicy.js');

module.exports = defineConfig({
  plugins: [vue(), createOverlayReloadPlugin(__dirname)],
  // Vite clears interactive terminals when it restarts or re-optimizes. Keep the
  // complete npm run dev scrollback available for startup diagnosis.
  clearScreen: false,
  // Required for Electron loadFile(); file:// cannot resolve root paths.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        '**/.tmp/**',
        '**/coverage/**',
        '**/release/**',
        '**/release-*/**',
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        performer: path.resolve(__dirname, 'performer-view.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: [
      'electron/*.test.js',
      'electron/lib/**/*.test.js',
      'electron/main/**/*.test.js',
      'overlay/**/*.test.js',
      'scripts/**/*.test.mjs',
      'shared/**/*.test.js',
      'src/**/*.test.js',
    ],
    exclude: ['coverage/**', 'dist/**', 'node_modules/**'],
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

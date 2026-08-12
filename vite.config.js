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
      provider: 'v8',
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

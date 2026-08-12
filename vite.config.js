'use strict';

// defineConfig from 'vitest/config', not plain 'vite', so the `test` field
// below is recognized. Test files are plain Node-logic modules, not Vue
// components, so the default Node test environment is enough.
const { defineConfig } = require('vitest/config');
const vue = require('@vitejs/plugin-vue');

module.exports = defineConfig({
  plugins: [vue()],
  // Root-relative paths ('/assets/...', the default) 404 under
  // electron/main.js's production loadFile() — file:// has no server to
  // resolve '/' against. Relative paths work under both that and dev.
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {},
});

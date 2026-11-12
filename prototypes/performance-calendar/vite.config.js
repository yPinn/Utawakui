'use strict';

/* global __dirname, module, require */

const { defineConfig, searchForWorkspaceRoot } = require('vite');
const vue = require('@vitejs/plugin-vue');

module.exports = defineConfig({
  root: __dirname,
  base: './',
  plugins: [vue()],
  server: { fs: { allow: [searchForWorkspaceRoot(__dirname)] } },
  build: { outDir: '.build' },
});

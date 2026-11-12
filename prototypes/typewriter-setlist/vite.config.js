'use strict';

/* global __dirname, module, require */

const { defineConfig, searchForWorkspaceRoot } = require('vite');

module.exports = defineConfig({
  root: __dirname,
  base: './',
  server: { fs: { allow: [searchForWorkspaceRoot(__dirname)] } },
  build: { outDir: '.build' },
});

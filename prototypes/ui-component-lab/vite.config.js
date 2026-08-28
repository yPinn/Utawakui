'use strict';

/* global __dirname, module, require */

const path = require('node:path');
const { defineConfig } = require('vite');
const vue = require('@vitejs/plugin-vue');

module.exports = defineConfig({
  root: __dirname,
  base: './',
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, '.build'),
    emptyOutDir: true,
  },
});

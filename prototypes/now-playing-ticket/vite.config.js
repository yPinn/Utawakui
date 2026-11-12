'use strict';

/* global __dirname, module, require */

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { defineConfig, searchForWorkspaceRoot } = require('vite');

const cover = readFileSync(
  resolve(__dirname, '../performance-calendar/art/stage.webp'),
);

function mountSampleArtwork(server) {
  server.middlewares.use((request, response, next) => {
    if (request.url === '/media/artwork/ticket-sample') {
      response.setHeader('Content-Type', 'image/webp');
      response.end(cover);
    } else if (request.url === '/media/artwork/ticket-sample-no-cover') {
      response.statusCode = 404;
      response.end();
    } else {
      next();
    }
  });
}

module.exports = defineConfig({
  root: __dirname,
  base: './',
  plugins: [
    {
      name: 'now-playing-ticket-sample-artwork',
      configureServer: mountSampleArtwork,
      configurePreviewServer: mountSampleArtwork,
    },
  ],
  server: { fs: { allow: [searchForWorkspaceRoot(__dirname)] } },
  build: { outDir: '.build' },
});

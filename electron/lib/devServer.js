'use strict';

const { host, port } = require('../../shared/devServerValues.json');

// Vite dev server origin; vite.config.js pins the same port with strictPort.
const DEV_SERVER_ORIGIN = `http://${host}:${port}`;

function devServerUrl(pagePath = '') {
  return `${DEV_SERVER_ORIGIN}/${pagePath}`;
}

module.exports = { DEV_SERVER_ORIGIN, devServerUrl };

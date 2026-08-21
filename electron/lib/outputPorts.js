'use strict';

const net = require('node:net');
const {
  host: OUTPUT_HOST,
  suggestedPorts: OUTPUT_PORT_CANDIDATES,
} = require('../../shared/outputRuntimeValues.json');

function isOutputPortAvailable(port, options = {}) {
  const host = options.host ?? OUTPUT_HOST;
  const createServer = options.createServer ?? (() => net.createServer());

  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref?.();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });
}

async function findAvailableOutputPorts(
  candidates = OUTPUT_PORT_CANDIDATES,
  options = {},
) {
  const probe = options.probe ?? isOutputPortAvailable;
  const limit = Number.isSafeInteger(options.limit) ? options.limit : 3;
  const available = [];
  for (const port of candidates) {
    if (await probe(port)) available.push(port);
    if (available.length >= limit) break;
  }
  return available;
}

module.exports = {
  findAvailableOutputPorts,
  isOutputPortAvailable,
};

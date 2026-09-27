'use strict';

const {
  createProviderRequestScheduler,
} = require('../providerRequestScheduler.js');

const DEFAULT_REQUEST_INTERVAL_MS = 250;

function createLrclibRequestScheduler(options = {}) {
  return createProviderRequestScheduler({
    ...options,
    intervalMs: Number.isFinite(options.intervalMs)
      ? options.intervalMs
      : DEFAULT_REQUEST_INTERVAL_MS,
  });
}

const sharedLrclibRequestScheduler = createLrclibRequestScheduler();

module.exports = {
  DEFAULT_REQUEST_INTERVAL_MS,
  createLrclibRequestScheduler,
  sharedLrclibRequestScheduler,
};

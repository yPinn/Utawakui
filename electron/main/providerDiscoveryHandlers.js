'use strict';

const { createAppError } = require('../lib/appError');
const { buildYoutubeMusicSearchUrl } = require('../lib/providerDiscovery');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function registerProviderDiscoveryHandlers({
  ipcMain,
  openExternal,
  requireFeatureGate,
  featureIds,
  recordDiagnostic,
}) {
  ipcMain.handle(
    'provider-discovery:open-youtube-music-search',
    async (event, query) => {
      const targetUrl = buildYoutubeMusicSearchUrl(query);
      if (!targetUrl) {
        throw createAppError({
          code: 'PROVIDER_DISCOVERY_QUERY_INVALID',
          severity: 'warning',
        });
      }

      requireFeatureGate(featureIds.PROVIDER_FLOW);
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'provider-discovery',
            operation: 'open-youtube-music-search',
            code: 'PROVIDER_DISCOVERY_OPEN_FAILED',
            context: { provider: 'youtube-music' },
          },
          publicError: {
            code: 'PROVIDER_DISCOVERY_OPEN_FAILED',
          },
        },
        () => openExternal(targetUrl),
      );
    },
  );
}

module.exports = {
  registerProviderDiscoveryHandlers,
};

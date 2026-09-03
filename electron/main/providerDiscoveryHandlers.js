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
          title: '無法開啟 YT Music',
          message: '請輸入較短的歌曲或歌手名稱後再試一次。',
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
            title: '無法開啟 YT Music',
            message: '目前無法開啟 YT Music，請稍後再試。',
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

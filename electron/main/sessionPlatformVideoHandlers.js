'use strict';

const { SESSION_ID } = require('../lib/sessionPlatformVideos');
const {
  PlatformVideoError,
  requireCondition,
} = require('../lib/youtubeDesktopAuthorization');
const { t } = require('../lib/i18n');
const { runDiagnosticIpcOperation } = require('./ipcErrorBoundary');

function registerSessionPlatformVideoHandlers({
  ipcMain,
  service,
  operationContext,
  recordDiagnostic,
}) {
  function lookup(sessionId) {
    requireCondition(
      typeof sessionId === 'string' && SESSION_ID.test(sessionId),
      'missingSession',
    );
    const { directory, store, tracksById } = operationContext({
      reuseRecentScan: true,
    });
    let session;
    try {
      session = store.getSession(sessionId, tracksById);
    } catch {
      throw new PlatformVideoError('missingSession');
    }
    requireCondition(session?.endedAt, 'missingSession');
    return { directory, startedAt: session.startedAt };
  }

  const sessionAction = (action) => (intent) => {
    const sessionId = intent?.sessionId;
    const { directory, startedAt } = lookup(sessionId);
    const verifySession = () =>
      requireCondition(
        lookup(sessionId).directory === directory,
        'missingSession',
      );
    return action({
      sessionId,
      platform: intent.platform,
      url: intent.url,
      candidateId: intent.candidateId,
      startedAt,
      verifySession,
    });
  };

  for (const [name, action] of Object.entries({
    status: () => service.status(),
    connect: () => service.connect(),
    cancel: () => service.cancel(),
    disconnect: () => service.disconnect(),
    get: sessionAction(({ sessionId }) => service.sessionPairs(sessionId)),
    'refresh-metadata': sessionAction(({ sessionId, verifySession }) =>
      service.refreshMetadata(sessionId, verifySession),
    ),
    candidates: sessionAction(async ({ startedAt, verifySession }) => {
      const entries = await service.candidates(startedAt);
      verifySession();
      return entries;
    }),
    save: sessionAction(
      ({ sessionId, platform, url, candidateId, verifySession }) =>
        service.save(sessionId, platform, { url, candidateId }, verifySession),
    ),
    remove: sessionAction(({ sessionId, platform }) =>
      service.remove(sessionId, platform),
    ),
    open: sessionAction(({ sessionId, platform }) =>
      service.open(sessionId, platform),
    ),
  })) {
    ipcMain.handle(`session-platform-video:${name}`, async (_event, intent) => {
      return runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: {
            source: 'session-platform-video',
            operation: name,
            code: 'PLATFORM_VIDEO_FAILED',
          },
          publicError: { code: 'PLATFORM_VIDEO_FAILED' },
        },
        async () => {
          try {
            return { ok: true, value: await action(intent) };
          } catch (error) {
            if (
              !(error instanceof PlatformVideoError) ||
              error.code === 'failed'
            )
              throw error;
            const code = `PLATFORM_VIDEO_${error.code.replace(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase()}`;
            return {
              ok: false,
              error: { code, message: t(`errors.${code}.message`) },
            };
          }
        },
      );
    });
  }
}

module.exports = { registerSessionPlatformVideoHandlers };

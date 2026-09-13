'use strict';

const crypto = require('node:crypto');
const { atomicWriteJson } = require('../lib/atomicWrite');
const { buildFeedbackPayload } = require('../lib/feedback/payload');
const {
  DIAGNOSTICS_ALLOWED_KINDS,
  DIAGNOSTICS_EVENT_LIMIT,
} = require('../lib/feedback/constants');

const DEFAULT_MAX_SUBMISSIONS_PER_WINDOW = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function errorCodeFromReason(reason) {
  return `FEEDBACK_${String(reason).toUpperCase().replaceAll('-', '_')}`;
}

function buildPayloadFromInput(
  input,
  { service, environment, idGenerator, now },
) {
  const rawInput = input && typeof input === 'object' ? input : {};
  const kind = rawInput.kind;
  const includeDiagnostics =
    Boolean(rawInput.includeDiagnostics) && DIAGNOSTICS_ALLOWED_KINDS.has(kind);
  const diagnosticsEvents = includeDiagnostics
    ? service.listRecent(DIAGNOSTICS_EVENT_LIMIT)
    : [];
  return buildFeedbackPayload({
    kind,
    description: rawInput.description,
    contact: rawInput.contact,
    trackLabel: rawInput.trackLabel,
    environment,
    includeDiagnostics,
    diagnosticsEvents,
    reportId: idGenerator(),
    createdAt: new Date(now()).toISOString(),
  });
}

// Preview and submit each rebuild the payload independently from the same
// raw renderer input rather than the renderer replaying a cached preview —
// this keeps main stateless between the two calls. They stay byte-for-byte
// equivalent except reportId/createdAt (see payload.test.js), which is what
// the preview-then-confirm contract actually needs: the user sees every
// field kind/category of data that will be sent, not a literal byte replay.
function registerFeedbackHandlers({
  ipcMain,
  service,
  client,
  dialog,
  getMainWindow = () => null,
  now = Date.now,
  appVersion = '',
  electronVersion = '',
  locale = '',
  idGenerator = () => crypto.randomUUID(),
  writeExportFile = (filePath, data) => atomicWriteJson(filePath, data),
  maxSubmissionsPerWindow = DEFAULT_MAX_SUBMISSIONS_PER_WINDOW,
}) {
  const environment = {
    appVersion,
    electronVersion,
    platform: process.platform,
    locale,
  };
  let windowStartedAt = now();
  let submissionCount = 0;

  function withinRateLimit() {
    const currentTime = now();
    if (currentTime - windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
      windowStartedAt = currentTime;
      submissionCount = 0;
    }
    if (submissionCount >= maxSubmissionsPerWindow) return false;
    submissionCount += 1;
    return true;
  }

  ipcMain.handle('feedback:build-preview', async (event, input) => {
    const built = buildPayloadFromInput(input, {
      service,
      environment,
      idGenerator,
      now,
    });
    return built.status === 'ok'
      ? { ok: true, payload: built.payload }
      : { ok: false, errorCode: errorCodeFromReason(built.reason) };
  });

  ipcMain.handle('feedback:submit', async (event, input) => {
    if (!withinRateLimit()) {
      return { ok: false, errorCode: 'FEEDBACK_RATE_LIMITED' };
    }
    const built = buildPayloadFromInput(input, {
      service,
      environment,
      idGenerator,
      now,
    });
    if (built.status !== 'ok') {
      return { ok: false, errorCode: errorCodeFromReason(built.reason) };
    }
    const result = await client.submit(built.payload);
    if (result.status !== 'ok') {
      return {
        ok: false,
        errorCode: 'FEEDBACK_SUBMIT_FAILED',
        reason: result.reason,
      };
    }
    return { ok: true, reportId: result.reportId };
  });

  // Renderer never supplies a path — same main-owned save-dialog pattern as
  // diagnostics:export. This is the fallback offered when feedback:submit
  // fails (offline, relay down), so the user's write-up isn't lost.
  ipcMain.handle('feedback:export-fallback', async (event, input) => {
    try {
      const built = buildPayloadFromInput(input, {
        service,
        environment,
        idGenerator,
        now,
      });
      if (built.status !== 'ok') {
        return { ok: false, errorCode: errorCodeFromReason(built.reason) };
      }
      const ownerWindow = getMainWindow();
      const dialogOptions = {
        title: '另存意見回饋',
        defaultPath: `utawakui-feedback-${new Date(now())
          .toISOString()
          .replace(/[:.]/g, '-')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      const result = ownerWindow
        ? await dialog.showSaveDialog(ownerWindow, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);
      if (result.canceled || !result.filePath) {
        return { ok: true, cancelled: true };
      }
      writeExportFile(result.filePath, built.payload);
      return { ok: true, cancelled: false };
    } catch {
      return { ok: false, errorCode: 'FEEDBACK_EXPORT_FAILED' };
    }
  });
}

module.exports = { registerFeedbackHandlers };

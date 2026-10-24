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
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_PREVIEWS = 4;

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

// What the user reviewed is exactly what leaves the machine: submit and
// export reuse the main-held preview payload by its reportId, so later
// diagnostics never join a report the user already approved.
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

  const previews = new Map();

  function rememberPreview(payload) {
    previews.set(payload.reportId, { payload, createdAt: now() });
    while (previews.size > MAX_PENDING_PREVIEWS) {
      previews.delete(previews.keys().next().value);
    }
  }

  function previewFor(input) {
    const previewId = input && typeof input === 'object' ? input.previewId : '';
    const entry =
      typeof previewId === 'string' ? previews.get(previewId) : null;
    if (!entry) return null;
    if (now() - entry.createdAt > PREVIEW_TTL_MS) {
      previews.delete(previewId);
      return null;
    }
    return entry.payload;
  }

  function recordSubmission(level, code, reportId, reason) {
    try {
      service.record?.({
        process: 'main',
        level,
        source: 'feedback',
        operation: 'submit',
        code,
        message:
          level === 'info'
            ? 'Feedback submitted'
            : 'Feedback submission failed',
        correlationId: reportId,
        context: reason ? { reason } : {},
      });
    } catch {
      // Diagnostics must never turn a feedback result into a failure.
    }
  }

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
    if (built.status !== 'ok') {
      return { ok: false, errorCode: errorCodeFromReason(built.reason) };
    }
    rememberPreview(built.payload);
    return { ok: true, payload: built.payload };
  });

  ipcMain.handle('feedback:submit', async (event, input) => {
    const payload = previewFor(input);
    if (!payload) return { ok: false, errorCode: 'FEEDBACK_PREVIEW_EXPIRED' };
    if (!withinRateLimit()) {
      return { ok: false, errorCode: 'FEEDBACK_RATE_LIMITED' };
    }
    const result = await client.submit(payload);
    if (result.status !== 'ok') {
      recordSubmission(
        'warning',
        'FEEDBACK_SUBMIT_FAILED',
        payload.reportId,
        result.reason,
      );
      return {
        ok: false,
        errorCode: 'FEEDBACK_SUBMIT_FAILED',
        reason: result.reason,
      };
    }
    previews.delete(payload.reportId);
    recordSubmission('info', 'FEEDBACK_SUBMITTED', payload.reportId);
    return { ok: true, reportId: result.reportId };
  });

  // Renderer never supplies a path — same main-owned save-dialog pattern as
  // diagnostics:export. This is the fallback offered when feedback:submit
  // fails (offline, relay down), so the user's write-up isn't lost.
  ipcMain.handle('feedback:export-fallback', async (event, input) => {
    try {
      const payload = previewFor(input);
      if (!payload) {
        return { ok: false, errorCode: 'FEEDBACK_PREVIEW_EXPIRED' };
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
      writeExportFile(result.filePath, payload);
      return { ok: true, cancelled: false };
    } catch {
      return { ok: false, errorCode: 'FEEDBACK_EXPORT_FAILED' };
    }
  });
}

module.exports = { registerFeedbackHandlers };

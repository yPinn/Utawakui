'use strict';

const {
  constants,
  createCipheriv,
  publicEncrypt,
  randomBytes,
} = require('node:crypto');
const { gzip } = require('node:zlib');
const { promisify } = require('node:util');
const { appFramesOf } = require('./autoReport/severity');
const compress = promisify(gzip);

const BUNDLE_VERSION = 1;
const SCHEMA_VERSION = 1;

function emptyLevelCounts() {
  return { debug: 0, info: 0, warning: 0, error: 0 };
}

function countLevels(events) {
  const counts = emptyLevelCounts();
  for (const event of events) {
    if (Object.hasOwn(counts, event?.level)) counts[event.level] += 1;
  }
  return counts;
}

// Events are already normalized/redacted by diagnostics.js's own storage and
// read path (createDiagnosticsService().listRecent()); this only shapes them
// into a single, self-describing support bundle for an explicit user export.
function buildDiagnosticsSupportBundle({
  events,
  appVersion,
  electronVersion,
  exportedAt,
} = {}) {
  const safeEvents = Array.isArray(events) ? events : [];
  return {
    bundleVersion: BUNDLE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt:
      typeof exportedAt === 'string' ? exportedAt : new Date().toISOString(),
    appVersion: typeof appVersion === 'string' ? appVersion : '',
    electronVersion: typeof electronVersion === 'string' ? electronVersion : '',
    eventCount: safeEvents.length,
    levelCounts: countLevels(safeEvents),
    events: safeEvents,
  };
}

function isSupportIssue(event) {
  return event?.level === 'error' || event?.level === 'warning';
}

function isAutoReportReceipt(event) {
  return (
    event?.process === 'main' &&
    event.source === 'auto-report' &&
    event.code === 'AUTO_REPORT_SENT'
  );
}

function isSupportDiagnostic(event) {
  return isSupportIssue(event) || isAutoReportReceipt(event);
}

async function packageDiagnostics(bundle, { publicKey, reference } = {}) {
  const events = bundle.events.filter(isSupportIssue);
  const times = events
    .map(({ timestamp }) => timestamp)
    .filter(Boolean)
    .sort();
  const summary = {
    format: 'utawakui-support-v1',
    reference,
    eventCount: events.length,
    from: times[0] ?? null,
    to: times.at(-1) ?? null,
    levelCounts: countLevels(events),
  };
  if (!publicKey || events.length === 0) return summary;

  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(reference ?? ''), 'utf8'));
  const details = events.map(
    ({
      id,
      timestamp,
      level,
      process,
      source,
      operation,
      code,
      correlationId,
      stack,
    }) => ({
      id,
      timestamp,
      level,
      process,
      source,
      operation,
      code,
      correlationId,
      appFrames: appFramesOf(stack),
    }),
  );
  const reports = bundle.events
    .filter(isAutoReportReceipt)
    .map(({ correlationId, context }) => ({
      reportId: correlationId,
      diagnosticId: context?.reason,
    }));
  const compressed = await compress(
    JSON.stringify({
      appVersion: bundle.appVersion,
      events: details,
      reports,
    }),
  );
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const wrappedKey = publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    key,
  );
  return {
    ...summary,
    sealed: {
      key: wrappedKey.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: ciphertext.toString('base64'),
    },
  };
}

module.exports = {
  buildDiagnosticsSupportBundle,
  isSupportDiagnostic,
  packageDiagnostics,
};

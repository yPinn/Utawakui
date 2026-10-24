'use strict';

const { appFramesOf, labelOf } = require('./severity');

const AUTO_REPORT_SCHEMA_VERSION = 1;
const MAX_MESSAGE_LENGTH = 300;

function boundedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

// Built only from an already-redacted diagnostic event: fixed fields, the
// app-bundle frames and a generated status line. No free text, library,
// lyrics or path data can be added here.
function buildAutoReport({
  event,
  severity,
  escalated = false,
  occurrences = 1,
  environment = {},
  reportId,
  createdAt,
}) {
  // The label already names the failing part; the recording process (often
  // main, even for renderer exits) stays in its own field.
  const platform = boundedText(environment.platform, 32);
  const appVersion = boundedText(environment.appVersion, 32);
  const window = escalated ? '1 小時內' : '24 小時內';
  return {
    schemaVersion: AUTO_REPORT_SCHEMA_VERSION,
    kind: 'auto',
    reportId,
    createdAt,
    severity,
    escalated,
    code: event.code,
    source: event.source,
    operation: event.operation,
    process: event.process,
    summary: `${labelOf(event.code)}（${event.code}）；App ${appVersion || '?'}／${platform || '?'}；${window}第 ${occurrences} 次。`,
    message: boundedText(event.message, MAX_MESSAGE_LENGTH),
    appFrames: appFramesOf(event.stack),
    occurrences,
    environment: {
      appVersion,
      electronVersion: boundedText(environment.electronVersion, 32),
      platform,
      locale: boundedText(environment.locale, 16),
    },
  };
}

module.exports = { AUTO_REPORT_SCHEMA_VERSION, buildAutoReport };

import {
  FEEDBACK_KIND_VALUES,
  FEEDBACK_SCHEMA_VERSION,
  MAX_CONTACT_LENGTH,
  MAX_CREATED_AT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_DIAGNOSTICS_EVENT_COUNT,
  MAX_ENVIRONMENT_VALUE_LENGTH,
  MAX_PAYLOAD_BYTES,
  MAX_REPORT_ID_LENGTH,
  MAX_TRACK_LABEL_LENGTH,
} from './constants.js';

function isNonEmptyString(value, maxLength) {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength
  );
}

function isBoundedOptionalString(value, maxLength) {
  return value === undefined || isNonEmptyString(value, maxLength);
}

function isBoundedEnvironment(environment) {
  if (
    !environment ||
    typeof environment !== 'object' ||
    Array.isArray(environment)
  ) {
    return false;
  }
  return ['appVersion', 'electronVersion', 'platform', 'locale'].every(
    (key) =>
      environment[key] === undefined ||
      (typeof environment[key] === 'string' &&
        environment[key].length <= MAX_ENVIRONMENT_VALUE_LENGTH),
  );
}

function isCanonicalIsoTimestamp(value) {
  if (!isNonEmptyString(value, MAX_CREATED_AT_LENGTH)) return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function isBoundedDiagnostics(diagnostics) {
  if (
    !diagnostics ||
    typeof diagnostics !== 'object' ||
    Array.isArray(diagnostics) ||
    !Array.isArray(diagnostics.events)
  ) {
    return false;
  }
  return (
    Number.isSafeInteger(diagnostics.eventCount) &&
    diagnostics.eventCount >= 0 &&
    diagnostics.eventCount <= MAX_DIAGNOSTICS_EVENT_COUNT &&
    diagnostics.eventCount === diagnostics.events.length
  );
}

// TextEncoder (not Buffer) — this runs on Cloudflare Workers, which has no
// Node Buffer global without an explicit nodejs_compat flag.
function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}

// The relay never trusts client-side bounds — everything the app-side
// buildFeedbackPayload already enforces is re-checked here independently,
// since this endpoint is reachable by anything that can send an HTTP
// request, not only this app's own main process.
export function validateFeedbackPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'invalid-payload' };
  }
  if (utf8ByteLength(JSON.stringify(payload)) > MAX_PAYLOAD_BYTES) {
    return { ok: false, reason: 'payload-too-large' };
  }
  if (payload.schemaVersion !== FEEDBACK_SCHEMA_VERSION) {
    return { ok: false, reason: 'invalid-schema-version' };
  }
  if (!FEEDBACK_KIND_VALUES.includes(payload.kind)) {
    return { ok: false, reason: 'invalid-kind' };
  }
  if (
    !isNonEmptyString(payload.reportId, MAX_REPORT_ID_LENGTH) ||
    !/^[A-Za-z0-9_-]+$/.test(payload.reportId)
  ) {
    return { ok: false, reason: 'invalid-report-id' };
  }
  if (!isNonEmptyString(payload.description, MAX_DESCRIPTION_LENGTH)) {
    return { ok: false, reason: 'invalid-description' };
  }
  if (!isCanonicalIsoTimestamp(payload.createdAt)) {
    return { ok: false, reason: 'invalid-created-at' };
  }
  if (!isBoundedEnvironment(payload.environment)) {
    return { ok: false, reason: 'invalid-environment' };
  }
  if (!isBoundedOptionalString(payload.contact, MAX_CONTACT_LENGTH)) {
    return { ok: false, reason: 'invalid-contact' };
  }
  if (!isBoundedOptionalString(payload.trackLabel, MAX_TRACK_LABEL_LENGTH)) {
    return { ok: false, reason: 'invalid-track-label' };
  }
  if (payload.trackLabel !== undefined && payload.kind !== 'content') {
    return { ok: false, reason: 'track-label-not-allowed' };
  }
  if (payload.diagnostics !== undefined && payload.kind !== 'bug') {
    return { ok: false, reason: 'diagnostics-not-allowed' };
  }
  if (
    payload.diagnostics !== undefined &&
    !isBoundedDiagnostics(payload.diagnostics)
  ) {
    return { ok: false, reason: 'invalid-diagnostics' };
  }
  return { ok: true };
}

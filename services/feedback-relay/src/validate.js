import {
  FEEDBACK_KIND_VALUES,
  MAX_CONTACT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_PAYLOAD_BYTES,
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
  if (!FEEDBACK_KIND_VALUES.includes(payload.kind)) {
    return { ok: false, reason: 'invalid-kind' };
  }
  if (!isNonEmptyString(payload.reportId, 200)) {
    return { ok: false, reason: 'invalid-report-id' };
  }
  if (!isNonEmptyString(payload.description, MAX_DESCRIPTION_LENGTH)) {
    return { ok: false, reason: 'invalid-description' };
  }
  if (typeof payload.createdAt !== 'string' || payload.createdAt.length === 0) {
    return { ok: false, reason: 'invalid-created-at' };
  }
  if (!isBoundedOptionalString(payload.contact, MAX_CONTACT_LENGTH)) {
    return { ok: false, reason: 'invalid-contact' };
  }
  if (!isBoundedOptionalString(payload.trackLabel, MAX_TRACK_LABEL_LENGTH)) {
    return { ok: false, reason: 'invalid-track-label' };
  }
  if (
    payload.diagnostics !== undefined &&
    (typeof payload.diagnostics !== 'object' || payload.diagnostics === null)
  ) {
    return { ok: false, reason: 'invalid-diagnostics' };
  }
  return { ok: true };
}

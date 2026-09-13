'use strict';

const { buildDiagnosticsSupportBundle } = require('../diagnosticsExport');
const {
  FEEDBACK_SCHEMA_VERSION,
  FEEDBACK_KINDS,
  FEEDBACK_KIND_VALUES,
  DIAGNOSTICS_ALLOWED_KINDS,
  MAX_DESCRIPTION_LENGTH,
  MAX_CONTACT_LENGTH,
  MAX_TRACK_LABEL_LENGTH,
  MAX_PAYLOAD_BYTES,
} = require('./constants');

// Tab/newline/carriage-return are ordinary content in a multi-line
// description and must survive; every other C0 control character (and DEL)
// does not belong in submitted text and is dropped. Comparing numeric code
// points (rather than a regex literal) avoids embedding raw control bytes
// in this source file.
function isStrippableControlCharacter(codePoint) {
  const isTabOrNewlineOrReturn =
    codePoint === 9 || codePoint === 10 || codePoint === 13;
  if (isTabOrNewlineOrReturn) return false;
  return codePoint <= 31 || codePoint === 127;
}

// User-authored free text is reviewed by the user in the preview step before
// send, unlike diagnostics.js's redactText (which guards *system*-generated
// messages the user never sees before they're written to disk). Mangling a
// pasted URL or path here would actively break `content` reports, which
// routinely need to reference a source link to be actionable — so this only
// strips control characters and bounds length; the preview step is the
// actual privacy mechanism for these fields.
function normalizeUserText(value, maxLength) {
  if (typeof value !== 'string') return '';
  let stripped = '';
  for (const character of value) {
    if (!isStrippableControlCharacter(character.codePointAt(0))) {
      stripped += character;
    }
  }
  return stripped.trim().slice(0, maxLength);
}

// Flat and independently defaulted so a future field (this app has no i18n
// yet, but locale is already captured since language is part of the usage
// context a report needs) is a one-line addition, not a schema migration —
// `schemaVersion` above covers the case where a field's meaning ever changes.
function normalizeEnvironment(environment) {
  const source =
    environment && typeof environment === 'object' ? environment : {};
  return {
    appVersion: typeof source.appVersion === 'string' ? source.appVersion : '',
    electronVersion:
      typeof source.electronVersion === 'string' ? source.electronVersion : '',
    platform: typeof source.platform === 'string' ? source.platform : '',
    locale: typeof source.locale === 'string' ? source.locale : '',
  };
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

// Diagnostic events are already normalized/redacted by diagnostics.js at
// write time (createDiagnosticsService().listRecent() only ever returns
// sanitized records); this only trims the bundle when it still doesn't fit
// the relay's payload ceiling, dropping the oldest events first (the caller
// passes them newest-first, matching listRecent()'s read order).
function fitDiagnosticsBundle(bundle, maxBytes) {
  const events = [...bundle.events];
  let trimmed = { ...bundle, events };
  while (events.length > 0 && byteLength(trimmed) > maxBytes) {
    events.pop();
    trimmed = { ...bundle, events, eventCount: events.length };
  }
  return trimmed;
}

function buildFeedbackPayload({
  kind,
  description,
  contact = '',
  trackLabel = '',
  environment,
  includeDiagnostics = false,
  diagnosticsEvents = [],
  reportId,
  createdAt,
} = {}) {
  if (!FEEDBACK_KIND_VALUES.includes(kind)) {
    return { status: 'error', reason: 'invalid-kind' };
  }
  if (typeof reportId !== 'string' || reportId.length === 0) {
    return { status: 'error', reason: 'report-id-required' };
  }

  const normalizedDescription = normalizeUserText(
    description,
    MAX_DESCRIPTION_LENGTH,
  );
  if (!normalizedDescription) {
    return { status: 'error', reason: 'description-required' };
  }

  const payload = {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    reportId,
    kind,
    createdAt:
      typeof createdAt === 'string' ? createdAt : new Date().toISOString(),
    description: normalizedDescription,
    environment: normalizeEnvironment(environment),
  };

  const normalizedContact = normalizeUserText(contact, MAX_CONTACT_LENGTH);
  if (normalizedContact) payload.contact = normalizedContact;

  const normalizedTrackLabel = normalizeUserText(
    trackLabel,
    MAX_TRACK_LABEL_LENGTH,
  );
  if (kind === FEEDBACK_KINDS.CONTENT && normalizedTrackLabel) {
    payload.trackLabel = normalizedTrackLabel;
  }

  if (
    includeDiagnostics &&
    DIAGNOSTICS_ALLOWED_KINDS.has(kind) &&
    Array.isArray(diagnosticsEvents) &&
    diagnosticsEvents.length > 0
  ) {
    const bundle = buildDiagnosticsSupportBundle({
      events: diagnosticsEvents,
      appVersion: payload.environment.appVersion,
      electronVersion: payload.environment.electronVersion,
      exportedAt: payload.createdAt,
    });
    const remainingBudget = MAX_PAYLOAD_BYTES - byteLength(payload);
    payload.diagnostics = fitDiagnosticsBundle(bundle, remainingBudget);
  }

  if (byteLength(payload) > MAX_PAYLOAD_BYTES) {
    // Diagnostics are already fitted above; a still-oversized payload means
    // the description itself is the problem (rare given the 2000-char cap).
    // Fail rather than silently truncate user-authored content further.
    return { status: 'error', reason: 'payload-too-large' };
  }

  return { status: 'ok', payload };
}

module.exports = {
  buildFeedbackPayload,
  normalizeUserText,
};

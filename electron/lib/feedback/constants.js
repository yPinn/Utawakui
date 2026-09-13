'use strict';

// Every field a caller may send is bounded here so a runaway textarea or a
// pasted stack trace cannot blow past what the relay and Discord accept.
const FEEDBACK_SCHEMA_VERSION = 1;

const FEEDBACK_KINDS = Object.freeze({
  BUG: 'bug',
  FEATURE: 'feature',
  EXPERIENCE: 'experience',
  CONTENT: 'content',
});

const FEEDBACK_KIND_VALUES = Object.freeze(Object.values(FEEDBACK_KINDS));

// Only `bug` defaults to attaching diagnostics — the other kinds have no
// exception to point at, so attaching the same window of recent events would
// collect more than the user consciously chose to share for that report.
const DIAGNOSTICS_DEFAULT_BY_KIND = Object.freeze({
  [FEEDBACK_KINDS.BUG]: true,
  [FEEDBACK_KINDS.FEATURE]: false,
  [FEEDBACK_KINDS.EXPERIENCE]: false,
  [FEEDBACK_KINDS.CONTENT]: false,
});

// Diagnostics may only ever be attached for `bug`; the UI preview and the
// main-process payload builder both enforce this independently.
const DIAGNOSTICS_ALLOWED_KINDS = new Set([FEEDBACK_KINDS.BUG]);

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CONTACT_LENGTH = 200;
const MAX_TRACK_LABEL_LENGTH = 200;
// Recent-event window for an attached bug report: enough for the failure and
// its immediate lead-up, well short of the 500-event full export.
const DIAGNOSTICS_EVENT_LIMIT = 50;
// Hard ceiling on the serialized payload sent to the relay.
const MAX_PAYLOAD_BYTES = 256 * 1024;

const DEFAULT_FEEDBACK_ENDPOINT = 'https://feedback.utawakui.app/submit';

function resolveFeedbackEndpoint(env = process.env) {
  const override = env.UTAWAKUI_FEEDBACK_ENDPOINT;
  return typeof override === 'string' && override.trim().length > 0
    ? override.trim()
    : DEFAULT_FEEDBACK_ENDPOINT;
}

module.exports = {
  FEEDBACK_SCHEMA_VERSION,
  FEEDBACK_KINDS,
  FEEDBACK_KIND_VALUES,
  DIAGNOSTICS_DEFAULT_BY_KIND,
  DIAGNOSTICS_ALLOWED_KINDS,
  MAX_DESCRIPTION_LENGTH,
  MAX_CONTACT_LENGTH,
  MAX_TRACK_LABEL_LENGTH,
  DIAGNOSTICS_EVENT_LIMIT,
  MAX_PAYLOAD_BYTES,
  DEFAULT_FEEDBACK_ENDPOINT,
  resolveFeedbackEndpoint,
};

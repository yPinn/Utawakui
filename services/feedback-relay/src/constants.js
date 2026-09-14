// The relay is deployed independently (Cloudflare Workers) from the
// Electron app and never shares a bundler graph with it, so the small
// bounds it needs to defensively re-check are duplicated here rather than
// imported across that boundary — see electron/lib/feedback/constants.js
// for the app-side source of truth these mirror.
export const FEEDBACK_KIND_VALUES = Object.freeze([
  'bug',
  'feature',
  'experience',
  'content',
]);

export const FEEDBACK_SCHEMA_VERSION = 1;
export const FEEDBACK_SUBMIT_PATH = '/feedback/submit';
export const FEEDBACK_CLIENT_MARKER_HEADER = 'X-Utawakui-Client';
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_CONTACT_LENGTH = 200;
export const MAX_TRACK_LABEL_LENGTH = 200;
export const MAX_ENVIRONMENT_VALUE_LENGTH = 100;
export const MAX_CREATED_AT_LENGTH = 64;
export const MAX_REPORT_ID_LENGTH = 200;
// Mirrors electron/lib/feedback/constants.js. The app only ever includes
// this newest-first window in an explicitly approved bug report.
export const MAX_DIAGNOSTICS_EVENT_COUNT = 50;
// A little above the app's own 256 KiB cap: the relay must never be
// stricter than the client it trusts least, only at least as strict.
export const MAX_PAYLOAD_BYTES = 320 * 1024;

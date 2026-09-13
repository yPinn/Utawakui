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

export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_CONTACT_LENGTH = 200;
export const MAX_TRACK_LABEL_LENGTH = 200;
// A little above the app's own 256 KiB cap: the relay must never be
// stricter than the client it trusts least, only at least as strict.
export const MAX_PAYLOAD_BYTES = 320 * 1024;

// Renderer-side mirror of electron/lib/feedback/constants.js — the two
// processes never share a module graph (same reason src/constants/
// featureGates.js and electron/lib/featureGates.js each hold their own copy
// of enum-like values), so this list and the length bounds below must be
// kept in sync by hand if either side changes.

import { t } from '../utils/i18n.js';

export const FEEDBACK_KINDS = Object.freeze({
  BUG: 'bug',
  FEATURE: 'feature',
  EXPERIENCE: 'experience',
  CONTENT: 'content',
});

export const FEEDBACK_KIND_OPTIONS = Object.freeze([
  { value: FEEDBACK_KINDS.BUG, label: t('feedback.kinds.bug') },
  { value: FEEDBACK_KINDS.FEATURE, label: t('feedback.kinds.feature') },
  { value: FEEDBACK_KINDS.EXPERIENCE, label: t('feedback.kinds.experience') },
  { value: FEEDBACK_KINDS.CONTENT, label: t('feedback.kinds.content') },
]);

// Only a bug report has an exception to point at; the other kinds have no
// default reason to attach recent diagnostic events.
export const DIAGNOSTICS_DEFAULT_BY_KIND = Object.freeze({
  [FEEDBACK_KINDS.BUG]: true,
  [FEEDBACK_KINDS.FEATURE]: false,
  [FEEDBACK_KINDS.EXPERIENCE]: false,
  [FEEDBACK_KINDS.CONTENT]: false,
});

export const DIAGNOSTICS_ALLOWED_KINDS = new Set([FEEDBACK_KINDS.BUG]);

export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_CONTACT_LENGTH = 200;
export const MAX_TRACK_LABEL_LENGTH = 200;

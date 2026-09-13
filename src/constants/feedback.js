// Renderer-side mirror of electron/lib/feedback/constants.js — the two
// processes never share a module graph (same reason src/constants/
// featureGates.js and electron/lib/featureGates.js each hold their own copy
// of enum-like values), so this list and the length bounds below must be
// kept in sync by hand if either side changes.
export const FEEDBACK_KINDS = Object.freeze({
  BUG: 'bug',
  FEATURE: 'feature',
  EXPERIENCE: 'experience',
  CONTENT: 'content',
});

export const FEEDBACK_KIND_OPTIONS = Object.freeze([
  { value: FEEDBACK_KINDS.BUG, label: '錯誤回報' },
  { value: FEEDBACK_KINDS.FEATURE, label: '功能請求' },
  { value: FEEDBACK_KINDS.EXPERIENCE, label: '使用體驗意見' },
  { value: FEEDBACK_KINDS.CONTENT, label: '內容／歌詞來源問題' },
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

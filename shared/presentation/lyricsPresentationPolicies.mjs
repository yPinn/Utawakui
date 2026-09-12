import { lyricsTemplateCapabilities } from './lyricsTemplateCapabilities.mjs';

const POLICY_VERSION = 1;

function freezePolicy(policy) {
  return Object.freeze({ version: POLICY_VERSION, ...policy });
}

export const LYRICS_PRESENTATION_POLICIES = Object.freeze({
  literal: freezePolicy({
    id: 'literal',
    label: '忠實原文',
    contentMode: 'literal',
    automaticLayout: false,
  }),
  balanced: freezePolicy({
    id: 'balanced',
    label: '平衡分行',
    contentMode: 'preserve',
    automaticLayout: true,
  }),
  'broadcast-compact': freezePolicy({
    id: 'broadcast-compact',
    label: '轉播精簡',
    contentMode: 'compact',
    automaticLayout: true,
  }),
});

export function normalizeLyricsPresentationPolicyId(templateId, value) {
  const capabilities = lyricsTemplateCapabilities(templateId);
  const policyIds = capabilities.presentationPolicyIds;
  if (policyIds.length === 0) return null;
  const candidate = String(value ?? '');
  return policyIds.includes(candidate)
    ? candidate
    : capabilities.defaultPresentationPolicyId;
}

export function sanitizeLyricsPresentationPolicyId(templateId, value) {
  const candidate = String(value ?? '');
  const policyIds =
    lyricsTemplateCapabilities(templateId).presentationPolicyIds;
  return policyIds.includes(candidate) ? candidate : undefined;
}

export function lyricsPresentationPolicyForTemplate(templateId, value) {
  const policyId = normalizeLyricsPresentationPolicyId(templateId, value);
  return policyId ? LYRICS_PRESENTATION_POLICIES[policyId] : null;
}

export function lyricsPresentationPolicyOptionsForTemplate(templateId) {
  const policyIds =
    lyricsTemplateCapabilities(templateId).presentationPolicyIds;
  return policyIds.map((id) => ({
    id,
    label: LYRICS_PRESENTATION_POLICIES[id].label,
  }));
}

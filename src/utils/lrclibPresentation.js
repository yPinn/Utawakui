import { catalogKey, t } from './i18n.js';
import { lyricsProviderAlias } from './lyricsSourcePresentation.js';

const CAPABILITY_KEYS = Object.freeze({
  T2: 't2',
  T1: 't1',
  T0: 't0',
  instrumental: 'instrumental',
  unsupported: 'unsupported',
});

const WARNINGS = new Set([
  'partial-word-timing',
  'overlapping-lines',
  'overlapping-words',
  'unsupported-lyricsfile-version',
  'invalid-lyricsfile',
  'normalized-boundary-jitter',
  'version-mismatch',
  'instrumental-record',
]);

export function capabilityLabel(candidate) {
  const level = candidate?.capability?.level;
  if (level === 'T2' && candidate.capability.partial)
    return t('lyricsSource.capability.t2Partial');
  return t(
    `lyricsSource.capability.${Object.hasOwn(CAPABILITY_KEYS, level) ? CAPABILITY_KEYS[level] : 'unknown'}`,
  );
}

export function candidateImportMessage(candidate) {
  const level = candidate?.capability?.level;
  if (level === 'instrumental') {
    return t('lyricsSource.importInstrumental');
  }
  if (level === 'unsupported') {
    return t('lyricsSource.importUnsupported');
  }
  return null;
}

export function warningLabels(warnings) {
  // The capability badge already shows the usable format after a fallback.
  return [...new Set(Array.isArray(warnings) ? warnings : [])]
    .filter((warning) => WARNINGS.has(warning))
    .map((warning) => t(`lyricsSource.warnings.${catalogKey(warning)}`));
}

export function candidateTimingDetails(candidate) {
  if (!['T0', 'T1'].includes(candidate?.capability?.level)) return '';
  const evidence = candidate.timingEvidence;
  switch (evidence?.status) {
    case 'no-word-timing':
      return t('lyricsSource.timingDetails.noWordTiming');
    case 'unsupported-format':
      return t('lyricsSource.timingDetails.unsupportedFormat');
    case 'structural-error':
      return t('lyricsSource.timingDetails.structure');
    case 'semantic-error':
      return evidence.issueCodes?.includes('word-text-mismatch')
        ? t('lyricsSource.timingDetails.wordTextMismatch')
        : t('lyricsSource.timingDetails.validation');
    default:
      return '';
  }
}

export function candidateTimelineDifference(
  group,
  candidate,
  changedCandidates,
) {
  const comparison = group?.timelineDifferences?.find(
    (item) => item.candidateKey === candidate.candidateKey,
  );
  if (
    !comparison ||
    changedCandidates?.has(candidate.candidateKey) ||
    changedCandidates?.has(comparison.referenceCandidateKey)
  )
    return null;
  const reference = group.candidates.find(
    (item) => item.candidateKey === comparison.referenceCandidateKey,
  );
  if (
    !/^[a-f0-9]{64}$/u.test(comparison.referenceFingerprint) ||
    !/^[a-f0-9]{64}$/u.test(comparison.candidateFingerprint)
  )
    return null;
  if (
    !reference ||
    reference.previewFingerprint !== comparison.referenceFingerprint ||
    candidate.previewFingerprint !== comparison.candidateFingerprint
  )
    return null;
  const { offsetMs, matchedLineCount } = comparison;
  if (
    !Number.isSafeInteger(offsetMs) ||
    Math.abs(offsetMs) <= 1000 ||
    Math.abs(offsetMs) > 15000 ||
    !Number.isSafeInteger(matchedLineCount) ||
    matchedLineCount < 5 ||
    matchedLineCount > 128
  )
    return null;
  const seconds = Number((Math.abs(offsetMs) / 1000).toFixed(1));
  return t(
    offsetMs > 0
      ? 'lyricsSource.timeline.later'
      : 'lyricsSource.timeline.earlier',
    {
      reference: reference.providerId
        ? lyricsProviderAlias(reference.providerId)
        : t('lyricsSource.timeline.reference'),
      seconds,
    },
  );
}

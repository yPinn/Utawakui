import { catalogKey, t } from './i18n.js';

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

function fallbackCapabilityLabel(capability) {
  if (capability?.level === 'T1') return t('lyricsSource.fallback.t1');
  if (capability?.level === 'T0') return t('lyricsSource.fallback.t0');
  return t('lyricsSource.fallback.other');
}

function warningLabel(warning, capability) {
  const fallback = fallbackCapabilityLabel(capability);
  if (warning === 'unsupported-lyricsfile-version-fallback') {
    return t('lyricsSource.warnings.versionFallback', { fallback });
  }
  if (warning === 'invalid-lyricsfile-fallback') {
    return t('lyricsSource.warnings.invalidFallback', { fallback });
  }
  if (warning === 'invalid-yrc') {
    return t('lyricsSource.warnings.invalidYrc', { fallback });
  }
  return WARNINGS.has(warning)
    ? t(`lyricsSource.warnings.${catalogKey(warning)}`)
    : undefined;
}

export function warningLabels(warnings, capability = null) {
  return [...new Set(Array.isArray(warnings) ? warnings : [])]
    .map((warning) => warningLabel(warning, capability))
    .filter(Boolean);
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
  const labels = {
    kugou: t('lyricsAcquisition.kugou'),
    lrclib: 'LRCLIB',
    netease: t('lyricsAcquisition.netease'),
    betterlyrics: 'Better Lyrics',
  };
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
      reference:
        labels[reference.providerId] || t('lyricsSource.timeline.reference'),
      seconds,
    },
  );
}

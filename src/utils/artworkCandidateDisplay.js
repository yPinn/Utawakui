import { releaseTypeLabel } from './releasePresentation.js';
import { t } from './i18n.js';

const SECONDARY_TYPE_LABELS = Object.freeze({
  compilation: t('track.artwork.compilation'),
  live: t('track.artwork.live'),
  remix: t('track.artwork.remix'),
});

function normalized(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function releaseMeta(candidate) {
  const values = [];
  if (Number.isInteger(candidate?.firstReleaseYear)) {
    values.push(String(candidate.firstReleaseYear));
  }
  const type = normalized(candidate?.primaryType);
  const primaryType = ['single', 'ep', 'album'].includes(type)
    ? releaseTypeLabel(type)
    : '';
  if (primaryType) values.push(primaryType);
  for (const type of candidate?.secondaryTypes || []) {
    const label = SECONDARY_TYPE_LABELS[normalized(type)];
    if (label && !values.includes(label)) values.push(label);
  }
  return values.join(' · ') || t('track.artwork.noRelease');
}

function decision(candidate, reasons) {
  if (reasons.has('version-conflict')) {
    return { label: t('track.artwork.checkVersion'), tone: 'warning' };
  }
  if (candidate?.recommended)
    return { label: t('track.artwork.recommended'), tone: 'success' };
  if (candidate?.confidence === 'high') {
    return { label: t('track.artwork.strong'), tone: 'success' };
  }
  if (candidate?.confidence === 'medium') {
    return { label: t('track.artwork.possible'), tone: 'warning' };
  }
  return { label: t('track.artwork.weak'), tone: 'muted' };
}

function reasonSummary(reasons) {
  if (reasons.has('version-conflict'))
    return t('track.artwork.versionConflict');
  if (reasons.has('title-exact') && reasons.has('artist-exact')) return '';
  if (reasons.has('artist-exact') && reasons.has('title-contains')) {
    return t('track.artwork.artistTitle');
  }
  if (reasons.has('title-exact')) return t('track.artwork.titleExact');
  if (reasons.has('artist-exact')) return t('track.artwork.artistExact');
  return t('track.artwork.checkCover');
}

export function projectArtworkCandidate(candidate = {}) {
  const reasons = new Set(
    Array.isArray(candidate.reasons) ? candidate.reasons : [],
  );
  const status = decision(candidate, reasons);
  return {
    title: candidate.releaseTitle?.trim() || t('track.artwork.unknownRelease'),
    artist: candidate.artistCredit?.trim() || t('track.artwork.unknownArtist'),
    releaseMeta: releaseMeta(candidate),
    decisionLabel: status.label,
    decisionTone: status.tone,
    reason: reasonSummary(reasons),
  };
}

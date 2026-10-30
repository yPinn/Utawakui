import { t } from './i18n.js';
export const METADATA_LABELS = {
  title: t('reconciliation.labels.title'),
  artist: t('reconciliation.labels.artist'),
  album: t('reconciliation.labels.album'),
  albumArtist: t('reconciliation.labels.albumArtist'),
  releaseDate: t('reconciliation.labels.releaseDate'),
  releaseYear: t('reconciliation.labels.releaseYear'),
  trackNumber: t('reconciliation.labels.trackNumber'),
  trackTotal: t('reconciliation.labels.trackTotal'),
  discNumber: t('reconciliation.labels.discNumber'),
  discTotal: t('reconciliation.labels.discTotal'),
};
export const MERGE_LABELS = {
  name: t('reconciliation.labels.name'),
  description: t('reconciliation.labels.description'),
  type: t('reconciliation.labels.type'),
  date: t('reconciliation.labels.releaseDate'),
  totalTrackCount: t('reconciliation.labels.trackTotal'),
};
export function displayMetadata(value) {
  if (value === null || value === undefined) return t('common.none');
  if (value === '') return t('common.blank');
  if (typeof value === 'object')
    return typeof value.value === 'string' ? value.value : t('common.none');
  return String(value);
}
export function reconciliationReason(reason) {
  return (
    {
      'verified-release-members': t('reconciliation.reasons.verified'),
      'unverified-media': t('reconciliation.reasons.unverifiedMedia'),
      'different-source': t('reconciliation.reasons.differentSource'),
      'different-tracklist': t('reconciliation.reasons.differentTracklist'),
      RECONCILIATION_ASSET_CONFLICT: t('reconciliation.reasons.assetConflict'),
      RECONCILIATION_ASSET_LIMIT: t('reconciliation.reasons.assetLimit'),
    }[reason] ?? t('reconciliation.reasons.default')
  );
}
export function reconciliationItemLabel(kind) {
  return (
    {
      metadata: t('reconciliation.kinds.metadata'),
      'duplicate-file': t('reconciliation.kinds.duplicateFile'),
      'changed-file': t('reconciliation.kinds.changedFile'),
      'missing-file': t('reconciliation.kinds.missingFile'),
      'tags-unavailable': t('reconciliation.kinds.tagsUnavailable'),
      'release-pair': t('reconciliation.kinds.releasePair'),
    }[kind] ?? t('reconciliation.kinds.default')
  );
}

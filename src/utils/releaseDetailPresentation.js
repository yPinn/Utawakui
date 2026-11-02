import { formatLongDuration } from './format.js';
import { t } from './i18n.js';

export function formatReleaseDate(date) {
  const patterns = {
    year: /^(\d{4})$/,
    month: /^(\d{4})-(\d{2})$/,
    day: /^(\d{4})-(\d{2})-(\d{2})$/,
  };
  const match = patterns[date?.precision]?.exec(date?.value ?? '');
  if (
    !match ||
    Number(match[1]) < 1 ||
    (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 12)) ||
    (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 31))
  )
    return '';
  return date.value;
}

// This is a presentation of Main's resolved facts, never a second classifier.
// Singles share the album composition. Only exceptional collection facts add copy.
export function deriveReleaseDetail({
  collection,
  tracks = [],
  verification = { state: 'ready' },
} = {}) {
  if (
    collection?.kind !== 'album' ||
    collection.resolvedRelease?.type !== 'single'
  )
    return { isSingle: false, layout: 'default' };
  const release = collection.resolvedRelease;
  const ids = [...new Set(collection.trackIds ?? [])];
  const total =
    Number.isSafeInteger(release.totalTrackCount) && release.totalTrackCount > 0
      ? release.totalTrackCount
      : null;
  const byId = new Map();
  for (const track of tracks)
    if (ids.includes(track.id) && !byId.has(track.id))
      byId.set(track.id, track);
  const available = [...byId.values()];
  const partial = total !== null && total > ids.length;
  const countLabel = partial
    ? t('release.detail.partialCount', { count: ids.length, total })
    : t('library.browse.trackTotal', { count: ids.length }, ids.length);
  const duration = formatLongDuration(
    available.reduce(
      (sum, track) =>
        sum +
        (Number.isFinite(track.duration) && track.duration > 0
          ? track.duration
          : 0),
      0,
    ),
  );
  const durationsKnown = available.every(
    (track) => Number.isFinite(track.duration) && track.duration > 0,
  );
  const durationLabel = !duration
    ? ''
    : !durationsKnown
      ? t('release.detail.knownDuration', { duration })
      : available.length < ids.length
        ? t('release.detail.localDuration', { duration })
        : partial
          ? t('release.detail.includedDuration', { duration })
          : duration;
  const fields = [
    formatReleaseDate(release.date),
    durationLabel
      ? t('release.detail.countAndDuration', {
          count: countLabel,
          duration: durationLabel,
        })
      : countLabel,
  ];
  let message = '';
  if (verification.state === 'error')
    message = verification.error || t('release.detail.verifyFailed');
  else if (!ids.length) message = t('release.detail.noMembers');
  else if (!available.length) message = t('release.detail.noLocal');
  else if (available.length < ids.length)
    message = t(
      'release.detail.partialLocal',
      { count: available.length },
      available.length,
    );
  return {
    isSingle: true,
    layout: 'album',
    fields: fields.filter(Boolean),
    memberCount: ids.length,
    localTrackCount: available.length,
    totalTrackCount: total,
    state: verification.state,
    message,
    // Enables an action intent; the action still obtains fresh Main proof.
    canStart: verification.state !== 'pending' && available.length > 0,
    canShuffle: verification.state !== 'pending' && available.length > 1,
    conflictMessage: release.conflicts?.length
      ? t('release.detail.conflict')
      : '',
  };
}

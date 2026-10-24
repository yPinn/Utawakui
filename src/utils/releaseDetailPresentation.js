import { formatLongDuration } from './format.js';

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
  const ready = verification.state === 'ready';
  const byId = new Map();
  for (const track of tracks)
    if (ids.includes(track.id) && !byId.has(track.id))
      byId.set(track.id, track);
  const available = ready ? [...byId.values()] : [];
  const partial = total !== null && total > ids.length;
  const countLabel = partial
    ? `已收錄 ${ids.length}／${total} 首`
    : `${ids.length} 首曲目`;
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
      ? `已知曲長 ${duration}`
      : available.length < ids.length
        ? `可播放曲長 ${duration}`
        : partial
          ? `已收錄曲長 ${duration}`
          : duration;
  const fields = [
    formatReleaseDate(release.date),
    [countLabel, durationLabel].filter(Boolean).join('，'),
  ];
  let message = '';
  if (!ready)
    message =
      verification.state === 'error'
        ? verification.error || '發行曲目確認未完成，請重試。'
        : '正在確認發行曲目…';
  else if (!ids.length) message = '這份單曲發行尚未收錄本機曲目。';
  else if (!available.length)
    message = '目前沒有可播放的曲目，請檢查音源或在發行資訊中重新確認。';
  else if (available.length < ids.length)
    message = `目前可播放 ${available.length} 首，其餘音源請在「發行資訊」中確認。`;
  return {
    isSingle: true,
    layout: 'album',
    fields: fields.filter(Boolean),
    memberCount: ids.length,
    playableCount: available.length,
    totalTrackCount: total,
    state: verification.state,
    message,
    canStart: ready && available.length > 0,
    canShuffle: ready && available.length > 1,
    conflictMessage: release.conflicts?.length
      ? '來源發行資料與已收錄內容不一致，請在發行資訊中確認。'
      : '',
  };
}

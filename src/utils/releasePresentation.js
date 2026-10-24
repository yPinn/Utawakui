const TYPE_LABELS = {
  unknown: '未分類',
  album: '專輯',
  single: '單曲',
  ep: '迷你專輯',
};
export function releaseTypeLabel(type) {
  return Object.hasOwn(TYPE_LABELS, type)
    ? TYPE_LABELS[type]
    : TYPE_LABELS.unknown;
}
export function releaseYearFromDate(date) {
  return typeof date?.value === 'string' &&
    ['year', 'month', 'day'].includes(date.precision) &&
    validDate(date.value, date.precision)
    ? Number(date.value.slice(0, 4))
    : undefined;
}
export function releaseMetadataLabel(type, year) {
  return [
    Number.isInteger(year) && year > 0 && year <= 9999 ? year : undefined,
    releaseTypeLabel(type),
  ]
    .filter(Boolean)
    .join(' · ');
}
export function releaseCard(collection, tracks) {
  const effective = collection.resolvedRelease;
  const date = effective?.date;
  const year = releaseYearFromDate(date);
  return {
    id: collection.id,
    name: collection.name || '(未命名發行)',
    coverUrl: collection.coverUrl ?? '',
    tracks,
    releaseType: effective?.type || 'unknown',
    releaseDate: date ?? null,
    releaseYear: year > 0 ? year : undefined,
  };
}
export function filterReleases(releases, filter) {
  const list = Array.isArray(releases) ? releases : [];
  if (filter === 'albums')
    return list.filter((entry) => entry.releaseType === 'album');
  if (filter === 'singles-ep')
    return list.filter((entry) => ['single', 'ep'].includes(entry.releaseType));
  return list;
}
export function createReleaseDraft(release) {
  const effective = release.effective ?? {};
  const overrides = release.overrides ?? {};
  const mode = (field) =>
    Object.hasOwn(overrides, field)
      ? overrides[field] === null
        ? 'clear'
        : 'manual'
      : 'source';
  return {
    type: { mode: mode('type'), value: effective.type || 'unknown' },
    date: {
      mode: mode('date'),
      value: effective.date?.value || '',
      precision: effective.date?.precision || 'year',
    },
    totalTrackCount: {
      mode: mode('totalTrackCount'),
      value:
        effective.totalTrackCount === null ||
        effective.totalTrackCount === undefined
          ? ''
          : String(effective.totalTrackCount),
    },
    leadTrackId: release.leadTrackId || '',
  };
}
function validDate(value, precision) {
  const patterns = {
    year: /^([0-9]{4})$/,
    month: /^([0-9]{4})-([0-9]{2})$/,
    day: /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/,
  };
  const match = patterns[precision]?.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2] || 1);
  const day = Number(match[3] || 1);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day > 0 &&
    day <=
      [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}
export function releaseDraftIntent(release, draft) {
  const set = {};
  const remove = [];
  for (const field of ['type', 'date', 'totalTrackCount']) {
    const entry = draft[field];
    if (entry.mode === 'source') {
      if (Object.hasOwn(release.overrides ?? {}, field)) remove.push(field);
      continue;
    }
    if (entry.mode === 'clear' && field !== 'type') {
      set[field] = null;
      continue;
    }
    if (entry.mode !== 'manual') throw new Error('請確認欄位的資料來源。');
    if (field === 'type') {
      if (!Object.hasOwn(TYPE_LABELS, entry.value))
        throw new Error('請選擇發行類型。');
      set.type = entry.value;
    }
    if (field === 'date') {
      if (!validDate(entry.value, entry.precision))
        throw new Error('請依精度輸入有效的發行日期。');
      set.date = { value: entry.value, precision: entry.precision };
    }
    if (field === 'totalTrackCount') {
      const count = Number(entry.value);
      if (
        !/^[0-9]+$/.test(entry.value) ||
        !Number.isSafeInteger(count) ||
        count < Math.max(1, release.memberCount || 0)
      )
        throw new Error('總曲數不得少於目前的收錄曲目數。');
      set.totalTrackCount = count;
    }
  }
  return {
    set,
    remove,
    ...(draft.leadTrackId !== (release.leadTrackId || '')
      ? { leadTrackId: draft.leadTrackId || null }
      : {}),
  };
}

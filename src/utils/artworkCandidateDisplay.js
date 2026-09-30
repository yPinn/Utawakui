const PRIMARY_TYPE_LABELS = Object.freeze({
  single: '單曲',
  ep: 'EP',
  album: '專輯',
});

const SECONDARY_TYPE_LABELS = Object.freeze({
  compilation: '合輯',
  live: '現場版',
  remix: '混音版',
});

function normalized(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function releaseMeta(candidate) {
  const values = [];
  if (Number.isInteger(candidate?.firstReleaseYear)) {
    values.push(String(candidate.firstReleaseYear));
  }
  const primaryType = PRIMARY_TYPE_LABELS[normalized(candidate?.primaryType)];
  if (primaryType) values.push(primaryType);
  for (const type of candidate?.secondaryTypes || []) {
    const label = SECONDARY_TYPE_LABELS[normalized(type)];
    if (label && !values.includes(label)) values.push(label);
  }
  return values.join(' · ') || '發行資訊未提供';
}

function decision(candidate, reasons) {
  if (reasons.has('version-conflict')) {
    return { label: '請確認版本', tone: 'warning' };
  }
  if (candidate?.recommended) return { label: '建議', tone: 'success' };
  if (candidate?.confidence === 'high') {
    return { label: '高度相符', tone: 'success' };
  }
  if (candidate?.confidence === 'medium') {
    return { label: '可能相符', tone: 'warning' };
  }
  return { label: '差異較多', tone: 'muted' };
}

function reasonSummary(reasons) {
  if (reasons.has('version-conflict')) return '候選名稱可能是其他版本';
  if (reasons.has('title-exact') && reasons.has('artist-exact')) return '';
  if (reasons.has('artist-exact') && reasons.has('title-contains')) {
    return '演唱者一致，歌名相近';
  }
  if (reasons.has('title-exact')) return '歌名一致';
  if (reasons.has('artist-exact')) return '演唱者一致';
  return '請依封面與發行資訊確認';
}

export function projectArtworkCandidate(candidate = {}) {
  const reasons = new Set(
    Array.isArray(candidate.reasons) ? candidate.reasons : [],
  );
  const status = decision(candidate, reasons);
  return {
    title: candidate.releaseTitle?.trim() || '未知發行',
    artist: candidate.artistCredit?.trim() || '未知演唱者',
    releaseMeta: releaseMeta(candidate),
    decisionLabel: status.label,
    decisionTone: status.tone,
    reason: reasonSummary(reasons),
  };
}

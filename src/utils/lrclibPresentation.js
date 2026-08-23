const CAPABILITY_LABELS = Object.freeze({
  T2: 'T2 逐字',
  T1: 'T1 逐行',
  T0: 'T0 無時間',
  instrumental: '純音樂',
  unsupported: '無法匯入',
});

const MATCH_REASON_LABELS = Object.freeze({
  'title-exact': '曲名完全相同',
  'title-close': '曲名相近',
  'artist-exact': '歌手完全相同',
  'artist-close': '歌手名稱相近',
  'album-exact': '專輯相同',
  'duration-exact': '長度完全相同',
  'duration-close': '長度相近',
});

const WARNING_LABELS = Object.freeze({
  'partial-word-timing': '部分歌詞缺少逐字時間',
  'overlapping-lines': '逐行時間有重疊，將保留來源但不直接套用',
  'overlapping-words': '逐字時間有重疊，將保留來源但不直接套用',
  'unsupported-lyricsfile-version': '逐字格式版本尚未支援',
  'invalid-lyricsfile': '逐字資料無法安全讀取',
  'version-mismatch': '可能是不同版本',
  'instrumental-record': '這筆資料標示為純音樂',
});

export function capabilityLabel(candidate) {
  const level = candidate?.capability?.level;
  if (level === 'T2' && candidate.capability.partial) return 'T2 部分逐字';
  return CAPABILITY_LABELS[level] || '時間資訊未知';
}

export function matchReasonLabels(reasons) {
  return (Array.isArray(reasons) ? reasons : [])
    .map((reason) => MATCH_REASON_LABELS[reason])
    .filter(Boolean);
}

export function warningLabels(warnings) {
  return [...new Set(Array.isArray(warnings) ? warnings : [])]
    .map((warning) => WARNING_LABELS[warning])
    .filter(Boolean);
}

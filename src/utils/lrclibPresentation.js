const CAPABILITY_LABELS = Object.freeze({
  T2: '逐字同步',
  T1: '逐行同步',
  T0: '純文字歌詞',
  instrumental: '純音樂',
  unsupported: '格式不支援',
});

const WARNING_LABELS = Object.freeze({
  'partial-word-timing': '部分歌詞缺少逐字時間',
  'overlapping-lines': '逐行時間有重疊，將保留來源但不直接套用',
  'overlapping-words': '逐字時間有重疊，將保留來源但不直接套用',
  'unsupported-lyricsfile-version': '逐字格式版本尚未支援',
  'invalid-lyricsfile': '逐字資料無法安全讀取',
  'unsupported-lyricsfile-version-fallback':
    '逐字格式版本尚未支援，已改用逐行或純文字歌詞',
  'invalid-lyricsfile-fallback': '逐字資料無法安全讀取，已改用逐行或純文字歌詞',
  'version-mismatch': '可能是不同版本',
  'instrumental-record': '這筆資料標示為純音樂',
});

export function capabilityLabel(candidate) {
  const level = candidate?.capability?.level;
  if (level === 'T2' && candidate.capability.partial) return '部分逐字同步';
  return CAPABILITY_LABELS[level] || '時間資訊未知';
}

export function candidateImportMessage(candidate) {
  const level = candidate?.capability?.level;
  if (level === 'instrumental') {
    return '這筆來源標示為純音樂，沒有可匯入的歌詞。';
  }
  if (level === 'unsupported') {
    return '這筆來源格式目前不支援，無法安全匯入。';
  }
  return null;
}

export function warningLabels(warnings) {
  return [...new Set(Array.isArray(warnings) ? warnings : [])]
    .map((warning) => WARNING_LABELS[warning])
    .filter(Boolean);
}

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
  'invalid-lyricsfile': '逐字同步資料無法使用',
  'normalized-boundary-jitter': '來源有 1ms 邊界誤差，已對齊相鄰逐字時間',
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

function fallbackCapabilityLabel(capability) {
  if (capability?.level === 'T1') return '逐行同步歌詞';
  if (capability?.level === 'T0') return '純文字歌詞';
  return '其他可用歌詞';
}

function warningLabel(warning, capability) {
  const fallback = fallbackCapabilityLabel(capability);
  if (warning === 'unsupported-lyricsfile-version-fallback') {
    return `逐字格式版本尚未支援；仍可儲存${fallback}`;
  }
  if (warning === 'invalid-lyricsfile-fallback') {
    return `逐字同步資料無法使用；仍可儲存${fallback}`;
  }
  if (warning === 'invalid-yrc') {
    return `網易逐字同步資料無法使用；仍可儲存${fallback}`;
  }
  return WARNING_LABELS[warning];
}

export function warningLabels(warnings, capability = null) {
  return [...new Set(Array.isArray(warnings) ? warnings : [])]
    .map((warning) => warningLabel(warning, capability))
    .filter(Boolean);
}

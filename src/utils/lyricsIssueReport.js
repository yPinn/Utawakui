import {
  FEEDBACK_KINDS,
  MAX_TRACK_LABEL_LENGTH,
} from '../constants/feedback.js';

function singleLine(value, limit = 160) {
  if (typeof value !== 'string') return '';
  return Array.from(value.slice(0, limit * 2))
    .filter(
      (character) =>
        character.codePointAt(0) >= 32 && character.codePointAt(0) !== 127,
    )
    .join('')
    .trim()
    .slice(0, limit);
}

function identity(artist, title) {
  return [singleLine(artist), singleLine(title)].filter(Boolean).join(' - ');
}

// Only visible scalar context becomes user-editable text. No lyrics, filenames,
// URLs, fingerprints, timing documents or arbitrary object serialization.
export function buildLyricsIssueReport({
  track,
  candidate,
  source,
  tier,
  offsetMs,
} = {}) {
  const provider = candidate ? candidate.providerId : source?.kind;
  const names = {
    lrclib: 'LRCLIB',
    netease: '網易雲音樂',
    betterlyrics: 'Better Lyrics',
    amll: '既有 AMLL',
  };
  const name = Object.hasOwn(names, provider)
    ? names[provider]
    : candidate
      ? '線上來源'
      : '本機來源';
  const recordId = candidate ? candidate.id : source?.provider?.recordId;
  const id =
    ['lrclib', 'netease'].includes(provider) &&
    Number.isSafeInteger(recordId) &&
    recordId > 0
      ? ` #${recordId}`
      : '';
  const level = candidate ? candidate.capability?.level : tier;
  const capability = ['T0', 'T1', 'T2'].includes(level)
    ? `${level}${candidate?.capability?.partial ? '（部分）' : ''}`
    : '未確認';
  const lines = [
    '歌詞問題（待確認）',
    `位置：${candidate ? '搜尋候選' : '已保存來源'}`,
    `來源：${name}${id}`,
    ...(candidate
      ? [
          `候選歌曲：${identity(candidate.artistName, candidate.trackName) || '未提供'}`,
        ]
      : []),
    `同步層級：${capability}`,
    ...(!candidate &&
    Number.isSafeInteger(offsetMs) &&
    Math.abs(offsetMs) <= 86400000
      ? [`本機時間偏移：${offsetMs > 0 ? '+' : ''}${offsetMs} ms（只供說明）`]
      : []),
    '',
    '發生位置／時間：',
    '實際情況：',
    '預期結果：',
    '重現步驟：',
  ];
  return {
    kind: FEEDBACK_KINDS.CONTENT,
    trackLabel: identity(track?.artist, track?.title).slice(
      0,
      MAX_TRACK_LABEL_LENGTH,
    ),
    description: lines.join('\n'),
  };
}

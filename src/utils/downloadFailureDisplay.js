// Mirrors electron/lib/downloadFailure.js's code list — kept in sync by
// hand, same as ytdlpStatus.js's outcome enum vs SettingsView.vue's mapping.
const DOWNLOAD_FAILURE_PREFIX = 'utawakui-download-failed:';
const DOWNLOAD_FAILURE_CODES = [
  'invalid-input',
  'members-only',
  'age-restricted',
  'region-restricted',
  'video-unavailable',
  'rate-limited',
  'network-error',
  'disk-full',
  'bot-protected',
  'unknown',
];

const CODE_RE = /utawakui-download-failed:([a-z][a-z-]*)/;

// electron's ipcMain.handle mangles the message to
// "Error invoking remote method '...': Error: <message>" — matching the
// sentinel via regex (not .includes per code) means an unclassified error
// that happens to contain a code-like word never gets misread as classified.
export function extractDownloadFailureCode(error) {
  const message = typeof error === 'string' ? error : error?.message || '';
  const code = CODE_RE.exec(message)?.[1];
  return DOWNLOAD_FAILURE_CODES.includes(code) ? code : 'unknown';
}

export function downloadFailureLabel(code) {
  const labels = {
    'invalid-input': '連結無法辨識',
    'members-only': '會員限定',
    'age-restricted': '需要年齡驗證',
    'region-restricted': '地區限制',
    'video-unavailable': '影片無法取得',
    'rate-limited': '下載次數受限',
    'network-error': '網路連線失敗',
    'disk-full': '儲存空間不足',
    'bot-protected': '反機器人驗證',
    unknown: '下載失敗',
  };
  return labels[code] || labels.unknown;
}

export function downloadFailureTone(code) {
  const tones = {
    'members-only': 'gated',
    'video-unavailable': 'danger',
    'disk-full': 'danger',
    'invalid-input': 'danger',
    unknown: 'danger',
  };
  return tones[code] || 'warning';
}

export function downloadFailureHint(code) {
  const hints = {
    'invalid-input': '請貼上 YouTube 或 YouTube Music 的歌曲／播放清單連結。',
    'members-only': '這是頻道會員專屬內容，無法下載。',
    'age-restricted': '請先在 Firefox 登入 YouTube，再重試一次。',
    'region-restricted':
      '這部影片在你的地區被封鎖，可改用上方的「本機音訊」匯入。',
    'video-unavailable': '影片已刪除或設為私人，請改用其他版本的連結。',
    'rate-limited': 'YouTube 暫時限制了下載，請等幾分鐘再重試。',
    'network-error': '請確認網路連線後再重試。',
    'disk-full': '請清出空間，或到設定改用其他下載資料夾。',
    'bot-protected':
      '這首暫時無法從 YouTube 下載。可改用上方的「本機音訊」匯入已有的檔案。',
    unknown: '請稍後重試；若持續失敗，可改用上方的「本機音訊」匯入。',
  };
  return hints[code] || hints.unknown;
}

export function describeDownloadFailure(error) {
  const code = extractDownloadFailureCode(error);
  return {
    code,
    label: downloadFailureLabel(code),
    tone: downloadFailureTone(code),
    hint: downloadFailureHint(code),
  };
}

export { DOWNLOAD_FAILURE_CODES, DOWNLOAD_FAILURE_PREFIX };

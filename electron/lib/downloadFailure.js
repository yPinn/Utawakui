'use strict';

const {
  downloadErrorText,
  isAudioFormatUnavailableError,
  isForbiddenAudioDownloadError,
} = require('./youtubeAttempts');

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

// Order matters: yt-dlp's "Video unavailable" wording is also emitted for
// members-only/geo-blocked videos, so those more specific codes must be
// checked first or they'd be misclassified as the generic case.
const CLASSIFICATION_RULES = [
  ['invalid-input', /invalid video id or youtube url/i],
  [
    'members-only',
    /members-only|join this channel|channel membership|channel.?s members/i,
  ],
  ['age-restricted', /confirm your age|age[- ]restricted/i],
  [
    'region-restricted',
    /available in your country|blocked it in your country/i,
  ],
  ['video-unavailable', /video unavailable|private video|has been removed/i],
  ['rate-limited', /HTTP Error 429/i],
  [
    'network-error',
    /getaddrinfo|ETIMEDOUT|ECONNRESET|unable to download webpage/i,
  ],
  ['disk-full', /ENOSPC|not enough space on the disk/i],
];

function classifyDownloadFailure(error) {
  const text = downloadErrorText(error);
  for (const [code, pattern] of CLASSIFICATION_RULES) {
    if (pattern.test(text)) return code;
  }
  if (
    isForbiddenAudioDownloadError(error) ||
    isAudioFormatUnavailableError(error)
  ) {
    return 'bot-protected';
  }
  return 'unknown';
}

function toClassifiedDownloadError(error) {
  return new Error(DOWNLOAD_FAILURE_PREFIX + classifyDownloadFailure(error));
}

module.exports = {
  DOWNLOAD_FAILURE_CODES,
  DOWNLOAD_FAILURE_PREFIX,
  classifyDownloadFailure,
  toClassifiedDownloadError,
};

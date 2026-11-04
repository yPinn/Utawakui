import downloadFailureValues from '../../shared/downloadFailureValues.json';
import { catalogKey, t } from './i18n.js';

const DOWNLOAD_FAILURE_PREFIX = downloadFailureValues.prefix;
const DOWNLOAD_FAILURE_CODES = Object.freeze([...downloadFailureValues.codes]);

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

// Codes with their own copy; anything else reads as unknown.
const FAILURE_COPY_CODES = new Set([
  'invalid-input',
  'members-only',
  'age-restricted',
  'region-restricted',
  'video-unavailable',
  'rate-limited',
  'network-error',
  'disk-full',
  'bot-protected',
  'login-expired',
  'unknown',
]);
const failureCopy = (code, field) =>
  t(
    `import.failures.${catalogKey(FAILURE_COPY_CODES.has(code) ? code : 'unknown')}.${field}`,
  );

export function downloadFailureLabel(code) {
  return failureCopy(code, 'label');
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
  return failureCopy(code, 'hint');
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

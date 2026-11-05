'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// A user-exported Netscape cookies.txt, reduced to YouTube/Google sign-in,
// kept encrypted with safeStorage and decrypted only for one yt-dlp run.
const HEADERS = Object.freeze([
  '# HTTP Cookie File',
  '# Netscape HTTP Cookie File',
]);
const HTTP_ONLY_PREFIX = '#HttpOnly_';
const ALLOWED_DOMAINS = Object.freeze(['youtube.com', 'google.com']);
const MAX_FILE_BYTES = 1024 * 1024;

const LOGIN_FILE_ERRORS = Object.freeze({
  FORMAT: 'YOUTUBE_LOGIN_FILE_FORMAT',
  NO_YOUTUBE: 'YOUTUBE_LOGIN_FILE_NO_YOUTUBE',
  TOO_LARGE: 'YOUTUBE_LOGIN_FILE_TOO_LARGE',
  STORAGE_UNAVAILABLE: 'YOUTUBE_LOGIN_STORAGE_UNAVAILABLE',
  MISSING: 'YOUTUBE_LOGIN_FILE_MISSING',
});

function loginFileError(code) {
  return Object.assign(new Error(code), { code });
}

function cookieDomain(field) {
  const domain = field.startsWith(HTTP_ONLY_PREFIX)
    ? field.slice(HTTP_ONLY_PREFIX.length)
    : field;
  return domain.replace(/^\./u, '').toLowerCase();
}

function isAllowedDomain(domain) {
  return ALLOWED_DOMAINS.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
  );
}

// Keeps only well-formed YouTube/Google cookie lines; throws a coded error.
function filterLoginCookies(text) {
  if (typeof text !== 'string') throw loginFileError(LOGIN_FILE_ERRORS.FORMAT);
  const lines = text.replace(/^\u{FEFF}/u, '').split(/\r?\n/u);
  const first = lines.find((line) => line.trim() !== '');
  if (!first || !HEADERS.includes(first.trim())) {
    throw loginFileError(LOGIN_FILE_ERRORS.FORMAT);
  }
  const cookies = lines.filter((line) => {
    if (line.startsWith('#') && !line.startsWith(HTTP_ONLY_PREFIX))
      return false;
    const fields = line.split('\t');
    return fields.length === 7 && isAllowedDomain(cookieDomain(fields[0]));
  });
  if (!cookies.length) throw loginFileError(LOGIN_FILE_ERRORS.NO_YOUTUBE);
  return `${HEADERS[1]}\n${cookies.join('\n')}\n`;
}

const RUN_FILE = /^utawakui-login-[0-9a-f]{16}\.txt$/u;

// Plain run copies live beside the encrypted file, not in the shared temp dir.
function sweepRunFiles(fileSystem, directory) {
  try {
    for (const name of fileSystem.readdirSync(directory)) {
      if (RUN_FILE.test(name))
        fileSystem.rmSync(path.join(directory, name), { force: true });
    }
  } catch {
    // A missing directory has nothing left over from a crashed run.
  }
}

function createYoutubeLoginStore({
  safeStorage,
  filePath,
  tempDir = path.join(path.dirname(filePath), 'youtube-login-runs'),
  fileSystem = fs,
} = {}) {
  sweepRunFiles(fileSystem, tempDir);

  function assertEncryption() {
    if (!safeStorage?.isEncryptionAvailable?.()) {
      throw loginFileError(LOGIN_FILE_ERRORS.STORAGE_UNAVAILABLE);
    }
  }

  function save(cookies) {
    assertEncryption();
    fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    fileSystem.writeFileSync(temporary, safeStorage.encryptString(cookies));
    fileSystem.renameSync(temporary, filePath);
  }

  function load() {
    assertEncryption();
    if (!fileSystem.existsSync(filePath)) {
      throw loginFileError(LOGIN_FILE_ERRORS.MISSING);
    }
    return safeStorage.decryptString(fileSystem.readFileSync(filePath));
  }

  function importFile(sourcePath) {
    if (fileSystem.statSync(sourcePath).size > MAX_FILE_BYTES) {
      throw loginFileError(LOGIN_FILE_ERRORS.TOO_LARGE);
    }
    save(filterLoginCookies(fileSystem.readFileSync(sourcePath, 'utf8')));
    return getStatus();
  }

  function getStatus() {
    return { imported: fileSystem.existsSync(filePath) };
  }

  function remove() {
    fileSystem.rmSync(filePath, { force: true });
    return getStatus();
  }

  // yt-dlp writes rotated cookies back to --cookies; keep them if still valid.
  // Without a stored file or OS encryption the run goes ahead unsigned.
  async function withCookieFile(run) {
    let cookies;
    try {
      cookies = load();
    } catch {
      return run(null);
    }
    const file = path.join(
      tempDir,
      `utawakui-login-${crypto.randomBytes(8).toString('hex')}.txt`,
    );
    fileSystem.mkdirSync(tempDir, { recursive: true });
    // yt-dlp on Windows expects CRLF line endings in cookie files.
    fileSystem.writeFileSync(file, cookies.replace(/\n/gu, '\r\n'), {
      mode: 0o600,
    });
    try {
      return await run(file);
    } finally {
      try {
        save(filterLoginCookies(fileSystem.readFileSync(file, 'utf8')));
      } catch {
        // Keep the last good copy when the run left nothing usable.
      }
      fileSystem.rmSync(file, { force: true });
    }
  }

  return { getStatus, importFile, remove, withCookieFile };
}

module.exports = {
  LOGIN_FILE_ERRORS,
  createYoutubeLoginStore,
  filterLoginCookies,
};

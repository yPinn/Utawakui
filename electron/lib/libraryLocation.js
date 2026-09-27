'use strict';

const fs = require('fs');
const { createAppError } = require('./appError');

function reasonFromError(error) {
  if (error?.code === 'ENOENT') return 'missing';
  if (error?.code === 'ENOTDIR') return 'not-directory';
  if (error?.code === 'EACCES' || error?.code === 'EPERM') {
    return 'access-denied';
  }
  return 'io-error';
}

function inspectLibraryDirectory(directory, { fsImpl = fs } = {}) {
  if (typeof directory !== 'string' || directory.length === 0) {
    return { available: false, reason: 'invalid' };
  }

  try {
    const stat = fsImpl.statSync(directory);
    if (!stat.isDirectory()) {
      return { available: false, reason: 'not-directory' };
    }
    fsImpl.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
    return { available: true, reason: null };
  } catch (error) {
    return { available: false, reason: reasonFromError(error) };
  }
}

function createLibraryLocationUnavailableError(reason) {
  return createAppError({
    code: 'LIBRARY_LOCATION_UNAVAILABLE',
    severity: 'error',
    title: '曲庫位置無法使用',
    message: '無法使用已設定的曲庫位置。請重新連接磁碟，或到設定選擇其他位置。',
    actionLabel: '前往設定',
    context: { reason, retryable: true },
  });
}

function ensureLibraryDirectory(
  directory,
  { createIfMissing = false, fsImpl = fs } = {},
) {
  if (createIfMissing) {
    try {
      fsImpl.mkdirSync(directory, { recursive: true });
    } catch (error) {
      throw createLibraryLocationUnavailableError(reasonFromError(error));
    }
  }

  const status = inspectLibraryDirectory(directory, { fsImpl });
  if (!status.available) {
    throw createLibraryLocationUnavailableError(status.reason);
  }
  return directory;
}

module.exports = {
  ensureLibraryDirectory,
  inspectLibraryDirectory,
};

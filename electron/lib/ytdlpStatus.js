'use strict';

const fs = require('fs');
const youtubedl = require('youtube-dl-exec');

// Best-effort classification of yt-dlp's own -U/--update stdout. Exact
// wording needs confirming against a real run with network access — treat
// as a documented assumption, not a verified fact.
const UP_TO_DATE_RE = /up.to.date|already.*latest/i;
const UPDATED_RE = /updated.*to|new version/i;

async function getInstalledVersion({ runner = youtubedl } = {}) {
  try {
    const version = await runner(undefined, { version: true });
    return { version: String(version).trim(), found: true };
  } catch {
    return { version: null, found: false };
  }
}

function binaryExists({
  binaryPath = youtubedl.constants?.YOUTUBE_DL_PATH,
} = {}) {
  if (!binaryPath) return false;
  return fs.existsSync(binaryPath);
}

async function getStatus({ runner, binaryPath } = {}) {
  const { version, found } = await getInstalledVersion({ runner });
  return { version, binaryFound: found && binaryExists({ binaryPath }) };
}

function downloadErrorText(error) {
  return `${error?.stderr || ''}\n${error?.message || ''}`;
}

async function checkForUpdate({ runner = youtubedl } = {}) {
  try {
    const output = String(await runner(undefined, { update: true }));
    const { version } = await getInstalledVersion({ runner });
    if (UP_TO_DATE_RE.test(output)) {
      return { outcome: 'up-to-date', version, output };
    }
    if (UPDATED_RE.test(output)) {
      return { outcome: 'updated', version, output };
    }
    return { outcome: 'error', version, output };
  } catch (err) {
    return { outcome: 'error', version: null, output: downloadErrorText(err) };
  }
}

function normalizeYtdlpStatusCache(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const { lastCheckedAt, lastKnownVersion, lastCheckResult } = value;
  const cache = {};
  if (
    typeof lastCheckedAt === 'string' &&
    !Number.isNaN(Date.parse(lastCheckedAt))
  ) {
    cache.lastCheckedAt = lastCheckedAt;
  }
  if (typeof lastKnownVersion === 'string' && lastKnownVersion.length > 0) {
    cache.lastKnownVersion = lastKnownVersion;
  }
  if (['up-to-date', 'updated', 'error'].includes(lastCheckResult)) {
    cache.lastCheckResult = lastCheckResult;
  }
  return cache;
}

module.exports = {
  binaryExists,
  checkForUpdate,
  getInstalledVersion,
  getStatus,
  normalizeYtdlpStatusCache,
};

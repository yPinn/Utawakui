'use strict';

const crypto = require('crypto');

const DEFAULT_MAX_FEATURE_DEPENDENCY_DOWNLOAD_BYTES = 512 * 1024 * 1024;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function emitProgress(options, payload) {
  options.onProgress?.(payload);
}

function readContentLength(response) {
  const value = response.headers?.get?.('content-length');
  const total = Number(value);
  return Number.isFinite(total) && total > 0 ? total : null;
}

function downloadSizeLimit(dependency) {
  const maxDownloadSize = Number(dependency?.maxDownloadSize);
  if (Number.isSafeInteger(maxDownloadSize) && maxDownloadSize > 0) {
    return maxDownloadSize;
  }

  const expectedSize = Number(dependency?.expectedSize);
  return Number.isSafeInteger(expectedSize) && expectedSize > 0
    ? expectedSize
    : DEFAULT_MAX_FEATURE_DEPENDENCY_DOWNLOAD_BYTES;
}

function dependencyDownloadLabel(dependency) {
  return dependency?.role || dependency?.id || dependency?.name || 'dependency';
}

function assertDownloadSizeWithinLimit(size, dependency) {
  const limit = downloadSizeLimit(dependency);
  if (size > limit) {
    throw new Error(
      `Downloaded ${dependencyDownloadLabel(dependency)} exceeds allowed size (${size} > ${limit})`,
    );
  }
}

async function readResponseBuffer(response, options = {}, dependency = null) {
  const total = readContentLength(response);
  if (total) assertDownloadSizeWithinLimit(total, dependency);

  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    assertDownloadSizeWithinLimit(buffer.length, dependency);
    emitProgress(options, { stage: 'downloading', percent: 100 });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let lastPercent = -1;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    chunks.push(chunk);
    received += chunk.length;
    assertDownloadSizeWithinLimit(received, dependency);

    if (total) {
      const percent = Math.min(100, Math.floor((received / total) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        emitProgress(options, { stage: 'downloading', percent });
      }
    } else {
      emitProgress(options, { stage: 'downloading' });
    }
  }

  if (total && lastPercent < 100) {
    emitProgress(options, { stage: 'downloading', percent: 100 });
  }
  return Buffer.concat(chunks);
}

async function downloadBuffer(
  url,
  fetchImpl = fetch,
  options = {},
  dependency = null,
) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download feature dependency: HTTP ${response.status}`,
    );
  }
  return readResponseBuffer(response, options, dependency);
}

async function downloadText(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download feature dependency metadata: HTTP ${response.status}`,
    );
  }
  return (await response.text()).trim();
}

module.exports = {
  dependencyDownloadLabel,
  downloadBuffer,
  downloadText,
  emitProgress,
  sha256,
};

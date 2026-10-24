'use strict';
const path = require('node:path');
const { execFile } = require('node:child_process');
const { validateManifest } = require('./catalog');
const { hasControlCharacters } = require('../textGuards');
const ENV = [
  'NUMBER_OF_PROCESSORS',
  'PATH',
  'PATHEXT',
  'PROCESSOR_ARCHITECTURE',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'WINDIR',
];
function validateRequest(request) {
  const field = {
    resolve: 'videoId',
    album: 'playlistId',
    browse: 'browseId',
    search: 'query',
  }[request?.action];
  const pattern = {
    videoId: /^[A-Za-z0-9_-]{11}$/,
    playlistId: /^OLAK5uy_[A-Za-z0-9_-]{1,120}$/,
    browseId: /^MPRE[A-Za-z0-9_-]{1,120}$/,
  }[field];
  if (
    !field ||
    Object.keys(request).sort().join(',') !==
      ['action', field].sort().join(',') ||
    typeof request[field] !== 'string' ||
    (pattern
      ? !pattern.test(request[field])
      : !request[field].trim() ||
        request[field].length > 200 ||
        hasControlCharacters(request[field]))
  )
    throw new TypeError('Invalid release worker intent');
}
async function runReleaseCatalogWorker({
  pythonPath,
  workerPath,
  request,
  signal,
  execFileImpl = execFile,
}) {
  validateRequest(request);
  if (
    ![pythonPath, workerPath].every(
      (value) =>
        typeof value === 'string' &&
        (path.isAbsolute(value) || path.win32.isAbsolute(value)),
    )
  )
    throw new TypeError('Worker paths must be absolute');
  if (signal?.aborted) return { status: 'error', reason: 'cancelled' };
  return new Promise((resolve) => {
    let settled = false,
      closed = false,
      outcome = null,
      terminationTimer,
      child;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(terminationTimer);
      resolve(value);
    };
    const fail = (reason = 'worker-failed') => {
      outcome = { status: 'error', reason };
      if (closed) settle(outcome);
    };
    try {
      child = execFileImpl(
        pythonPath,
        ['-B', workerPath],
        {
          windowsHide: true,
          timeout: 30000,
          maxBuffer: 2 * 1024 * 1024,
          signal,
          env: {
            ...Object.fromEntries(
              ENV.filter((key) => process.env[key] !== undefined).map((key) => [
                key,
                process.env[key],
              ]),
            ),
            PYTHONDONTWRITEBYTECODE: '1',
            PYTHONIOENCODING: 'utf-8',
          },
        },
        (error, stdout, stderr) => {
          if (error || stderr?.length)
            return fail(signal?.aborted ? 'cancelled' : 'worker-failed');
          try {
            const value = JSON.parse(stdout);
            if (
              value.status === 'no-match' &&
              Object.keys(value).length === 1
            ) {
              outcome = value;
              if (closed) settle(outcome);
              return;
            }
            if (value.status === 'error')
              return fail(
                ['schema-error', 'provider-unavailable'].includes(value.reason)
                  ? value.reason
                  : 'worker-failed',
              );
            if (value.status !== 'ok') return fail('schema-error');
            if (value.manifest) {
              outcome = {
                status: 'ok',
                manifest: validateManifest(value.manifest),
              };
              if (closed) settle(outcome);
              return;
            }
            if (
              request.action !== 'search' ||
              !Array.isArray(value.candidates) ||
              value.candidates.length > 5
            )
              return fail('schema-error');
            const candidates = value.candidates.map((candidate) => {
              if (
                !/^MPRE[A-Za-z0-9_-]{1,120}$/.test(candidate.browseId) ||
                ['title', 'artist', 'year'].some(
                  (key) =>
                    typeof candidate[key] !== 'string' ||
                    candidate[key].length > 200 ||
                    hasControlCharacters(candidate[key]),
                )
              )
                throw Error('Invalid candidate');
              return {
                browseId: candidate.browseId,
                title: candidate.title,
                artist: candidate.artist,
                year: candidate.year,
              };
            });
            outcome = { status: 'ok', candidates };
            if (closed) settle(outcome);
          } catch {
            fail('schema-error');
          }
        },
      );
      child.on('close', () => {
        closed = true;
        settle(outcome ?? { status: 'error', reason: 'worker-failed' });
      });
      const terminate = () => {
        try {
          child.kill('SIGKILL');
        } catch {
          /* forced bounded fallback below */
        }
      };
      terminationTimer = setTimeout(() => {
        terminate();
        terminationTimer = setTimeout(
          () => settle({ status: 'error', reason: 'worker-failed' }),
          1000,
        );
        terminationTimer.unref?.();
      }, 31000);
      terminationTimer.unref?.();
      child.stdin?.on?.('error', () => {
        fail();
        terminate();
      });
      child.stdin.end(JSON.stringify(request));
    } catch {
      if (child) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* close/deadline remains authoritative */
        }
      } else closed = true;
      fail();
    }
  });
}
module.exports = { runReleaseCatalogWorker, validateRequest };

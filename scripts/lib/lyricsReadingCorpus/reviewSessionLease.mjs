import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

import { windowsPowerShellExecutable } from './localCorpus.mjs';

const ACTIVE_PORTABLE_SESSION_LEASES = new Set();
const HOLD_WINDOWS_REVIEW_MUTEX_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$name = [string]$env:UTAWAKUI_READING_REVIEW_MUTEX
if ($name -notmatch '^Local\\UtawakuiLyricsReadingReview-[a-f0-9]{64}$') { throw 'invalid review mutex name' }
$mutex = [System.Threading.Mutex]::new($false, $name)
$acquired = $false
try {
  try {
    $acquired = $mutex.WaitOne(0)
  } catch [System.Threading.AbandonedMutexException] {
    $acquired = $true
  }
  if (-not $acquired) {
    [Console]::Out.WriteLine('UTAWAKUI_MUTEX_BUSY')
    [Console]::Out.Flush()
    exit 23
  }
  [Console]::Out.WriteLine('UTAWAKUI_MUTEX_OK')
  [Console]::Out.Flush()
  [void][Console]::In.ReadLine()
} finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
`;

function reviewSessionKey(directory) {
  const normalized =
    process.platform === 'win32'
      ? path.resolve(directory).toLowerCase()
      : path.resolve(directory);
  return createHash('sha256').update(normalized).digest('hex');
}

function acquirePortableReviewSessionLease(directory) {
  const key = reviewSessionKey(directory);
  if (ACTIVE_PORTABLE_SESSION_LEASES.has(key)) {
    throw new TypeError(
      'private reading reviews are active in another session',
    );
  }
  ACTIVE_PORTABLE_SESSION_LEASES.add(key);
  let released = false;
  return {
    assertHeld() {
      if (released) {
        throw new TypeError('private reading review session lease was lost');
      }
    },
    async release() {
      if (released) return;
      released = true;
      ACTIVE_PORTABLE_SESSION_LEASES.delete(key);
    },
  };
}

function acquireWindowsReviewSessionLease(directory) {
  const executable = windowsPowerShellExecutable();
  const mutexName = `Local\\UtawakuiLyricsReadingReview-${reviewSessionKey(directory)}`;
  const child = spawn(
    executable,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      HOLD_WINDOWS_REVIEW_MUTEX_SCRIPT,
    ],
    {
      env: {
        SystemRoot: 'C:\\Windows',
        windir: 'C:\\Windows',
        UTAWAKUI_READING_REVIEW_MUTEX: mutexName,
      },
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    },
  );

  return new Promise((resolve, reject) => {
    let output = '';
    let ready = false;
    let exited = false;
    let releasing = false;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const timeout = setTimeout(() => {
      child.kill();
      rejectOnce(
        new TypeError('private reading review session lease is unavailable'),
      );
    }, 5_000);
    const fail = (message, cause) => {
      if (ready || settled) return;
      clearTimeout(timeout);
      child.kill();
      rejectOnce(new TypeError(message, { cause }));
    };
    child.once('error', (error) => {
      fail('private reading review session lease is unavailable', error);
    });
    child.once('exit', (code) => {
      exited = true;
      if (!ready) {
        fail(
          code === 23
            ? 'private reading reviews are active in another session'
            : 'private reading review session lease is unavailable',
        );
      }
    });
    child.stdout.on('data', (chunk) => {
      if (ready || settled) return;
      output += chunk.toString('utf8');
      if (output.length > 128) {
        fail('private reading review session lease is unavailable');
        return;
      }
      if (output.includes('UTAWAKUI_MUTEX_BUSY')) {
        fail('private reading reviews are active in another session');
        return;
      }
      if (!output.includes('UTAWAKUI_MUTEX_OK')) return;
      ready = true;
      settled = true;
      clearTimeout(timeout);
      resolve({
        assertHeld() {
          if (exited && !releasing) {
            throw new TypeError(
              'private reading review session lease was lost',
            );
          }
        },
        release() {
          if (releasing || exited) return Promise.resolve();
          releasing = true;
          return new Promise((releaseResolve, releaseReject) => {
            const releaseTimeout = setTimeout(() => {
              child.kill();
              releaseReject(
                new TypeError(
                  'private reading review session lease could not be released',
                ),
              );
            }, 5_000);
            child.once('exit', (code) => {
              clearTimeout(releaseTimeout);
              if (code === 0) releaseResolve();
              else {
                releaseReject(
                  new TypeError(
                    'private reading review session lease could not be released',
                  ),
                );
              }
            });
            child.stdin.once('error', () => {});
            child.stdin.end('\n');
          });
        },
      });
    });
  });
}

export function acquireReviewSessionLease(directory) {
  return process.platform === 'win32'
    ? acquireWindowsReviewSessionLease(directory)
    : Promise.resolve(acquirePortableReviewSessionLease(directory));
}

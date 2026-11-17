'use strict';

const crypto = require('node:crypto');

const PAIRING_TTL_MS = 120_000;
const MAX_FAILURES = 5;
const CODE_RE = /^[A-Za-z0-9_-]{22}$/u;

// One active single-use code at a time. Wrong guesses count against the code
// and the fifth failure voids it.
function createPairingCodes({
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  ttlMs = PAIRING_TTL_MS,
  maxFailures = MAX_FAILURES,
} = {}) {
  let active = null;

  function begin() {
    const code = randomBytes(16).toString('base64url');
    active = { code, expiresAt: now() + ttlMs, failures: 0 };
    return { code, expiresAt: active.expiresAt };
  }

  function cancel() {
    active = null;
  }

  function claim(code) {
    if (!active) return false;
    if (now() >= active.expiresAt) {
      active = null;
      return false;
    }
    const valid =
      typeof code === 'string' &&
      CODE_RE.test(code) &&
      crypto.timingSafeEqual(Buffer.from(code), Buffer.from(active.code));
    if (valid) {
      active = null;
      return true;
    }
    active.failures += 1;
    if (active.failures >= maxFailures) active = null;
    return false;
  }

  return {
    begin,
    cancel,
    claim,
    status: () =>
      active && now() < active.expiresAt
        ? { pending: true, expiresAt: active.expiresAt }
        : { pending: false, expiresAt: null },
  };
}

module.exports = { MAX_FAILURES, PAIRING_TTL_MS, createPairingCodes };

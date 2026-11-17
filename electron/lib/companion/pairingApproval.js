'use strict';

const crypto = require('node:crypto');

const APPROVAL_TTL_MS = 60_000;
const CLAIM_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/u;

// A scanned code only opens a request; the computer must approve it after
// comparing the match code shown on both screens. A leaked QR therefore
// never pairs a phone on its own.
function createPairingApprovals({
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  randomInt = crypto.randomInt,
  createId = crypto.randomUUID,
  ttlMs = APPROVAL_TTL_MS,
} = {}) {
  let request = null;

  function expired() {
    return request && now() >= request.expiresAt;
  }

  function current() {
    if (expired()) request = null;
    return request;
  }

  // Only one request at a time; a second phone waits for the first to end.
  function open(label) {
    if (current()?.state === 'pending') return null;
    request = {
      id: createId(),
      label,
      matchCode: String(randomInt(1000, 10000)),
      claimToken: randomBytes(32).toString('base64url'),
      expiresAt: now() + ttlMs,
      state: 'pending',
      credential: null,
    };
    return {
      claimToken: request.claimToken,
      matchCode: request.matchCode,
      expiresAt: request.expiresAt,
    };
  }

  function pendingRequest(id) {
    const value = current();
    return value?.state === 'pending' && value.id === id ? value : null;
  }

  function approve(id, issueCredential) {
    const value = pendingRequest(id);
    if (!value) return false;
    value.credential = issueCredential(value.label);
    value.state = 'approved';
    return true;
  }

  function deny(id) {
    const value = pendingRequest(id);
    if (!value) return false;
    value.state = 'denied';
    return true;
  }

  // The phone collects its credential once with the token it was given.
  function poll(claimToken) {
    if (typeof claimToken !== 'string' || !CLAIM_TOKEN_RE.test(claimToken))
      return { state: 'unknown' };
    if (!request) return { state: 'unknown' };
    const matches = crypto.timingSafeEqual(
      Buffer.from(claimToken),
      Buffer.from(request.claimToken),
    );
    if (!matches) return { state: 'unknown' };
    if (request.state === 'approved') {
      const { credential } = request;
      request = null;
      return { state: 'approved', credential };
    }
    if (request.state === 'denied') {
      request = null;
      return { state: 'denied' };
    }
    if (expired()) {
      request = null;
      return { state: 'expired' };
    }
    return { state: 'pending' };
  }

  function cancel() {
    request = null;
  }

  // Settings sees who is asking, never the token or credential.
  function status() {
    const value = current();
    return value?.state === 'pending'
      ? {
          id: value.id,
          label: value.label,
          matchCode: value.matchCode,
          expiresAt: value.expiresAt,
        }
      : null;
  }

  return { open, approve, deny, poll, cancel, status };
}

module.exports = { APPROVAL_TTL_MS, createPairingApprovals };

'use strict';

// Verifies the independent signed update manifest described in
// docs/adr/0018-signed-update-manifest.md. This module only ever verifies —
// the signing half (which needs the private key) lives entirely in
// tools/update-signing/, never in code that ships inside the app bundle.
//
// canonicalizeManifest() is shared with tools/update-signing/sign-manifest.mjs
// (via createRequire) so signing and verification can never disagree about
// what bytes were actually signed.

const crypto = require('crypto');

// Deterministic serialization: sorted keys, no whitespace. Mirrors the
// canonicalize() shape EliteSand Pro's update-signature.js uses for the same
// problem (see docs/research/competitive-research.md) — not copied code, the
// same well-known technique (a manifest's signature must cover exactly one
// unambiguous byte sequence, independent of object key insertion order).
function canonicalizeManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('manifest must be a plain object');
  }
  // eslint-disable-next-line no-unused-vars -- destructured only to exclude it from `rest`
  const { signature, ...rest } = manifest;
  return canonicalizeValue(rest);
}

function canonicalizeValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeValue).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalizeValue(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function loadPublicKey(publicKeyHex) {
  if (typeof publicKeyHex !== 'string' || !/^[0-9a-f]+$/i.test(publicKeyHex)) {
    throw new Error('update signing public key is invalid');
  }
  return crypto.createPublicKey({
    key: Buffer.from(publicKeyHex, 'hex'),
    format: 'der',
    type: 'spki',
  });
}

// Returns { ok: true } or { ok: false, reason }. Never throws for a malformed
// manifest/signature — those are exactly the inputs this function exists to
// reject, so they are reported the same way as a genuine forgery, not
// surfaced as an operational error.
function verifyManifest(manifest, publicKeyHex) {
  if (!manifest || typeof manifest.signature !== 'string') {
    return { ok: false, reason: 'missing-signature' };
  }
  let publicKey;
  try {
    publicKey = loadPublicKey(publicKeyHex);
  } catch {
    return { ok: false, reason: 'invalid-public-key' };
  }
  let signatureBuffer;
  try {
    signatureBuffer = Buffer.from(manifest.signature, 'hex');
  } catch {
    return { ok: false, reason: 'invalid-signature-encoding' };
  }
  if (signatureBuffer.length === 0) {
    return { ok: false, reason: 'invalid-signature-encoding' };
  }

  let canonicalBytes;
  try {
    canonicalBytes = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  } catch {
    return { ok: false, reason: 'malformed-manifest' };
  }

  let verified;
  try {
    // Ed25519 does not take a digest algorithm — pass null, matching Node's
    // documented API for this key type.
    verified = crypto.verify(null, canonicalBytes, publicKey, signatureBuffer);
  } catch {
    return { ok: false, reason: 'verification-error' };
  }

  return verified ? { ok: true } : { ok: false, reason: 'signature-mismatch' };
}

module.exports = { canonicalizeManifest, verifyManifest };

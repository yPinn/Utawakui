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

const SHA512_HEX_PATTERN = /^[0-9a-f]{128}$/i;
const SHA512_BASE64_PATTERN = /^[A-Za-z0-9+/]{86}==$/;
const SIGNATURE_HEX_PATTERN = /^[0-9a-f]{128}$/i;
const KEY_ID_PATTERN = /^[0-9a-f]{64}$/;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_MANIFEST_FILES = 16;
const MAX_TRUSTED_KEYS = 8;
const PRODUCTION_KEY_STATUSES = new Set(['active', 'retiring', 'recovery']);

function hasControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function normalizeVersion(value) {
  if (typeof value !== 'string') return null;
  const version = value.trim();
  if (
    version.length === 0 ||
    version.length > 64 ||
    hasControlCharacters(version)
  ) {
    return null;
  }
  return version;
}

function normalizeFileName(value, { allowAbsoluteUrl = false } = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return null;
  }

  let encodedName;
  if (/^https?:\/\//iu.test(value)) {
    if (!allowAbsoluteUrl) return null;
    try {
      const parsed = new URL(value);
      encodedName = parsed.pathname.split('/').at(-1) || '';
    } catch {
      return null;
    }
  } else {
    encodedName = value.split(/[?#]/u, 1)[0];
    if (encodedName.includes('/') || encodedName.includes('\\')) return null;
  }

  let name;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return null;
  }
  if (
    name.length === 0 ||
    name.length > MAX_FILE_NAME_LENGTH ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    hasControlCharacters(name)
  ) {
    return null;
  }
  return name;
}

function normalizeSha512Base64(value) {
  if (typeof value !== 'string' || !SHA512_BASE64_PATTERN.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== value) return null;
  return bytes.toString('hex');
}

function normalizeSha512Hex(value) {
  return typeof value === 'string' && SHA512_HEX_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function normalizeFileSize(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Reduce electron-updater's UpdateInfo to the only fields the independent
// signature layer needs. The original URL and all other feed metadata stay in
// main and are never projected to the renderer. This product currently ships
// one Windows/x64 installer per release, so multiple download candidates are
// rejected rather than guessing which one electron-updater will select.
function createUpdateDescriptor(updateInfo) {
  const version = normalizeVersion(updateInfo?.version);
  if (!version) return { ok: false, reason: 'invalid-update-version' };
  if (!Array.isArray(updateInfo?.files) || updateInfo.files.length === 0) {
    return { ok: false, reason: 'missing-update-file' };
  }
  if (updateInfo.files.length !== 1) {
    return { ok: false, reason: 'ambiguous-update-files' };
  }

  const fileInfo = updateInfo.files[0];
  const name = normalizeFileName(fileInfo?.url, { allowAbsoluteUrl: true });
  if (!name) return { ok: false, reason: 'invalid-update-file-name' };
  const size = normalizeFileSize(fileInfo?.size);
  if (!size) return { ok: false, reason: 'invalid-update-size' };
  const sha512 = normalizeSha512Base64(fileInfo?.sha512);
  if (!sha512) return { ok: false, reason: 'invalid-update-sha512' };

  if (updateInfo.path !== undefined) {
    const legacyName = normalizeFileName(updateInfo.path, {
      allowAbsoluteUrl: true,
    });
    if (!legacyName || legacyName !== name) {
      return { ok: false, reason: 'inconsistent-update-metadata' };
    }
  }
  if (updateInfo.sha512 !== undefined) {
    const legacySha512 = normalizeSha512Base64(updateInfo.sha512);
    if (!legacySha512 || legacySha512 !== sha512) {
      return { ok: false, reason: 'inconsistent-update-metadata' };
    }
  }

  return { ok: true, value: { version, file: { name, size, sha512 } } };
}

function matchManifestToUpdateDescriptor(manifest, descriptor) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, reason: 'malformed-manifest' };
  }
  if (manifest.schemaVersion !== 2) {
    return { ok: false, reason: 'unsupported-schema-version' };
  }
  if (normalizeVersion(manifest.version) !== descriptor?.version) {
    return { ok: false, reason: 'version-mismatch' };
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    return { ok: false, reason: 'missing-manifest-file' };
  }
  if (manifest.files.length > MAX_MANIFEST_FILES) {
    return { ok: false, reason: 'too-many-manifest-files' };
  }

  const files = [];
  const names = new Set();
  for (const entry of manifest.files) {
    const name = normalizeFileName(entry?.name);
    if (!name) return { ok: false, reason: 'invalid-manifest-file-name' };
    if (names.has(name)) {
      return { ok: false, reason: 'duplicate-manifest-file' };
    }
    names.add(name);
    const size = normalizeFileSize(entry?.size);
    if (!size) return { ok: false, reason: 'invalid-manifest-file-size' };
    const sha512 = normalizeSha512Hex(entry?.sha512);
    if (!sha512) return { ok: false, reason: 'invalid-manifest-file-sha512' };
    files.push({ name, size, sha512 });
  }

  const matched = files.find((entry) => entry.name === descriptor?.file?.name);
  if (!matched) return { ok: false, reason: 'update-name-mismatch' };
  if (matched.size !== descriptor.file.size) {
    return { ok: false, reason: 'update-size-mismatch' };
  }
  if (matched.sha512 !== descriptor.file.sha512) {
    return { ok: false, reason: 'update-sha512-mismatch' };
  }
  return { ok: true };
}

// Deterministic serialization: sorted keys, no whitespace. Mirrors the
// canonicalize() shape EliteSand Pro's update-signature.js uses for the same
// problem (see docs/research/competitive-research.md) — not copied code, the
// same well-known technique (a manifest's signature must cover exactly one
// unambiguous byte sequence, independent of object key insertion order).
function canonicalizeManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('manifest must be a plain object');
  }
  const rest = { ...manifest };
  delete rest.signatures;
  return canonicalizeValue(rest);
}

function assertValidUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError('JCS strings must not contain lone surrogates');
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError('JCS strings must not contain lone surrogates');
    }
  }
}

function canonicalizeValue(value) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new TypeError('JCS arrays must not be sparse');
      }
    }
    return `[${value.map(canonicalizeValue).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => {
        assertValidUnicode(key);
        return `${JSON.stringify(key)}:${canonicalizeValue(value[key])}`;
      })
      .join(',')}}`;
  }
  if (typeof value === 'string') assertValidUnicode(value);
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('JCS numbers must be finite');
  }
  if (
    value !== null &&
    !['string', 'number', 'boolean'].includes(typeof value)
  ) {
    throw new TypeError('value is outside the I-JSON data model');
  }
  return JSON.stringify(value);
}

function loadPublicKey(publicKeyHex) {
  if (typeof publicKeyHex !== 'string' || !/^[0-9a-f]+$/i.test(publicKeyHex)) {
    throw new Error('update signing public key is invalid');
  }
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(publicKeyHex, 'hex'),
    format: 'der',
    type: 'spki',
  });
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('update signing key is not Ed25519');
  }
  return publicKey;
}

function deriveUpdateSigningKeyId(publicKeyHex) {
  const publicKey = loadPublicKey(publicKeyHex);
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(spki).digest('hex');
}

function selectTrustedKey(keyId, registry, requiredEnvironment) {
  if (typeof keyId !== 'string' || keyId.length === 0) {
    return { ok: false, reason: 'missing-key-id' };
  }
  if (!KEY_ID_PATTERN.test(keyId)) {
    return { ok: false, reason: 'invalid-key-id' };
  }
  if (
    registry?.schemaVersion !== 1 ||
    !Array.isArray(registry.keys) ||
    registry.keys.length === 0 ||
    registry.keys.length > MAX_TRUSTED_KEYS
  ) {
    return { ok: false, reason: 'invalid-key-registry' };
  }

  const matches = registry.keys.filter((entry) => entry?.keyId === keyId);
  if (matches.length === 0) return { ok: false, reason: 'unknown-key-id' };
  if (matches.length !== 1) return { ok: false, reason: 'duplicate-key-id' };

  const keyInfo = matches[0];
  if (keyInfo.environment !== requiredEnvironment) {
    return { ok: false, reason: 'key-environment-mismatch' };
  }
  const acceptedStatuses =
    requiredEnvironment === 'production'
      ? PRODUCTION_KEY_STATUSES
      : new Set(['development']);
  if (!acceptedStatuses.has(keyInfo.status)) {
    return { ok: false, reason: 'untrusted-key-status' };
  }
  if (keyInfo.algorithm !== 'ed25519') {
    return { ok: false, reason: 'unsupported-key-algorithm' };
  }
  return { ok: true, keyInfo };
}

// Returns { ok: true } or { ok: false, reason }. Never throws for a malformed
// manifest/signature — those are exactly the inputs this function exists to
// reject, so they are reported the same way as a genuine forgery, not
// surfaced as an operational error.
function verifyManifest(
  manifest,
  trustedKeyRegistry,
  { requiredEnvironment = 'production' } = {},
) {
  if (!manifest || !Array.isArray(manifest.signatures)) {
    return { ok: false, reason: 'missing-signatures' };
  }
  if (manifest.schemaVersion !== 2) {
    return { ok: false, reason: 'unsupported-schema-version' };
  }
  if (
    manifest.signatures.length === 0 ||
    manifest.signatures.length > MAX_TRUSTED_KEYS
  ) {
    return { ok: false, reason: 'invalid-signatures-envelope' };
  }

  const signatureKeyIds = new Set();
  for (const signature of manifest.signatures) {
    if (typeof signature?.keyId !== 'string' || signature.keyId.length === 0) {
      return { ok: false, reason: 'missing-key-id' };
    }
    if (!KEY_ID_PATTERN.test(signature.keyId)) {
      return { ok: false, reason: 'invalid-key-id' };
    }
    if (signatureKeyIds.has(signature.keyId)) {
      return { ok: false, reason: 'duplicate-signature-key-id' };
    }
    signatureKeyIds.add(signature.keyId);
    if (signature.algorithm !== 'ed25519') {
      return { ok: false, reason: 'unsupported-signature-algorithm' };
    }
    if (!SIGNATURE_HEX_PATTERN.test(signature.signature)) {
      return { ok: false, reason: 'invalid-signature-encoding' };
    }
  }

  let canonicalBytes;
  try {
    canonicalBytes = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  } catch {
    return { ok: false, reason: 'malformed-manifest' };
  }

  const verifiedKeyIds = [];
  let failureReason = 'unknown-key-id';
  for (const signature of manifest.signatures) {
    const trustedKey = selectTrustedKey(
      signature.keyId,
      trustedKeyRegistry,
      requiredEnvironment,
    );
    if (!trustedKey.ok) {
      if (trustedKey.reason !== 'unknown-key-id') {
        failureReason = trustedKey.reason;
      }
      continue;
    }

    let publicKey;
    try {
      publicKey = loadPublicKey(trustedKey.keyInfo.publicKeyHex);
    } catch {
      failureReason = 'invalid-public-key';
      continue;
    }
    const derivedKeyId = crypto
      .createHash('sha256')
      .update(publicKey.export({ type: 'spki', format: 'der' }))
      .digest('hex');
    if (derivedKeyId !== signature.keyId) {
      failureReason = 'key-id-mismatch';
      continue;
    }

    try {
      // Ed25519 does not take a digest algorithm — pass null, matching Node's
      // documented API for this key type.
      if (
        crypto.verify(
          null,
          canonicalBytes,
          publicKey,
          Buffer.from(signature.signature, 'hex'),
        )
      ) {
        verifiedKeyIds.push(signature.keyId);
      } else {
        failureReason = 'signature-mismatch';
      }
    } catch {
      failureReason = 'verification-error';
    }
  }

  return verifiedKeyIds.length > 0
    ? { ok: true, keyId: verifiedKeyIds[0], verifiedKeyIds }
    : { ok: false, reason: failureReason };
}

module.exports = {
  canonicalizeManifest,
  createUpdateDescriptor,
  deriveUpdateSigningKeyId,
  matchManifestToUpdateDescriptor,
  verifyManifest,
};

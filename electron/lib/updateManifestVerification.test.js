import { generateKeyPairSync, sign as signBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeManifest,
  verifyManifest,
} from './updateManifestVerification.js';

function keypairHex() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyHex: publicKey
      .export({ type: 'spki', format: 'der' })
      .toString('hex'),
    privateKey,
  };
}

function signedManifest(privateKey, overrides = {}) {
  const manifest = {
    schemaVersion: 1,
    version: '0.4.0',
    releaseDate: '2026-10-01T00:00:00.000Z',
    files: [
      {
        name: 'Utawakui-Setup-0.4.0.exe',
        size: 12345,
        sha512: 'a'.repeat(128),
      },
    ],
    ...overrides,
  };
  const canonicalBytes = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  const signature = signBytes(null, canonicalBytes, privateKey).toString('hex');
  return { ...manifest, signature };
}

describe('canonicalizeManifest', () => {
  it('produces the same bytes regardless of key insertion order', () => {
    const a = canonicalizeManifest({ version: '1.0.0', schemaVersion: 1 });
    const b = canonicalizeManifest({ schemaVersion: 1, version: '1.0.0' });
    expect(a).toBe(b);
  });

  it('excludes the signature field from what gets signed', () => {
    const withSig = canonicalizeManifest({ version: '1.0.0', signature: 'x' });
    const withoutSig = canonicalizeManifest({ version: '1.0.0' });
    expect(withSig).toBe(withoutSig);
  });
});

describe('verifyManifest', () => {
  it('accepts a manifest signed with the matching key', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const manifest = signedManifest(privateKey);

    expect(verifyManifest(manifest, publicKeyHex)).toEqual({ ok: true });
  });

  it('rejects a manifest whose content was tampered with after signing', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const manifest = signedManifest(privateKey);
    const tampered = { ...manifest, version: '9.9.9' };

    expect(verifyManifest(tampered, publicKeyHex)).toEqual({
      ok: false,
      reason: 'signature-mismatch',
    });
  });

  it('rejects a manifest signed with a different key than the trusted one', () => {
    const { privateKey } = keypairHex();
    const { publicKeyHex: otherPublicKeyHex } = keypairHex();
    const manifest = signedManifest(privateKey);

    expect(verifyManifest(manifest, otherPublicKeyHex)).toEqual({
      ok: false,
      reason: 'signature-mismatch',
    });
  });

  it('rejects a manifest with no signature field', () => {
    const { publicKeyHex } = keypairHex();

    expect(verifyManifest({ version: '1.0.0' }, publicKeyHex)).toEqual({
      ok: false,
      reason: 'missing-signature',
    });
  });

  it('rejects a manifest whose signature is not valid hex', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const manifest = signedManifest(privateKey, {});

    expect(
      verifyManifest({ ...manifest, signature: '' }, publicKeyHex),
    ).toEqual({ ok: false, reason: 'invalid-signature-encoding' });
  });

  it('rejects an invalid public key instead of throwing', () => {
    const { privateKey } = keypairHex();
    const manifest = signedManifest(privateKey);

    expect(verifyManifest(manifest, 'not-hex')).toEqual({
      ok: false,
      reason: 'invalid-public-key',
    });
  });

  it('rejects null/undefined manifests instead of throwing', () => {
    const { publicKeyHex } = keypairHex();

    expect(verifyManifest(null, publicKeyHex)).toEqual({
      ok: false,
      reason: 'missing-signature',
    });
  });
});

import {
  createPublicKey,
  generateKeyPairSync,
  sign as signBytes,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeManifest,
  createUpdateDescriptor,
  deriveUpdateSigningKeyId,
  matchManifestToUpdateDescriptor,
  verifyManifest,
} from './updateManifestVerification.js';

const INSTALLER_SHA512_BYTES = Buffer.alloc(64, 0xab);
const INSTALLER_SHA512_BASE64 = INSTALLER_SHA512_BYTES.toString('base64');
const INSTALLER_SHA512_HEX = INSTALLER_SHA512_BYTES.toString('hex');

function updateInfo(overrides = {}) {
  return {
    version: '0.4.0',
    path: 'Utawakui-Setup-0.4.0.exe',
    sha512: INSTALLER_SHA512_BASE64,
    files: [
      {
        url: 'Utawakui-Setup-0.4.0.exe',
        size: 12345,
        sha512: INSTALLER_SHA512_BASE64,
      },
    ],
    ...overrides,
  };
}

function keypairHex() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyHex = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('hex');
  return {
    publicKeyHex,
    keyId: deriveUpdateSigningKeyId(publicKeyHex),
    privateKey,
  };
}

function trustedKeyRegistry(publicKeyHex, overrides = {}) {
  const keyId = deriveUpdateSigningKeyId(publicKeyHex);
  return {
    schemaVersion: 1,
    activeProductionKeyId: keyId,
    keys: [
      {
        keyId,
        label: 'test-current',
        environment: 'production',
        algorithm: 'ed25519',
        status: 'active',
        publicKeyHex,
      },
    ],
    ...overrides,
  };
}

function signedManifest(privateKey, overrides = {}) {
  const { signatureKeyId, signatureValue, ...manifestOverrides } = overrides;
  const publicKeyHex = cryptoPublicKeyHex(privateKey);
  const manifest = {
    schemaVersion: 2,
    version: '0.4.0',
    releaseDate: '2026-10-01T00:00:00.000Z',
    files: [
      {
        name: 'Utawakui-Setup-0.4.0.exe',
        size: 12345,
        sha512: INSTALLER_SHA512_HEX,
      },
    ],
    ...manifestOverrides,
  };
  const canonicalBytes = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  const signature = signBytes(null, canonicalBytes, privateKey).toString('hex');
  return {
    ...manifest,
    signatures: [
      {
        keyId: signatureKeyId || deriveUpdateSigningKeyId(publicKeyHex),
        algorithm: 'ed25519',
        signature: signatureValue ?? signature,
      },
    ],
  };
}

function multiSignedManifest(signers) {
  const manifest = {
    schemaVersion: 2,
    version: '0.4.0',
    releaseDate: '2026-10-01T00:00:00.000Z',
    files: [
      {
        name: 'Utawakui-Setup-0.4.0.exe',
        size: 12345,
        sha512: INSTALLER_SHA512_HEX,
      },
    ],
  };
  const canonicalBytes = Buffer.from(canonicalizeManifest(manifest), 'utf8');
  return {
    ...manifest,
    signatures: signers.map(({ keyId, privateKey }) => ({
      keyId,
      algorithm: 'ed25519',
      signature: signBytes(null, canonicalBytes, privateKey).toString('hex'),
    })),
  };
}

function cryptoPublicKeyHex(privateKey) {
  return createPublicKey(privateKey)
    .export({ type: 'spki', format: 'der' })
    .toString('hex');
}

describe('createUpdateDescriptor', () => {
  it('normalizes electron-updater metadata into a main-private descriptor', () => {
    expect(createUpdateDescriptor(updateInfo())).toEqual({
      ok: true,
      value: {
        version: '0.4.0',
        file: {
          name: 'Utawakui-Setup-0.4.0.exe',
          size: 12345,
          sha512: INSTALLER_SHA512_HEX,
        },
      },
    });
  });

  it('rejects ambiguous updater metadata with more than one downloadable file', () => {
    expect(
      createUpdateDescriptor(
        updateInfo({
          files: [
            updateInfo().files[0],
            {
              url: 'Utawakui-Setup-0.4.0-arm64.exe',
              size: 12345,
              sha512: INSTALLER_SHA512_BASE64,
            },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: 'ambiguous-update-files' });
  });

  it('rejects malformed SHA-512 and unsafe or incomplete file metadata', () => {
    expect(
      createUpdateDescriptor(
        updateInfo({
          files: [{ ...updateInfo().files[0], sha512: 'not-base64' }],
        }),
      ),
    ).toEqual({ ok: false, reason: 'invalid-update-sha512' });
    expect(
      createUpdateDescriptor(
        updateInfo({
          files: [{ ...updateInfo().files[0], size: undefined }],
        }),
      ),
    ).toEqual({ ok: false, reason: 'invalid-update-size' });
    expect(
      createUpdateDescriptor(
        updateInfo({
          files: [{ ...updateInfo().files[0], url: '../setup.exe' }],
        }),
      ),
    ).toEqual({ ok: false, reason: 'invalid-update-file-name' });
  });

  it('rejects disagreement between legacy and files metadata', () => {
    expect(createUpdateDescriptor(updateInfo({ path: 'other.exe' }))).toEqual({
      ok: false,
      reason: 'inconsistent-update-metadata',
    });
    expect(
      createUpdateDescriptor(
        updateInfo({ sha512: Buffer.alloc(64).toString('base64') }),
      ),
    ).toEqual({ ok: false, reason: 'inconsistent-update-metadata' });
  });
});

describe('matchManifestToUpdateDescriptor', () => {
  const descriptor = createUpdateDescriptor(updateInfo()).value;
  const matchingManifest = {
    schemaVersion: 2,
    version: '0.4.0',
    releaseDate: '2026-10-01T00:00:00.000Z',
    files: [
      {
        name: 'Utawakui-Setup-0.4.0.exe',
        size: 12345,
        sha512: INSTALLER_SHA512_HEX,
      },
    ],
    signatures: [
      {
        keyId: 'ab'.repeat(32),
        algorithm: 'ed25519',
        signature: 'ab'.repeat(64),
      },
    ],
  };

  it('accepts only an exact version, filename, size, and SHA-512 binding', () => {
    expect(
      matchManifestToUpdateDescriptor(matchingManifest, descriptor),
    ).toEqual({ ok: true });

    for (const [field, value] of [
      ['name', 'Utawakui-Setup-0.4.0-replaced.exe'],
      ['size', 12346],
      ['sha512', 'cd'.repeat(64)],
    ]) {
      const manifest = {
        ...matchingManifest,
        files: [{ ...matchingManifest.files[0], [field]: value }],
      };
      expect(matchManifestToUpdateDescriptor(manifest, descriptor)).toEqual({
        ok: false,
        reason: `update-${field}-mismatch`,
      });
    }

    expect(
      matchManifestToUpdateDescriptor(
        { ...matchingManifest, version: '0.4.1' },
        descriptor,
      ),
    ).toEqual({ ok: false, reason: 'version-mismatch' });
  });

  it('rejects malformed, duplicate, or path-bearing manifest file entries', () => {
    expect(
      matchManifestToUpdateDescriptor(
        { ...matchingManifest, schemaVersion: 3 },
        descriptor,
      ),
    ).toEqual({ ok: false, reason: 'unsupported-schema-version' });
    expect(
      matchManifestToUpdateDescriptor(
        {
          ...matchingManifest,
          files: [matchingManifest.files[0], matchingManifest.files[0]],
        },
        descriptor,
      ),
    ).toEqual({ ok: false, reason: 'duplicate-manifest-file' });
    expect(
      matchManifestToUpdateDescriptor(
        {
          ...matchingManifest,
          files: [{ ...matchingManifest.files[0], name: '../setup.exe' }],
        },
        descriptor,
      ),
    ).toEqual({ ok: false, reason: 'invalid-manifest-file-name' });
  });
});

describe('canonicalizeManifest', () => {
  it('produces the same bytes regardless of key insertion order', () => {
    const a = canonicalizeManifest({ version: '1.0.0', schemaVersion: 1 });
    const b = canonicalizeManifest({ schemaVersion: 1, version: '1.0.0' });
    expect(a).toBe(b);
  });

  it('excludes the signatures envelope from what gets signed', () => {
    const withSignatures = canonicalizeManifest({
      version: '1.0.0',
      signatures: [{ keyId: 'x', signature: 'y' }],
    });
    const withoutSignatures = canonicalizeManifest({ version: '1.0.0' });
    expect(withSignatures).toBe(withoutSignatures);
  });

  it('authenticates a stray legacy signature field instead of excluding it', () => {
    expect(
      canonicalizeManifest({ version: '1.0.0', signature: 'legacy-value' }),
    ).not.toBe(canonicalizeManifest({ version: '1.0.0' }));
  });

  it('matches the RFC 8785 JSON canonicalization example', () => {
    expect(
      canonicalizeManifest({
        numbers: [Number('333333333.33333329'), 1e30, 4.5, 2e-3, 1e-27],
        string: '€$\u000f\nA\'B"\\\\"/',
        literals: [null, true, false],
      }),
    ).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it('rejects values outside the I-JSON data model', () => {
    expect(() => canonicalizeManifest({ value: undefined })).toThrow();
    expect(() => canonicalizeManifest({ value: Number.NaN })).toThrow();
    expect(() => canonicalizeManifest({ value: '\ud800' })).toThrow();
  });
});

describe('verifyManifest', () => {
  it('lets old and new clients verify the same overlap manifest', () => {
    const previous = keypairHex();
    const current = keypairHex();
    const manifest = multiSignedManifest([current, previous]);
    const previousRegistry = trustedKeyRegistry(previous.publicKeyHex);
    const currentRegistry = trustedKeyRegistry(current.publicKeyHex);

    expect(verifyManifest(manifest, previousRegistry)).toMatchObject({
      ok: true,
      keyId: previous.keyId,
    });
    expect(verifyManifest(manifest, currentRegistry)).toMatchObject({
      ok: true,
      keyId: current.keyId,
    });
  });

  it('accepts a manifest signed with the matching key', () => {
    const { publicKeyHex, privateKey, keyId } = keypairHex();
    const manifest = signedManifest(privateKey);

    expect(
      verifyManifest(manifest, trustedKeyRegistry(publicKeyHex)),
    ).toMatchObject({ ok: true, keyId });
  });

  it('rejects a manifest whose content was tampered with after signing', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const manifest = signedManifest(privateKey);
    const tampered = { ...manifest, version: '9.9.9' };

    expect(verifyManifest(tampered, trustedKeyRegistry(publicKeyHex))).toEqual({
      ok: false,
      reason: 'signature-mismatch',
    });
  });

  it('rejects a manifest signed with a different key than the trusted one', () => {
    const { privateKey } = keypairHex();
    const { publicKeyHex: otherPublicKeyHex, keyId: otherKeyId } = keypairHex();
    const manifest = signedManifest(privateKey, {
      signatureKeyId: otherKeyId,
    });

    expect(
      verifyManifest(manifest, trustedKeyRegistry(otherPublicKeyHex)),
    ).toEqual({
      ok: false,
      reason: 'signature-mismatch',
    });
  });

  it('rejects a manifest with no signatures envelope', () => {
    const { publicKeyHex } = keypairHex();

    expect(
      verifyManifest({ version: '1.0.0' }, trustedKeyRegistry(publicKeyHex)),
    ).toEqual({ ok: false, reason: 'missing-signatures' });
  });

  it('rejects a manifest whose signature is not valid hex', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const manifest = signedManifest(privateKey);
    manifest.signatures[0].signature = '';

    expect(verifyManifest(manifest, trustedKeyRegistry(publicKeyHex))).toEqual({
      ok: false,
      reason: 'invalid-signature-encoding',
    });
  });

  it('rejects an invalid public key instead of throwing', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const manifest = signedManifest(privateKey);
    const registry = trustedKeyRegistry(publicKeyHex);
    registry.keys[0].publicKeyHex = 'not-hex';

    expect(verifyManifest(manifest, registry)).toEqual({
      ok: false,
      reason: 'invalid-public-key',
    });
  });

  it('rejects null/undefined manifests instead of throwing', () => {
    const { publicKeyHex } = keypairHex();

    expect(verifyManifest(null, trustedKeyRegistry(publicKeyHex))).toEqual({
      ok: false,
      reason: 'missing-signatures',
    });
  });

  it('selects the trusted key by keyId and rejects missing or unknown ids', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const registry = trustedKeyRegistry(publicKeyHex);
    const manifestWithoutKeyId = signedManifest(privateKey);
    delete manifestWithoutKeyId.signatures[0].keyId;

    expect(verifyManifest(manifestWithoutKeyId, registry)).toEqual({
      ok: false,
      reason: 'missing-key-id',
    });
    expect(
      verifyManifest(
        signedManifest(privateKey, {
          signatureKeyId: 'unknown-2026-01',
        }),
        registry,
      ),
    ).toEqual({ ok: false, reason: 'invalid-key-id' });
    expect(
      verifyManifest(
        signedManifest(privateKey, {
          signatureKeyId: 'ff'.repeat(32),
        }),
        registry,
      ),
    ).toEqual({ ok: false, reason: 'unknown-key-id' });
  });

  it('accepts active and retiring production keys during an overlap rotation', () => {
    const current = keypairHex();
    const previous = keypairHex();
    const registry = trustedKeyRegistry(current.publicKeyHex, {
      activeProductionKeyId: current.keyId,
      keys: [
        {
          keyId: current.keyId,
          label: 'current-2026-01',
          environment: 'production',
          algorithm: 'ed25519',
          status: 'active',
          publicKeyHex: current.publicKeyHex,
        },
        {
          keyId: previous.keyId,
          label: 'previous-2025-01',
          environment: 'production',
          algorithm: 'ed25519',
          status: 'retiring',
          publicKeyHex: previous.publicKeyHex,
        },
      ],
    });

    expect(
      verifyManifest(signedManifest(current.privateKey), registry),
    ).toMatchObject({ ok: true, keyId: current.keyId });
    expect(
      verifyManifest(signedManifest(previous.privateKey), registry),
    ).toMatchObject({ ok: true, keyId: previous.keyId });
  });

  it('rejects development, revoked, and duplicate key entries in production verification', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const manifest = signedManifest(privateKey);
    const developmentKey = {
      keyId: deriveUpdateSigningKeyId(publicKeyHex),
      label: 'test-development',
      environment: 'development',
      algorithm: 'ed25519',
      status: 'development',
      publicKeyHex,
    };

    expect(
      verifyManifest(
        manifest,
        trustedKeyRegistry(publicKeyHex, { keys: [developmentKey] }),
      ),
    ).toEqual({ ok: false, reason: 'key-environment-mismatch' });
    expect(
      verifyManifest(
        manifest,
        trustedKeyRegistry(publicKeyHex, {
          keys: [
            { ...developmentKey, environment: 'production', status: 'revoked' },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: 'untrusted-key-status' });
    expect(
      verifyManifest(
        manifest,
        trustedKeyRegistry(publicKeyHex, {
          keys: [
            { ...developmentKey, environment: 'production', status: 'active' },
            {
              ...developmentKey,
              environment: 'production',
              status: 'retiring',
            },
          ],
        }),
      ),
    ).toEqual({ ok: false, reason: 'duplicate-key-id' });
  });

  it('rejects a registry keyId that is not the SHA-256 fingerprint of its SPKI key', () => {
    const { publicKeyHex, privateKey } = keypairHex();
    const manifest = signedManifest(privateKey);
    const registry = trustedKeyRegistry(publicKeyHex);
    registry.keys[0].keyId = '00'.repeat(32);
    registry.keys[0].publicKeyHex = publicKeyHex;
    const mismatchedManifest = structuredClone(manifest);
    mismatchedManifest.signatures[0].keyId = '00'.repeat(32);

    expect(verifyManifest(mismatchedManifest, registry)).toEqual({
      ok: false,
      reason: 'key-id-mismatch',
    });
  });
});

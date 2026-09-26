import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveUpdateSigningKeyId } from '../electron/lib/updateManifestVerification.js';
import { resolveUpdateSigningPolicy } from './update-signing-policy.mjs';

function productionKey(overrides = {}) {
  const { publicKey } = generateKeyPairSync('ed25519');
  const publicKeyHex = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('hex');
  return {
    keyId: deriveUpdateSigningKeyId(publicKeyHex),
    label: 'production-test',
    environment: 'production',
    algorithm: 'ed25519',
    status: 'active',
    publicKeyHex,
    ...overrides,
  };
}

describe('resolveUpdateSigningPolicy', () => {
  it('keeps signing disabled without requiring a production private key', () => {
    expect(
      resolveUpdateSigningPolicy({
        updateValues: { signedManifestEnabled: false },
        registry: { schemaVersion: 1, activeProductionKeyId: null, keys: [] },
      }),
    ).toEqual({ enabled: false, activeKeyId: '', retiringKeyId: '' });
  });

  it('requires exactly one matching active production key when enabled', () => {
    const key = productionKey();
    expect(
      resolveUpdateSigningPolicy({
        updateValues: { signedManifestEnabled: true },
        registry: {
          schemaVersion: 1,
          activeProductionKeyId: key.keyId,
          keys: [key],
        },
      }),
    ).toEqual({ enabled: true, activeKeyId: key.keyId, retiringKeyId: '' });

    expect(() =>
      resolveUpdateSigningPolicy({
        updateValues: { signedManifestEnabled: true },
        registry: {
          schemaVersion: 1,
          activeProductionKeyId: null,
          keys: [key],
        },
      }),
    ).toThrow(/active production key/iu);
  });

  it('requires exactly one declared retiring production key during overlap', () => {
    const active = productionKey();
    const retiring = productionKey({
      label: 'retiring-test',
      status: 'retiring',
    });
    expect(
      resolveUpdateSigningPolicy({
        updateValues: { signedManifestEnabled: true },
        registry: {
          schemaVersion: 1,
          activeProductionKeyId: active.keyId,
          keys: [active, retiring],
        },
      }),
    ).toEqual({
      enabled: true,
      activeKeyId: active.keyId,
      retiringKeyId: retiring.keyId,
    });

    expect(() =>
      resolveUpdateSigningPolicy({
        updateValues: { signedManifestEnabled: true },
        registry: {
          schemaVersion: 1,
          activeProductionKeyId: active.keyId,
          keys: [
            active,
            retiring,
            productionKey({ label: 'second-retiring', status: 'retiring' }),
          ],
        },
      }),
    ).toThrow(/retiring production key/iu);
  });

  it('rejects duplicate ids and ids that do not fingerprint the public key', () => {
    const key = productionKey();
    expect(() =>
      resolveUpdateSigningPolicy({
        updateValues: { signedManifestEnabled: true },
        registry: {
          schemaVersion: 1,
          activeProductionKeyId: key.keyId,
          keys: [key, key],
        },
      }),
    ).toThrow(/duplicate/iu);
    expect(() =>
      resolveUpdateSigningPolicy({
        updateValues: { signedManifestEnabled: true },
        registry: {
          schemaVersion: 1,
          activeProductionKeyId: '00'.repeat(32),
          keys: [{ ...key, keyId: '00'.repeat(32) }],
        },
      }),
    ).toThrow(/fingerprint/iu);
  });

  it('rejects status and environment combinations the runtime will not trust', () => {
    const key = productionKey();
    for (const invalidKey of [
      { ...key, status: 'development' },
      { ...key, environment: 'development', status: 'active' },
    ]) {
      expect(() =>
        resolveUpdateSigningPolicy({
          updateValues: { signedManifestEnabled: false },
          registry: {
            schemaVersion: 1,
            activeProductionKeyId: null,
            keys: [invalidKey],
          },
        }),
      ).toThrow(/key contract/iu);
    }
  });
});

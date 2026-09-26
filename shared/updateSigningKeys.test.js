import { createHash, createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import updateValues from './appUpdateValues.json';
import registry from './updateSigningKeys.json';

describe('update signing key registry', () => {
  it('uses unique bounded key ids and structurally valid Ed25519 public keys', () => {
    expect(registry.schemaVersion).toBe(1);
    expect(Array.isArray(registry.keys)).toBe(true);
    expect(registry.keys.length).toBeGreaterThan(0);
    const keyIds = new Set();

    for (const keyInfo of registry.keys) {
      expect(keyInfo.keyId).toMatch(/^[0-9a-f]{64}$/u);
      expect(keyIds.has(keyInfo.keyId)).toBe(false);
      keyIds.add(keyInfo.keyId);
      expect(keyInfo.algorithm).toBe('ed25519');
      expect(['development', 'production']).toContain(keyInfo.environment);
      expect([
        'development',
        'active',
        'retiring',
        'recovery',
        'revoked',
      ]).toContain(keyInfo.status);
      expect(keyInfo.publicKeyHex).toMatch(/^[0-9a-f]+$/iu);
      const publicKey = createPublicKey({
        key: Buffer.from(keyInfo.publicKeyHex, 'hex'),
        format: 'der',
        type: 'spki',
      });
      expect(publicKey.asymmetricKeyType).toBe('ed25519');
      expect(keyInfo.keyId).toBe(
        createHash('sha256')
          .update(Buffer.from(keyInfo.publicKeyHex, 'hex'))
          .digest('hex'),
      );
    }
  });

  it('cannot enable the production gate without an active production signing key', () => {
    if (!updateValues.signedManifestEnabled) {
      expect(registry.activeProductionKeyId).toBeNull();
      expect(
        registry.keys.every((key) => key.environment !== 'production'),
      ).toBe(true);
      return;
    }

    const active = registry.keys.filter(
      (key) =>
        key.keyId === registry.activeProductionKeyId &&
        key.environment === 'production' &&
        key.status === 'active',
    );
    expect(active).toHaveLength(1);
  });
});

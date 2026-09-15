import { createPublicKey } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import keyInfo from './updateSigningPublicKey.json';

describe('update signing public key', () => {
  it('declares an Ed25519 key with a bounded key id and environment', () => {
    expect(keyInfo.algorithm).toBe('ed25519');
    expect(typeof keyInfo.keyId).toBe('string');
    expect(keyInfo.keyId.length).toBeGreaterThan(0);
    expect(['dev', 'production']).toContain(keyInfo.environment);
  });

  it('holds a structurally valid SPKI-encoded Ed25519 public key', () => {
    expect(keyInfo.publicKeyHex).toMatch(/^[0-9a-f]+$/i);
    const publicKey = createPublicKey({
      key: Buffer.from(keyInfo.publicKeyHex, 'hex'),
      format: 'der',
      type: 'spki',
    });
    expect(publicKey.asymmetricKeyType).toBe('ed25519');
  });
});

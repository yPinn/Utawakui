import { describe, expect, it } from 'vitest';
import { MAX_FAILURES, createPairingCodes } from './pairing.js';

function setup() {
  let time = 1000;
  const codes = createPairingCodes({ now: () => time });
  return { codes, advance: (ms) => (time += ms) };
}

describe('companion pairing codes', () => {
  it('accepts the active code once', () => {
    const { codes } = setup();
    const { code, expiresAt } = codes.begin();
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(expiresAt).toBe(121000);
    expect(codes.claim(code)).toBe(true);
    expect(codes.claim(code)).toBe(false);
  });

  it('expires after two minutes and when replaced or cancelled', () => {
    const { codes, advance } = setup();
    const first = codes.begin().code;
    const second = codes.begin().code;
    expect(codes.claim(first)).toBe(false);
    advance(120000);
    expect(codes.status().pending).toBe(false);
    expect(codes.claim(second)).toBe(false);
    const third = codes.begin().code;
    codes.cancel();
    expect(codes.claim(third)).toBe(false);
  });

  it('voids the code after repeated wrong guesses', () => {
    const { codes } = setup();
    const { code } = codes.begin();
    for (let i = 0; i < MAX_FAILURES; i++)
      expect(codes.claim('A'.repeat(22))).toBe(false);
    expect(codes.claim(code)).toBe(false);
  });

  it('rejects malformed codes without throwing', () => {
    const { codes } = setup();
    codes.begin();
    for (const value of [null, 42, '', 'short', 'x'.repeat(40)])
      expect(codes.claim(value)).toBe(false);
  });
});

import { effectScope, nextTick, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useCompanionPairingQr } from './useCompanionPairingQr.js';

describe('useCompanionPairingQr', () => {
  it('keeps a scanned code expired after the approval finishes', async () => {
    const url = '#pair=code';
    const pairing = shallowRef({ url, expiresAt: Date.now() + 1000 });
    const status = shallowRef({ running: true });
    const companion = {
      pairing,
      status,
      beginPairing: vi.fn(async () => true),
    };
    const scope = effectScope();
    try {
      const qr = scope.run(() => useCompanionPairingQr(companion, () => true));
      pairing.value = null;
      status.value = { running: true, pairing: { request: { id: 'phone' } } };
      await nextTick();
      status.value = { running: true, pairing: { request: null } };
      await nextTick();
      expect(companion.beginPairing).not.toHaveBeenCalled();
      expect(qr.url.value).toBe(url);
      expect(qr.expired.value).toBe(true);
    } finally {
      scope.stop();
    }
  });

  it('withdraws a code that arrives after the phone panel closes', async () => {
    const pending = Promise.withResolvers();
    const pairing = shallowRef(null);
    const visible = shallowRef(true);
    const companion = {
      pairing,
      status: shallowRef({ running: true }),
      beginPairing: vi.fn(async () => {
        await pending.promise;
        pairing.value = { url: '#pair=code', expiresAt: Date.now() + 1000 };
        return true;
      }),
      cancelPairing: vi.fn(async () => {
        pairing.value = null;
        return true;
      }),
    };
    const scope = effectScope();
    try {
      const qr = scope.run(() =>
        useCompanionPairingQr(companion, () => visible.value),
      );
      expect(companion.beginPairing).toHaveBeenCalledOnce();
      visible.value = false;
      await nextTick();

      pending.resolve();
      await vi.waitFor(() =>
        expect(companion.cancelPairing).toHaveBeenCalledOnce(),
      );
      expect(pairing.value).toBeNull();
      expect(qr.url.value).toBe('');
    } finally {
      scope.stop();
    }
  });
});

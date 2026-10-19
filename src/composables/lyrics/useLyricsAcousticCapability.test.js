import { describe, it, expect, vi } from 'vitest';
import { createLyricsAcousticCapabilityOwner } from './useLyricsAcousticCapability.js';
describe('manual lyrics capability owner', () => {
  it('handles unavailable bridges and recovers from rejected status and cancellation', async () => {
    const missing = createLyricsAcousticCapabilityOwner(() => null);
    await missing.refresh();
    expect(missing.error.value).toContain('無法讀取');
    await missing.prepare();
    expect(missing.error.value).toContain('重新啟動');
    const bridge = {
      getLyricsAcousticCapabilityStatus: vi.fn(async () => {
        throw Error('private');
      }),
      cancelLyricsAcousticCapability: vi.fn(async () => {
        throw Error('private');
      }),
      repairLyricsAcousticCapability: vi.fn(async () => {
        throw Error('private');
      }),
    };
    const owner = createLyricsAcousticCapabilityOwner(() => bridge);
    await owner.repair();
    expect(owner.capability.value).toBe(null);
    await owner.cancel();
    expect(owner.error.value).toContain('取消未完成');
    expect(owner.error.value).not.toContain('private');
  });
  it('refreshes status without preparing and rejects late status after an action', async () => {
    let late;
    const bridge = {
      getLyricsAcousticCapabilityStatus: vi.fn(
        () =>
          new Promise((r) => {
            late = r;
          }),
      ),
      prepareLyricsAcousticCapability: vi.fn(async () => ({
        status: 'ready',
        installed: true,
      })),
    };
    const owner = createLyricsAcousticCapabilityOwner(() => bridge);
    const pending = owner.refresh();
    await owner.prepare();
    late({ status: 'missing' });
    await pending;
    expect(owner.capability.value.status).toBe('ready');
    expect(bridge.prepareLyricsAcousticCapability).toHaveBeenCalledTimes(1);
  });
  it('retains old status on failure and keeps cancellation separate from other actions', async () => {
    const bridge = {
      getLyricsAcousticCapabilityStatus: async () => ({
        status: 'unverified',
        installed: true,
      }),
      verifyLyricsAcousticCapability: vi.fn(async () => {
        throw Error('private');
      }),
      cancelLyricsAcousticCapability: vi.fn(async () => ({ cancelled: true })),
    };
    const owner = createLyricsAcousticCapabilityOwner(() => bridge);
    await owner.refresh();
    await owner.verify();
    expect(owner.capability.value.status).toBe('unverified');
    expect(owner.error.value).not.toContain('private');
    await owner.cancel();
    expect(bridge.cancelLyricsAcousticCapability).toHaveBeenCalledTimes(1);
  });
  it('reads the recoverable removal status after a failed action without clearing the error', async () => {
    const bridge = {
      getLyricsAcousticCapabilityStatus: vi.fn(async () => ({
        status: 'remove-pending',
        canRemove: true,
      })),
      removeLyricsAcousticCapability: vi.fn(async () => {
        throw Error('private');
      }),
    };
    const owner = createLyricsAcousticCapabilityOwner(() => bridge);
    await owner.remove();
    expect(owner.capability.value.status).toBe('remove-pending');
    expect(owner.error.value).toContain('原有歌詞仍可使用');
    expect(owner.busy.value).toBe(false);
  });
});

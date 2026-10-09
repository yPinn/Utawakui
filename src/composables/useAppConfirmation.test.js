import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfirmation() {
  const { useAppConfirmation } = await import('./useAppConfirmation.js');
  return useAppConfirmation();
}

afterEach(() => {
  vi.resetModules();
});

describe('useAppConfirmation', () => {
  it('exposes readonly state and resolves true only from the explicit accept action', async () => {
    const { isReadonly } = await import('vue');
    const confirmation = await loadConfirmation();

    const result = confirmation.confirm({
      title: '刪除播放清單？',
      subject: '播放清單 #2',
      meta: '0 首曲目',
      message: '只會刪除播放清單，不會刪除音檔。',
      detail: '此動作無法復原。',
      confirmLabel: '刪除播放清單',
      intent: 'danger',
    });

    expect(isReadonly(confirmation.state)).toBe(true);
    expect(confirmation.state.request).toEqual({
      title: '刪除播放清單？',
      subject: '播放清單 #2',
      meta: '0 首曲目',
      message: '只會刪除播放清單，不會刪除音檔。',
      detail: '此動作無法復原。',
      confirmLabel: '刪除播放清單',
      cancelLabel: '取消',
      intent: 'danger',
    });

    confirmation.accept();

    await expect(result).resolves.toBe(true);
    expect(confirmation.state.request).toBeNull();
  });

  it.each(['cancel', 'dismiss'])(
    '%s resolves false and clears the request',
    async (action) => {
      const confirmation = await loadConfirmation();
      const result = confirmation.confirm({
        title: '清除紀錄？',
        message: '這不會影響播放佇列。',
      });

      confirmation[action]();

      await expect(result).resolves.toBe(false);
      expect(confirmation.state.request).toBeNull();
    },
  );

  it('keeps one request active and safely rejects an overlapping request', async () => {
    const confirmation = await loadConfirmation();
    const first = confirmation.confirm({
      title: '第一個確認',
      message: '保留這個確認。',
    });
    const second = confirmation.confirm({
      title: '第二個確認',
      message: '不能覆蓋第一個確認。',
    });

    await expect(second).resolves.toBe(false);
    expect(confirmation.state.request.title).toBe('第一個確認');

    confirmation.cancel();
    await expect(first).resolves.toBe(false);
  });

  it('normalizes optional copy and rejects malformed requests without opening', async () => {
    const confirmation = await loadConfirmation();

    await expect(confirmation.confirm(null)).resolves.toBe(false);
    expect(confirmation.state.request).toBeNull();

    const result = confirmation.confirm({
      title: '  取代草稿？  ',
      subject: '  場次草稿  ',
      meta: '  12 首曲目  ',
      message: '  目前草稿會被取代。  ',
      confirmLabel: '  取代  ',
      cancelLabel: '  返回  ',
      intent: 'unsupported',
      html: '<img src=x onerror=alert(1)>',
    });

    expect(confirmation.state.request).toEqual({
      title: '取代草稿？',
      subject: '場次草稿',
      meta: '12 首曲目',
      message: '目前草稿會被取代。',
      detail: '',
      confirmLabel: '取代',
      cancelLabel: '返回',
      intent: 'neutral',
    });
    expect(confirmation.state.request).not.toHaveProperty('html');

    confirmation.cancel();
    await expect(result).resolves.toBe(false);
  });

  it('bounds optional decision values and leaves them empty for plain confirmations', async () => {
    const confirmation = await loadConfirmation();
    const plainResult = confirmation.confirm({
      title: '清除紀錄？',
      message: '紀錄會被清除。',
    });

    expect(confirmation.state.request.subject).toBe('');
    expect(confirmation.state.request.meta).toBe('');
    confirmation.cancel();
    await expect(plainResult).resolves.toBe(false);

    const boundedResult = confirmation.confirm({
      title: '刪除？',
      subject: '名'.repeat(240),
      meta: '值'.repeat(180),
      message: '必要通知。',
    });

    expect(confirmation.state.request.subject).toHaveLength(200);
    expect(confirmation.state.request.meta).toHaveLength(120);
    confirmation.cancel();
    await expect(boundedResult).resolves.toBe(false);
  });
});

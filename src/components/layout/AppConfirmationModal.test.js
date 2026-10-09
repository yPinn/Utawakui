import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import AppConfirmationModal from './AppConfirmationModal.vue';

afterEach(() => {
  useAppConfirmation().dismiss();
  vi.restoreAllMocks();
});

describe('AppConfirmationModal', () => {
  it('renders one notice-sized destructive confirmation with explicit actions', async () => {
    const confirmation = useAppConfirmation();
    const result = confirmation.confirm({
      title: '刪除播放清單？',
      subject: '播放清單 #2',
      meta: '0 首曲目',
      message: '只會刪除播放清單，不會刪除音檔。',
      detail: '此動作無法復原。',
      confirmLabel: '刪除播放清單',
      intent: 'danger',
    });

    const html = await renderToString(createSSRApp(AppConfirmationModal));

    expect(html).toContain('ui-modal--notice');
    expect(html).toContain('ui-modal--select-none');
    expect(html).toContain('刪除播放清單？');
    expect(html).toContain('app-confirmation__subject');
    expect(html).toContain('播放清單 #2');
    expect(html).toContain('app-confirmation__meta');
    expect(html).toContain('0 首曲目');
    expect(html).toContain('只會刪除播放清單，不會刪除音檔。');
    expect(html).toContain('此動作無法復原。');
    expect(html).toContain('取消');
    expect(html).toContain('刪除播放清單');
    expect(html).toContain('ui-btn--secondary');
    expect(html).toContain('ui-btn--accent');
    expect(html).toContain('ui-btn--intent-danger');

    confirmation.cancel();
    await expect(result).resolves.toBe(false);
  });

  it('keeps plain confirmations compact when no decision value is needed', async () => {
    const confirmation = useAppConfirmation();
    const result = confirmation.confirm({
      title: '清除錯誤紀錄？',
      message: '這台電腦上已儲存的錯誤紀錄會被清除。',
      confirmLabel: '清除紀錄',
      intent: 'danger',
    });

    const html = await renderToString(createSSRApp(AppConfirmationModal));

    expect(html).not.toContain('app-confirmation__summary');
    expect(html).toContain('這台電腦上已儲存的錯誤紀錄會被清除。');

    confirmation.cancel();
    await expect(result).resolves.toBe(false);
  });

  it('renders nothing without a pending confirmation', async () => {
    const html = await renderToString(createSSRApp(AppConfirmationModal));

    expect(html).not.toContain('role="dialog"');
  });
});

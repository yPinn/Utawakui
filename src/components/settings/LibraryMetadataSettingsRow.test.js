import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import LibraryMetadataSettingsRow from './LibraryMetadataSettingsRow.vue';

const maintenance = vi.hoisted(() => ({
  state: { busy: false, cancelling: false, progress: null, error: false },
  feedback: '',
  refresh: vi.fn(),
  cancel: vi.fn(),
  reload: vi.fn(),
}));
vi.mock('../../composables/useLibraryMetadataMaintenance.js', () => ({
  useLibraryMetadataMaintenance: () => maintenance,
}));

beforeEach(() => {
  Object.assign(maintenance.state, {
    busy: false,
    cancelling: false,
    progress: null,
    error: false,
  });
  maintenance.feedback = '';
  vi.clearAllMocks();
});

async function renderRow() {
  const html = await renderToString(
    createSSRApp({
      render: () => h(LibraryMetadataSettingsRow),
    }),
  );
  return html.replace(/<!--[\s\S]*?-->/gu, '');
}

describe('LibraryMetadataSettingsRow', () => {
  it('distinguishes automatic offline organization from an explicit online action', async () => {
    const html = await renderRow();

    expect(html).toContain('>曲庫資訊</h3>');
    expect(html).toContain('啟動時整理本地資料；手動編輯會保留。');
    expect(html).toContain('線上補齊');
    expect(html).toContain(
      'aria-description="重新讀取本地曲目與作品，不連線。"',
    );
    expect(html).toContain(
      'aria-description="連線補齊所屬專輯與完整曲序，保留手動編輯。"',
    );
    expect(html).toContain(
      'aria-description="檢查重複發行、音檔與資訊差異，逐欄校對後儲存。"',
    );
    expect(html).toContain('>自動</span>');
    expect(html.match(/<button\b/gu)).toHaveLength(3);
    expect(html).toContain('>校對</span>');
    expect(
      html.match(/settings-document-item__supporting-copy/gu),
    ).toHaveLength(1);
    expect(html).not.toContain('settings-document-item__value');
    expect(html).not.toContain('settings-document-item__feedback');
    expect(html).not.toContain('已啟用');
    expect(html).not.toContain('ui-icon-button');
    expect(maintenance.refresh).not.toHaveBeenCalled();
  });

  it('keeps the update busy and offers Stop only while a source operation is running', async () => {
    maintenance.state.busy = true;
    maintenance.state.progress = { status: 'running' };
    maintenance.feedback = '查詢中 · 1 / 3 個來源 · 已補齊 1 張';
    const html = await renderRow();
    expect(html.match(/<button\b/gu)).toHaveLength(4);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('>更新中</span>');
    expect(html).toContain('>停止</span>');
    expect(html).toContain('role="status"');
    expect(html).toContain(maintenance.feedback);
    maintenance.state.cancelling = true;
    expect(
      (await renderRow()).match(/<button\b[^>]*\bdisabled/gu),
    ).toHaveLength(4);
  });

  it.each([
    [false, '已補齊 2 張作品。', 'status'],
    [true, '目前無法更新發行資訊，請稍後再試。', 'alert'],
  ])(
    'shows one result area and a retry action after completion (error=%s)',
    async (error, feedback, role) => {
      maintenance.state.error = error;
      maintenance.feedback = feedback;
      const html = await renderRow();
      expect(html).toContain(`role="${role}"`);
      expect(html).toContain(error ? 'ui-hint--danger' : 'ui-hint--muted');
      expect(html.match(/settings-document-item__feedback/gu)).toHaveLength(1);
      expect(html.match(/<button\b/gu)).toHaveLength(3);
      expect(html).toContain('線上補齊');
      expect(html).not.toContain('>停止</span>');
      expect(html).toContain(feedback);
    },
  );
});

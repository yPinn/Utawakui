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
vi.mock('../../composables/useLibraryReconciliation.js', () => ({
  useLibraryReconciliation: () => ({ state: { busy: false }, open: vi.fn() }),
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

async function renderRow(props = {}) {
  const html = await renderToString(
    createSSRApp({
      render: () => h(LibraryMetadataSettingsRow, props),
    }),
  );
  return html.replace(/<!--[\s\S]*?-->/gu, '');
}

describe('LibraryMetadataSettingsRow', () => {
  it('offers a single named menu without starting online work', async () => {
    const html = await renderRow();

    expect(html).toContain('>曲庫資訊</h3>');
    expect(html).toContain('線上補齊會保留手動編輯。');
    expect(html).toContain('>維護曲庫</span>');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('>自動</span>');
    expect(html.match(/<button\b/gu)).toHaveLength(1);
    expect(
      html.match(/settings-document-item__supporting-copy/gu),
    ).toHaveLength(1);
    expect(html).not.toContain('settings-document-item__value');
    expect(html).not.toContain('settings-document-item__feedback');
    expect(html).not.toContain('已啟用');
    expect(maintenance.refresh).not.toHaveBeenCalled();
  });

  it('disables new work when the library is unavailable', async () => {
    const html = await renderRow({ disabled: true });
    expect(html.match(/<button\b[^>]*\bdisabled/gu)).toHaveLength(1);
    expect(html).toContain('>維護曲庫</span>');
  });

  it('keeps the update busy and offers Stop only while a source operation is running', async () => {
    maintenance.state.busy = true;
    maintenance.state.progress = { status: 'running' };
    maintenance.feedback = '查詢中 · 1 / 3';
    const html = await renderRow({ disabled: true });
    expect(html.match(/<button\b/gu)).toHaveLength(1);
    expect(html).not.toContain('aria-haspopup="menu"');
    expect(html.match(/<button\b[^>]*\bdisabled/gu)).toBeNull();
    expect(html).toContain('>停止</span>');
    expect(html).toContain('role="status"');
    expect(html).toContain(maintenance.feedback);
    maintenance.state.cancelling = true;
    expect(
      (await renderRow()).match(/<button\b[^>]*\bdisabled/gu),
    ).toHaveLength(1);
  });

  it.each([
    [false, '已更新 2 張', 'status'],
    [true, '更新未完成，請再試一次。', 'alert'],
  ])(
    'shows one result area and a retry action after completion (error=%s)',
    async (error, feedback, role) => {
      maintenance.state.error = error;
      maintenance.feedback = feedback;
      const html = await renderRow();
      expect(html).toContain(`role="${role}"`);
      expect(html).toContain(error ? 'ui-hint--danger' : 'ui-hint--muted');
      expect(html.match(/settings-document-item__feedback/gu)).toHaveLength(1);
      expect(html.match(/<button\b/gu)).toHaveLength(1);
      expect(html).toContain('>維護曲庫</span>');
      expect(html).not.toContain('>停止</span>');
      expect(html).toContain(feedback);
    },
  );

  it('keeps named issues and reasons in a collapsed disclosure', async () => {
    maintenance.feedback = '已更新 46 張 · 2 項待查看';
    maintenance.state.progress = {
      status: 'complete',
      issues: [
        {
          kind: 'track',
          title: '翻唱曲名',
          artist: '演唱者',
          reason: 'no-match',
        },
        { kind: 'album', title: '專輯名稱', reason: 'failed' },
      ],
    };
    const html = await renderRow();
    const disclosure = html.slice(html.indexOf('<details'));
    expect(html).toContain(maintenance.feedback);
    expect(disclosure).toMatch(/^<details\b(?![^>]*\bopen)[^>]*>/);
    expect(disclosure).toContain('查看明細');
    expect(disclosure).toContain('翻唱曲名');
    expect(disclosure).toContain('演唱者');
    expect(disclosure).toContain('查無對應發行');
    expect(disclosure).toContain('專輯名稱');
    expect(disclosure).toContain('更新未完成，可再試一次');
  });
});

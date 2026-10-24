import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { expect, it, vi } from 'vitest';
import LibraryReconciliationModal from './LibraryReconciliationModal.vue';
import ReconciliationMetadataFields from './ReconciliationMetadataFields.vue';
const session = vi.hoisted(() => ({
  state: {
    open: true,
    busy: false,
    scanning: false,
    page: {
      total: 1,
      offset: 0,
      items: [
        {
          itemId: 'a',
          kind: 'release-pair',
          leftName: 'Local RASEN',
          rightName: 'RASEN',
          mergeable: true,
        },
      ],
      summary: { tracks: 2, releases: 3, candidates: 1 },
      merges: [],
    },
    preview: null,
    error: '',
    message: '',
    kind: 'all',
  },
  close: vi.fn(),
  scan: vi.fn(),
}));
vi.mock('../../composables/useLibraryReconciliation.js', () => ({
  useLibraryReconciliation: () => session,
}));
it('renders the read-only result and explicit review action, without track-row linking controls', async () => {
  const html = await renderToString(
    createSSRApp({ render: () => h(LibraryReconciliationModal) }),
  );
  expect(html).toContain('曲庫校對');
  expect(html).toContain('ui-modal--max-block-small');
  expect(html).toContain('ui-modal--fixed-height');
  expect(html).toContain('ui-modal__workspace-body');
  expect(html).toContain('aria-label="校對內容"');
  expect(html).toContain('class="ui-modal__footer"');
  expect(html).toContain('Local RASEN');
  expect(html.replace(/<!--[\s\S]*?-->/gu, '')).toContain('>比較</span>');
  expect(html).not.toContain('比較資料');
  expect(html).not.toContain('比較後再儲存');
  expect(html).not.toContain('解除關聯');
  expect(html).not.toContain('寫入音檔');
});
it('keeps blocked merge reasons and field differences while omitting repeated guidance', async () => {
  const previous = session.state.page.items;
  session.state.page.items = [
    {
      itemId: 'blocked',
      kind: 'release-pair',
      leftName: 'Single',
      rightName: 'EP',
      mergeable: false,
      reason: 'different-tracklist',
    },
    {
      itemId: 'same',
      kind: 'metadata',
      title: 'Same',
      artist: 'Artist',
      fields: [],
    },
    {
      itemId: 'changed',
      kind: 'metadata',
      title: 'Changed',
      artist: 'Artist',
      fields: ['title'],
    },
  ];
  try {
    const html = await renderToString(
      createSSRApp({ render: () => h(LibraryReconciliationModal) }),
    );
    expect(html).toContain('發行類型或完整曲序不同，暫時無法合併。');
    expect(html).toContain('1 個欄位有差異');
    expect(html).toContain('aria-label="校對：Same"');
    expect(html).toContain('aria-label="比較發行：Single ／ EP"');
    expect(html).not.toMatch(/可逐欄校對|比較後再儲存|比較資料/);
  } finally {
    session.state.page.items = previous;
  }
});
it('compares file/source/app values and offers an explicit manual-clear decision', async () => {
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(ReconciliationMetadataFields, {
          preview: {
            previewId: 'p',
            fields: {
              title: {
                value: 'App title',
                observed: 'Source title',
                origin: 'manual',
                canFollow: true,
                observedKind: 'provider',
              },
              album: {
                value: 'Album',
                observed: 'Source album',
                origin: 'unknown',
              },
            },
            fileTags: { title: 'File title' },
            providerValues: { title: 'Source title' },
          },
          decisions: {},
        }),
    }),
  );
  expect(html).toContain('App title');
  expect(html).toContain('Source title');
  expect(html).toContain('File title');
  expect(html).toContain('清空');
  expect(html).toContain('恢復跟隨來源');
});
it('keeps scan cancellation available without a redundant rescan button', async () => {
  const previous = {
    page: session.state.page,
    busy: session.state.busy,
    scanning: session.state.scanning,
  };
  Object.assign(session.state, { page: null, busy: true, scanning: true });
  try {
    const html = await renderToString(
      createSSRApp({ render: () => h(LibraryReconciliationModal) }),
    );
    expect(html).toContain('停止檢查');
    expect(html).not.toContain('重新檢查');
  } finally {
    Object.assign(session.state, previous);
  }
});

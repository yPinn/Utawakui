import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';

const workspaceSource = readCatalogSource(
  new URL('./PerformanceSessionWorkspace.vue', import.meta.url),
);
const reviewSource = readCatalogSource(
  new URL('./PerformanceSessionPlanEditor.vue', import.meta.url),
);
const manualSource = readCatalogSource(
  new URL('./PerformanceSessionManualItemForm.vue', import.meta.url),
);
const planListSource = readCatalogSource(
  new URL('./PerformanceSessionPlanList.vue', import.meta.url),
);
const performanceSource = readCatalogSource(
  new URL('../performance/PerformanceWorkspace.vue', import.meta.url),
);

describe('PerformanceSessionWorkspace fast path and viewport layout', () => {
  it('keeps the original board and continuous control mounted independently of Dock visibility', () => {
    expect(workspaceSource).not.toContain('v-if="!arrangementDockVisible"');
    expect(workspaceSource).not.toContain('props.tracks.slice(0, 50)');
    expect(workspaceSource).toContain('顯示演出安排側欄');
    expect(workspaceSource).toContain('收合演出安排側欄');
    expect(workspaceSource).toContain(':aria-pressed="arrangementDockVisible"');
  });
  it('keeps library search as the fixed primary entry and manual creation secondary', () => {
    expect(workspaceSource).toContain('v-model="librarySearchQuery"');
    expect(workspaceSource).toContain('搜尋曲庫並加入');
    expect(workspaceSource).toContain('appendLibraryTrack');
    expect(workspaceSource).toContain('新增手動項目');
    expect(workspaceSource).toContain('appendManualItem');
    expect(workspaceSource).not.toContain('UiTextarea');
    expect(workspaceSource).not.toContain('appendPlaceholders');
  });

  it('leaves collection append at its source and only clears the pending queue', () => {
    expect(workspaceSource).not.toContain('selectedPlaylist');
    expect(workspaceSource).not.toContain('replaceFromCollection');
    expect(workspaceSource).toContain('canClearPending');
    expect(workspaceSource).toContain('清空待唱');
  });

  it('uses a fixed workspace shell with one scrolling body per pane', () => {
    expect(performanceSource).toContain('<PerformanceSessionWorkspace');
    expect(performanceSource).toContain(
      'surface-id="performance-session-workspace"',
    );
    expect(workspaceSource).toMatch(
      /\.performance-session-workspace\s*\{[^}]*flex:\s*1[^}]*overflow:\s*hidden/su,
    );
    expect(workspaceSource).toMatch(
      /\.performance-session-workspace__grid\s*\{[^}]*flex:\s*1[^}]*min-height:\s*calc/su,
    );
    expect(workspaceSource).not.toContain('min-height: 560px');
    expect(workspaceSource).not.toContain('calc(100vh - 230px)');
    expect(workspaceSource).not.toMatch(
      /<UiScrollRegion\s+v-else-if="hasItems"/u,
    );
    expect(planListSource).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue';",
    );
    expect(planListSource).toContain('collection-kind="performance-session"');
    expect(workspaceSource).toContain('content-tag="ul"');
    expect(workspaceSource).not.toContain(
      "import UiScrollRegion from '../ui/UiScrollRegion.vue';",
    );
  });

  it('reflows from its actual workspace container without fixed pane pixels or viewport media', () => {
    expect(workspaceSource).toContain(
      'container-name: performance-session-workspace;',
    );
    const boardSource = readCatalogSource(
      new URL('./PerformanceSessionBoard.vue', import.meta.url),
    );
    expect(boardSource).not.toContain('ResizeObserver');
    expect(boardSource).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(boardSource).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(workspaceSource).not.toContain('minmax(360px');
    expect(workspaceSource).not.toContain('minmax(320px');
    expect(workspaceSource).not.toContain('@media (max-width: 780px)');
  });

  it('uses the shared occurrence table while feature actions remain in the session owner', () => {
    expect(planListSource).toContain(
      "import TrackTable from '../track/TrackTable.vue';",
    );
    expect(planListSource).toContain('collection-kind="performance-session"');
    expect(planListSource).toContain('#row-actions');
    expect(planListSource).toContain('@select-entry');
    expect(planListSource).toContain('handleRowKeydown');
    expect(planListSource).not.toContain('grid-template-columns');
    expect(planListSource).not.toContain('--performance-session-plan-grid');
  });

  it('shows the return action only for a contextual entry', () => {
    expect(workspaceSource).toContain(
      'showReturn: { type: Boolean, default: false }',
    );
    expect(workspaceSource).toContain('v-if="showReturn"');
    expect(performanceSource).toContain(
      ':show-return="sessionWorkspace.isOpen.value"',
    );
  });

  it('keeps review actions outside the scrolling details body and removes mandatory verification copy', () => {
    const paneSource = readCatalogSource(
      new URL('./PerformanceSessionReviewPane.vue', import.meta.url),
    );
    expect(reviewSource).toContain('PerformanceSessionReviewPane');
    expect(reviewSource).toContain('#actions');
    expect(paneSource).toContain('<UiModal');
    expect(paneSource.indexOf('<slot />')).toBeLessThan(
      paneSource.indexOf('#footer'),
    );
    expect(paneSource).not.toContain('fixed-height');
    expect(workspaceSource).toContain(
      '<PerformanceSessionSummary :show-source="false" />',
    );
    expect(reviewSource).toContain('調整顯示名稱');
    expect(reviewSource).not.toContain('確認本首');
    expect(reviewSource).not.toContain('確認並下一首');
    expect(reviewSource).not.toContain('完成確認後');
  });

  it('keeps library metadata read-only throughout the session preparation path', () => {
    expect(reviewSource).toContain('顯示曲名');
    expect(reviewSource).toContain('第二行（選填）');
    expect(reviewSource).toContain('原唱、演出者或版本資訊');
    expect(reviewSource).toContain('不會修改曲庫曲名');
    expect(reviewSource).toContain('曲庫曲名');
    expect(reviewSource).toContain('歌手／藝人');
    expect(reviewSource).not.toContain('本場顯示名稱');
    expect(reviewSource).not.toContain('本場顯示演出者');
    expect(reviewSource).not.toContain('編輯曲庫資料');
    expect(reviewSource).not.toContain('editLibraryMetadata');
    expect(workspaceSource).not.toContain('editLibraryMetadata');
    expect(workspaceSource).not.toContain('edit-library-metadata');
    expect(performanceSource).not.toContain('editSessionLinkedTrack');
    expect(performanceSource).not.toContain('@edit-library-metadata');
  });

  it('describes manual display fields by their output role instead of artist metadata', () => {
    expect(manualSource).toContain('曲名／項目名稱');
    expect(manualSource).toContain('第二行（選填）');
    expect(manualSource).toContain('原唱、演出者或版本資訊');
    expect(manualSource).toContain('不會建立曲庫歌曲');
    expect(manualSource).not.toContain('label="顯示名稱"');
    expect(manualSource).not.toContain('label="演出者（選填）"');
  });

  it('makes local playback available without an active broadcast', () => {
    expect(workspaceSource).toContain('aria-label="演出安排"');
    expect(workspaceSource).toContain('<PerformanceSessionBoard');
    expect(workspaceSource).toContain('搜尋曲庫並加入演出待唱');
    expect(planListSource).toContain("history ? '演出紀錄' : '待唱順序'");
    expect(workspaceSource).not.toContain('title="演唱中"');
    expect(workspaceSource).not.toContain('title="已唱紀錄"');
  });

  it('summarizes readiness as one operator decision instead of six counters', () => {
    expect(workspaceSource).toContain('pendingAttention');
    expect(workspaceSource).toContain('playback.pendingItems.value');
    expect(workspaceSource).not.toContain('全部可演出');
    expect(workspaceSource).toContain("'session.workspace.attention'");
    expect(workspaceSource).not.toContain('待確認');
    expect(workspaceSource).not.toContain('待連結');
    expect(workspaceSource).not.toContain('曲庫資料已變更 {{');
  });

  it('confirms occurrence removal without offering a library deletion path', () => {
    expect(workspaceSource).toContain('@remove="confirmRemoveItem"');
    expect(workspaceSource).toContain('function confirmRemoveItem(itemId)');
    expect(workspaceSource).toContain('confirmPerformanceSessionItemRemoval');
    expect(workspaceSource).toContain('removeItem(itemId)');
    expect(workspaceSource).not.toContain('deleteTrack');
  });

  it('keeps singing controls above the lists and reveals the single Dock BGM through the Dock button', () => {
    expect(workspaceSource).toContain('<PerformanceSessionCurrent');
    expect(workspaceSource).not.toContain('BgmPlayer');
    expect(workspaceSource).not.toContain("label: '顯示 BGM'");
    expect(workspaceSource).toContain("dock.selectArrangementTab('pending')");
    expect(workspaceSource).toContain("dock.showQueueVariant('arrangement')");
    expect(workspaceSource).toContain('<template #pending>');
    expect(workspaceSource).not.toContain('v-else-if="playback.pendingItems');
    expect(workspaceSource).toContain("label: '清空待唱'");
    expect(workspaceSource).toContain('@select="selectWorkspaceAction"');
    expect(workspaceSource).toContain('label="演出安排的更多選項"');
  });
});

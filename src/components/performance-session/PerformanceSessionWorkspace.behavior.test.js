import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(
  new URL('./PerformanceSessionWorkspace.vue', import.meta.url),
  'utf8',
);
const reviewSource = readFileSync(
  new URL('./PerformanceSessionPlanEditor.vue', import.meta.url),
  'utf8',
);
const manualSource = readFileSync(
  new URL('./PerformanceSessionManualItemForm.vue', import.meta.url),
  'utf8',
);
const planListSource = readFileSync(
  new URL('./PerformanceSessionPlanList.vue', import.meta.url),
  'utf8',
);
const performanceSource = readFileSync(
  new URL('../performance/PerformanceWorkspace.vue', import.meta.url),
  'utf8',
);

describe('PerformanceSessionWorkspace fast path and viewport layout', () => {
  it('keeps library search as the fixed primary entry and manual creation secondary', () => {
    expect(workspaceSource).toContain('v-model="librarySearchQuery"');
    expect(workspaceSource).toContain('搜尋曲庫並加入');
    expect(workspaceSource).toContain('appendLibraryTrack');
    expect(workspaceSource).toContain('新增手動項目');
    expect(workspaceSource).toContain('appendManualItem');
    expect(workspaceSource).not.toContain('UiTextarea');
    expect(workspaceSource).not.toContain('appendPlaceholders');
  });

  it('owns the selected playlist or album source action after the global session Dock is removed', () => {
    expect(workspaceSource).toContain('usePlaylists');
    expect(workspaceSource).toContain('selectedPlaylist');
    expect(workspaceSource).toContain('replaceFromCollection');
    expect(workspaceSource).toContain('從清單建立');
    expect(workspaceSource).toContain('prepareSelectedCollection');
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
      /\.performance-session-workspace__grid\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0/su,
    );
    expect(workspaceSource).not.toContain('min-height: 560px');
    expect(workspaceSource).not.toContain('calc(100vh - 230px)');
    expect(workspaceSource).not.toMatch(
      /<UiScrollRegion\s+v-else-if="hasItems"/u,
    );
    expect(planListSource).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue';",
    );
    expect(planListSource).toContain('content-tag="ol"');
    expect(workspaceSource).toContain('content-tag="ul"');
    expect(workspaceSource).not.toContain(
      "import UiScrollRegion from '../ui/UiScrollRegion.vue';",
    );
  });

  it('reflows from its actual workspace container without fixed pane pixels or viewport media', () => {
    expect(workspaceSource).toContain(
      'container-name: performance-session-workspace;',
    );
    expect(workspaceSource).toContain(
      '@container performance-session-workspace (max-width: 48.75rem)',
    );
    expect(workspaceSource).toContain(
      'grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);',
    );
    expect(workspaceSource).not.toContain('minmax(360px');
    expect(workspaceSource).not.toContain('minmax(320px');
    expect(workspaceSource).not.toContain('@media (max-width: 780px)');
  });

  it('adapts session occurrences through the shared track-row primitive instead of TrackTable semantics', () => {
    expect(planListSource).toContain(
      "import UiTrackRow from '../ui/UiTrackRow.vue';",
    );
    expect(planListSource).toContain('<UiTrackRow');
    expect(planListSource).toContain('<template #lead>');
    expect(planListSource).toContain('<template #trail>');
    expect(planListSource).not.toContain('PerformanceSessionPlanRow');
    expect(planListSource).not.toContain('TrackTable');
  });

  it('reuses track-row list spacing without a second grid or row-state recipe', () => {
    expect(planListSource).toContain('var(--ui-track-list-gap)');
    expect(planListSource).not.toContain('grid-template-columns');
    expect(planListSource).not.toContain('--performance-session-plan-grid');
    expect(planListSource).not.toContain('--ui-track-row-selected-surface');
    expect(planListSource).not.toContain('draggable');
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
    expect(reviewSource).toContain('performance-session-editor__body-scroll');
    expect(
      reviewSource.indexOf('performance-session-editor__body-scroll'),
    ).toBeLessThan(reviewSource.indexOf('performance-session-editor__actions'));
    expect(reviewSource).toContain('調整本場顯示');
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

  it('names the implemented preparation surface as the editable upcoming plan', () => {
    expect(workspaceSource).toContain('aria-label="待唱安排"');
    expect(workspaceSource).toContain('只安排尚未開始的曲目');
    expect(workspaceSource).toContain('aria-label="待唱清單"');
    expect(workspaceSource).toContain('搜尋曲庫並加入待唱');
    expect(planListSource).toContain('aria-label="待唱順序"');
    expect(workspaceSource).not.toContain('title="演唱中"');
    expect(workspaceSource).not.toContain('title="已唱紀錄"');
  });

  it('summarizes readiness as one operator decision instead of six counters', () => {
    expect(workspaceSource).toContain('state.plan.summary.needsAttention');
    expect(workspaceSource).toContain('全部可演出');
    expect(workspaceSource).not.toContain('待確認');
    expect(workspaceSource).not.toContain('待連結');
    expect(workspaceSource).not.toContain('曲庫資料已變更 {{');
  });

  it('confirms occurrence removal without offering a library deletion path', () => {
    expect(workspaceSource).toContain('@remove="confirmRemoveItem"');
    expect(workspaceSource).toContain('function confirmRemoveItem(itemId)');
    expect(workspaceSource).toContain('從待唱移除');
    expect(workspaceSource).toContain('不會刪除曲庫歌曲');
    expect(workspaceSource).toContain('removeItem(itemId)');
    expect(workspaceSource).not.toContain('deleteTrack');
  });

  it('puts destructive clearing before the truthful return action in the header', () => {
    const actionsStart = workspaceSource.indexOf('<template #actions>');
    const actionsEnd = workspaceSource.indexOf('</template>', actionsStart);
    const actions = workspaceSource.slice(actionsStart, actionsEnd);
    const clearIndex = actions.indexOf('@click="clearDraft"');
    const returnIndex = actions.indexOf('@click="emit(\'close\')"');

    expect(actions).toContain(':icon="Trash2"');
    expect(actions).toContain(':icon="ArrowLeft"');
    expect(actions).toContain('返回');
    expect(actions).not.toContain('完成');
    expect(clearIndex).toBeGreaterThan(-1);
    expect(returnIndex).toBeGreaterThan(clearIndex);
  });
});

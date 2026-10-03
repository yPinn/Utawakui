import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspaceSource = readFileSync(
  new URL('./SessionPreparationWorkspace.vue', import.meta.url),
  'utf8',
);
const reviewSource = readFileSync(
  new URL('./SessionPlanReviewEditor.vue', import.meta.url),
  'utf8',
);
const manualSource = readFileSync(
  new URL('./SessionManualItemForm.vue', import.meta.url),
  'utf8',
);
const planListSource = readFileSync(
  new URL('./SessionPlanList.vue', import.meta.url),
  'utf8',
);
const setlistSource = readFileSync(
  new URL('../../views/SetlistView.vue', import.meta.url),
  'utf8',
);

describe('SessionPreparationWorkspace fast path and viewport layout', () => {
  it('keeps library search as the fixed primary entry and manual creation secondary', () => {
    expect(workspaceSource).toContain('v-model="librarySearchQuery"');
    expect(workspaceSource).toContain('搜尋曲庫並加入');
    expect(workspaceSource).toContain('appendLibraryTrack');
    expect(workspaceSource).toContain('新增手動項目');
    expect(workspaceSource).toContain('appendManualItem');
    expect(workspaceSource).not.toContain('UiTextarea');
    expect(workspaceSource).not.toContain('appendPlaceholders');
  });

  it('uses a fixed workspace shell with one scrolling body per pane', () => {
    expect(setlistSource).toContain(
      "'setlist-view--session': performanceSessionWorkspace.isOpen.value",
    );
    expect(workspaceSource).toMatch(
      /\.session-workspace\s*\{[^}]*flex:\s*1[^}]*overflow:\s*hidden/su,
    );
    expect(workspaceSource).toMatch(
      /\.session-workspace__grid\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0/su,
    );
    expect(workspaceSource).not.toContain('min-height: 560px');
    expect(workspaceSource).not.toContain('calc(100vh - 230px)');
  });

  it('keeps review actions outside the scrolling details body and removes mandatory verification copy', () => {
    expect(reviewSource).toContain('session-review__body-scroll');
    expect(reviewSource.indexOf('session-review__body-scroll')).toBeLessThan(
      reviewSource.indexOf('session-review__actions'),
    );
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
    expect(setlistSource).not.toContain('editSessionLinkedTrack');
    expect(setlistSource).not.toContain('@edit-library-metadata');
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
    expect(workspaceSource).toContain('title="待唱安排"');
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

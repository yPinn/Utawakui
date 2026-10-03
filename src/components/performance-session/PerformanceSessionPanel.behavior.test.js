import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./PerformanceSessionPanel.vue', import.meta.url),
  'utf8',
);

describe('PerformanceSessionPanel', () => {
  it('identifies the inactive panel as preparation rather than current or history', () => {
    expect(source).toContain('subtitle="錄製／直播待唱"');
    expect(source).toContain('aria-label="目前待唱安排"');
    expect(source).toContain('首待唱');
    expect(source).not.toContain('subtitle="錄製／直播準備"');
  });

  it('keeps entry side-effect free and requires an explicit source action', () => {
    expect(source).toContain('usePerformanceSessionPlan');
    expect(source).toContain('usePlaylists');
    expect(source).toContain('onMounted(initialize)');
    expect(source).toContain('用此清單建立場次');
    expect(source).toContain('取代目前草稿');
    expect(source).not.toContain('onMounted(prepareSelectedCollection)');
  });

  it('opens the existing full preparation workspace instead of embedding its editor', () => {
    expect(source).toContain(
      "const emit = defineEmits(['close', 'openPreparation'])",
    );
    expect(source).toContain("emit('openPreparation')");
    expect(source).toContain('AppRightDockPanel');
    expect(source).not.toContain('PerformanceSessionWorkspace');
    expect(source).not.toContain('PerformanceSessionPlanEditor');
  });

  it('contains no BGM player, plan, library search, or transport ownership', () => {
    expect(source).not.toContain('BgmPreparationSection');
    expect(source).not.toContain('useBgmStandbyPlan');
    expect(source).not.toContain('useLibrary');
    expect(source).not.toContain('bgmSearchQuery');
    expect(source).not.toContain('LiveSessionCard');
    expect(source).not.toContain('playBgm');
  });

  it('summarizes the current draft with only the essential preparation states', () => {
    expect(source).toContain('state.plan.summary.total');
    expect(source).toContain('state.plan.summary.needsAttention');
    expect(source).toContain('全部可演出');
    expect(source).not.toContain('待確認');
    expect(source).toContain('編輯待唱安排');
    expect(source).toContain('建立臨時場次');
  });

  it('uses distinct ordered-list, collection-add, and temporary-create icons', () => {
    expect(source).toContain(
      "import { ListOrdered, ListPlus, Plus } from '../../icons/index.js'",
    );
    expect(source).toContain(':icon="ListOrdered"');
    expect(source).toContain(':icon="ListPlus"');
    expect(source).toContain(':icon="Plus"');
    expect(source).not.toContain('ListChecks');

    const editIndex = source.indexOf(':icon="ListOrdered"');
    const collectionIndex = source.indexOf(':icon="ListPlus"');
    const temporaryCreateIndex = source.lastIndexOf(':icon="Plus"');
    expect(collectionIndex).toBeGreaterThan(editIndex);
    expect(temporaryCreateIndex).toBeGreaterThan(collectionIndex);
  });
});

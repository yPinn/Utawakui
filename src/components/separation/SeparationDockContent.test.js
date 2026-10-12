import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SeparationDockContent.vue', import.meta.url),
  'utf8',
);

describe('SeparationDockContent copy and controls', () => {
  it('presents a concise accompaniment workflow without implementation jargon', () => {
    expect(source).toContain('label="模式"');
    expect(source).toContain('加入');
    expect(source).toContain('已有伴奏也重新準備');
    expect(source).toContain('尚未加入處理');
    expect(source).toContain('<SeparationToolbarList');
    expect(source).toContain('useSeparationPreparation({ enqueue })');
    expect(source).toContain('<UiHint>{{ planHint }}</UiHint>');
    expect(source).not.toContain('useSeparationQueue');
    expect(source).not.toContain('onMounted(initialize)');
    expect(source).not.toContain('曲庫總容量');
    expect(source).not.toContain('準備清單');
    expect(source).not.toContain('尚無歌曲');
    expect(source).not.toContain('separation-queue-panel__intro');
    expect(source).not.toContain('把目前播放清單加入後');
    expect(source).not.toMatch(/模型|runtime|recipe|執行提供者/u);
  });

  it('keeps one text primary action and uses familiar icon buttons for compact controls', () => {
    expect(source.match(/<UiButton\b/gu)).toHaveLength(1);
    expect(source).toContain(':icon="Play"');
    expect(source).toContain(':icon="Pause"');
    expect(source).toContain(':icon="Square"');
    expect(source).toContain(':icon="RotateCcw"');
    expect(source).toContain('label="繼續"');
    expect(source).toContain("'完成這首後暫停'");
    expect(source).toContain('label="停止這首"');
    expect(source).toContain('@retry="retry"');
    expect(source).toContain('@clear-completed="clearCompleted"');
  });

  it('renders ordered, active, unfinished, and completed sections', () => {
    expect(source).toContain(':active-items="activeItems"');
    expect(source).toContain(':pending-items="pendingItems"');
    expect(source).toContain(':attention-items="attentionItems"');
    expect(source).toContain(':completed-items="completedItems"');
    expect(source).toContain('@move="move"');
    expect(source).toContain('@remove="remove"');
    expect(source).toContain('@retry="retry"');
    expect(source).toContain('@cancel-active="cancelActive"');
  });
});

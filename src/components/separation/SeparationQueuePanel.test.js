import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SeparationQueuePanel.vue', import.meta.url),
  'utf8',
);

describe('SeparationQueuePanel copy and controls', () => {
  it('presents a concise accompaniment workflow without implementation jargon', () => {
    expect(source).toContain('伴奏處理');
    expect(source).toContain('label="模式"');
    expect(source).toContain('加入處理');
    expect(source).toContain('重新準備已有伴奏');
    expect(source).toContain('尚未加入處理');
    expect(source).toContain('heading="未完成"');
    expect(source).toContain('useSeparationPreparation({ enqueue })');
    expect(source).toContain('<UiHint>{{ planHint }}</UiHint>');
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
    expect(source).toContain(':icon="ChevronUp"');
    expect(source).toContain(':icon="ChevronDown"');
    expect(source).toContain(':icon="RotateCcw"');
    expect(source).toContain(':icon="Trash2"');
    expect(source).toContain('label="繼續"');
    expect(source).toContain("'完成這首後暫停'");
    expect(source).toContain('label="停止這首"');
    expect(source).toContain(':label="`重試 ${trackFor(item).title}`"');
    expect(source).toContain('label="清除完成紀錄"');
  });

  it('renders ordered, active, unfinished, and completed sections', () => {
    expect(source).toContain('處理中');
    expect(source).toContain('接下來');
    expect(source).toContain('未完成');
    expect(source).toContain('已完成');
    expect(source).toContain('@click="move(item.itemId, -1)"');
    expect(source).toContain('@click="remove(item.itemId)"');
    expect(source).toContain('@click="retry(item.itemId)"');
    expect(source).toContain('@click="cancelActive"');
  });
});

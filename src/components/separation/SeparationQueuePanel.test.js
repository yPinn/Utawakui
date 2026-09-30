import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SeparationQueuePanel.vue', import.meta.url),
  'utf8',
);

describe('SeparationQueuePanel copy and controls', () => {
  it('presents a concise accompaniment workflow without implementation jargon', () => {
    expect(source).toContain('伴奏處理');
    expect(source).toContain('準備播放清單');
    expect(source).toContain('已有伴奏也重新準備');
    expect(source).toContain('跑完這首就暫停');
    expect(source).toContain('再試一次');
    expect(source).not.toMatch(/模型|runtime|recipe|執行提供者/u);
  });

  it('renders ordered, active, attention, and completed sections', () => {
    expect(source).toContain('處理中');
    expect(source).toContain('接下來');
    expect(source).toContain('需要處理');
    expect(source).toContain('已完成');
    expect(source).toContain('@click="move(item.itemId, -1)"');
    expect(source).toContain('@click="remove(item.itemId)"');
    expect(source).toContain('@click="retry(item.itemId)"');
    expect(source).toContain('@click="cancelActive"');
  });
});

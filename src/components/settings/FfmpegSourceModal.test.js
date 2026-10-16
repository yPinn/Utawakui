import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./FfmpegSourceModal.vue', import.meta.url),
  'utf8',
);

describe('FfmpegSourceModal copy', () => {
  it('explains the choice and recovery with concise actions', () => {
    expect(source).toContain('使用電腦上的 FFmpeg，或由 Utawakui 下載並管理。');
    expect(source).toContain('系統 FFmpeg');
    expect(source).toContain('由 Utawakui 下載並管理');
    expect(source).toContain('Utawakui 管理版本');
    expect(source).toContain('重新檢查');
    expect(source).toContain("message: '請再試一次。'");
    expect(source).not.toContain('下載內建管理的版本');
  });
});

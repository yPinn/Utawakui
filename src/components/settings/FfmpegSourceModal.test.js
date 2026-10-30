import { describe, expect, it } from 'vitest';
import { readCatalogSource } from '../../utils/catalogSourceText.js';

const source = readCatalogSource(
  new URL('./FfmpegSourceModal.vue', import.meta.url),
);

describe('FfmpegSourceModal copy', () => {
  it('explains the choice and recovery with concise actions', () => {
    expect(source).toContain(
      '選擇工具來源，再按「使用此版本」或「準備並使用」套用。',
    );
    expect(source).toContain('電腦上的 FFmpeg');
    expect(source).toContain('由 Utawakui 下載並管理');
    expect(source).toContain('Utawakui 管理版本');
    expect(source).toContain('重新檢查');
    expect(source).toContain("message: '請再試一次。'");
    expect(source).not.toContain('下載內建管理的版本');
  });
});

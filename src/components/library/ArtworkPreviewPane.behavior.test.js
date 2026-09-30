import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ArtworkPreviewPane.vue', import.meta.url),
  'utf8',
);

describe('ArtworkPreviewPane behavior contract', () => {
  it('distinguishes the current artwork from an unapplied candidate', () => {
    expect(source).toContain('目前封面');
    expect(source).toContain('候選預覽');
    expect(source).toContain('尚未套用');
    expect(source).toContain('套用這張封面');
    expect(source).toContain('class="artwork-preview__loading"');
    expect(source).toContain('role="status"');
    expect(source).not.toContain('UiSkeleton');
    expect(source).toContain("emit('apply')");
  });

  it('keeps local and online artwork intents explicit', () => {
    expect(source).toContain('UiIconButton');
    expect(source).toContain('label="從電腦選擇圖片"');
    expect(source).toContain('label="移除封面"');
    expect(source).toContain('搜尋線上封面');
    expect(source).toContain('v-if="!searchOpen"');
    expect(source).not.toContain('收合搜尋');
    expect(source).toContain("emit('choose')");
    expect(source).toContain("emit('openSearch')");
    expect(source).toContain("emit('clear')");
  });
});

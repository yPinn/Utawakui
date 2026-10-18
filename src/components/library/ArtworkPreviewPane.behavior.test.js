import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ArtworkPreviewPane.vue', import.meta.url),
  'utf8',
);

describe('ArtworkPreviewPane behavior contract', () => {
  it('distinguishes the saved artwork from the staged preview', () => {
    expect(source).toContain('目前封面');
    expect(source).toContain('封面預覽');
    expect(source).toContain('待儲存');
    // Loading status comes from the shared UiArtworkLoading (role="status").
    expect(source).toContain(
      '<template v-if="candidate?.previewLoading" #overlay>',
    );
    expect(source).toContain('<UiArtworkLoading label="候選封面載入中" />');
    expect(source).not.toMatch(/@keyframes|artwork-preview__loading/u);
    expect(source).not.toContain('UiSkeleton');
    expect(source).not.toContain("emit('apply')");
    expect(source).not.toContain('套用這張封面');
  });

  it('keeps artwork actions compact, named and grouped without hiding the save action', () => {
    expect(source).toContain('更換封面');
    expect(source).toContain('選擇封面');
    expect(source).toContain('label="線上搜尋"');
    expect(source).toContain('label="移除封面"');
    expect(source).toMatch(
      /<UiIconButton[\s\S]*?:label="[\s\S]*?更換封面[\s\S]*?選擇封面[\s\S]*?"[\s\S]*?variant="command"/u,
    );
    expect([...source.matchAll(/<UiButton/gu)]).toHaveLength(0);
    expect([...source.matchAll(/<UiIconButton/gu)]).toHaveLength(3);
    expect(source).toContain('role="group"');
    expect(source).toContain('aria-label="封面操作"');
    expect(source).toContain(':loading="artworkPreparing"');
    expect(source).toContain('loading-label="準備預覽中"');
    expect(source).not.toContain('intent="danger"');
    expect(source).toMatch(
      /\.artwork-preview__actions\s*\{[^}]*inline-size:\s*var\(--track-metadata-preview-size\)[^}]*justify-content:\s*flex-end/msu,
    );
    expect(source).toContain('v-if="!searchOpen"');
    expect(source).not.toContain('收合搜尋');
  });

  it('sizes the artwork from ramp steps and edge-aligns the narrow layout', () => {
    expect(source).toContain(
      '--track-metadata-preview-size: var(--ui-artwork-size-3xl);',
    );
    expect(source).toContain(
      '--track-metadata-preview-size: var(--ui-artwork-size-lg);',
    );
    expect(source).not.toMatch(/\b(7|13)rem\b/u);
    expect(source).toMatch(
      /grid-template-columns:\s*var\(--track-metadata-preview-size\)\s+minmax\(0, 1fr\)/u,
    );
    expect(source).toMatch(
      /\.artwork-preview__thumb\s*\{[^}]*grid-row:\s*1 \/ span 2;/u,
    );
    expect(source).toMatch(
      /\.artwork-preview__actions\s*\{[^}]*inline-size:\s*auto;[^}]*align-self:\s*end;/u,
    );
  });

  it('keeps the remaining artwork actions wired', () => {
    expect(source).toContain("emit('choose')");
    expect(source).toContain("emit('openSearch')");
    expect(source).toContain("emit('clear')");
  });
});

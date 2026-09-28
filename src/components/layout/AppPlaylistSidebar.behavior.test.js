import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AppPlaylistSidebar resize handle', () => {
  const source = readFileSync(
    new URL('./AppPlaylistSidebar.vue', import.meta.url),
    'utf8',
  );

  it('exposes the bidirectional double-click toggle on the draggable axis', () => {
    expect(source).toContain('aria-label="調整側欄寬度，雙擊切換摺疊"');
    expect(source).toContain('@dblclick="toggleSidebarCollapse"');
  });

  it('tightens only the compact scroll inset so the standard row fits the narrower rail', () => {
    expect(source).toMatch(
      /@container \(width < 256px\)\s*\{[^}]*\.app-playlist-sidebar__scroll\s*\{[^}]*padding-inline:\s*var\(--ui-playlist-sidebar-padding-inline-compact\);/su,
    );
  });

  it('derives the collection interaction mode from the shell-owned sidebar width', () => {
    expect(source).toContain('SIDEBAR_COMPACT_THRESHOLD');
    expect(source).toContain('const sidebarCompact = computed(');
    expect(source).toContain(':compact="sidebarCompact"');
  });
});
